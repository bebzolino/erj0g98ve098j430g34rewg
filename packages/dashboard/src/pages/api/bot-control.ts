import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'shared';
import { requireAuth } from '../../lib/auth';

const isRailway = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_STATIC_URL || !!process.env.RAILWAY_SERVICE_NAME;
const defaultBotUrl = isRailway
  ? `http://bot.railway.internal:${process.env.BOT_API_PORT || 3001}`
  : `http://localhost:${process.env.BOT_API_PORT || 3001}`;

const BOT_URL = process.env.BOT_URL || defaultBotUrl;
const allowedActions = new Set(['runtime_start', 'runtime_stop', 'runtime_restart']);

async function sendBotControl(action: string) {
  let dbPort = 3001;
  try {
    const config = await prisma.systemConfig.findUnique({ where: { id: 'default' } });
    if (config?.botPort) dbPort = config.botPort;
  } catch (error) {
    console.error('[BotControlAPI] Failed to read botPort:', error);
  }

  const urlsToTry = [`${BOT_URL.replace(/\/$/, '')}/`];
  if (isRailway) {
    for (const url of [
      `http://bot.railway.internal:${dbPort}/`,
      'http://bot.railway.internal:8080/',
      'http://bot.railway.internal:3001/',
      'http://bot.railway.internal:3000/',
    ]) {
      if (!urlsToTry.includes(url)) urlsToTry.push(url);
    }
  }

  let lastError: any = null;
  for (const url of urlsToTry) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.BOT_API_KEY ? { 'x-bot-api-key': process.env.BOT_API_KEY } : {}),
        },
        body: JSON.stringify({ action }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Bot replied with status ${response.status}: ${body}`);
      }

      return await response.json();
    } catch (error: any) {
      lastError = error;
    }
  }

  throw new Error(`Cannot reach bot service. Last error: ${lastError?.message || lastError}`);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const action = String(req.body.action || '').trim();
    if (!allowedActions.has(action)) {
      return res.status(400).json({ error: 'Invalid bot control action' });
    }
    const result = await sendBotControl(action);
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(502).json({ error: error.message || 'Bot control failed' });
  }
}
