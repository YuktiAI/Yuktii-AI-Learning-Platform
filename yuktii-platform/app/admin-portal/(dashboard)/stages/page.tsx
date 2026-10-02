'use client';

import { useEffect, useState } from 'react';

type Track = {
  id: string;
  duration: number;
  certificateName: string;
  domain: { name: string };
};

type Stage = {
  id: string;
  trackId: string;
  stageNumber: number;
  title: string;
  learningObjectives: string;
  plainLanguageIntro: string;
  taskTemplate: string;
  modelAnswer: string;
  rubricJson: string[];
  gapDaysOverride: number | null;
  defaultGapDays: number;
  track: { duration: number; _count: { stages: number } };
};

const empty = {
  trackId: '',
  stageNumber: '1',
  title: '',
  learningObjectives: '',
  plainLanguageIntro: '',
  taskTemplate: '',
  modelAnswer: '',
  rubricText: '', // one checklist item per line, converted to rubricJson on submit
};

export default function AdminStagesPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Per-stage gap override edit state: { [stageId]: string (draft) }
  const [gapOverrideDraft, setGapOverrideDraft] = useState<Record<string, string>>({});
  const [gapSaving, setGapSaving] = useState<Record<string, boolean>>({});
  const [gapError, setGapError] = useState<Record<string, string>>({});

  async function loadTracks() {
    const res = await fetch('/api/admin/tracks');
    const data = await res.json();
    if (res.ok) setTracks(data.tracks);
  }

  async function loadStages(trackId: string) {
    if (!trackId) return setStages([]);
    const res = await fetch(`/api/admin/stages?trackId=${trackId}`);
    const data = await res.json();
    if (res.ok) {
      setStages(data.stages);
      // Initialise draft values from current DB state
      const drafts: Record<string, string> = {};
      for (const s of data.stages) {
        drafts[s.id] = s.gapDaysOverride !== null && s.gapDaysOverride !== undefined
          ? String(s.gapDaysOverride)
          : '';
      }
      setGapOverrideDraft(drafts);
    }
  }

  useEffect(() => {
    loadTracks();
  }, []);

  useEffect(() => {
    loadStages(selectedTrackId);
  }, [selectedTrackId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackId: form.trackId,
          stageNumber: Number(form.stageNumber),
          title: form.title,
          learningObjectives: form.learningObjectives,
          plainLanguageIntro: form.plainLanguageIntro,
          taskTemplate: form.taskTemplate,
          modelAnswer: form.modelAnswer,
          rubricJson: form.rubricText.split('\n').map((s) => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm({ ...empty, trackId: form.trackId, stageNumber: String(Number(form.stageNumber) + 1) });
      loadStages(form.trackId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this stage?')) return;
    await fetch(`/api/admin/stages/${id}`, { method: 'DELETE' });
    loadStages(selectedTrackId);
  }

  async function handleSaveGapOverride(stageId: string) {
    const draft = gapOverrideDraft[stageId] ?? '';
    const parsed = draft.trim() === '' ? null : parseInt(draft, 10);
    if (draft.trim() !== '' && (isNaN(parsed as number) || (parsed as number) < 0)) {
      setGapError((prev) => ({ ...prev, [stageId]: 'Enter a non-negative whole number, or leave blank to use the default.' }));
      return;
    }
    setGapError((prev) => ({ ...prev, [stageId]: '' }));
    setGapSaving((prev) => ({ ...prev, [stageId]: true }));
    try {
      const res = await fetch(`/api/admin/stages/${stageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gapDaysOverride: parsed }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Save failed');
      }
      await loadStages(selectedTrackId);
    } catch (err: any) {
      setGapError((prev) => ({ ...prev, [stageId]: err.message }));
    } finally {
      setGapSaving((prev) => ({ ...prev, [stageId]: false }));
    }
  }

  // Compute track-level duration overflow warning
  function computeOverflowWarning(stagesForTrack: Stage[]): string | null {
    if (stagesForTrack.length === 0) return null;
    const trackDuration = stagesForTrack[0]?.track?.duration;
    if (!trackDuration) return null;
    const totalGap = stagesForTrack.reduce((acc, s) => {
      const effective = s.gapDaysOverride !== null && s.gapDaysOverride !== undefined
        ? s.gapDaysOverride
        : s.defaultGapDays;
      return acc + effective;
    }, 0);
    if (totalGap > trackDuration) {
      return `⚠️ The total pacing gap across all stages (${totalGap} days) exceeds the track duration (${trackDuration} days). Students in later stages may wait longer than the track is designed for. Consider reducing gap overrides or using the default formula.`;
    }
    return null;
  }

  const overflowWarning = computeOverflowWarning(stages);

  return (
    <div className="space-y-8">
      <form onSubmit={handleCreate} className="border border-line rounded-lg p-6 bg-white/50 space-y-3">
        <h2 className="font-medium mb-1">New stage</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-ink/70">Track</span>
            <select
              required
              value={form.trackId}
              onChange={(e) => {
                setForm({ ...form, trackId: e.target.value });
                setSelectedTrackId(e.target.value);
              }}
              className="mt-1 w-full border border-line rounded-md px-3 py-2 bg-white min-h-[40px]"
            >
              <option value="">Select…</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.domain.name} – {t.duration}d ({t.certificateName})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-ink/70">Stage number</span>
            <input
              type="number"
              min={1}
              value={form.stageNumber}
              onChange={(e) => setForm({ ...form, stageNumber: e.target.value })}
              className="mt-1 w-full border border-line rounded-md px-3 py-2 bg-white min-h-[40px]"
            />
          </label>
        </div>
        <Text label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
        <Text
          label="Learning objectives"
          value={form.learningObjectives}
          onChange={(v) => setForm({ ...form, learningObjectives: v })}
          area
        />
        <Text
          label="Plain-language intro (required before the task, every stage)"
          value={form.plainLanguageIntro}
          onChange={(v) => setForm({ ...form, plainLanguageIntro: v })}
          area
        />
        <Text
          label="Task brief (base template – Phase 3 personalizes this per student)"
          value={form.taskTemplate}
          onChange={(v) => setForm({ ...form, taskTemplate: v })}
          area
        />
        <Text label="Model answer" value={form.modelAnswer} onChange={(v) => setForm({ ...form, modelAnswer: v })} area />
        <Text
          label="Self-check rubric – one checklist item per line"
          value={form.rubricText}
          onChange={(v) => setForm({ ...form, rubricText: v })}
          area
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={loading} className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50">
          {loading ? 'Adding…' : 'Add stage'}
        </button>
      </form>

      <div>
        <h2 className="font-medium mb-1">
          Stages {selectedTrackId ? `for selected track` : '– pick a track above to filter'}
        </h2>

        {/* Track-level overflow warning */}
        {overflowWarning && (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {overflowWarning}
          </div>
        )}

        <div className="space-y-2">
          {stages.sort((a, b) => a.stageNumber - b.stageNumber).map((s) => {
            const effectiveGap =
              s.gapDaysOverride !== null && s.gapDaysOverride !== undefined
                ? s.gapDaysOverride
                : s.defaultGapDays;
            const isStage1 = s.stageNumber === 1;
            const draftVal = gapOverrideDraft[s.id] ?? '';
            const isSaving = gapSaving[s.id] ?? false;
            const errMsg = gapError[s.id] ?? '';

            return (
              <div key={s.id} className="border border-line rounded-lg p-4 bg-white/50 space-y-3">
                {/* Stage Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="stage-id text-xs text-marigold-dark">Stage {s.stageNumber}</div>
                    <div className="font-medium">{s.title}</div>
                    <div className="text-xs text-ink/50 mt-1">
                      {Array.isArray(s.rubricJson) ? s.rubricJson.length : 0} rubric item(s)
                    </div>
                  </div>
                  <button onClick={() => handleDelete(s.id)} className="text-xs text-red-600 hover:underline">
                    Delete
                  </button>
                </div>

                {/* Time-Gate Pacing Controls */}
                <div className="border-t border-line pt-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-ink/70">Pacing gate:</span>

                    {isStage1 ? (
                      <span className="text-xs text-ink/50">Stage 1 — no gate (opens immediately on enrollment)</span>
                    ) : (
                      <>
                        {/* Default formula badge */}
                        <span className="text-xs bg-ink/5 border border-line rounded px-2 py-0.5">
                          Default: {s.defaultGapDays}d
                        </span>

                        {/* Override input */}
                        <div className="flex items-center gap-1.5">
                          <input
                            id={`gap-override-${s.id}`}
                            type="number"
                            min={0}
                            placeholder={`${s.defaultGapDays} (default)`}
                            value={draftVal}
                            onChange={(e) =>
                              setGapOverrideDraft((prev) => ({ ...prev, [s.id]: e.target.value }))
                            }
                            className="w-28 border border-line rounded px-2 py-1 text-xs bg-white"
                          />
                          <span className="text-xs text-ink/50">days override</span>
                          <button
                            onClick={() => handleSaveGapOverride(s.id)}
                            disabled={isSaving}
                            className="text-xs bg-ink text-paper px-2 py-1 rounded disabled:opacity-50"
                          >
                            {isSaving ? 'Saving…' : 'Save'}
                          </button>
                          {s.gapDaysOverride !== null && s.gapDaysOverride !== undefined && (
                            <button
                              onClick={() => {
                                setGapOverrideDraft((prev) => ({ ...prev, [s.id]: '' }));
                                // Immediately clear override (save null)
                                setGapSaving((prev) => ({ ...prev, [s.id]: true }));
                                fetch(`/api/admin/stages/${s.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ gapDaysOverride: null }),
                                })
                                  .then(() => loadStages(selectedTrackId))
                                  .finally(() => setGapSaving((prev) => ({ ...prev, [s.id]: false })));
                              }}
                              className="text-xs text-ink/50 underline hover:text-red-600"
                            >
                              Clear override
                            </button>
                          )}
                        </div>

                        {/* Effective gap summary */}
                        <span className="text-xs text-ink/60">
                          Effective: <strong>{effectiveGap}d</strong>
                          {s.gapDaysOverride !== null && s.gapDaysOverride !== undefined && (
                            <span className="ml-1 text-amber-600">(admin override)</span>
                          )}
                        </span>
                      </>
                    )}
                  </div>
                  {errMsg && <p className="text-xs text-red-600 mt-1">{errMsg}</p>}
                </div>
              </div>
            );
          })}
          {selectedTrackId && stages.length === 0 && (
            <p className="text-sm text-ink/50">No stages loaded for this track yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  area = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  area?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="text-ink/70">{label}</span>
      {area ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="mt-1 w-full border border-line rounded-md px-3 py-2 bg-white"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full border border-line rounded-md px-3 py-2 bg-white min-h-[40px]"
        />
      )}
    </label>
  );
}
