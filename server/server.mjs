import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { createApi, SECURITY_HEADERS } from './api.mjs';
export { hashToken } from './api.mjs';
const fail = (status, message) => Object.assign(new Error(message), {status});

/** CouchDB is private; only this adapter knows its credentials or raw API. */
export class CouchRepository {
  constructor({ url, database = 'shopping_shares', user, password }) {
    if (!/^[a-z][a-z0-9_]*$/.test(database)) throw new Error('Invalid database name');
    const base = new URL(url);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Invalid CouchDB URL');
    this.base = `${base.href.replace(/\/$/, '')}/${database}`;
    this.headers = { Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`, 'Content-Type': 'application/json' };
  }
  async request(path, options = {}) {
    const response = await fetch(this.base + path, { ...options, headers: this.headers, signal: AbortSignal.timeout(8000) });
    if (response.status === 409) throw fail(409, 'Version geändert.');
    if (response.status === 404) return null;
    if (!response.ok) throw fail(503, 'Speicher vorübergehend nicht erreichbar.');
    return response.json();
  }
  async initialize() {
    const response = await fetch(this.base, { method: 'PUT', headers: this.headers, signal: AbortSignal.timeout(8000) });
    if (!response.ok && response.status !== 412) throw new Error('CouchDB initialization failed');
    await this.request('/_security', { method: 'PUT', body: JSON.stringify({ admins: { names: [], roles: ['_admin'] }, members: { names: [], roles: ['_admin'] } }) });
  }
  get(id) { return this.request(`/share:${id}`); }
  async put(document) {
    const result = await this.request(`/share:${document.id}`, { method: 'PUT', body: JSON.stringify({ ...document, _id: `share:${document.id}` }) });
    return { ...document, _rev: result.rev };
  }
}

/** Node adapter retained for Docker/CouchDB installations and HTTP tests. */
export function createApp({ repository, origin, clock, trustProxy = false, root = new URL('../', import.meta.url), rateLimit = 600 }) {
  const api = createApi({repository, origin, clock, rateLimit, clientIp: request => request.headers.get('X-Internal-Client-IP'), assets: async (request, path, headers) => {
    const name = {'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js'}[path];
    if (!name || !['GET','HEAD'].includes(request.method)) return new Response('Nicht gefunden.',{status:404,headers});
    const content = await readFile(new URL(name,root));
    return new Response(request.method === 'HEAD' ? null : content, {headers:{...headers,'Content-Type':name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'}});
  }});
  return async (req,res) => {
    try {
      const headers = new Headers();
      for (const [key,value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key,Array.isArray(value)?value.join(','):value);
      const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').at(-1)?.trim();
      headers.set('X-Internal-Client-IP',trustProxy && forwarded && isIP(forwarded) ? forwarded : req.socket.remoteAddress || 'unknown');
      const request = new Request(new URL(req.url,origin || `http://${req.headers.host}`), {method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
      const response = await api(request);
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(503,SECURITY_HEADERS); res.end(); }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { COUCHDB_URL, COUCHDB_USER, COUCHDB_PASSWORD, PUBLIC_ORIGIN, PORT = '8080', TRUST_PROXY } = process.env;
  if (!COUCHDB_URL || !COUCHDB_USER || !COUCHDB_PASSWORD || !PUBLIC_ORIGIN) throw new Error('COUCHDB_URL, COUCHDB_USER, COUCHDB_PASSWORD and PUBLIC_ORIGIN are required');
  const publicOrigin = new URL(PUBLIC_ORIGIN);
  if (publicOrigin.origin !== PUBLIC_ORIGIN || (process.env.NODE_ENV === 'production' && (publicOrigin.protocol !== 'https:' || COUCHDB_PASSWORD.length < 32 || COUCHDB_PASSWORD.startsWith('CHANGE_ME')))) throw new Error('Use a canonical HTTPS PUBLIC_ORIGIN and an independent CouchDB password of at least 32 characters in production');
  const repository = new CouchRepository({ url: COUCHDB_URL, user: COUCHDB_USER, password: COUCHDB_PASSWORD });
  await repository.initialize();
  const server = createServer(createApp({ repository, origin: PUBLIC_ORIGIN, trustProxy: TRUST_PROXY === '1' }));
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.listen(Number(PORT), '0.0.0.0', () => console.log(`Shopping API listening on port ${PORT}`));
}
