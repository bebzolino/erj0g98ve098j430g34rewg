import type { NextApiRequest, NextApiResponse } from 'next';
import { createSessionCookie, isAuthConfigured, verifyPassword } from '../../../lib/auth';

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function clientKey(req: NextApiRequest) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}

function isRateLimited(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (!isAuthConfigured()) {
    return res.status(500).json({ error: 'DASHBOARD_PASSWORD is not configured' });
  }
  if (isRateLimited(clientKey(req))) {
    return res.status(429).json({ error: 'Too many login attempts' });
  }
  if (!verifyPassword(String(req.body?.password || ''))) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  res.setHeader('Set-Cookie', createSessionCookie(req));
  return res.status(200).json({ success: true });
}
