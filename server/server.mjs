import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

const ID = /^[A-Za-z0-9_-]{43}$/;
const HASH = /^[a-f0-9]{64}$/;
const TTL = 10 * 60_000;
const MAX_BODY = 2 * 1024 * 1024;
export const hashToken = token => createHash('sha256').update(token).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
function equalHash(token, hash) {
  return ID.test(token || '') && HASH.test(hash || '') && timingSafeEqual(Buffer.from(hashToken(token), 'hex'), Buffer.from(hash, 'hex'));
}
function keys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...expected].sort().join()) throw fail(400, 'Ungültiges Format.');
}
function envelope(value, max = 1_400_000) {
  keys(value, ['v', 'iv', 'ct']);
  if (value.v !== 1 || typeof value.iv !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(value.iv) || typeof value.ct !== 'string' || value.ct.length < 22 || value.ct.length > max || !/^[A-Za-z0-9_-]+$/.test(value.ct) || Buffer.from(value.ct, 'base64url').toString('base64url') !== value.ct) throw fail(400, 'Ungültiges Chiffrat.');
  return value;
}

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

function limiter() {
  const buckets = new Map();
  const cleanup = setInterval(() => { const now = Date.now(); for (const [key, value] of buckets) if (value.until < now) buckets.delete(key); }, 60_000);
  cleanup.unref();
  return (key, limit, period) => {
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.until <= now) {
      if (buckets.size >= 10_000) throw fail(429, 'Bitte später erneut versuchen.');
      buckets.set(key, bucket = { until: now + period, count: 0 });
    }
    if (++bucket.count > limit) throw fail(429, 'Zu viele Anfragen. Bitte später erneut versuchen.');
  };
}

