const ID = /^[A-Za-z0-9_-]{43}$/;
const HASH = /^[a-f0-9]{64}$/;
const TTL = 10 * 60_000;
const MAX_BODY = 2 * 1024 * 1024;
export async function hashToken(token) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('');
}
const fail = (status, message) => Object.assign(new Error(message), { status });
async function equalHash(token, hash) {
  if (!ID.test(token || '') || !HASH.test(hash || '')) return false;
  const actual = await hashToken(token);
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= actual.charCodeAt(i) ^ hash.charCodeAt(i);
  return difference === 0;
}
function keys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...expected].sort().join()) throw fail(400, 'Ungültiges Format.');
}
function canonicalBase64(value) {
  try { return btoa(atob(value.replace(/-/g,'+').replace(/_/g,'/'))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'') === value; }
  catch { return false; }
}
function envelope(value, max = 1_400_000) {
  keys(value, ['v', 'iv', 'ct']);
  if (value.v !== 1 || typeof value.iv !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(value.iv) || typeof value.ct !== 'string' || value.ct.length < 22 || value.ct.length > max || !/^[A-Za-z0-9_-]+$/.test(value.ct) || !canonicalBase64(value.ct)) throw fail(400, 'Ungültiges Chiffrat.');
  return value;
}

function limiter() {
  const buckets = new Map();
  let lastCleanup = 0;
  return (key, limit, period) => {
    const now = Date.now();
    if (now - lastCleanup > 60_000) {
      for (const [id, value] of buckets) if (value.until <= now) buckets.delete(id);
      lastCleanup = now;
    }
    let bucket = buckets.get(key);
    if (!bucket || bucket.until <= now) {
      if (buckets.size >= 10_000) throw fail(429, 'Bitte später erneut versuchen.');
      buckets.set(key, bucket = { until: now + period, count: 0 });
    }
    if (++bucket.count > limit) throw fail(429, 'Zu viele Anfragen. Bitte später erneut versuchen.');
  };
}

export const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
};

