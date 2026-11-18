'use strict';
// REACH 2.2 STAGING ONLY. No HTTP endpoints, providers, production users or secrets.
// The public reach-shell dummy login is unrelated to these server-side sessions.
const { randomBytes, scryptSync, timingSafeEqual, createHash } = require('node:crypto');
const TTL_MS = 8 * 60 * 60 * 1000;
const COOKIE_NAME = '__Host-reach_staging_session';
const HASH_BYTES = 64;
function passwordHash(password, salt = randomBytes(16)) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw new TypeError('Password length must be 12..1024');
  if (!Buffer.isBuffer(salt) || salt.length !== 16) throw new TypeError('Invalid salt');
  return 'scrypt-v1:' + salt.toString('hex') + ':' + scryptSync(password, salt, HASH_BYTES, { N: 16384, r: 8, p: 1 }).toString('hex');
}
function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024 || typeof encoded !== 'string') return false;
  const parts = encoded.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt-v1' || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{128}$/.test(parts[2])) return false;
  const candidate = scryptSync(password, Buffer.from(parts[1], 'hex'), HASH_BYTES, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(candidate, Buffer.from(parts[2], 'hex'));
}
function newSessionStore({ now = Date.now } = {}) {
  const sessions = new Map(); // ephemeral per-process only; not production/distributed storage
  function issue({ userId, tenantId, role }) {
    if (![userId, tenantId].every(v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(v)) || role !== 'owner') throw new TypeError('Synthetic owner identity required');
    const token = randomBytes(32).toString('base64url');
    const csrf = randomBytes(32).toString('base64url');
    const expiresAt = now() + TTL_MS;
    sessions.set(createHash('sha256').update(token).digest('hex'), { userId, tenantId, role, csrf, expiresAt });
    return { token, csrf, expiresAt };
  }
  function resolve(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const key = createHash('sha256').update(token).digest('hex');
    const record = sessions.get(key);
    if (!record) return null;
    if (record.expiresAt <= now()) { sessions.delete(key); return null; }
    return Object.freeze({ ...record });
  }
  function revoke(token) {
    if (typeof token !== 'string') return false;
    return sessions.delete(createHash('sha256').update(token).digest('hex'));
  }
  function validCsrf(token, supplied) {
    const session = resolve(token);
    if (!session || typeof supplied !== 'string' || supplied.length !== session.csrf.length) return false;
    return timingSafeEqual(Buffer.from(supplied), Buffer.from(session.csrf));
  }
  return Object.freeze({ issue, resolve, revoke, validCsrf });
}
function sessionCookie(token, { secure = true } = {}) {
  if (!secure || typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new TypeError('Secure session cookie required');
  return COOKIE_NAME + '=' + token + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + (TTL_MS / 1000);
}
function clearSessionCookie() {
  return COOKIE_NAME + '=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
}
module.exports = { passwordHash, verifyPassword, newSessionStore, sessionCookie, clearSessionCookie, COOKIE_NAME, TTL_MS };
