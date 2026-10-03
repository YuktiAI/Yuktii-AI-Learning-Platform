'use client';

import { useState } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────

type SpecMeta = {
  enrollmentId: string;
  stageNumber: number;
  title: string;
  generationStatus: string;
  generationModel: string;
  generationVersion: string;
  specVersion: string;
  specHash: string | null;
  generatedAt: string;
  difficultyTier: string;
  domain: string | null;
  domainSlug: string | null;
  levelName: string | null;
  implementationPath: string | null;
};

type FunctionalRequirement = {
  id: string;
  text: string;
  required: boolean;
  verify: { method: string; target: string };
};

type Resource = {
  title: string;
  url: string;
  rationale: string;
  verifiedAt?: string;
  isReachable?: boolean;
};

type TestCase = {
  id?: string;
  name: string;
  input?: string;
  expected: string;
  hidden?: boolean;
};

type SimTool = {
  name: string;
  url: string;
  license: string;
  openSource: boolean;
  freeToUse: boolean;
  gpuRequired: boolean;
  os: string;
  description: string;
  bestFor?: string;
  isPrimary: boolean;
  browserBased: boolean;
};

type ProjectSpec = {
  specVersion: string;
  implementationPath?: string;
  simulationTools?: SimTool[];
  problemStatement: { title: string; domain: string; difficulty: string; targetUsers: string; realWorldContext: string; expectedOutcome: string };
  problemDescription: { background: string; industrySignificance: string; existingLimitations: string; proposedSolution: string };
  learningObjectives: string[];
  prerequisites: string[];
  resourcesAndDatasets: Resource[];
  technologyStack: { frontend: string[]; backend: string[]; database: string[]; libraries: string[] };
  systemArchitecture: string;
  functionalRequirements: FunctionalRequirement[];
  nonFunctionalRequirements: string[];
  developmentRoadmap: string[];
  gitDevelopmentPlan: { milestone: string; expectedArtifacts: string[] }[];
  componentsToDevelop: string[];
  deliverables: string[];
  testCases: TestCase[];
  hiddenTestCases: TestCase[];
  edgeCases: string[];
  securityRequirements: string[];
  documentationRequirements: string[];
  deploymentRequirements: string[];
  evaluationRubric: { category: string; weight: number }[];
  extensionChallenges: { basic: string[]; intermediate: string[]; advanced: string[]; bonus: string[] };
  finalSubmissionChecklist: string[];
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function Badge({ children, color = 'gray' }: { children: React.ReactNode; color?: 'gray' | 'green' | 'blue' | 'amber' | 'red' | 'teal' }) {
  const map = {
    gray: 'bg-gray-100 text-gray-700 border-gray-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    teal: 'bg-teal-50 text-teal-700 border-teal-200',
  };
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded border ${map[color]}`}>
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-line rounded-lg overflow-hidden">
      <div className="bg-gray-50 border-b border-line px-4 py-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function StringList({ items }: { items: string[] }) {
  if (!items?.length) return <p className="text-xs text-ink/40 italic">None</p>;
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="text-sm text-ink/80 flex gap-2">
          <span className="text-ink/30 mt-0.5">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function VerifyBadge({ method }: { method: string }) {
  const map: Record<string, { label: string; color: 'green' | 'blue' | 'teal' | 'amber' }> = {
    static: { label: 'static', color: 'blue' },
    test: { label: 'test', color: 'green' },
    llm_judge: { label: 'llm_judge', color: 'teal' },
    manual: { label: 'manual', color: 'amber' },
  };
  const def = map[method] || { label: method, color: 'amber' };
  return <Badge color={def.color}>{def.label}</Badge>;
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function SpecPreviewPage() {
  const [enrollmentId, setEnrollmentId] = useState('');
  const [stageNumber, setStageNumber] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<SpecMeta | null>(null);
  const [spec, setSpec] = useState<ProjectSpec | null>(null);
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const [regenerating, setRegenerating] = useState(false);
  const [regenMsg, setRegenMsg] = useState<string | null>(null);

  async function handleLoad() {
    if (!enrollmentId.trim()) {
      setError('Please enter an Enrollment ID');
      return;
    }
    setLoading(true);
    setError(null);
    setMeta(null);
    setSpec(null);
    setRawJson(null);
    setRegenMsg(null);
    try {
      const res = await fetch(
        `/api/admin/stages/spec-preview?enrollmentId=${encodeURIComponent(enrollmentId.trim())}&stageNumber=${stageNumber}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load spec');
        return;
      }
      setMeta(data.meta);
      setSpec(data.specJson);
      setRawJson(data.specRaw);
      if (data.parseError) setError(`Warning: ${data.parseError}`);
    } catch (e: any) {
      setError(e?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenerate() {
    if (!enrollmentId.trim() || !meta) return;
    if (!confirm(`Regenerate spec for enrollment ${enrollmentId} stage ${stageNumber}? This will overwrite the cached spec but NOT alter historical submissions.`)) return;
    setRegenerating(true);
    setRegenMsg(null);
    try {
      const res = await fetch('/api/admin/stages/spec-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId: enrollmentId.trim(), stageNumber }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRegenMsg(`Error: ${data.error}`);
        return;
      }
      setRegenMsg(data.message || 'Regenerated successfully');
      // Reload the new spec
      await handleLoad();
    } catch (e: any) {
      setRegenMsg(`Error: ${e?.message}`);
    } finally {
      setRegenerating(false);
    }
  }

  const verifyMethodColor = (m: string) =>
    ({ static: 'bg-blue-50 text-blue-600', test: 'bg-green-50 text-green-600', llm_judge: 'bg-teal-50 text-teal-600', manual: 'bg-amber-50 text-amber-600' }[m] || 'bg-gray-100 text-gray-600');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-ink">Project Spec Preview</h1>
        <p className="text-sm text-ink/50 mt-0.5">
          View the full machine-readable Project Specification (including hidden test cases) and optionally regenerate it.
        </p>
      </div>

      {/* Lookup Form */}
      <div className="border border-line rounded-lg p-5 bg-white/50 space-y-3">
        <h2 className="text-sm font-medium text-ink">Load spec</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="block text-sm flex-1 min-w-48">
            <span className="text-ink/70">Enrollment ID</span>
            <input
              value={enrollmentId}
              onChange={(e) => setEnrollmentId(e.target.value)}
              placeholder="clxxx..."
              className="mt-1 w-full border border-line rounded-md px-3 py-2 bg-white text-sm"
            />
          </label>
          <label className="block text-sm w-28">
            <span className="text-ink/70">Stage #</span>
            <input
              type="number"
              min={1}
              value={stageNumber}
              onChange={(e) => setStageNumber(parseInt(e.target.value) || 1)}
              className="mt-1 w-full border border-line rounded-md px-3 py-2 bg-white text-sm"
            />
          </label>
          <button
            onClick={handleLoad}
            disabled={loading}
            className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load Spec'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {/* Meta Panel */}
      {meta && (
        <div className="border border-line rounded-lg p-4 bg-white/50 space-y-2">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex flex-wrap gap-2">
              <Badge color={meta.generationStatus === 'SUCCESS' ? 'green' : 'red'}>{meta.generationStatus}</Badge>
              <Badge color="blue">{meta.specVersion}</Badge>
              {meta.difficultyTier && <Badge color="teal">{meta.difficultyTier}</Badge>}
              {meta.implementationPath && (
                <Badge color={meta.implementationPath === 'hardware' ? 'amber' : 'blue'}>
                  {meta.implementationPath}
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRaw(!showRaw)}
                className="text-xs border border-line px-3 py-1.5 rounded-md hover:bg-gray-50 text-ink/70"
              >
                {showRaw ? 'Show rendered' : 'View raw JSON'}
              </button>
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-md hover:bg-amber-600 disabled:opacity-50"
              >
                {regenerating ? 'Regenerating…' : 'Regenerate Spec'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-ink/60 pt-2">
            <div><span className="font-medium text-ink/80">Domain:</span> {meta.domain}</div>
            <div><span className="font-medium text-ink/80">Level:</span> {meta.levelName}</div>
            <div><span className="font-medium text-ink/80">Model:</span> {meta.generationModel}</div>
            <div><span className="font-medium text-ink/80">Stage:</span> {meta.stageNumber}</div>
            <div><span className="font-medium text-ink/80">Generated:</span> {new Date(meta.generatedAt).toLocaleString()}</div>
            <div className="col-span-2 truncate"><span className="font-medium text-ink/80">Hash:</span> <code className="font-mono">{meta.specHash?.slice(0, 24)}…</code></div>
          </div>

          {regenMsg && (
            <div className={`mt-2 text-xs px-3 py-2 rounded-md border ${regenMsg.startsWith('Error') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
              {regenMsg}
            </div>
          )}
        </div>
      )}

      {/* Raw JSON View */}
      {spec && showRaw && (
        <div className="border border-line rounded-lg overflow-hidden">
          <div className="bg-gray-50 border-b border-line px-4 py-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">Raw JSON (admin only — includes hiddenTestCases)</span>
          </div>
          <pre className="p-4 text-xs font-mono overflow-x-auto bg-gray-950 text-green-300 max-h-[600px] overflow-y-auto whitespace-pre-wrap break-all">
            {rawJson}
          </pre>
        </div>
      )}

      {/* Rendered Spec */}
      {spec && !showRaw && (
        <div className="space-y-4">
          {/* Title Banner */}
          <div className="border border-line rounded-lg p-4 bg-gradient-to-r from-teal/5 to-blue-50">
            <h2 className="text-lg font-semibold text-ink">{spec.problemStatement?.title}</h2>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge color="blue">{spec.problemStatement?.domain}</Badge>
              <Badge color="teal">{spec.problemStatement?.difficulty}</Badge>
              {spec.implementationPath && (
                <Badge color={spec.implementationPath === 'hardware' ? 'amber' : 'green'}>{spec.implementationPath} path</Badge>
              )}
            </div>
          </div>

          {/* §1 Problem Statement */}
          <Section title="§1 Problem Statement">
            <p className="text-sm text-ink/80 mb-2">{spec.problemStatement?.realWorldContext}</p>
            <p className="text-sm text-ink/60"><strong>Expected outcome:</strong> {spec.problemStatement?.expectedOutcome}</p>
          </Section>

          {/* §2 Problem Description */}
          <Section title="§2 Problem Description">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="font-medium text-ink/70 mb-1">Background</p>
                <p className="text-ink/80">{spec.problemDescription?.background}</p>
              </div>
              <div>
                <p className="font-medium text-ink/70 mb-1">Proposed Solution</p>
                <p className="text-ink/80">{spec.problemDescription?.proposedSolution}</p>
              </div>
            </div>
          </Section>

          {/* §3 Learning Objectives */}
          <Section title="§3 Learning Objectives">
            <StringList items={spec.learningObjectives} />
          </Section>

          {/* §4 Prerequisites */}
          <Section title="§4 Prerequisites">
            <StringList items={spec.prerequisites} />
          </Section>

          {/* §5 Resources & Datasets */}
          <Section title="§5 Resources & Datasets">
            {spec.resourcesAndDatasets?.length ? (
              <div className="space-y-2">
                {spec.resourcesAndDatasets.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <span className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${r.isReachable === false ? 'bg-red-400' : 'bg-green-400'}`} />
                    <div>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">{r.title}</a>
                      <p className="text-ink/60">{r.rationale}</p>
                      {r.verifiedAt && <p className="text-ink/40 text-xs">Verified: {new Date(r.verifiedAt).toLocaleDateString()}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-ink/40 italic">None</p>}
          </Section>

          {/* §6 Technology Stack */}
          <Section title="§6 Technology Stack">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              {(['frontend', 'backend', 'database', 'libraries'] as const).map((key) => (
                spec.technologyStack?.[key]?.length ? (
                  <div key={key}>
                    <p className="font-medium text-ink/70 capitalize mb-1">{key}</p>
                    <div className="flex flex-wrap gap-1">
                      {spec.technologyStack[key].map((t, i) => <Badge key={i} color="gray">{t}</Badge>)}
                    </div>
                  </div>
                ) : null
              ))}
            </div>
          </Section>

          {/* §7 System Architecture */}
          <Section title="§7 System Architecture">
            <p className="text-sm text-ink/80 whitespace-pre-wrap">{spec.systemArchitecture}</p>
          </Section>

          {/* §8 Functional Requirements */}
          <Section title="§8 Functional Requirements">
            <div className="space-y-2">
              {spec.functionalRequirements?.map((fr) => (
                <div key={fr.id} className="flex gap-3 text-sm items-start border border-line rounded p-2 bg-white/50">
                  <span className="font-mono font-bold text-teal-700 w-14 flex-shrink-0">{fr.id}</span>
                  <span className="flex-1 text-ink/80">{fr.text}</span>
                  <div className="flex flex-col gap-1 items-end flex-shrink-0">
                    <VerifyBadge method={fr.verify?.method} />
                    {!fr.required && <Badge color="amber">optional</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* §9 Non-Functional Requirements */}
          <Section title="§9 Non-Functional Requirements">
            <StringList items={spec.nonFunctionalRequirements} />
          </Section>

          {/* §10 Development Roadmap */}
          <Section title="§10 Development Roadmap">
            <div className="space-y-1">
              {spec.developmentRoadmap?.map((phase, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <span className="text-ink/30 font-mono w-6">{i + 1}.</span>
                  <span className="text-ink/80">{phase}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* §11 Git Development Plan */}
          <Section title="§11 Git Development Plan">
            <div className="space-y-3">
              {spec.gitDevelopmentPlan?.map((m, i) => (
                <div key={i} className="border-l-2 border-teal/30 pl-3">
                  <p className="text-sm font-medium text-ink">{m.milestone}</p>
                  <ul className="mt-1 space-y-0.5">
                    {m.expectedArtifacts?.map((a, j) => (
                      <li key={j} className="text-xs text-ink/60 font-mono">└ {a}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>

          {/* §12 Components to Develop */}
          <Section title="§12 Components to Develop">
            <StringList items={spec.componentsToDevelop} />
          </Section>

          {/* §13 Deliverables */}
          <Section title="§13 Deliverables">
            <div className="space-y-1">
              {spec.deliverables?.map((d, i) => (
                <div key={i} className="flex gap-2 text-sm text-ink/80">
                  <span className="text-green-500 mt-0.5">☐</span>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* §14 Published Test Cases */}
          <Section title="§14 Published Test Cases (visible to student)">
            <div className="space-y-2">
              {spec.testCases?.map((tc, i) => (
                <div key={i} className="border border-line rounded p-2 text-xs bg-white/50">
                  <div className="flex gap-2 items-center mb-1">
                    <span className="font-mono font-bold text-blue-700">{tc.id || `TC-${String(i + 1).padStart(3, '0')}`}</span>
                    <span className="text-ink/70">{tc.name}</span>
                  </div>
                  {tc.input && <p className="text-ink/60">Input: <code className="font-mono bg-gray-100 px-1 rounded">{tc.input}</code></p>}
                  <p className="text-ink/80">Expected: {tc.expected}</p>
                </div>
              ))}
              {!spec.testCases?.length && <p className="text-xs text-ink/40 italic">None</p>}
            </div>
          </Section>

          {/* §14-H Hidden Test Cases — ADMIN ONLY */}
          <div className="border-2 border-red-200 rounded-lg overflow-hidden">
            <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-2">
              <span className="text-xs font-bold text-red-700 uppercase tracking-wider">🔒 Hidden Test Cases — Admin Only</span>
              <Badge color="red">Never shown to students</Badge>
            </div>
            <div className="p-4 space-y-2">
              {spec.hiddenTestCases?.length ? spec.hiddenTestCases.map((tc, i) => (
                <div key={i} className="border border-red-100 rounded p-2 text-xs bg-red-50/30">
                  <div className="flex gap-2 items-center mb-1">
                    <span className="font-mono font-bold text-red-700">{tc.id || `TC-H${String(i + 1).padStart(3, '0')}`}</span>
                    <span className="text-ink/70">{tc.name}</span>
                    <Badge color="red">hidden</Badge>
                  </div>
                  {tc.input && <p className="text-ink/60">Input: <code className="font-mono bg-white px-1 rounded">{tc.input}</code></p>}
                  <p className="text-ink/80">Expected: {tc.expected}</p>
                </div>
              )) : <p className="text-xs text-ink/40 italic">No hidden test cases generated for this stage.</p>}
            </div>
          </div>

          {/* §15 Edge Cases */}
          <Section title="§15 Edge Cases">
            <StringList items={spec.edgeCases} />
          </Section>

          {/* §16 Security Requirements */}
          <Section title="§16 Security Requirements">
            <StringList items={spec.securityRequirements} />
          </Section>

          {/* §17 Documentation Requirements */}
          <Section title="§17 Documentation Requirements">
            <StringList items={spec.documentationRequirements} />
          </Section>

          {/* §18 Deployment Requirements */}
          <Section title="§18 Deployment Requirements">
            <StringList items={spec.deploymentRequirements} />
          </Section>

          {/* §19 Evaluation Rubric */}
          <Section title="§19 Evaluation Rubric">
            <div className="space-y-2">
              {spec.evaluationRubric?.map((r, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 text-sm text-ink/80">{r.category}</div>
                  <div className="w-32 bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-teal rounded-full h-2"
                      style={{ width: `${(r.weight / 30) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-ink w-10 text-right">{r.weight}%</span>
                </div>
              ))}
              <p className="text-xs text-ink/40 pt-1">
                Total: {spec.evaluationRubric?.reduce((s, r) => s + r.weight, 0)}%
              </p>
            </div>
          </Section>

          {/* §20 Extension Challenges */}
          <Section title="§20 Extension / Bonus Challenges">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              {(['basic', 'intermediate', 'advanced', 'bonus'] as const).map((tier) => (
                spec.extensionChallenges?.[tier]?.length ? (
                  <div key={tier}>
                    <p className="font-medium text-ink/70 capitalize mb-1">{tier}</p>
                    <StringList items={spec.extensionChallenges[tier]} />
                  </div>
                ) : null
              ))}
            </div>
          </Section>

          {/* §21 Final Submission Checklist */}
          <Section title="§21 Final Submission Checklist">
            <div className="space-y-1">
              {spec.finalSubmissionChecklist?.map((item, i) => (
                <div key={i} className="flex gap-2 text-sm text-ink/80">
                  <span className="text-ink/30">☐</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* Simulation Tools (if present) */}
          {spec.simulationTools && spec.simulationTools.length > 0 && (
            <Section title="Simulation Tools Registry (curated)">
              <div className="space-y-3">
                {spec.simulationTools.map((tool, i) => (
                  <div key={i} className={`border rounded-lg p-3 ${tool.isPrimary ? 'border-teal/40 bg-teal/5' : 'border-line bg-white/50'}`}>
                    <div className="flex items-start gap-2 flex-wrap">
                      <a href={tool.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-blue-600 hover:underline">{tool.name}</a>
                      {tool.isPrimary && <Badge color="teal">Primary</Badge>}
                      {tool.openSource ? <Badge color="green">Open Source</Badge> : <Badge color="amber">Proprietary</Badge>}
                      {tool.freeToUse && <Badge color="blue">Free</Badge>}
                      {tool.gpuRequired && <Badge color="red">GPU required</Badge>}
                      {tool.browserBased && <Badge color="teal">Browser</Badge>}
                    </div>
                    <p className="text-xs text-ink/60 mt-1">License: {tool.license} · OS: {tool.os}</p>
                    <p className="text-xs text-ink/70 mt-1">{tool.description}</p>
                    {tool.bestFor && <p className="text-xs text-teal-700 mt-0.5">Best for: {tool.bestFor}</p>}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}

      {!spec && !loading && !error && (
        <p className="text-sm text-ink/40 text-center py-12">Enter an Enrollment ID and Stage Number above to preview the spec.</p>
      )}
    </div>
  );
}
