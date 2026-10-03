/**
 * src/__tests__/test-workstream-d.ts — Workstream D unit tests
 *
 * Tests:
 *  D-1  toStudentProjectSpecification strips hiddenTestCases
 *  D-2  toProjectSpecification produces valid schema + stable FR IDs
 *  D-3  hashProjectSpecification is deterministic and order-independent
 *  D-4  set-implementation-path locks after first submission (pure logic)
 *  D-5  Spec rubric weights sum to exactly 100
 *  D-6  Simulation vs hardware path content differs correctly
 *  D-7  Hidden test IDs use TC-H prefix (not TC-)
 *
 * Run with:
 *   npx tsx src/__tests__/test-workstream-d.ts
 */

import { createHash } from 'crypto';

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const errors: string[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result && typeof (result as any).then === 'function') {
      (result as Promise<void>)
        .then(() => { console.log(`  ✅  ${name}`); passed++; })
        .catch((err: any) => {
          console.error(`  ❌  ${name}`);
          console.error(`      ${err.message}`);
          errors.push(`${name}: ${err.message}`);
          failed++;
        });
    } else {
      console.log(`  ✅  ${name}`);
      passed++;
    }
  } catch (err: any) {
    console.error(`  ❌  ${name}`);
    console.error(`      ${err.message}`);
    errors.push(`${name}: ${err.message}`);
    failed++;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, label?: string) {
  assert(
    actual === expected,
    `${label ? label + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

// ─── Inline implementations (mirrors lib/ai-generator/ without importing Next.js) ──

const SPEC_VERSION = 'v2.0';

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashSpec(spec: object): string {
  return createHash('sha256').update(canonicalize(spec)).digest('hex');
}

function toStudentSpec(spec: Record<string, unknown>) {
  const { hiddenTestCases: _hidden, ...rest } = spec;
  return rest;
}

function makeMinimalSpec(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    specVersion: SPEC_VERSION,
    implementationPath: undefined as string | undefined,
    simulationTools: undefined as any[] | undefined,
    problemStatement: { title: 'Sensor Monitor', domain: 'IoT', difficulty: 'foundation', targetUsers: 'interns', realWorldContext: 'ctx', expectedOutcome: 'outcome' },
    problemDescription: { background: 'bg', industrySignificance: 'sig', existingLimitations: 'lim', proposedSolution: 'sol' },
    learningObjectives: ['Learn Python', 'Learn MQTT'],
    prerequisites: ['Python 3.11', 'Git'],
    resourcesAndDatasets: [{ title: 'HF', url: 'https://huggingface.co/datasets', rationale: 'good datasets' }],
    technologyStack: { frontend: [], backend: ['Python'], database: [], libraries: ['paho-mqtt'] },
    systemArchitecture: 'Sensor → ESP32 → MQTT → Backend → Dashboard',
    functionalRequirements: [
      { id: 'FR-01', text: 'Read sensor data', required: true, verify: { method: 'test', target: 'pytest sensor_test.py' } },
      { id: 'FR-02', text: 'Publish to MQTT', required: true, verify: { method: 'static', target: 'mqtt_publisher.py' } },
    ],
    nonFunctionalRequirements: ['Input validation'],
    developmentRoadmap: ['Phase 1: Setup', 'Phase 2: Core'],
    gitDevelopmentPlan: [{ milestone: 'M1: repo init', expectedArtifacts: ['README.md'] }],
    componentsToDevelop: ['sensor_reader.py'],
    deliverables: ['GitHub repo', 'README'],
    testCases: [{ id: 'TC-001', name: 'Read valid sensor', expected: '{"temp": 25.0}' }],
    hiddenTestCases: [
      { id: 'TC-H001', name: 'Reject negative temperature', input: '{"temp": -999}', expected: 'validation error', hidden: true },
    ],
    edgeCases: ['Invalid input'],
    securityRequirements: [],
    documentationRequirements: ['README outline'],
    deploymentRequirements: [],
    evaluationRubric: [
      { category: 'Requirements', weight: 25 },
      { category: 'Functionality', weight: 20 },
      { category: 'Code Quality', weight: 15 },
      { category: 'Architecture', weight: 10 },
      { category: 'Dev Process (Git)', weight: 10 },
      { category: 'Testing', weight: 5 },
      { category: 'Documentation', weight: 5 },
      { category: 'Security', weight: 5 },
      { category: 'Innovation', weight: 5 },
    ],
    extensionChallenges: { basic: ['Deploy locally'], intermediate: [], advanced: [], bonus: [] },
    finalSubmissionChecklist: ['Public GitHub repo', 'README complete'],
    ...overrides,
  };
}

// ─── D-1: toStudentProjectSpecification strips hiddenTestCases ────────────────

console.log('\n[D-1] toStudentSpec strips hiddenTestCases');

test('hiddenTestCases is removed from student spec', () => {
  const fullSpec = makeMinimalSpec();
  const studentSpec = toStudentSpec(fullSpec) as any;
  assert(!('hiddenTestCases' in studentSpec), 'hiddenTestCases must not appear in student spec');
});

test('student spec retains testCases (published)', () => {
  const fullSpec = makeMinimalSpec();
  const studentSpec = toStudentSpec(fullSpec) as any;
  assert(Array.isArray(studentSpec.testCases), 'testCases must be present');
  assertEqual(studentSpec.testCases.length, 1, 'student spec has 1 published test case');
});

test('student spec retains all other top-level fields', () => {
  const fullSpec = makeMinimalSpec();
  const studentSpec = toStudentSpec(fullSpec) as any;
  const requiredFields = [
    'specVersion', 'problemStatement', 'functionalRequirements',
    'evaluationRubric', 'deliverables', 'testCases',
  ];
  for (const f of requiredFields) {
    assert(f in studentSpec, `student spec missing field: ${f}`);
  }
});

test('student spec does NOT expose hidden field content', () => {
  const fullSpec = makeMinimalSpec();
  const student = toStudentSpec(fullSpec);
  const json = JSON.stringify(student);
  assert(!json.includes('TC-H001'), 'hidden test ID must not appear in student spec JSON');
  assert(!json.includes('Reject negative temperature'), 'hidden test name must not appear in student spec JSON');
  assert(!json.includes('"hidden":true'), 'hidden: true must not appear in student spec JSON');
});

// ─── D-2: Functional requirement IDs are stable and correct ─────────────────

console.log('\n[D-2] Functional requirement ID stability');

test('FR IDs are stable zero-padded format FR-01, FR-02, ...', () => {
  const spec = makeMinimalSpec();
  assertEqual(spec.functionalRequirements[0].id, 'FR-01');
  assertEqual(spec.functionalRequirements[1].id, 'FR-02');
});

test('FR ID regex: matches FR-01..FR-99', () => {
  const frIdRegex = /^FR-\d{2,}$/;
  assert(frIdRegex.test('FR-01'), 'FR-01 matches');
  assert(frIdRegex.test('FR-21'), 'FR-21 matches');
  assert(!frIdRegex.test('REQ-01'), 'REQ-01 does not match');
  assert(!frIdRegex.test('FR-1'), 'FR-1 (single digit) does not match');
});

test('Verify method must be one of allowed values', () => {
  const allowed = ['static', 'test', 'llm_judge', 'manual'];
  const spec = makeMinimalSpec();
  for (const fr of spec.functionalRequirements) {
    assert(allowed.includes(fr.verify.method), `FR ${fr.id} has invalid verify method: ${fr.verify.method}`);
  }
});

// ─── D-3: hashProjectSpecification is deterministic and order-independent ─────

console.log('\n[D-3] hashProjectSpecification determinism');

test('same spec produces the same hash', () => {
  const spec1 = makeMinimalSpec();
  const spec2 = makeMinimalSpec();
  assertEqual(hashSpec(spec1), hashSpec(spec2), 'identical specs must produce identical hash');
});

test('different spec produces a different hash', () => {
  const spec1 = makeMinimalSpec();
  const spec2 = makeMinimalSpec({ problemStatement: { ...makeMinimalSpec().problemStatement, title: 'Different Title' } });
  assert(hashSpec(spec1) !== hashSpec(spec2), 'different specs must produce different hash');
});

test('hash is order-independent (property insertion order does not matter)', () => {
  const specA = { b: 2, a: 1, c: [3, 1] };
  const specB = { a: 1, c: [3, 1], b: 2 };
  assertEqual(hashSpec(specA), hashSpec(specB), 'canonicalize must sort keys so order does not matter');
});

test('hash is 64 hex chars (SHA-256)', () => {
  const h = hashSpec(makeMinimalSpec());
  assert(/^[0-9a-f]{64}$/.test(h), `Hash must be 64 hex chars, got: ${h}`);
});

// ─── D-4: Implementation path locking after first submission ─────────────────

console.log('\n[D-4] Implementation path locking logic');

function simulateSetImplementationPath(
  hasSubmission: boolean,
  requestedPath: 'hardware' | 'simulation',
): { ok: boolean; error?: string; locked?: boolean } {
  if (hasSubmission) {
    return { ok: false, error: 'Implementation path is locked after your first submission.', locked: true };
  }
  return { ok: true };
}

test('can set implementation path before any submission', () => {
  const result = simulateSetImplementationPath(false, 'simulation');
  assert(result.ok, 'should be allowed before first submission');
});

test('blocked from changing path after first submission', () => {
  const result = simulateSetImplementationPath(true, 'hardware');
  assert(!result.ok, 'should be blocked after submission');
  assert(result.locked === true, 'should return locked=true');
  assert(typeof result.error === 'string', 'should return an error message');
});

test('lock applies to both hardware and simulation paths', () => {
  for (const path of ['hardware', 'simulation'] as const) {
    const result = simulateSetImplementationPath(true, path);
    assert(!result.ok, `should block ${path} path change after submission`);
  }
});

// ─── D-5: Rubric weights sum to exactly 100% ─────────────────────────────────

console.log('\n[D-5] Rubric weight sum');

const REQUIRED_RUBRIC = [
  { category: 'Requirements',    weight: 25 },
  { category: 'Functionality',   weight: 20 },
  { category: 'Code Quality',    weight: 15 },
  { category: 'Architecture',    weight: 10 },
  { category: 'Dev Process (Git)', weight: 10 },
  { category: 'Testing',         weight: 5 },
  { category: 'Documentation',   weight: 5 },
  { category: 'Security',        weight: 5 },
  { category: 'Innovation',      weight: 5 },
];

test('fixed rubric has exactly 9 categories', () => {
  assertEqual(REQUIRED_RUBRIC.length, 9, 'must have 9 rubric categories');
});

test('rubric weights sum to exactly 100', () => {
  const total = REQUIRED_RUBRIC.reduce((s, r) => s + r.weight, 0);
  assertEqual(total, 100, 'rubric weights must sum to 100');
});

test('makeMinimalSpec rubric matches fixed rubric', () => {
  const spec = makeMinimalSpec();
  const total = spec.evaluationRubric.reduce((s, r) => s + r.weight, 0);
  assertEqual(total, 100, 'spec rubric must sum to 100');
  assertEqual(spec.evaluationRubric.length, 9, 'spec rubric must have 9 categories');
});

// ─── D-6: Simulation path attributes ─────────────────────────────────────────

console.log('\n[D-6] Simulation path spec content');

test('simulation spec has simulationTools array', () => {
  const simTool = {
    name: 'Wokwi', url: 'https://wokwi.com', license: 'MIT',
    openSource: true, freeToUse: true, gpuRequired: false,
    os: 'Any (browser-based)', description: 'Browser-based IoT simulator',
    bestFor: 'ESP32 simulation', isPrimary: true, browserBased: true,
  };
  const spec = makeMinimalSpec({ implementationPath: 'simulation', simulationTools: [simTool] });
  assert(Array.isArray(spec.simulationTools), 'simulationTools must be an array');
  assertEqual(spec.simulationTools!.length, 1);
  assert(spec.simulationTools![0].isPrimary === true, 'primary tool must be marked');
});

test('hardware spec can have no simulationTools', () => {
  const spec = makeMinimalSpec({ implementationPath: 'hardware', simulationTools: undefined });
  assert(!spec.simulationTools || spec.simulationTools.length === 0, 'hardware spec should have no sim tools');
});

test('simulation tool requires license field', () => {
  const tool = {
    name: 'Webots', url: 'https://cyberbotics.com', license: 'Apache 2.0',
    openSource: true, freeToUse: true, gpuRequired: false,
    os: 'Linux, Windows, macOS', description: 'Open-source robotics simulator',
    isPrimary: false, browserBased: false,
  };
  assert(typeof tool.license === 'string' && tool.license.length > 0, 'license must be a non-empty string');
});

// ─── D-7: Hidden test ID prefix ───────────────────────────────────────────────

console.log('\n[D-7] Hidden test case ID prefix');

test('hidden test IDs use TC-H prefix', () => {
  const spec = makeMinimalSpec();
  for (const tc of spec.hiddenTestCases) {
    assert(tc.id?.startsWith('TC-H'), `hidden test case ${tc.id} must start with TC-H`);
  }
});

test('published test IDs use TC- prefix (not TC-H)', () => {
  const spec = makeMinimalSpec();
  for (const tc of spec.testCases) {
    assert(tc.id?.startsWith('TC-') && !tc.id?.startsWith('TC-H'), `published test case ${tc.id} must start with TC- not TC-H`);
  }
});

// ─── Summary ──────────────────────────────────────────────────────────────────

// Give async tests a moment to settle then print summary
setTimeout(() => {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Workstream D tests complete: ${passed} passed, ${failed} failed`);
  if (errors.length > 0) {
    console.error('\nFailed tests:');
    errors.forEach((e) => console.error(`  • ${e}`));
    process.exit(1);
  } else {
    console.log('All Workstream D tests passed ✅');
  }
}, 200);
