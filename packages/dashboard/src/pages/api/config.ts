import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, getOrCreateConfig } from 'shared';

function containsLink(value: string) {
  return /(?:https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/|[a-z0-9-]+\.[a-z]{2,}(?:\/|\b))/i.test(value);
}

function parseVariants(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const config = await getOrCreateConfig();
      return res.status(200).json(config);
    }

    if (req.method === 'POST') {
      const body = req.body;
      if (containsLink(String(body.welcomeMessage || ''))) {
        return res.status(400).json({ error: 'Welcome Message cannot contain links' });
      }
      const initialMessageVariants = parseVariants(body.initialMessageVariants);
      if (initialMessageVariants.some((variant) => containsLink(variant))) {
        return res.status(400).json({ error: 'Initial Message variants cannot contain links' });
      }
      const config = await prisma.systemConfig.update({
        where: { id: 'default' },
        data: {
          welcomeMessage: body.welcomeMessage,
          initialMessageVariants: JSON.stringify(initialMessageVariants),
          followupMessage: body.followupMessage,
          initialDelayMinutes: Number(body.initialDelayMinutes),
          followupDelayHours: Number(body.followupDelayHours),
          enableAi: Boolean(body.enableAi),
          confidenceThreshold: Number(body.confidenceThreshold),
          webhookUrl: body.webhookUrl,
          staffRole: body.staffRole,
          typingSimulation: Boolean(body.typingSimulation),
          enableFriendRequests: Boolean(body.enableFriendRequests),
          processRejoins: Boolean(body.processRejoins),
          enablePings: Boolean(body.enablePings),
          pingChannelId: body.pingChannelId,
          pingMessage: body.pingMessage,
          pingDelayHours: Number(body.pingDelayHours),
          userToken: body.userToken,
          geminiApiKey: body.geminiApiKey,
          captchaSolver: body.captchaSolver,
          captchaKey: body.captchaKey,
          friendRequestDelayMinutes: Number(body.friendRequestDelayMinutes),
          typingSpeedMultiplier: Number(body.typingSpeedMultiplier),
          capsolverKey: body.capsolverKey,
          anysolverKey: body.anysolverKey,
          captchaProxy: body.captchaProxy,
          safetyMinInitialDmDelayMinutes: Number(body.safetyMinInitialDmDelayMinutes),
          safetyMinFriendRequestDelayMinutes: Number(body.safetyMinFriendRequestDelayMinutes),
          safetyDmCooldownSeconds: Number(body.safetyDmCooldownSeconds),
          safetyFriendRequestCooldownSeconds: Number(body.safetyFriendRequestCooldownSeconds),
          safetyDmCooldownMinMs: Number(body.safetyDmCooldownMinMs),
          safetyDmCooldownMaxMs: Number(body.safetyDmCooldownMaxMs),
          safetyFriendRequestCooldownMinMs: Number(body.safetyFriendRequestCooldownMinMs),
          safetyFriendRequestCooldownMaxMs: Number(body.safetyFriendRequestCooldownMaxMs),
          safetyFailureCooldownMinutes: Number(body.safetyFailureCooldownMinutes),
          safetyMaxDmPerHour: Number(body.safetyMaxDmPerHour),
          safetyMaxFriendRequestsPerHour: Number(body.safetyMaxFriendRequestsPerHour),
          queueScanIntervalSeconds: Number(body.queueScanIntervalSeconds),
          queueDmSpreadSeconds: Number(body.queueDmSpreadSeconds),
          queueFriendRequestSpreadSeconds: Number(body.queueFriendRequestSpreadSeconds),
        },

      });
      return res.status(200).json(config);
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
