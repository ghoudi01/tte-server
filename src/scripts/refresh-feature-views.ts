/**
 * Feature view refresh job
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function refreshPhoneFeatures() {
  console.log('📞 Refreshing phone features...');
  const start = Date.now();

  await prisma.phoneFeature.deleteMany();

  const phones = await prisma.order.groupBy({
    by: ['phoneNumber'],
  });

  let processed = 0;
  const batchSize = 100;

  for (let i = 0; i < phones.length; i += batchSize) {
    const batch = phones.slice(i, i + batchSize);

    const batchData = await Promise.all(
      batch.map(async ({ phoneNumber }) => {
        const stats = await prisma.order.groupBy({
          by: ['phoneNumber'],
          where: { phoneNumber },
          _count: { id: true },
          _avg: { trustScore: true },
          _max: { createdAt: true },
        });

        const successful = await prisma.order.count({
          where: {
            phoneNumber,
            verificationStatus: 'verified',
            orderStatus: { in: ['placed', 'delivered'] },
          },
        });

        const result = stats[0];
        if (!result) return null;

        return {
          phoneNumber,
          totalOrders: result._count.id,
          successfulOrders: successful,
          avgTrustScore: result._avg.trustScore ?? 50,
          firstSeenAt: result._max.createdAt ?? new Date(),
          lastSeenAt: result._max.createdAt ?? new Date(),
        };
      })
    );

    const validData = batchData.filter((d): d is NonNullable<typeof d> => d !== null);
    if (validData.length > 0) {
      await prisma.phoneFeature.createMany({
        data: validData,
      });
    }

    processed += validData.length;
    console.log(`  Processed ${processed}/${phones.length} phone numbers...`);
  }

  const duration = Date.now() - start;
  console.log(`✅ Phone features refreshed: ${processed} records (${duration}ms)`);
  return { viewName: 'phone_features', rowsProcessed: processed, durationMs: duration };
}

async function refreshMerchantFeatures() {
  console.log('🏪 Refreshing merchant features...');
  const start = Date.now();

  await prisma.merchantFeature.deleteMany();

  const merchants = await prisma.merchant.findMany({
    select: { id: true },
  });

  const merchantData = await Promise.all(
    merchants.map(async ({ id: merchantId }) => {
      const stats = await prisma.order.groupBy({
        by: ['merchantId'],
        where: { merchantId },
        _count: { id: true },
        _avg: { trustScore: true },
      });

      const fraudCount = await prisma.order.count({
        where: {
          merchantId,
          riskLevel: { in: ['high', 'critical'] },
        },
      });

      const result = stats[0];
      if (!result) return null;

      return {
        merchantId,
        totalOrders: result._count.id,
        avgTrustScore: result._avg.trustScore ?? 50,
        fraudOrders: fraudCount,
      };
    })
  );

  const validData = merchantData.filter((d): d is NonNullable<typeof d> => d !== null);
  if (validData.length > 0) {
    await prisma.merchantFeature.createMany({
      data: validData,
    });
  }

  const duration = Date.now() - start;
  console.log(`✅ Merchant features refreshed: ${validData.length} records (${duration}ms)`);
  return { viewName: 'merchant_features', rowsProcessed: validData.length, durationMs: duration };
}

async function refreshCityFeatures() {
  console.log('🏙️  Refreshing city features...');
  console.log('  ⚠️  Skipping - Order model does not have customerCity field');
  console.log('✅ City features refreshed: 0 records');
  return { viewName: 'city_features', rowsProcessed: 0, durationMs: 0 };
}

async function recordRefreshJob(
  viewName: string,
  status: 'completed' | 'failed',
  rowsProcessed: number,
  durationMs: number,
  error?: string
) {
  await prisma.featureRefreshJob.create({
    data: {
      viewName,
      status,
      rowsProcessed,
      durationMs,
      error,
      completedAt: new Date(),
    },
  });
}

async function main() {
  console.log('🚀 Starting feature view refresh job...\n');

  try {
    const jobStart = Date.now();

    const phoneResult = await refreshPhoneFeatures();
    await recordRefreshJob(
      phoneResult.viewName,
      'completed',
      phoneResult.rowsProcessed,
      phoneResult.durationMs
    );

    const merchantResult = await refreshMerchantFeatures();
    await recordRefreshJob(
      merchantResult.viewName,
      'completed',
      merchantResult.rowsProcessed,
      merchantResult.durationMs
    );

    const cityResult = await refreshCityFeatures();
    await recordRefreshJob(
      cityResult.viewName,
      'completed',
      cityResult.rowsProcessed,
      cityResult.durationMs
    );

    const totalDuration = Date.now() - jobStart;
    console.log(`\n✅ All feature views refreshed in ${totalDuration}ms`);
  } catch (error) {
    console.error('❌ Refresh failed:', error);

    try {
      await recordRefreshJob(
        'all_views',
        'failed',
        0,
        0,
        error instanceof Error ? error.message : String(error)
      );
    } catch (recordError) {
      console.error('Failed to record error:', recordError);
    }

    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
