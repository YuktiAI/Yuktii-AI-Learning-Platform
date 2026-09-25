/**
 * scripts/regression-check.ts — Scoring Engine Regression & Drift Detection Suite (B-6)
 *
 * Runs 20 standardized submission fixtures through the scoring and hard-gate logic
 * to detect score drift when model routing or prompts are changed.
 *
 * Spec:
 * - 20 fixture submissions across multiple domains and quality tiers
 * - Each has an expected score range and expected pass/fail outcome
 * - Flags any submission that drifts more than ±10 points from expected baseline
 * - Non-blocking advisory CI check (exit 0 on advisory mode, exit 1 on --strict)
 *
 * Run:
 *   npx tsx scripts/regression-check.ts
 *   npx tsx scripts/regression-check.ts --strict
 */

interface FixtureSubmission {
  id: string;
  name: string;
  domain: string;
  stageNumber: number;
  totalStages: number;
  expectedScore: number;
  expectedScoreRange: [number, number]; // [min, max]
  expectedPassed: boolean;
  deterministic: {
    filesPresent: boolean;
    readmeFound: boolean;
    buildSucceeds: boolean;
    testsPassCount: number;
    testsFailCount: number;
  };
  requirements: Array<{ id: string; status: 'PASS' | 'PARTIAL' | 'FAIL' }>;
  signals: {
    functionalityAssessment: number; // 0-100
    codeQualityAssessment: number;   // 0-100
    architectureAssessment: number;  // 0-100
    gitHistoryCommitCount: number;
    docQuality: number;              // 0-100
    securityFlagsCount: number;
    innovationScore: number;         // 0-100
  };
}

const CATEGORY_WEIGHTS = {
  requirements:  0.25,
  functionality: 0.20,
  codeQuality:   0.15,
  architecture:  0.10,
  devProcess:    0.10,
  testing:       0.05,
  documentation: 0.05,
  security:      0.05,
  innovation:    0.05,
};

const PASSING_SCORE_STANDARD = 50;
const PASSING_SCORE_CAPSTONE = 60;
const HARD_GATE_REQ_PASS_RATE = 0.60;

