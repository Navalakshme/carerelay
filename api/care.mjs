import { createServerClient } from '@supabase/ssr';
import { parse, serialize } from 'cookie';
import { HttpError, uuid, text, validateMutation, readBody, rpcFor, databaseError } from '../lib/api-core.mjs';

// The browser talks ONLY to this BFF, never directly to Supabase. This lets the
// SDK store/refresh sessions in HttpOnly cookies without exposing tokens to JS.
function clientFor(req, res) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) throw new HttpError(503, 'Account setup is not connected yet.');
  const cookies = new Map(Object.entries(parse(req.headers.cookie || '')));
  const outgoing = new Map();
  return createServerClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: { httpOnly: true, secure: true, sameSite: 'lax', path: '/' },
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: entries => {
        for (const { name, value, options } of entries) {
          cookies.set(name, value);
          outgoing.set(name, serialize(name, value, { ...options, httpOnly: true, secure: true, sameSite: 'lax', path: '/' }));
        }
        res.setHeader('Set-Cookie', [...outgoing.values()]);
      }
    }
  });
}
const publicUser = user => ({ id: user.id, name: String(user.user_metadata?.name || 'You').slice(0, 80) });
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const send = (status, data) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)); };
  try {
    const origin = process.env.APP_ORIGIN || 'https://carerelay-sand.vercel.app';
    const url = new URL(req.url, origin);
    if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); throw new HttpError(405, 'Method not allowed.'); }
    if (req.headers['sec-fetch-site'] === 'cross-site' && !url.searchParams.has('code')) throw new HttpError(403, 'Request origin rejected.');
    const body = req.method === 'POST' ? (validateMutation(req, origin), await readBody(req)) : null;
    const sb = clientFor(req, res);
    if (req.method === 'GET' && url.searchParams.has('code')) {
      const code = url.searchParams.get('code');
      if (code.length > 2048) throw new HttpError(400, 'Invalid confirmation link.');
      const { error } = await sb.auth.exchangeCodeForSession(code);
      res.statusCode = 303; res.setHeader('Location', error ? '/?confirmation=failed' : '/'); res.end(); return;
    }
    if (body?.action === 'sign-in' || body?.action === 'sign-up') {
      const email = text(body.email, 254);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
      if (typeof body.password !== 'string' || body.password.length < (body.action === 'sign-up' ? 12 : 1) || body.password.length > 128) throw new HttpError(400, 'Use a password between 12 and 128 characters for a new account.');
      if (body.action === 'sign-in') {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: body.password });
        if (error) throw new HttpError(error.status === 429 ? 429 : 401, 'Unable to sign in. Check your details and confirm your email first.');
        send(200, { user: publicUser(data.user) }); return;
      }
      const name = text(body.name, 80);
      const { data, error } = await sb.auth.signUp({ email, password: body.password, options: { data: { name }, emailRedirectTo: `${origin}/api/care` } });
      if (error) throw new HttpError(error.status === 429 ? 429 : 400, 'Sign-up could not complete. Try again later; email delivery may need configuration.');
      send(200, { user: data.session ? publicUser(data.user) : null, message: 'If this address can be registered, a confirmation email has been sent. Open it in this browser, then sign in.' }); return;
    }
    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError?.status >= 500) throw new HttpError(503, 'Account service temporarily unavailable. Please try again.');
    if (req.method === 'GET' && !user && !url.searchParams.has('circle')) { send(200, { user: null, circles: [] }); return; }
    if (authError || !user) throw new HttpError(401, 'Please sign in again.');
    if (req.method === 'GET') {
      const cid = url.searchParams.get('circle');
      const { data, error } = cid ? await sb.rpc('care_state', { p_circle: uuid(cid) }) : await sb.rpc('care_bootstrap');
      if (error) throw databaseError(error);
      send(200, cid ? { user: publicUser(user), state: data } : { user: publicUser(user), circles: data }); return;
    }
    if (body.action === 'sign-out') {
      const { error } = await sb.auth.signOut({ scope: 'local' });
      if (error) throw new HttpError(500, 'Sign-out did not complete. Please try again.');
      send(200, { ok: true }); return;
    }
    const [rpc, args] = rpcFor(body);
    const { data, error } = await sb.rpc(rpc, args);
    if (error) throw databaseError(error);
    if (data?.error) throw new HttpError(400, data.error);
    send(200, { ok: true, result: data });
  } catch (error) {
    // No request payloads, tokens, email addresses, or health data in logs.
    send(error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : 'Service temporarily unavailable. Please try again.' });
  }
}
