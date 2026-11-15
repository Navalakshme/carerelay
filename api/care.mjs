import { createServerClient } from '@supabase/ssr';
import { parse, serialize } from 'cookie';
import { HttpError } from '../lib/api-core.mjs';
import { createHandler } from '../lib/http-handler.mjs';

export function clientFor(req, res) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY)
    throw new HttpError(503, 'Account setup is not connected yet.');
  const cookies = new Map(Object.entries(parse(req.headers.cookie || '')));
  const outgoing = new Map();
  return createServerClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: { httpOnly: true, secure: true, sameSite: 'lax', path: '/' },
    global: {
      fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(12000) }),
    },
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (entries) => {
        for (const { name, value, options } of entries) {
          cookies.set(name, value);
          outgoing.set(
            name,
            serialize(name, value, {
              ...options,
              httpOnly: true,
              secure: true,
              sameSite: 'lax',
              path: '/',
            }),
          );
        }
        res.setHeader('Set-Cookie', [...outgoing.values()]);
      },
    },
  });
}
export default createHandler(clientFor);
