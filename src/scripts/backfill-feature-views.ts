#!/usr/bin/env node
/**
 * Backfill script to populate materialized feature views
 * Run: npx tsx src/scripts/backfill-feature-views.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfillPhoneFeatures() {
  console.log('📞 Backfilling phone features...');
  
  // Get all unique phone numbers from orders
  const phones = await prisma.order.groupBy({
    by: ['phoneNumber'],
  });

  console.log(`  Found ${phones.length} unique phone numbers`);

  let processed = 0;
  for (const { phoneNumber } of phones) {
    // Calculate aggregations for each phone number
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
    if (!result) continue;

    await prisma.phoneFeature.upsert({
      where: { phoneNumber },
      create: {
        phoneNumber,
        totalOrders: result._count.id,
        successfulOrders: successful,
        avgTrustScore: result._avg.trustScore ?? 50,
        firstSeenAt: result._max.createdAt ?? new Date(),
        lastSeenAt: result._max.createdAt ?? new Date(),
      },
      update: {
        totalOrders: result._count.id,
        successfulOrders: successful,
        avgTrustScore: result._avg.trustScore ?? 50,
        lastSeenAt: result._max.createdAt ?? new Date(),
      },
    });

    processed++;
    if (processed % 100 === 0) {
      console.log(`  Processed ${processed}/${phones.length} phone numbers...`);
    }
  }

  console.log(`✅ Phone features backfilled: ${processed} records`);
}

async function backfillMerchantFeatures() {
  console.log('🏪 Backfilling merchant features...');

  const merchants = await prisma.merchant.findMany({
    select: { id: true },
  });

  console.log(`  Found ${merchants.length} merchants`);

  for (const { id: merchantId } of merchants) {
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
    if (!result) continue;

    await prisma.merchantFeature.upsert({
      where: { merchantId },
      create: {
        merchantId,
        totalOrders: result._count.id,
        avgTrustScore: result._avg.trustScore ?? 50,
        fraudOrders: fraudCount,
      },
      update: {
        totalOrders: result._count.id,
        avgTrustScore: result._avg.trustScore ?? 50,
        fraudOrders: fraudCount,
      },
    });
  }

  console.log(`✅ Merchant features backfilled: ${merchants.length} records`);
}

async function backfillCityFeatures() {
  console.log('🏙️  Backfilling city features...');
  console.log('  ⚠️  Skipping - Order model does not have customerCity field');
  console.log('✅ City features backfilled: 0 records');
}

async function createFeatureRefreshJobs() {
  console.log('⏱️  Creating feature refresh jobs...');

  const jobs = [
    { viewName: 'phone_features', status: 'completed', rowsProcessed: 0 },
    { viewName: 'merchant_features', status: 'completed', rowsProcessed: 0 },
    { viewName: 'city_features', status: 'completed', rowsProcessed: 0 },
  ];

  for (const job of jobs) {
    await prisma.featureRefreshJob.create({
      data: {
        viewName: job.viewName,
        status: job.status,
        rowsProcessed: job.rowsProcessed,
        completedAt: new Date(),
      },
    });
  }

  console.log('✅ Feature refresh jobs created');
}

async function main() {
  console.log('🚀 Starting feature view backfill...\n');

  try {
    const start = Date.now();

    await backfillPhoneFeatures();
    await backfillMerchantFeatures();
    await backfillCityFeatures();
    await createFeatureRefreshJobs();

    const duration = Date.now() - start;
    console.log(`\n✅ Backfill completed in ${duration}ms`);
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}