export function createApp({ repository, origin, clock = Date.now, trustProxy = false, root = new URL('../', import.meta.url), rateLimit = 600 }) {
  const limit = limiter();
  const send = (res, status, data, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    res.end(data === undefined ? undefined : JSON.stringify(data));
  };
  const auth = async (id, token, ownerOnly = false, allowRevoked = false) => {
    const document = await repository.get(id);
    const owner = document && equalHash(token, document.ownerHash);
    if (!document || (!owner && (ownerOnly || !equalHash(token, document.memberHash)))) throw fail(404, 'Kein Zugriff auf diese Freigabe.');
    if (document.revoked && !allowRevoked) throw fail(410, 'Freigabe beendet.');
    return { document, owner };
  };
  const update = async (id, token, ownerOnly, change, allowRevoked = false) => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const { document, owner } = await auth(id, token, ownerOnly, allowRevoked);
      const result = change(document, owner);
      try { const saved = await repository.put(document); return { saved, result }; }
      catch (error) { if (error.status !== 409 || attempt === 7) throw error; }
    }
  };
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/healthz' && req.method === 'GET') return send(res, 200, { ok: true });
      if (!path.startsWith('/api/')) {
        const name = { '/': 'index.html', '/index.html': 'index.html', '/style.css': 'style.css', '/app.js': 'app.js' }[path];
        if (!name || !['GET', 'HEAD'].includes(req.method)) throw fail(404, 'Nicht gefunden.');
        const content = await readFile(new URL(name, root));
        res.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript; charset=utf-8' : name.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8' });
        return res.end(req.method === 'HEAD' ? undefined : content);
      }
      const expectedOrigin = origin || `http://${req.headers.host}`;
      if (req.headers.origin && req.headers.origin !== expectedOrigin) throw fail(403, 'Andere Herkunft nicht erlaubt.');
      const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').at(-1)?.trim();
      const ip = trustProxy && forwarded && isIP(forwarded) ? forwarded : req.socket.remoteAddress;
      limit(`all:${ip}`, rateLimit, 60_000);
      const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '')?.[1] || '';
      let body;
      if (['POST', 'PUT'].includes(req.method)) {
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw fail(413, 'Anfrage zu groß.'); chunks.push(chunk); }
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail(400, 'Ungültiges JSON.'); }
      }
      if (path === '/api/shares' && req.method === 'POST') {
        keys(body, ['id', 'memberHash']);
        if (!ID.test(body.id) || !ID.test(token) || !HASH.test(body.memberHash) || hashToken(token) === body.memberHash) throw fail(400, 'Ungültige Berechtigungen.');
        const existing = await repository.get(body.id);
        if (existing) { await auth(body.id, token, true); if (existing.memberHash !== body.memberHash) throw fail(409, 'Berechtigungen stimmen nicht überein.'); return send(res, 200, { id: body.id }); }
        limit(`create:${ip}`, 30, 3600_000);
        await repository.put({ id: body.id, ownerHash: hashToken(token), memberHash: body.memberHash, createdAt: clock(), revoked: false, accepted: false, content: null, invitation: null, receipts: [] });
        return send(res, 201, { id: body.id });
      }
      const match = /^\/api\/shares\/([A-Za-z0-9_-]{43})(?:\/(content|invitation|claim))?$/.exec(path);
      if (!match) throw fail(404, 'Nicht gefunden.');
      const [, id, action] = match;
      if (action === 'claim' && req.method === 'POST') {
        keys(body, ['invitationId', 'requestId']);
        if (!ID.test(body.invitationId) || !ID.test(body.requestId) || !ID.test(token)) throw fail(400, 'Ungültige Einladung.');
        for (let attempt = 0; attempt < 8; attempt++) {
          const doc = await repository.get(id); const invite = doc?.invitation?.id === body.invitationId ? doc.invitation : doc?.receipts?.find(receipt => receipt.id === body.invitationId && receipt.retryUntil > clock());
          if (!invite || invite.id !== body.invitationId || !equalHash(token, invite.claimHash)) throw fail(404, 'Einladung nicht verfügbar.');
          if (doc.revoked) throw fail(410, 'Einladung abgelaufen oder beendet.');
          const requestHash = hashToken(body.requestId);
          if (invite.claimedBy && invite.claimedBy !== requestHash) throw fail(409, 'Einladung wurde bereits eingelöst.');
          if (invite.claimedBy) return send(res, 200, { box: invite.box });
          if (invite.expiresAt <= clock()) throw fail(410, 'Einladung abgelaufen oder beendet.');
          invite.claimedBy = requestHash;
          doc.accepted = true;
          invite.retryUntil = clock() + 24 * 3600_000;
          try { await repository.put(doc); return send(res, 200, { box: invite.box }); }
          catch (error) { if (error.status !== 409 || attempt === 7) throw error; }
        }
      }
      if (action === 'invitation') {
        if (req.method === 'POST') {
          keys(body, ['id', 'claimHash', 'box']);
          if (!ID.test(body.id) || !HASH.test(body.claimHash)) throw fail(400, 'Ungültige Einladung.');
          envelope(body.box, 4096);
          const { result } = await update(id, token, true, doc => {
            // Retrying the same creation must not unconsume a claimed invitation.
            if (doc.invitation?.id === body.id) {
              if (doc.invitation.claimHash !== body.claimHash || JSON.stringify(doc.invitation.box) !== JSON.stringify(body.box)) throw fail(409, 'Einladung existiert bereits.');
              return { expiresAt: doc.invitation.expiresAt };
            }
            doc.receipts = [...(doc.receipts || []), ...(doc.invitation?.claimedBy ? [doc.invitation] : [])].filter(receipt => receipt.retryUntil > clock()).slice(-128);
            doc.invitation = { ...body, expiresAt: clock() + TTL, claimedBy: null };
            return { expiresAt: doc.invitation.expiresAt };
          });
          return send(res, 201, result);
        }
        if (req.method === 'GET') {
          const { document } = await auth(id, token, true); const invite = document.invitation;
          return send(res, 200, { id: invite?.id || null, claimed: !!invite?.claimedBy, expired: !invite || invite.expiresAt <= clock(), expiresAt: invite?.expiresAt || null, active: !!document.content, ready: !!document.accepted });
        }
        if (req.method === 'DELETE') {
          await update(id, token, true, doc => { doc.receipts = [...(doc.receipts || []), ...(doc.invitation?.claimedBy ? [doc.invitation] : [])].filter(receipt => receipt.retryUntil > clock()).slice(-128); doc.invitation = null; }); return send(res, 204);
        }
      }
      if (action === 'content') {
        if (req.method === 'GET') {
          const { document } = await auth(id, token);
          if (!document.content) return send(res, 202, { waiting: true });
          const etag = `"${document._rev}"`;
          if (req.headers['if-none-match'] === etag) return send(res, 304, undefined, { ETag: etag });
          return send(res, 200, document.content, { ETag: etag });
        }
        if (req.method === 'PUT') {
          envelope(body);
          const { document, owner } = await auth(id, token);
          if (!document.content) {
            if (!owner || !document.accepted) throw fail(409, 'Erste Übernahme noch nicht bestätigt.');
            if (req.headers['if-none-match'] !== '*') throw fail(428, 'Bedingte Anfrage erforderlich.');
          } else if (req.headers['if-match'] !== `"${document._rev}"`) throw fail(409, 'Version geändert.');
          document.content = body;
          const saved = await repository.put(document);
          return send(res, 200, { ok: true }, { ETag: `"${saved._rev}"` });
        }
      }
      if (!action && req.method === 'DELETE') {
        await update(id, token, true, doc => { doc.revoked = true; doc.content = null; doc.invitation = null; doc.receipts = []; doc.accepted = false; }, true);
        return send(res, 204);
      }
      throw fail(405, 'Methode nicht erlaubt.');
    } catch (error) {
      send(res, Number.isInteger(error.status) ? error.status : 503, { error: Number.isInteger(error.status) ? error.message : 'Dienst vorübergehend nicht erreichbar.' });
    }
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
