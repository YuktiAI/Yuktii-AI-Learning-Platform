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

  async function loadTracks() {
    const res = await fetch('/api/admin/tracks');
    const data = await res.json();
    if (res.ok) setTracks(data.tracks);
  }

  async function loadStages(trackId: string) {
    if (!trackId) return setStages([]);
    const res = await fetch(`/api/admin/stages?trackId=${trackId}`);
    const data = await res.json();
    if (res.ok) setStages(data.stages);
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
              <option value="">Selectâ€¦</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.domain.name} â€” {t.duration}d ({t.certificateName})
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
          label="Task brief (base template â€” Phase 3 personalizes this per student)"
          value={form.taskTemplate}
          onChange={(v) => setForm({ ...form, taskTemplate: v })}
          area
        />
        <Text label="Model answer" value={form.modelAnswer} onChange={(v) => setForm({ ...form, modelAnswer: v })} area />
        <Text
          label="Self-check rubric â€” one checklist item per line"
          value={form.rubricText}
          onChange={(v) => setForm({ ...form, rubricText: v })}
          area
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={loading} className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50">
          {loading ? 'Addingâ€¦' : 'Add stage'}
        </button>
      </form>

      <div>
        <h2 className="font-medium mb-3">
          Stages {selectedTrackId ? `for selected track` : 'â€” pick a track above to filter'}
        </h2>
        <div className="space-y-2">
          {stages.sort((a, b) => a.stageNumber - b.stageNumber).map((s) => (
            <div key={s.id} className="border border-line rounded-lg p-4 bg-white/50 flex items-start justify-between">
              <div>
                <div className="stage-id text-xs text-marigold-dark">Stage {s.stageNumber}</div>
                <div className="font-medium">{s.title}</div>
                <div className="text-xs text-ink/50 mt-1">{Array.isArray(s.rubricJson) ? s.rubricJson.length : 0} rubric item(s)</div>
              </div>
              <button onClick={() => handleDelete(s.id)} className="text-xs text-red-600 hover:underline">Delete</button>
            </div>
          ))}
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