/** Portable Fetch API handler, shared by Node.js and the Sites Worker. */
export function createApi({ repository, origin, clock = Date.now, clientIp = () => 'unknown', assets, rateLimit = 600 }) {
  const limit = limiter();
  const send = (status, data, headers = {}) => new Response(data === undefined ? null : JSON.stringify(data), {
    status, headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
  const auth = async (id, token, ownerOnly = false, allowRevoked = false) => {
    const document = await repository.get(id);
    const owner = document && await equalHash(token, document.ownerHash);
    if (!document || (!owner && (ownerOnly || !await equalHash(token, document.memberHash)))) throw fail(404, 'Kein Zugriff auf diese Freigabe.');
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
  return async request => {
    try {
      const path = new URL(request.url).pathname;
      if (path === '/healthz' && request.method === 'GET') { await repository.health?.(); return send(200, { ok: true, storage: repository.kind || 'couchdb' }); }
      if (!path.startsWith('/api/')) {
        if (assets) return await assets(request, path, SECURITY_HEADERS);
        throw fail(404, 'Nicht gefunden.');
      }
      const expectedOrigin = origin || new URL(request.url).origin;
      if (request.headers.get('Origin') && request.headers.get('Origin') !== expectedOrigin) throw fail(403, 'Andere Herkunft nicht erlaubt.');
      const ip = clientIp(request);
      limit(`all:${ip}`, rateLimit, 60_000);
      const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization') || '')?.[1] || '';
      let body;
      if (['POST', 'PUT'].includes(request.method)) {
        if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) throw fail(413, 'Anfrage zu groß.');
        const reader = request.body?.getReader();
        const chunks = []; let size = 0;
        if (reader) {
          try {
            while (true) {
              const part = await reader.read(); if (part.done) break;
              size += part.value.length;
              if (size > MAX_BODY) { await reader.cancel(); throw fail(413, 'Anfrage zu groß.'); }
              chunks.push(part.value);
            }
          } finally { reader.releaseLock(); }
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        try { body = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); } catch { throw fail(400, 'Ungültiges JSON.'); }
      }
      if (path === '/api/shares' && request.method === 'POST') {
        keys(body, ['id', 'memberHash']);
        if (!ID.test(body.id) || !ID.test(token) || !HASH.test(body.memberHash) || await hashToken(token) === body.memberHash) throw fail(400, 'Ungültige Berechtigungen.');
        const existing = await repository.get(body.id);
        if (existing) { await auth(body.id, token, true); if (existing.memberHash !== body.memberHash) throw fail(409, 'Berechtigungen stimmen nicht überein.'); return send(200, { id: body.id }); }
        limit(`create:${ip}`, 30, 3600_000);
        await repository.put({ id: body.id, ownerHash: await hashToken(token), memberHash: body.memberHash, createdAt: clock(), revoked: false, accepted: false, content: null, invitation: null, receipts: [] });
        return send(201, { id: body.id });
      }
      const match = /^\/api\/shares\/([A-Za-z0-9_-]{43})(?:\/(content|invitation|claim))?$/.exec(path);
      if (!match) throw fail(404, 'Nicht gefunden.');
      const [, id, action] = match;
      if (action === 'claim' && request.method === 'POST') {
        keys(body, ['invitationId', 'requestId']);
        if (!ID.test(body.invitationId) || !ID.test(body.requestId) || !ID.test(token)) throw fail(400, 'Ungültige Einladung.');
        for (let attempt = 0; attempt < 8; attempt++) {
          const doc = await repository.get(id); const invite = doc?.invitation?.id === body.invitationId ? doc.invitation : doc?.receipts?.find(receipt => receipt.id === body.invitationId && receipt.retryUntil > clock());
          if (!invite || invite.id !== body.invitationId || !await equalHash(token, invite.claimHash)) throw fail(404, 'Einladung nicht verfügbar.');
          if (doc.revoked) throw fail(410, 'Einladung abgelaufen oder beendet.');
          const requestHash = await hashToken(body.requestId);
          if (invite.claimedBy && invite.claimedBy !== requestHash) throw fail(409, 'Einladung wurde bereits eingelöst.');
          if (invite.claimedBy) return send(200, { box: invite.box });
          if (invite.expiresAt <= clock()) throw fail(410, 'Einladung abgelaufen oder beendet.');
          invite.claimedBy = requestHash;
          doc.accepted = true;
          invite.retryUntil = clock() + 24 * 3600_000;
          try { await repository.put(doc); return send(200, { box: invite.box }); }
          catch (error) { if (error.status !== 409 || attempt === 7) throw error; }
        }
      }
      if (action === 'invitation') {
        if (request.method === 'POST') {
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
          return send(201, result);
        }
        if (request.method === 'GET') {
          const { document } = await auth(id, token, true); const invite = document.invitation;
          return send(200, { id: invite?.id || null, claimed: !!invite?.claimedBy, expired: !invite || invite.expiresAt <= clock(), expiresAt: invite?.expiresAt || null, active: !!document.content, ready: !!document.accepted });
        }
        if (request.method === 'DELETE') {
          await update(id, token, true, doc => { doc.receipts = [...(doc.receipts || []), ...(doc.invitation?.claimedBy ? [doc.invitation] : [])].filter(receipt => receipt.retryUntil > clock()).slice(-128); doc.invitation = null; }); return send(204);
        }
      }
      if (action === 'content') {
        if (request.method === 'GET') {
          const { document } = await auth(id, token);
          if (!document.content) return send(202, { waiting: true });
          const etag = `"${document._rev}"`;
          if (request.headers.get('if-none-match') === etag) return send(304, undefined, { ETag: etag });
          return send(200, document.content, { ETag: etag });
        }
        if (request.method === 'PUT') {
          envelope(body);
          const { document, owner } = await auth(id, token);
          if (!document.content) {
            if (!owner || !document.accepted) throw fail(409, 'Erste Übernahme noch nicht bestätigt.');
            if (request.headers.get('if-none-match') !== '*') throw fail(428, 'Bedingte Anfrage erforderlich.');
          } else if (request.headers.get('if-match') !== `"${document._rev}"`) throw fail(409, 'Version geändert.');
          document.content = body;
          const saved = await repository.put(document);
          return send(200, { ok: true }, { ETag: `"${saved._rev}"` });
        }
      }
      if (!action && request.method === 'DELETE') {
        await update(id, token, true, doc => { doc.revoked = true; doc.content = null; doc.invitation = null; doc.receipts = []; doc.accepted = false; }, true);
        return send(204);
      }
      throw fail(405, 'Methode nicht erlaubt.');
    } catch (error) {
      return send(Number.isInteger(error.status) ? error.status : 503, { error: Number.isInteger(error.status) ? error.message : 'Dienst vorübergehend nicht erreichbar.' });
    }
  };
}

