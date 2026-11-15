// Local browser integration harness. Never included in the deployment.
// Uses the real HTTP handler and real PostgreSQL RPCs; only the identity provider
// is replaced by fixed, disposable fixture accounts (no usable credentials).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHandler } from '../lib/http-handler.mjs';
import { sql, rpc } from './database-runner.mjs';
const roles = {
  owner: { sub: '00000000-0000-4000-8000-000000000031', email: 'browser-owner@example.invalid' },
  helper: { sub: '00000000-0000-4000-8000-000000000032', email: 'browser-helper@example.invalid' },
  viewer: { sub: '00000000-0000-4000-8000-000000000033', email: 'browser-viewer@example.invalid' },
};
sql(
  `insert into auth.users(id,email) values ('${roles.owner.sub}','${roles.owner.email}'),('${roles.helper.sub}','${roles.helper.email}'),('${roles.viewer.sub}','${roles.viewer.email}') on conflict do nothing;`,
);
const handler = createHandler(
  (req) => {
    const role = req.headers.cookie?.match(/care-test-role=(owner|helper|viewer)/)?.[1];
    const actor = roles[role];
    return {
      auth: {
        getUser: async () => ({
          data: { user: actor ? { id: actor.sub, user_metadata: { name: role } } : null },
        }),
      },
      rpc: async (name, args) => {
        try {
          return rpc(name, args, actor);
        } catch (error) {
          const match = String(error.stderr).match(/ERROR:\s+([A-Z0-9]{5}):\s*([^\n]+)/);
          return {
            error: { code: match?.[1] || 'XX000', message: match?.[2] || 'Test database failure' },
          };
        }
      },
    };
  },
  { APP_ORIGIN: 'http://127.0.0.1:4174' },
);
const assets = new Set([
  'index.html',
  'styles.css',
  'live.css',
  'live.mjs',
  'artwork.mjs',
  'lib/sync.mjs',
  'lib/brief.mjs',
  'demo.html',
  'demo.mjs',
  'domain.mjs',
]);
createServer(async (req, res) => {
  if (req.url.startsWith('/api/care')) {
    await handler(req, res);
    return;
  }
  const path = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!assets.has(path)) {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    const file = await readFile(new URL('../' + path, import.meta.url));
    res.setHeader(
      'Content-Type',
      path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : 'text/javascript',
    );
    res.end(file);
  } catch {
    res.writeHead(500);
    res.end();
  }
}).listen(4174, '127.0.0.1');
