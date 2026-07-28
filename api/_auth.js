import crypto from 'node:crypto';

const COOKIE_NAME = 'rami_pool_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getSecret() {
  return String(process.env.APP_SESSION_SECRET || '').trim();
}

function getPin() {
  return String(process.env.APP_ACCESS_PIN || '').trim();
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');
}

function makeToken() {
  const expires = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `rami:${expires}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || !getSecret()) return false;
  const [encoded, signature] = String(token).split('.');
  if (!encoded || !signature) return false;
  let payload;
  try {
    payload = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return false;
  }
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const [prefix, expiryText] = payload.split(':');
  return prefix === 'rami' && Number(expiryText) > Math.floor(Date.now() / 1000);
}

function cookies(req) {
  const header = String(req.headers.cookie || '');
  return Object.fromEntries(header.split(';').map(item => {
    const [key, ...rest] = item.trim().split('=');
    return [key, decodeURIComponent(rest.join('='))];
  }).filter(([key]) => key));
}

export function authenticationConfigured() {
  return Boolean(getPin() && getSecret());
}

export function isAuthenticated(req) {
  if (!authenticationConfigured()) return false;
  return verifyToken(cookies(req)[COOKIE_NAME]);
}

export function requireAuth(req, res) {
  if (isAuthenticated(req)) return true;
  res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });
  return false;
}

export function verifyPin(pin) {
  const actual = getPin();
  const supplied = String(pin || '');
  if (!actual || actual.length !== supplied.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(supplied));
}

export function setSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(makeToken())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`);
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}
