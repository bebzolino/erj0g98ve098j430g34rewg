import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, getOrCreateConfig } from 'shared';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const config = await getOrCreateConfig();
      return res.status(200).json(config);
    }

    if (req.method === 'POST') {
      const body = req.body;
      const config = await prisma.systemConfig.update({
        where: { id: 'default' },
        data: {
          welcomeMessage: body.welcomeMessage,
          followupMessage: body.followupMessage,
          initialDelayMinutes: Number(body.initialDelayMinutes),
          followupDelayHours: Number(body.followupDelayHours),
          enableAi: Boolean(body.enableAi),
          confidenceThreshold: Number(body.confidenceThreshold),
          webhookUrl: body.webhookUrl,
          staffRole: body.staffRole,
          typingSimulation: Boolean(body.typingSimulation),
          enableFriendRequests: Boolean(body.enableFriendRequests),
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
