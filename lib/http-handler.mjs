import {
  HttpError,
  uuid,
  text,
  email,
  validateMutation,
  readBody,
  rpcFor,
  databaseError,
} from './api-core.mjs';

// The browser talks ONLY to this BFF, never directly to Supabase. This lets the
// SDK store/refresh sessions in HttpOnly cookies without exposing tokens to JS.
const publicUser = (user) => ({
  id: user.id,
  name: String(user.user_metadata?.name || 'You').slice(0, 80),
});
export function createHandler(clientFor, env = process.env, log = console.error) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const send = (status, data) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(data));
    };
    try {
      const origin = env.APP_ORIGIN || 'https://carerelay-sand.vercel.app';
      const url = new URL(req.url, origin);
      if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST');
        throw new HttpError(405, 'Method not allowed.');
      }
      if (req.headers['sec-fetch-site'] === 'cross-site' && !url.searchParams.has('code'))
        throw new HttpError(403, 'Request origin rejected.');
      const body =
        req.method === 'POST' ? (validateMutation(req, origin), await readBody(req)) : null;
      const sb = clientFor(req, res);
      if (req.method === 'GET' && url.searchParams.has('code')) {
        const code = url.searchParams.get('code');
        if (code.length > 2048) throw new HttpError(400, 'Invalid confirmation link.');
        const { error } = await sb.auth.exchangeCodeForSession(code);
        res.statusCode = 303;
        res.setHeader(
          'Location',
          error
            ? '/?confirmation=failed'
            : url.searchParams.get('flow') === 'recovery'
              ? '/?recovery=1'
              : '/',
        );
        res.end();
        return;
      }
      if (body?.action === 'recover') {
        const address = email(body.email);
        const { error } = await sb.auth.resetPasswordForEmail(address, {
          redirectTo: `${origin}/api/care?flow=recovery`,
        });
        if (error)
          throw new HttpError(
            error.status === 429 ? 429 : 503,
            'Recovery email could not be requested. Try again later.',
          );
        send(200, {
          message:
            'If the account exists, a recovery link has been requested. Open it in this browser.',
        });
        return;
      }
      if (body?.action === 'sign-in' || body?.action === 'sign-up') {
        const email = text(body.email, 254);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          throw new HttpError(400, 'Enter a valid email address.');
        if (
          typeof body.password !== 'string' ||
          body.password.length < (body.action === 'sign-up' ? 12 : 1) ||
          body.password.length > 128
        )
          throw new HttpError(
            400,
            'Use a password between 12 and 128 characters for a new account.',
          );
        if (body.action === 'sign-in') {
          const { data, error } = await sb.auth.signInWithPassword({
            email,
            password: body.password,
          });
          if (error)
            throw new HttpError(
              error.status === 429 ? 429 : 401,
              'Unable to sign in. Check your details and confirm your email first.',
            );
          send(200, { user: publicUser(data.user) });
          return;
        }
        const name = text(body.name, 80);
        const { data, error } = await sb.auth.signUp({
          email,
          password: body.password,
          options: { data: { name }, emailRedirectTo: `${origin}/api/care` },
        });
        if (error)
          throw new HttpError(
            error.status === 429 ? 429 : 400,
            'Sign-up could not complete. Try again later; email delivery may need configuration.',
          );
        send(200, {
          user: data.session ? publicUser(data.user) : null,
          message:
            'If this address can be registered, a confirmation email has been sent. Open it in this browser, then sign in.',
        });
        return;
      }
      const {
        data: { user },
        error: authError,
      } = await sb.auth.getUser();
      if (authError?.status >= 500)
        throw new HttpError(503, 'Account service temporarily unavailable. Please try again.');
      if (req.method === 'GET' && !user && !url.searchParams.has('circle')) {
        send(200, { user: null, circles: [] });
        return;
      }
      if (authError || !user) throw new HttpError(401, 'Please sign in again.');
      if (req.method === 'GET') {
        const cid = url.searchParams.get('circle');
        const view = url.searchParams.get('view');
        const number = (key) => {
          const raw = url.searchParams.get(key);
          if (raw === null) return null;
          const value = Number(raw);
          if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value))
            throw new HttpError(400, 'Invalid page or revision.');
          return value;
        };
        if (view && !['history', 'export'].includes(view))
          throw new HttpError(400, 'Unknown view.');
        const [rpc, args] = !cid
          ? ['care_bootstrap', {}]
          : view === 'history'
            ? ['care_history', { p_circle: uuid(cid), p_before: number('before') }]
            : view === 'export'
              ? ['care_export', { p_circle: uuid(cid) }]
              : ['care_state_v2', { p_circle: uuid(cid), p_revision: number('revision') }];
        const { data, error } = await sb.rpc(rpc, args);
        if (error) throw databaseError(error);
        send(
          200,
          cid
            ? { user: publicUser(user), ...(view ? { result: data } : { state: data }) }
            : { user: publicUser(user), circles: data },
        );
        return;
      }
      if (body.action === 'sign-out') {
        const { error } = await sb.auth.signOut({ scope: 'local' });
        if (error) throw new HttpError(500, 'Sign-out did not complete. Please try again.');
        send(200, { ok: true });
        return;
      }
      if (body.action === 'update-password') {
        if (
          typeof body.password !== 'string' ||
          body.password.length < 12 ||
          body.password.length > 128
        )
          throw new HttpError(400, 'Use between 12 and 128 characters.');
        const { error } = await sb.auth.updateUser({ password: body.password });
        if (error)
          throw new HttpError(400, 'Password could not be updated. Request a fresh recovery link.');
        send(200, { ok: true });
        return;
      }
      const [rpc, args] = rpcFor(body);
      const { data, error } = await sb.rpc(rpc, args);
      if (error) throw databaseError(error);
      if (data?.error) throw new HttpError(400, data.error);
      send(200, { ok: true, result: data });
    } catch (error) {
      // No request payloads, tokens, email addresses, or health data in logs.
      if (!(error instanceof HttpError) || error.status >= 500)
        log(
          JSON.stringify({
            event: 'care_request_failed',
            status: error instanceof HttpError ? error.status : 500,
          }),
        );
      send(error instanceof HttpError ? error.status : 500, {
        error:
          error instanceof HttpError
            ? error.message
            : 'Service temporarily unavailable. Please try again.',
      });
    }
  };
}