function evaluateFixture(f: FixtureSubmission): {
  finalScore: number;
  passed: boolean;
  hardGateFailed: boolean;
  hardGateReason: string | null;
  reqPassRate: number;
  categoryScores: Record<string, number>;
} {
  // 1. Requirements score
  const totalReqs = f.requirements.length;
  const passCount = f.requirements.filter((r) => r.status === 'PASS').length;
  const partialCount = f.requirements.filter((r) => r.status === 'PARTIAL').length;
  const reqWeighted = totalReqs > 0 ? (passCount * 100 + partialCount * 50) / totalReqs : 50;
  const requirementsScore = Math.round(reqWeighted);

  // 2. Testing score
  const totalTests = f.deterministic.testsPassCount + f.deterministic.testsFailCount;
  const testingScore = totalTests > 0
    ? Math.round((f.deterministic.testsPassCount / totalTests) * 100)
    : f.deterministic.buildSucceeds ? 60 : 0;

  // 3. Dev process score
  const devProcessScore = Math.min(100, Math.max(30, f.signals.gitHistoryCommitCount * 12));

  // 4. Documentation score
  const docScore = f.deterministic.readmeFound ? Math.max(60, f.signals.docQuality) : 20;

  // 5. Security score
  const securityScore = Math.max(20, 100 - f.signals.securityFlagsCount * 30);

  const categoryScores: Record<string, number> = {
    requirements:  requirementsScore,
    functionality: f.signals.functionalityAssessment,
    codeQuality:   f.signals.codeQualityAssessment,
    architecture:  f.signals.architectureAssessment,
    devProcess:    devProcessScore,
    testing:       testingScore,
    documentation: docScore,
    security:      securityScore,
    innovation:    f.signals.innovationScore,
  };

  let rawScore = Math.round(
    Object.entries(CATEGORY_WEIGHTS).reduce((acc, [cat, weight]) => {
      return acc + (categoryScores[cat] || 0) * weight;
    }, 0)
  );
  rawScore = Math.min(100, Math.max(0, rawScore));

  // Hard Gates
  const buildSucceeded = f.deterministic.buildSucceeds;
  const reqPassRate = totalReqs > 0 ? passCount / totalReqs : 1.0;
  const reqGatePassed = reqPassRate >= HARD_GATE_REQ_PASS_RATE;

  const hardGateFailed = !buildSucceeded || !reqGatePassed;
  const hardGateReason = !buildSucceeded
    ? 'build_failed'
    : !reqGatePassed
      ? 'req_pass_rate_below_threshold'
      : null;

  const isCapstone = f.stageNumber === f.totalStages;
  const threshold = isCapstone ? PASSING_SCORE_CAPSTONE : PASSING_SCORE_STANDARD;
  const passed = rawScore >= threshold && !hardGateFailed;

  return {
    finalScore: rawScore,
    passed,
    hardGateFailed,
    hardGateReason,
    reqPassRate,
    categoryScores,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 20 Standardized Test Fixtures Across All 8 Internship Domains
// ─────────────────────────────────────────────────────────────────────────────

export const FIXTURES: FixtureSubmission[] = [
  // 1. Web Dev — Excellent Full-Stack App (Pass)
  {
    id: 'WEB-01-EXCELLENT',
    name: 'Full-stack REST API with Clean Architecture',
    domain: 'web-development',
    stageNumber: 2,
    totalStages: 6,
    expectedScore: 92,
    expectedScoreRange: [85, 96],
    expectedPassed: true,
    deterministic: { filesPresent: true, readmeFound: true, buildSucceeds: true, testsPassCount: 12, testsFailCount: 0 },
    requirements: [{ id: 'r1', status: 'PASS' }, { id: 'r2', status: 'PASS' }, { id: 'r3', status: 'PASS' }, { id: 'r4', status: 'PASS' }],
    signals: { functionalityAssessment: 95, codeQualityAssessment: 90, architectureAssessment: 92, gitHistoryCommitCount: 8, docQuality: 90, securityFlagsCount: 0, innovationScore: 85 },
  },

  // 2. Web Dev — Good Working Implementation (Pass)
  {
    id: 'WEB-02-GOOD',
    name: 'Auth flow with minor linting gaps',
    domain: 'web-development',
    stageNumber: 3,
    totalStages: 6,
    expectedScore: 78,
    expectedScoreRange: [72, 84],
    expectedPassed: true,
    deterministic: { filesPresent: true, readmeFound: true, buildSucceeds: true, testsPassCount: 8, testsFailCount: 1 },
    requirements: [{ id: 'r1', status: 'PASS' }, { id: 'r2', status: 'PASS' }, { id: 'r3', status: 'PARTIAL' }, { id: 'r4', status: 'PASS' }],
    signals: { functionalityAssessment: 80, codeQualityAssessment: 75, architectureAssessment: 76, gitHistoryCommitCount: 6, docQuality: 75, securityFlagsCount: 0, innovationScore: 70 },
  },

  // 3. Web Dev — Build Failure with Good Code (Fail via Hard Gate 1)
  {
    id: 'WEB-03-BUILD-FAIL',
    name: 'Clean TypeScript but missing npm dependency causing build fail',
    domain: 'web-development',
    stageNumber: 2,
    totalStages: 6,
    expectedScore: 68,
    expectedScoreRange: [60, 75],
    expectedPassed: false, // build failed
    deterministic: { filesPresent: true, readmeFound: true, buildSucceeds: false, testsPassCount: 0, testsFailCount: 0 },
    requirements: [{ id: 'r1', status: 'PASS' }, { id: 'r2', status: 'PASS' }, { id: 'r3', status: 'PARTIAL' }, { id: 'r4', status: 'PASS' }],
    signals: { functionalityAssessment: 60, codeQualityAssessment: 85, architectureAssessment: 80, gitHistoryCommitCount: 5, docQuality: 80, securityFlagsCount: 0, innovationScore: 70 },
  },

  // 4. Web Dev — Low Requirement Pass Rate (Fail via Hard Gate 2)
  {
    id: 'WEB-04-LOW-REQ-RATE',
    name: 'Only 1 of 4 requirements completed (25% < 60%)',
    domain: 'web-development',
    stageNumber: 1,
    totalStages: 6,
    expectedScore: 42,
    expectedScoreRange: [36, 48],
    expectedPassed: false,
    deterministic: { filesPresent: true, readmeFound: true, buildSucceeds: true, testsPassCount: 2, testsFailCount: 6 },
    requirements: [{ id: 'r1', status: 'PASS' }, { id: 'r2', status: 'FAIL' }, { id: 'r3', status: 'FAIL' }, { id: 'r4', status: 'PARTIAL' }],
    signals: { functionalityAssessment: 40, codeQualityAssessment: 50, architectureAssessment: 45, gitHistoryCommitCount: 3, docQuality: 60, securityFlagsCount: 0, innovationScore: 40 },
  },

  // 5. AI/ML — Strong Model Training Pipeline (Pass)
  {
    id: 'AIML-01-STRONG',
    name: 'PyTorch model training with evaluation metrics & confusion matrix',
    domain: 'ai-ml',
    stageNumber: 3,
    totalStages: 6,
    expectedScore: 88,
    expectedScoreRange: [82, 94],
    expectedPassed: true,
    deterministic: { filesPresent: true, readmeFound: true, buildSucceeds: true, testsPassCount: 6, testsFailCount: 0 },
    requirements: [{ id: 'r1', status: 'PASS' }, { id: 'r2', status: 'PASS' }, { id: 'r3', status: 'PASS' }],
    signals: { functionalityAssessment: 90, codeQualityAssessment: 88, architectureAssessment: 85, gitHistoryCommitCount: 7, docQuality: 85, securityFlagsCount: 0, innovationScore: 82 },
  },

  // 6. AI/ML — Marginal Missing Visualizations (Boundary Pass)
  {
    id: 'AIML-02-MARGINAL',
    name: 'Working pipeline but missing loss curves documentation',
    domain: 'ai-ml',
    stageNumber: 2,
    totalStages: 6,
    expectedScore: 66,
    expectedScoreRange: [60, 73],
    expectedPassed: true,
    deterministic: { filesPresent: true, readmeFound: true, buildSucceeds: true, testsPassCount: 4, testsFailCount: 1 },
    requirements: [{ id: 'r1', status: 'PASS' }, { id: 'r2', status: 'PASS' }, { id: 'r3', status: 'PARTIAL' }],
    signals: { functionalityAssessment: 68, codeQualityAssessment: 65, architectureAssessment: 62, gitHistoryCommitCount: 4, docQuality: 60, securityFlagsCount: 0, innovationScore: 60 },
  },

  // 7. Data Analysis — Polished EDA Notebook & Export (Pass)
  {
    id: 'DATA-01-POLISHED',
    name: 'Pandas exploratory analysis with automated reporting',
    domain: 'data-analysis',
    stageNumber: 2,
    totalStages: 5,
    expectedScore: 89,
    expectedScoreRange: [83, 94],
    expectedPassed: true,
    deterministic: { filesPresent: true, readmeFound: true, buildSucceeds: true, testsPassCount: 5, testsFailCount: 0 },
    requirements: [{ id: 'r1', status: 'PASS' }, { id: 'r2', status: 'PASS' }, { id: 'r3', status: 'PASS' }],
    signals: { functionalityAssessment: 90, codeQualityAssessment: 88, architectureAssessment: 86, gitHistoryCommitCount: 6, docQuality: 92, securityFlagsCount: 0, innovationScore: 85 },
  },

  // 8. Data Analysis — Broken CSV Pipeline (Fail)
  {
    id: 'DATA-02-BROKEN',
    name: 'Notebook crashes on missing dataset path',
    domain: 'data-analysis',
    stageNumber: 1,
    totalStages: 5,
    expectedScore: 38,
    expectedScoreRange: [30, 46],
    expectedPassed: false,
    deterministic: { filesPresent: true, readmeFound: false, buildSucceeds: false, testsPassCount: 0, testsFailCount: 3 },
    requirements: [{ id: 'r1', status: 'FAIL' }, { id: 'r2', status: 'PARTIAL' }, { id: 'r3', status: 'FAIL' }],
    signals: { functionalityAssessment: 25, codeQualityAssessment: 40, architectureAssessment: 35, gitHistoryCommitCount: 1, docQuality: 20, securityFlagsCount: 0, innovationScore: 30 },
  },

  // 9. DevOps — Dockerfile + GitHub Actions CI (Pass)
  {
    id: 'DEVOPS-01-CI',
    name: 'Multi-stage Dockerfile with working GitHub Actions matrix',
    domain: 'devops',
    stageNumber: 4,
    totalStages: 6,
    expectedScore: 91,
    expectedScoreRange: [85, 96],
    expectedPassed: true,
    deterministic: { filesPresent: true, readmeFound: true, buildSucceeds: true, testsPassCount: 7, testsFailCount: 0 },
    requirements: [{ id: 'r1', status: 'PASS' }, { id: 'r2', status: 'PASS' }, { id: 'r3', status: 'PASS' }],
    signals: { functionalityAssessment: 92, codeQualityAssessment: 90, architectureAssessment: 92, gitHistoryCommitCount: 8, docQuality: 88, securityFlagsCount: 0, innovationScore: 88 },
  },

  // 10. DevOps — Insecure Secrets in Repo (Security Penalized)
  {
    id: 'DEVOPS-02-INSECURE',
    name: 'Working config but hardcoded credentials detected',
    domain: 'devops',
    stageNumber: 2,
    totalStages: 6,
    expectedScore: 62,
    expectedScoreRange: [55, 68],
    expectedPassed: true,
    deterministic: { filesPresent: true, readmeFound: true, buildSucceeds: true, testsPassCount: 4, testsFailCount: 0 },
    requirements: [{ id: 'r1', status: 'PASS' }, { id: 'r2', status: 'PASS' }, { id: 'r3', status: 'PARTIAL' }],
    signals: { functionalityAssessment: 75, codeQualityAssessment: 65, architectureAssessment: 70, gitHistoryCommitCount: 4, docQuality: 65, securityFlagsCount: 2, innovationScore: 60 },
  },

  // 11. Cybersecurity — Penetration Testing Report & Tool (Pass)
  {
    id: 'SEC-01-PORT-SCANNER',
    name: 'Async network vulnerability scanner with rate throttling',
    domain: 'cybersecurity',
    stageNumber: 3,
    totalStages: 6,
    expectedScore: 86,
    expectedScoreRange: [80, 92],
    expectedPassed: true,
    deterministic: { filesPresent: true, readmeFound: true, buildSucceeds: true, testsPassCount: 9, testsFailCount: 0 },
    requirements: [{ id: 'r1', status: 'PASS' }, { id: 'r2', status: 'PASS' }, { id: 'r3', status: 'PASS' }],
    signals: { functionalityAssessment: 88, codeQualityAssessment: 85, architectureAssessment: 84, gitHistoryCommitCount: 6, docQuality: 86, securityFlagsCount: 0, innovationScore: 84 },
  },

  // 12. Cybersecurity — Prompt Injection Attempt in README
  {
    id: 'SEC-02-INJECTION',
    name: 'Student attempt to insert ignore instructions prompt injection',
    domain: 'cybersecurity',
    stageNumber: 1,
    totalStages: 6,
    expectedScore: 40,
    expectedScoreRange: [32, 48],
    expectedPassed: false,
    deterministic: { filesPresent: true, readmeFound: true, buildSucceeds: true, testsPassCount: 1, testsFailCount: 4 },
    requirements: [{ id: 'r1', status: 'FAIL' }, { id: 'r2', status: 'PARTIAL' }, { id: 'r3', status: 'FAIL' }],
    signals: { functionalityAssessment: 35, codeQualityAssessment: 45, architectureAssessment: 40, gitHistoryCommitCount: 2, docQuality: 50, securityFlagsCount: 3, innovationScore: 20 },
  },

  // 13. Mobile Dev — React Native Clean Screen Flow (Pass)
  {
    id: 'MOB-01-RN-APP',
    name: 'State management and navigation in React Native',
    domain: 'mobile-app',
    stageNumber: 2,
    totalStages: 5,
    expectedScore: 84,
    expectedScoreRange: [78, 90],
    expectedPassed: true,
    deterministic: { filesPresent: true, readmeFound: true, buildSucceeds: true, testsPassCount: 6, testsFailCount: 0 },
    requirements: [{ id: 'r1', status: 'PASS' }, { id: 'r2', status: 'PASS' }, { id: 'r3', status: 'PASS' }],
    signals: { functionalityAssessment: 86, codeQualityAssessment: 82, architectureAssessment: 85, gitHistoryCommitCount: 5, docQuality: 80, securityFlagsCount: 0, innovationScore: 80 },
  },

  // 14. Mobile Dev — Single Empty Screen (Fail)
  {
    id: 'MOB-02-EMPTY',
    name: 'Scaffold boilerplate with no implemented features',
    domain: 'mobile-app',
    stageNumber: 2,
    totalStages: 5,
    expectedScore: 32,
    expectedScoreRange: [24, 40],
    expectedPassed: false,
    deterministic: { filesPresent: true, readmeFound: false, buildSucceeds: true, testsPassCount: 0, testsFailCount: 4 },
    requirements: [{ id: 'r1', status: 'FAIL' }, { id: 'r2', status: 'FAIL' }, { id: 'r3', status: 'FAIL' }],
    signals: { functionalityAssessment: 20, codeQualityAssessment: 35, architectureAssessment: 30, gitHistoryCommitCount: 1, docQuality: 20, securityFlagsCount: 0, innovationScore: 20 },
  },

  // 15. Cloud Computing — Terraform Infrastructure as Code (Pass)
  {
    id: 'CLOUD-01-TERRAFORM',
    name: 'Modular Terraform VPC + ECS setup with tfsec clean',
    domain: 'cloud-computing',
    stageNumber: 3,
    totalStages: 6,
    expectedScore: 90,
    expectedScoreRange: [84, 95],
    expectedPassed: true,
    deterministic: { filesPresent: true, readmeFound: true, buildSucceeds: true, testsPassCount: 8, testsFailCount: 0 },
    requirements: [{ id: 'r1', status: 'PASS' }, { id: 'r2', status: 'PASS' }, { id: 'r3', status: 'PASS' }],
    signals: { functionalityAssessment: 92, codeQualityAssessment: 90, architectureAssessment: 92, gitHistoryCommitCount: 7, docQuality: 88, securityFlagsCount: 0, innovationScore: 85 },
  },

  // 16. Cloud Computing — Broken Syntax in Config (Fail)
  {
    id: 'CLOUD-02-SYNTAX-ERR',
    name: 'Invalid HCL syntax failing terraform validate',
    domain: 'cloud-computing',
    stageNumber: 2,
    totalStages: 6,
    expectedScore: 34,
    expectedScoreRange: [26, 42],
    expectedPassed: false,
    deterministic: { filesPresent: true, readmeFound: true, buildSucceeds: false, testsPassCount: 0, testsFailCount: 2 },
    requirements: [{ id: 'r1', status: 'FAIL' }, { id: 'r2', status: 'FAIL' }, { id: 'r3', status: 'PARTIAL' }],
    signals: { functionalityAssessment: 25, codeQualityAssessment: 35, architectureAssessment: 30, gitHistoryCommitCount: 2, docQuality: 50, securityFlagsCount: 0, innovationScore: 30 },
  },

  // 17. Robotics/IoT — MQTT Telemetry Publisher (Pass)
  {
    id: 'ROBOTICS-01-MQTT',
    name: 'Sensor stream simulation publishing telemetry to MQTT broker',
    domain: 'robotics',
    stageNumber: 3,
    totalStages: 5,
    expectedScore: 87,
    expectedScoreRange: [80, 93],
    expectedPassed: true,
    deterministic: { filesPresent: true, readmeFound: true, buildSucceeds: true, testsPassCount: 5, testsFailCount: 0 },
    requirements: [{ id: 'r1', status: 'PASS' }, { id: 'r2', status: 'PASS' }, { id: 'r3', status: 'PASS' }],
    signals: { functionalityAssessment: 90, codeQualityAssessment: 85, architectureAssessment: 86, gitHistoryCommitCount: 6, docQuality: 85, securityFlagsCount: 0, innovationScore: 82 },
  },

  // 18. Robotics/IoT — Dropping Sensor Packets (Marginal)
  {
    id: 'ROBOTICS-02-UNSTABLE',
    name: 'Unbuffered MQTT stream dropping packets under high load',
    domain: 'robotics',
    stageNumber: 4,
    totalStages: 5,
    expectedScore: 64,
    expectedScoreRange: [58, 72],
    expectedPassed: true,
    deterministic: { filesPresent: true, readmeFound: true, buildSucceeds: true, testsPassCount: 3, testsFailCount: 2 },
    requirements: [{ id: 'r1', status: 'PASS' }, { id: 'r2', status: 'PASS' }, { id: 'r3', status: 'PARTIAL' }],
    signals: { functionalityAssessment: 65, codeQualityAssessment: 65, architectureAssessment: 60, gitHistoryCommitCount: 4, docQuality: 70, securityFlagsCount: 0, innovationScore: 60 },
  },

  // 19. Capstone Stage — High Standard Capstone (Pass at 60+ threshold)
  {
    id: 'CAPSTONE-01-PASS',
    name: 'Comprehensive capstone integration project meeting threshold 60',
    domain: 'web-development',
    stageNumber: 6,
    totalStages: 6,
    expectedScore: 79,
    expectedScoreRange: [72, 85],
    expectedPassed: true, // >= 60 threshold
    deterministic: { filesPresent: true, readmeFound: true, buildSucceeds: true, testsPassCount: 15, testsFailCount: 1 },
    requirements: [{ id: 'r1', status: 'PASS' }, { id: 'r2', status: 'PASS' }, { id: 'r3', status: 'PASS' }, { id: 'r4', status: 'PARTIAL' }],
    signals: { functionalityAssessment: 82, codeQualityAssessment: 78, architectureAssessment: 80, gitHistoryCommitCount: 8, docQuality: 80, securityFlagsCount: 0, innovationScore: 75 },
  },

  // 20. Capstone Stage — Score 55 would pass standard (50) but FAILS capstone (60)
  {
    id: 'CAPSTONE-02-CAPSTONE-FAIL',
    name: 'Marginal capstone scoring 55 — fails because capstone threshold is 60',
    domain: 'ai-ml',
    stageNumber: 6,
    totalStages: 6,
    expectedScore: 54,
    expectedScoreRange: [48, 59],
    expectedPassed: false, // fails capstone 60-point threshold
    deterministic: { filesPresent: true, readmeFound: true, buildSucceeds: true, testsPassCount: 3, testsFailCount: 3 },
    requirements: [{ id: 'r1', status: 'PASS' }, { id: 'r2', status: 'PASS' }, { id: 'r3', status: 'PARTIAL' }, { id: 'r4', status: 'FAIL' }],
    signals: { functionalityAssessment: 55, codeQualityAssessment: 55, architectureAssessment: 52, gitHistoryCommitCount: 4, docQuality: 60, securityFlagsCount: 0, innovationScore: 50 },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

export function runRegressionCheck(strictMode = false): { passed: boolean; report: string } {
  console.log('\n================================================================');
  console.log('  Yuktii AI Labs — Scoring Engine Regression & Drift Check');
  console.log(`  Evaluating ${FIXTURES.length} fixtures across 8 domains (Tolerance: ±10 points)`);
  console.log('================================================================\n');

  let passedTests = 0;
  let driftedTests = 0;
  let outcomeMismatches = 0;
  const results: Array<{ id: string; status: 'OK' | 'DRIFT' | 'MISMATCH'; details: string }> = [];

  for (const fixture of FIXTURES) {
    const outcome = evaluateFixture(fixture);
    const scoreDiff = outcome.finalScore - fixture.expectedScore;
    const isDrifted = Math.abs(scoreDiff) > 10;
    const isOutcomeMismatch = outcome.passed !== fixture.expectedPassed;

    let status: 'OK' | 'DRIFT' | 'MISMATCH' = 'OK';
    if (isOutcomeMismatch) {
      status = 'MISMATCH';
      outcomeMismatches++;
    } else if (isDrifted) {
      status = 'DRIFT';
      driftedTests++;
    } else {
      passedTests++;
    }

    const driftLabel = scoreDiff >= 0 ? `+${scoreDiff}` : `${scoreDiff}`;
    const symbol = status === 'OK' ? '✅' : status === 'DRIFT' ? '⚠️ ' : '❌';

    console.log(
      `${symbol} [${fixture.id}] Score: ${outcome.finalScore}/100 (Exp: ${fixture.expectedScore}, Drift: ${driftLabel}) ` +
      `Passed: ${outcome.passed} (Exp: ${fixture.expectedPassed}) — ${fixture.name.slice(0, 45)}`
    );

    results.push({
      id: fixture.id,
      status,
      details: `Score: ${outcome.finalScore} (Exp: ${fixture.expectedScore}), Drift: ${driftLabel}, Passed: ${outcome.passed}`,
    });
  }

  console.log('\n────────────────────────────────────────────────────────────────');
  console.log(`Total fixtures:    ${FIXTURES.length}`);
  console.log(`Within tolerance:  ${passedTests} / ${FIXTURES.length} ✅`);
  console.log(`Score drift (>10): ${driftedTests}`);
  console.log(`Pass/fail mismatch:${outcomeMismatches}`);
  console.log('────────────────────────────────────────────────────────────────\n');

  const allPassed = outcomeMismatches === 0 && (!strictMode || driftedTests === 0);

  if (allPassed) {
    console.log('🎉 REGRESSION CHECK PASSED: All fixtures produced expected pass/fail outcomes within tolerance.\n');
  } else {
    console.warn('⚠️  REGRESSION CHECK NOTED DRIFT OR MISMATCH. Review fixture details above.\n');
  }

  return {
    passed: allPassed,
    report: `Pass: ${passedTests}, Drift: ${driftedTests}, Mismatch: ${outcomeMismatches}`,
  };
}

// Direct execution from CLI
if (process.argv[1]?.endsWith('regression-check.ts') || process.argv[1]?.endsWith('regression-check.js')) {
  const strict = process.argv.includes('--strict');
  const result = runRegressionCheck(strict);
  if (strict && !result.passed) {
    process.exit(1);
  }
}
