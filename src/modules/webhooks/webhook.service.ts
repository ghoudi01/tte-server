import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class WebhookService {
  constructor(private readonly prisma: PrismaService) {}

  async getMerchantStats(merchantId: string) {
    if (!merchantId) {
      return {
        subscriptions: 0,
        activeSubscriptions: 0,
        totalDeliveries: 0,
        successRate: 0,
        recentFailures: 0,
      };
    }

    const [totalSubs, activeSubs, totalDeliveries, successes] = await Promise.all([
      this.prisma.webhookSubscription.count({ where: { merchantId } }),
      this.prisma.webhookSubscription.count({ where: { merchantId, isActive: true } }),
      this.prisma.webhookDeliveryLog.count(),
      this.prisma.webhookDeliveryLog.count({ where: { succeeded: true } }),
    ]);

    const successRate = totalDeliveries > 0 ? Math.round((successes / totalDeliveries) * 100) / 100 : 0;

    return {
      subscriptions: totalSubs,
      activeSubscriptions: activeSubs,
      totalDeliveries,
      successRate,
      recentFailures: totalDeliveries - successes,
    };
  }
}
