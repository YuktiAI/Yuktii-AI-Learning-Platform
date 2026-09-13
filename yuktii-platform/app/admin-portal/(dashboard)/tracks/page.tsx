'use client';

import { useEffect, useState } from 'react';

type Domain = { id: string; name: string };
type Track = {
  id: string;
  duration: number;
  levelName: string;
  certificateName: string;
  price: number;
  isPublished: boolean;
  domain: Domain;
  stages: { id: string }[];
};

const LEVELS = [
  { value: 'FOUNDATION', duration: 30, cert: 'Foundation Certificate' },
  { value: 'FOUNDATION_PLUS', duration: 45, cert: 'Foundation+ Certificate' },
  { value: 'PRACTITIONER', duration: 60, cert: 'Practitioner Certificate' },
  { value: 'APPLIED_PRACTITIONER', duration: 75, cert: 'Applied Practitioner Certificate' },
  { value: 'CAPSTONE', duration: 90, cert: 'Capstone Certificate' },
];

export default function AdminTracksPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [domainId, setDomainId] = useState('');
  const [levelIdx, setLevelIdx] = useState(0);
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const [dRes, tRes] = await Promise.all([fetch('/api/admin/domains'), fetch('/api/admin/tracks')]);
    const dData = await dRes.json();
    const tData = await tRes.json();
    if (dRes.ok) setDomains(dData.domains);
    if (tRes.ok) setTracks(tData.tracks);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const level = LEVELS[levelIdx];
    try {
      const res = await fetch('/api/admin/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domainId,
          duration: level.duration,
          levelName: level.value,
          certificateName: level.cert,
          price: Math.round(parseFloat(price || '0') * 100),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPrice('');
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function togglePublish(t: Track) {
    await fetch(`/api/admin/tracks/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublished: !t.isPublished }),
    });
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this track and its stages?')) return;
    await fetch(`/api/admin/tracks/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="grid lg:grid-cols-[1fr_1.3fr] gap-8">
      <form onSubmit={handleCreate} className="border border-line rounded-lg p-6 bg-white/50 space-y-3 h-fit">
        <h2 className="font-medium mb-1">New track</h2>
        <label className="block text-sm">
          <span className="text-ink/70">Domain</span>
          <select
            required
            value={domainId}
            onChange={(e) => setDomainId(e.target.value)}
            className="mt-1 w-full border border-line rounded-md px-3 py-2 bg-white min-h-[40px]"
          >
            <option value="">Selectâ€¦</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">Duration / level</span>
          <select
            value={levelIdx}
            onChange={(e) => setLevelIdx(Number(e.target.value))}
            className="mt-1 w-full border border-line rounded-md px-3 py-2 bg-white min-h-[40px]"
          >
            {LEVELS.map((l, i) => (
              <option key={l.value} value={i}>{l.duration} days â€” {l.cert}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">Price (â‚¹)</span>
          <input
            type="number"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1 w-full border border-line rounded-md px-3 py-2 bg-white min-h-[40px]"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={loading} className="bg-ink text-paper px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50">
          {loading ? 'Addingâ€¦' : 'Add track'}
        </button>
      </form>

      <div className="space-y-3">
        {tracks.map((t) => (
          <div key={t.id} className="border border-line rounded-lg p-4 bg-white/50 flex items-start justify-between">
            <div>
              <div className="font-medium">{t.domain.name} â€” {t.duration}d</div>
              <div className="text-xs text-ink/50">{t.certificateName} Â· â‚¹{(t.price / 100).toLocaleString('en-IN')}</div>
              <div className="text-xs text-ink/50 mt-1">{t.stages.length} stage(s) loaded</div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                onClick={() => togglePublish(t)}
                className={`text-xs px-2 py-1 rounded-full border ${t.isPublished ? 'border-teal text-teal' : 'border-line text-ink/50'}`}
              >
                {t.isPublished ? 'Published' : 'Draft'}
              </button>
              <button onClick={() => handleDelete(t.id)} className="text-xs text-red-600 hover:underline">Delete</button>
            </div>
          </div>
        ))}
        {tracks.length === 0 && <p className="text-sm text-ink/50">No tracks yet â€” add a domain first.</p>}
      </div>
    </div>
  );
}

