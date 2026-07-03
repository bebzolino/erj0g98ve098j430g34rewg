import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';

const COOKIE_NAME = 'c404_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export function isProductionLike() {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME);
}

function getSecret() {
  return process.env.DASHBOARD_AUTH_SECRET || process.env.DASHBOARD_PASSWORD || '';
}

function sign(value: string) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');
}

function timingSafeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseCookies(cookieHeader?: string) {
  return Object.fromEntries(
    String(cookieHeader || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

export function isAuthConfigured() {
  return Boolean(process.env.DASHBOARD_PASSWORD && getSecret());
}

export function verifyPassword(password: string) {
  const expected = process.env.DASHBOARD_PASSWORD || '';
  if (!expected) return false;
  return timingSafeEqual(password, expected);
}

export function createSessionCookie(req?: Pick<NextApiRequest, 'headers'>) {
  if (!getSecret()) {
    throw new Error('DASHBOARD_AUTH_SECRET is not configured');
  }
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = String(expiresAt);
  const token = `${payload}.${sign(payload)}`;
  const forwardedProto = String(req?.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = forwardedProto === 'https' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function isAuthenticated(req: Pick<NextApiRequest, 'headers'>) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !timingSafeEqual(signature, sign(payload))) return false;
  return Number(payload) > Date.now();
}

export function requireAuth(req: NextApiRequest, res: NextApiResponse) {
  if (!isAuthConfigured()) {
    if (isProductionLike()) {
      res.status(503).json({ error: 'Dashboard auth is not configured' });
      return false;
    }
    return true;
  }
  if (isAuthenticated(req)) {
    return true;
  }
  res.status(401).json({ error: 'Unauthorized' });
  return false;
}
