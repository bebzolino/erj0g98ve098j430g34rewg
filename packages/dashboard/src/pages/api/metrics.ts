import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'shared';
import { requireAuth } from '../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuth(req, res)) return;
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const totalMembers = await prisma.member.count();
    
    // Status counts
    const pending = await prisma.member.count({ where: { status: 'pending' } });
    const firstDmSent = await prisma.member.count({ where: { status: 'first_dm_sent' } });
    const replied = await prisma.member.count({ where: { status: 'replied' } });
    const stopped = await prisma.member.count({ where: { status: 'stopped' } });
    const failed = await prisma.member.count({ where: { status: { in: ['failed_dm', 'failed_followup'] } } });

    // Outreach starts when status is NOT pending
    const reachedOutCount = totalMembers - pending;
    
    // DM Delivery Rate
    const deliveryRate = totalMembers > 0 ? (reachedOutCount / totalMembers) * 100 : 0;
    
    // Reply Rate
    const replyRate = reachedOutCount > 0 ? (replied / reachedOutCount) * 100 : 0;

    // AI Interest distribution
    const interestHigh = await prisma.member.count({ where: { interestLevel: 'high' } });
    const interestMedium = await prisma.member.count({ where: { interestLevel: 'medium' } });
    const interestLow = await prisma.member.count({ where: { interestLevel: 'low' } });

    // Sentiment distribution
    const sentimentPositive = await prisma.member.count({ where: { sentiment: 'positive' } });
    const sentimentNeutral = await prisma.member.count({ where: { sentiment: 'neutral' } });
    const sentimentNegative = await prisma.member.count({ where: { sentiment: 'negative' } });

    // Toxicity
    const toxicCount = await prisma.member.count({ where: { isToxic: true } });

    // Average Response Time Calculation
    const repliedMembers = await prisma.member.findMany({
      where: { status: 'replied' },
      include: {
        conversations: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    let totalResponseTimeMs = 0;
    let validPairsCount = 0;

    for (const member of repliedMembers) {
      const firstOutbound = member.conversations.find(c => c.direction === 'outbound');
      const firstInbound = member.conversations.find(c => c.direction === 'inbound');

      if (firstOutbound && firstInbound) {
        const diff = firstInbound.timestamp.getTime() - firstOutbound.timestamp.getTime();
        if (diff > 0) {
          totalResponseTimeMs += diff;
          validPairsCount++;
        }
      }
    }

    const avgResponseTimeSec = validPairsCount > 0 
      ? Math.round((totalResponseTimeMs / validPairsCount) / 1000)
      : 0;

    const leadRate = replied > 0 ? (interestHigh / replied) * 100 : 0;

    return res.status(200).json({
      metrics: {
        totalMembers,
        reachedOutCount,
        deliveryRate: Math.round(deliveryRate * 10) / 10,
        replyRate: Math.round(replyRate * 10) / 10,
        leadRate: Math.round(leadRate * 10) / 10,
        avgResponseTimeSec,
        toxicCount,
      },
      statusDistribution: {
        pending,
        firstDmSent,
        replied,
        stopped,
        failed,
      },
      interestDistribution: {
        high: interestHigh,
        medium: interestMedium,
        low: interestLow,
      },
      sentimentDistribution: {
        positive: sentimentPositive,
        neutral: sentimentNeutral,
        negative: sentimentNegative,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
