/**
 * A/B Testing Setup for Model Comparison
 * Tests new ML-enhanced model against baseline rule-based system
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ABTestConfig {
  testName: string;
  testDescription: string;
  baselineVariant: {
    name: string;
    description: string;
    modelType: 'rule_based';
  };
  treatmentVariant: {
    name: string;
    description: string;
    modelType: 'ml_enhanced';
    modelPath: string;
  };
  trafficSplit: number; // 0.0 to 1.0, portion going to treatment
  sampleSize: number;
  successMetrics: string[];
  startDate: Date;
  endDate?: Date;
  status: 'planning' | 'running' | 'completed' | 'stopped';
}

interface TestResult {
  variant: string;
  totalOrders: number;
  approvedOrders: number;
  rejectedOrders: number;
  fraudDetected: number;
  falsePositives: number;
  falseNegatives: number;
  avgProcessingTimeMs: number;
  precision: number;
  recall: number;
  f1Score: number;
  revenueImpact: number;
  customerSatisfaction: number;
}

async function setupABTest() {
  console.log('🧪 Setting up A/B Test for Model Comparison\n');

  const testConfig: ABTestConfig = {
    testName: 'ML_Enhanced_vs_RuleBased_v1',
    testDescription: 'Compare ML-enhanced fraud detection model against baseline rule-based system',
    baselineVariant: {
      name: 'rule_based_baseline',
      description: 'Current production rule-based system with fixed thresholds',
      modelType: 'rule_based',
    },
    treatmentVariant: {
      name: 'ml_enhanced_model',
      description: 'New ML model using enriched features (phone history, items, customer LTV, etc.)',
      modelType: 'ml_enhanced',
      modelPath: './src/engine/trust-engine.model.json',
    },
    trafficSplit: 0.5,
    sampleSize: 1000,
    successMetrics: [
      'fraud_detection_rate',
      'false_positive_rate', 
      'approval_rate',
      'revenue_impact',
      'processing_time',
      'customer_satisfaction',
    ],
    startDate: new Date(),
    endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
    status: 'planning',
  };

  // Save test configuration
  await prisma.aBTestConfig.create({
    data: {
      name: testConfig.testName,
      description: testConfig.testDescription,
      baselineVariant: JSON.stringify(testConfig.baselineVariant),
      treatmentVariant: JSON.stringify(testConfig.treatmentVariant),
      trafficSplit: testConfig.trafficSplit,
      sampleSize: testConfig.sampleSize,
      successMetrics: testConfig.successMetrics.join(','),
      startDate: testConfig.startDate,
      endDate: testConfig.endDate,
      status: testConfig.status,
    },
  });

  console.log('✅ A/B Test configuration saved');
  console.log('\n📊 Test Parameters:');
  console.log(`   Test Name: ${testConfig.testName}`);
  console.log(`   Sample Size: ${testConfig.sampleSize} orders`);
  console.log(`   Traffic Split: ${testConfig.trafficSplit * 100}% treatment / ${(1 - testConfig.trafficSplit) * 100}% baseline`);
  console.log(`   Duration: ${testConfig.startDate.toISOString()} to ${testConfig.endDate?.toISOString()}`);
  console.log(`\n🎯 Success Metrics:`);
  testConfig.successMetrics.forEach(metric => console.log(`   - ${metric}`));

  return testConfig;
}

async function collectTestResults(testId: string): Promise<TestResult[]> {
  console.log(`\n📥 Collecting test results for test: ${testId}`);

  const results = await prisma.aBTestResult.findMany({
    where: { testId },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });

  if (results.length === 0) {
    console.log('  No results found');
    return [];
  }

  // Aggregate results by variant
  const variantResults: Record<string, TestResult> = {};

  for (const result of results) {
    const variant = result.variant;
    if (!variantResults[variant]) {
      variantResults[variant] = {
        variant,
        totalOrders: 0,
        approvedOrders: 0,
        rejectedOrders: 0,
        fraudDetected: 0,
        falsePositives: 0,
        falseNegatives: 0,
        avgProcessingTimeMs: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        revenueImpact: 0,
        customerSatisfaction: 0,
      };
    }

    const vr = variantResults[variant];
    vr.totalOrders++;
    vr.avgProcessingTimeMs += result.processingTimeMs;

    if (result.predictedFraud) vr.approvedOrders++;
    else if (!result.predictedFraud) vr.rejectedOrders++;

    if (result.actualFraud && result.predictedFraud) vr.fraudDetected++;
    if (!result.actualFraud && result.predictedFraud) vr.falsePositives++;
    if (result.actualFraud && !result.predictedFraud) vr.falseNegatives++;

    vr.revenueImpact += result.revenueImpact || 0;
    vr.customerSatisfaction += result.customerSatisfaction || 0;
  }

  // Calculate final metrics
  const finalResults = Object.values(variantResults).map(vr => {
    const tp = vr.fraudDetected;
    const fp = vr.falsePositives;
    const fn = vr.falseNegatives;
    const tn = vr.totalOrders - tp - fp - fn;

    const precision = tp / (tp + fp) || 0;
    const recall = tp / (tp + fn) || 0;
    const f1Score = 2 * precision * recall / (precision + recall) || 0;

    return {
      ...vr,
      avgProcessingTimeMs: vr.avgProcessingTimeMs / vr.totalOrders,
      precision,
      recall,
      f1Score,
      revenueImpact: vr.revenueImpact,
      customerSatisfaction: vr.customerSatisfaction / vr.totalOrders,
    };
  });

  console.log(`  Found ${results.length} test results across ${finalResults.length} variants`);
  return finalResults;
}

async function analyzeResults(results: TestResult[]) {
  console.log('\n📈 A/B Test Analysis\n');
  console.log('='.repeat(80));

  for (const result of results) {
    console.log(`\n📊 Variant: ${result.variant}`);
    console.log(`   Total Orders:       ${result.totalOrders}`);
    console.log(`   Approved Orders:    ${result.approvedOrders} (${(result.approvedOrders / result.totalOrders * 100).toFixed(1)}%)`);
    console.log(`   Rejected Orders:    ${result.rejectedOrders} (${(result.rejectedOrders / result.totalOrders * 100).toFixed(1)}%)`);
    console.log(`\n   Fraud Detection:`);
    console.log(`     True Positives:   ${result.fraudDetected}`);
    console.log(`     False Positives:  ${result.falsePositives}`);
    console.log(`     False Negatives:  ${result.falseNegatives}`);
    console.log(`\n   Performance Metrics:`);
    console.log(`     Precision:        ${(result.precision * 100).toFixed(2)}%`);
    console.log(`     Recall:           ${(result.recall * 100).toFixed(2)}%`);
    console.log(`     F1-Score:         ${(result.f1Score * 100).toFixed(2)}%`);
    console.log(`     Avg Processing:   ${result.avgProcessingTimeMs.toFixed(0)}ms`);
    console.log(`\n   Business Impact:`);
    console.log(`     Revenue Impact:   ${result.revenueImpact.toFixed(2)} TND`);
    console.log(`     Customer Sat:     ${(result.customerSatisfaction * 100).toFixed(1)}/100`);
  }

  // Compare variants
  if (results.length === 2) {
    console.log('\n' + '='.repeat(80));
    console.log('\n🔍 Variant Comparison\n');

    const [baseline, treatment] = results;

    const precisionDiff = ((treatment.precision - baseline.precision) / baseline.precision * 100);
    const recallDiff = ((treatment.recall - baseline.recall) / baseline.recall * 100);
    const f1Diff = ((treatment.f1Score - baseline.f1Score) / baseline.f1Score * 100);
    const fpDiff = ((treatment.falsePositives - baseline.falsePositives) / baseline.totalOrders * 100);

    console.log(`   Precision Change:    ${precisionDiff >= 0 ? '+' : ''}${precisionDiff.toFixed(2)}% ${treatment.precision > baseline.precision ? '✅' : '⚠️'}`);
    console.log(`   Recall Change:       ${recallDiff >= 0 ? '+' : ''}${recallDiff.toFixed(2)}% ${treatment.recall > baseline.recall ? '✅' : '⚠️'}`);
    console.log(`   F1-Score Change:     ${f1Diff >= 0 ? '+' : ''}${f1Diff.toFixed(2)}% ${treatment.f1Score > baseline.f1Score ? '✅' : '⚠️'}`);
    console.log(`   False Positive Rate: ${fpDiff >= 0 ? '+' : ''}${fpDiff.toFixed(3)}% ${treatment.falsePositives < baseline.falsePositives ? '✅' : '⚠️'}`);

    if (f1Diff > 5 && fpDiff < 0) {
      console.log('\n   ✅ RECOMMENDATION: Deploy ML-enhanced model to production');
    } else if (f1Diff > 0) {
      console.log('\n   🟡 RECOMMENDATION: Consider phased rollout with monitoring');
    } else {
      console.log('\n   ⚠️  RECOMMENDATION: Continue using baseline model');
    }
  }

  console.log('\n' + '='.repeat(80));
}

async function main() {
  console.log('🚀 Initializing A/B Testing Framework\n');

  try {
    // Create test configuration
    const testConfig = await setupABTest();

    // Simulate collecting results (in production, this would query actual test data)
    console.log('\n⏳ Waiting for test data collection...');
    console.log('   (In production, run this after collecting test samples)\n');

    // Create sample results for demonstration
    const sampleResults = [
      {
        testId: testConfig.testName,
        variant: testConfig.baselineVariant.name,
        orderId: 1,
        predictedFraud: false,
        actualFraud: false,
        processingTimeMs: 45,
        revenueImpact: 150,
        customerSatisfaction: 0.9,
        createdAt: new Date(),
      },
      {
        testId: testConfig.testName,
        variant: testConfig.treatmentVariant.name,
        orderId: 2,
        predictedFraud: true,
        actualFraud: true,
        processingTimeMs: 62,
        revenueImpact: 0,
        customerSatisfaction: 0.7,
        createdAt: new Date(),
      },
    ];

    // Save sample results
    for (const result of sampleResults) {
      await prisma.aBTestResult.create({ data: result });
    }

    // Collect and analyze results
    const results = await collectTestResults(testConfig.testName);
    await analyzeResults(results);

    console.log('\n✅ A/B Test Analysis Complete\n');

  } catch (error) {
    console.error('\n❌ Analysis failed:', error instanceof Error ? error.message : error);
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
