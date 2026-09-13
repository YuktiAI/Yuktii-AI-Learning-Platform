'use client';

import { useEffect, useState } from 'react';

type Domain = {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  tracks: { id: string }[];
};

const empty = { name: '', slug: '', tagline: '', description: '' };

export default function AdminDomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch('/api/admin/domains');
    const data = await res.json();
    if (res.ok) setDomains(data.domains);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm(empty);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this domain? This also deletes its tracks and stages.')) return;
    await fetch(`/api/admin/domains/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="grid lg:grid-cols-[1fr_1.2fr] gap-8">
      <form onSubmit={handleCreate} className="border border-line rounded-lg p-6 bg-white/50 space-y-3 h-fit">
        <h2 className="font-medium mb-1">New domain</h2>
        <Input label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Input label="Slug" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} placeholder="ai-ml-llm-apps" />
        <Input label="Tagline" value={form.tagline} onChange={(v) => setForm({ ...form, tagline: v })} />
        <label className="block text-sm">
          <span className="text-ink/70">Description</span>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="mt-1 w-full border border-line rounded-md px-3 py-2 bg-white"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={loading}
          className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Addingâ€¦' : 'Add domain'}
        </button>
      </form>

      <div className="space-y-3">
        {domains.map((d) => (
          <div key={d.id} className="border border-line rounded-lg p-4 bg-white/50 flex items-start justify-between">
            <div>
              <div className="font-medium">{d.name}</div>
              <div className="text-xs text-ink/50 stage-id">/{d.slug}</div>
              <div className="text-xs text-ink/50 mt-1">{d.tracks.length} track(s)</div>
            </div>
            <button onClick={() => handleDelete(d.id)} className="text-xs text-red-600 hover:underline">
              Delete
            </button>
          </div>
        ))}
        {domains.length === 0 && <p className="text-sm text-ink/50">No domains yet.</p>}
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-ink/70">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-line rounded-md px-3 py-2 bg-white min-h-[40px]"
      />
    </label>
  );
}

