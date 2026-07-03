import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'shared';
import { requireAuth } from '../../lib/auth';

const isRailway = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_STATIC_URL || !!process.env.RAILWAY_SERVICE_NAME;
const defaultBotUrl = isRailway
  ? `http://bot.railway.internal:${process.env.BOT_API_PORT || 3001}`
  : `http://localhost:${process.env.BOT_API_PORT || 3001}`;

const BOT_URL = process.env.BOT_URL || defaultBotUrl;

/**
 * Sends a command to the bot's HTTP control server.
 * Gracefully handles connection failures when the bot is unreachable
 * (e.g., separate Railway container without BOT_URL configured).
 */
async function sendBotCommand(action: string, payload: any) {
  let dbPort = 3001;
  try {
    const config = await prisma.systemConfig.findUnique({ where: { id: 'default' } });
    if (config?.botPort) {
      dbPort = config.botPort;
    }
  } catch (err) {
    console.error('[MembersAPI] Failed to retrieve botPort from database:', err);
  }

  const urlsToTry: string[] = [];
  
  // 1. Add the primary target URL from BOT_URL
  const primaryUrl = `${BOT_URL.replace(/\/$/, '')}/`;
  urlsToTry.push(primaryUrl);
  
  // 2. If running on Railway, add common fallback URLs
  if (isRailway) {
    const fallbacks = [
      `http://bot.railway.internal:${dbPort}/`,
      `http://bot.railway.internal:8080/`,
      `http://bot.railway.internal:3001/`,
      `http://bot.railway.internal:3000/`
    ];
    for (const url of fallbacks) {
      if (url !== primaryUrl && !urlsToTry.includes(url)) {
        urlsToTry.push(url);
      }
    }
  }

  let lastError: any = null;

  for (const url of urlsToTry) {
    try {
      console.log(`[MembersAPI] Attempting bot command at: ${url}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000); // 90s timeout per try

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.BOT_API_KEY ? { 'x-bot-api-key': process.env.BOT_API_KEY } : {}),
        },
        body: JSON.stringify({ action, ...payload }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errorBody = await res.text().catch(() => '');
        // If it's a 404 from a removed public domain, treat it as a connection failure to trigger fallback
        if (res.status === 404 && errorBody.includes('Application not found')) {
          throw new Error(`Public URL removed: ${errorBody}`);
        }
        throw new Error(`Bot replied with status ${res.status}: ${errorBody}`);
      }

      return await res.json();
    } catch (error: any) {
      lastError = error;
      console.warn(`[MembersAPI] Failed to connect to bot at ${url}: ${error.message || error}`);
    }
  }

  // If all attempts failed, throw a descriptive error
  throw new Error(
    `Cannot reach bot service after trying: ${urlsToTry.join(', ')}. ` +
    `Last error: ${lastError?.message || lastError}. ` +
    `Please ensure the bot service is running and exposes the correct port (default is 8080 or 3001).`
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuth(req, res)) return;
  try {
    if (req.method === 'GET') {
      const members = await prisma.member.findMany({
        orderBy: { joinTime: 'desc' },
      });
      return res.status(200).json(members);
    }

    if (req.method === 'POST') {
      const body = req.body;
      const { action, userId, username, message } = body;

      if (action === 'join') {
        const userIdentifier = userId || `user_${Math.floor(Math.random() * 100000)}`;
        const userName = username || `TestUser_${Math.floor(Math.random() * 1000)}`;

        await sendBotCommand('join', { userId: userIdentifier, username: userName });

        const member = await prisma.member.findUnique({
          where: { userId: userIdentifier }
        });

        return res.status(200).json({ success: true, member });
      }

      if (action === 'reply') {
        if (!userId || !message) {
          return res.status(400).json({ error: 'Missing userId or message' });
        }

        const member = await prisma.member.findUnique({ where: { userId } });
        if (!member) {
          return res.status(404).json({ error: 'Member not found' });
        }

        await sendBotCommand('reply', { userId, username: member.username, message });
        return res.status(200).json({ success: true });
      }

      if (action === 'trigger_initial') {
        if (!userId) return res.status(400).json({ error: 'Missing userId' });
        await sendBotCommand('trigger_initial', { userId });
        return res.status(200).json({ success: true });
      }

      if (action === 'trigger_followup') {
        if (!userId) return res.status(400).json({ error: 'Missing userId' });
        await sendBotCommand('trigger_followup', { userId });
        return res.status(200).json({ success: true });
      }

      if (action === 'join_server') {
        const { inviteLink } = body;
        if (!inviteLink) return res.status(400).json({ error: 'Missing inviteLink' });
        const result = await sendBotCommand('join_server', { inviteLink });
        return res.status(200).json(result);
      }

      return res.status(400).json({ error: 'Invalid action' });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error: any) {
    console.error('Error in members api:', error.message || error);
    return res.status(502).json({ error: error.message || 'Bot service unavailable' });
  }
}
