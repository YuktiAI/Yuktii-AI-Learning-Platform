'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Edit2, Check, X, AlertCircle, Info, Lock } from 'lucide-react';

export function ProfileEditor({
  student,
  studentName = '',
  studentEmail = '',
}: {
  student: {
    phone: string;
    college: string | null;
    degreeProgram: string;
    degreeProgramOther: string | null;
  };
  studentName?: string;
  studentEmail?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(student);

  function validatePhone(phone: string): boolean {
    const cleaned = phone.replace(/[\s-]/g, '');
    // 10 digits Indian mobile or with country code like +91...
    return /^(\+?\d{1,3})?\d{10}$/.test(cleaned);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    if (!form.phone.trim()) {
      return setError('Phone number is required.');
    }

    if (!validatePhone(form.phone)) {
      return setError('Please enter a valid 10-digit mobile number or international number with country code (e.g. +91 9876543210).');
    }

    setSaving(true);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Unable to save profile.');
      }
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Unable to save profile.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-gray-50 transition-colors"
      >
        <Edit2 size={12} className="text-teal" /> Edit profile
      </button>
    );
  }

  return (
    <form onSubmit={save} className="mt-5 border-t border-line pt-5 space-y-4 animate-in fade-in">
      <div className="rounded-lg bg-gray-50 border border-line p-3 flex items-start gap-2.5">
        <Lock size={14} className="text-ink/40 shrink-0 mt-0.5" />
        <div className="text-xs text-ink/60">
          <span className="font-semibold text-ink">Name ({studentName})</span> and <span className="font-semibold text-ink">Email ({studentEmail})</span> are official credential identifiers and locked. Contact support if you need to update them.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-ink/70 mb-1">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            required
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="e.g. +91 9876543210"
            className="input-field text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/70 mb-1">
            College / Institution
          </label>
          <input
            type="text"
            value={form.college || ''}
            onChange={(e) => setForm({ ...form, college: e.target.value || null })}
            placeholder="e.g. National Institute of Technology"
            className="input-field text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink/70 mb-1">
            Degree Program <span className="text-red-500">*</span>
          </label>
          <select
            value={form.degreeProgram}
            onChange={(e) => setForm({ ...form, degreeProgram: e.target.value })}
            className="input-field text-sm bg-white"
          >
            <option value="BSc">BSc</option>
            <option value="MSc">MSc</option>
            <option value="BE/B.Tech">BE / B.Tech</option>
            <option value="ME/M.Tech">ME / M.Tech</option>
            <option value="BCA/MCA">BCA / MCA</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {form.degreeProgram === 'Other' && (
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">
              Specify Degree Details <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.degreeProgramOther || ''}
              onChange={(e) => setForm({ ...form, degreeProgramOther: e.target.value || null })}
              placeholder="e.g. B.Com Computer Applications"
              className="input-field text-sm"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary text-xs flex items-center gap-1.5"
        >
          <Check size={13} /> {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn-ghost text-xs"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
