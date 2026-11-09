import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { domainToASCII } from 'node:url';
export const CONSENT_VERSION = '2026-11-09-v1';
export const CITIES = ['', 'Cyprus','Paris','London','Dubai','Abu Dhabi','Doha','New York','Hong Kong','Elsewhere'];
export const LANGUAGES = ['en','fr','el'];
const mac = (value, secret) => createHmac('sha256', secret).update(value).digest('base64url');
export function safeEqual(a, b) {
  const x = Buffer.from(a || ''), y = Buffer.from(b || '');
  return x.length === y.length && timingSafeEqual(x, y);
}
export function clientAddress(req, env) {
  // Vercel overwrites this header at its edge. Never trust arbitrary X-Forwarded-For.
  return env.VERCEL ? String(req.headers['x-vercel-forwarded-for'] || 'unknown').split(',')[0].trim() : 'local';
}
export function challenge(address, secret, now = Date.now()) {
  const payload = `${now}.${randomBytes(18).toString('base64url')}`;
  return `${payload}.${mac(`form:${address}:${payload}`, secret)}`;
}
export function verifyChallenge(token, address, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 200) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || !/^\d+$/.test(parts[0])) return false;
  const age = now - Number(parts[0]);
  return age >= 0 && age <= 1800000 && safeEqual(parts[2], mac(`form:${address}:${parts[0]}.${parts[1]}`, secret));
}
export function rateBucket(address, secret, now = Date.now()) {
  return mac(`rate:${Math.floor(now / 3600000)}:${address}`, secret);
}
export function allowedOrigin(origin, env) {
  const allowed = new Set(['https://tagai.art','https://www.tagai.art']);
  for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL]) if (host) allowed.add(`https://${host}`);
  if (!env.VERCEL) { for(const host of ['localhost','terminal.local'])allowed.add(`http://${host}:${env.DEV_PORT||4174}`); }
  return allowed.has(origin);
}
export function normalizeEmail(input) {
  if (typeof input !== 'string' || input.length > 254) return null;
  const email = input.trim().toLowerCase(), parts = email.split('@');
  if (parts.length !== 2 || parts[0].length > 64 || !/^[a-z0-9!#$%&'*+\/=?^_`{|}~.-]+$/.test(parts[0]) || /^\.|\.$|\.\./.test(parts[0])) return null;
  const domain = domainToASCII(parts[1]);
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) return null;
  return `${parts[0]}@${domain}`;
}
