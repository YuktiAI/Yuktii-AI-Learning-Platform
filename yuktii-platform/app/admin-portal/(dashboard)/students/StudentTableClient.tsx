'use client';

import { useState } from 'react';
import { Edit2, X, Check, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

type StudentItem = {
  id: string;
  name: string;
  email: string;
  phone: string;
  college: string | null;
  degreeProgram: string;
  enrollmentsCount: number;
  certsCount: number;
  createdAt: string;
};

export default function StudentTableClient({ students }: { students: StudentItem[] }) {
  const router = useRouter();
  const [editingStudent, setEditingStudent] = useState<StudentItem | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', college: '', degreeProgram: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function openEdit(s: StudentItem) {
    setEditingStudent(s);
    setForm({
      name: s.name,
      email: s.email,
      phone: s.phone || '',
      college: s.college || '',
      degreeProgram: s.degreeProgram || 'Other',
    });
    setErr('');
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingStudent) return;
    setSaving(true);
    setErr('');

    try {
      const res = await fetch(`/api/admin/students/${editingStudent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update student');

      setEditingStudent(null);
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="bg-white border border-line rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full border-collapse min-w-[750px]">
          <thead>
            <tr className="border-b border-line bg-gray-50/50">
              {['Name', 'Email', 'Phone', 'College', 'Degree', 'Enrollments', 'Certs', 'Joined', 'Actions'].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-[11px] font-semibold text-ink/50 uppercase tracking-wider whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {students.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-ink/40">
                  No students found.
                </td>
              </tr>
            ) : (
              students.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-ink whitespace-nowrap">{s.name}</td>
                  <td className="px-4 py-3 text-xs text-ink/70">{s.email}</td>
                  <td className="px-4 py-3 text-xs text-ink/60 whitespace-nowrap">{s.phone || '—'}</td>
                  <td className="px-4 py-3 text-xs text-ink/60 max-w-[140px] truncate" title={s.college || ''}>
                    {s.college || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink/60 whitespace-nowrap">{s.degreeProgram}</td>
                  <td className="px-4 py-3 text-xs text-ink/70 font-semibold">{s.enrollmentsCount}</td>
                  <td className="px-4 py-3 text-xs font-semibold">
                    {s.certsCount > 0 ? (
                      <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[11px] font-bold">
                        {s.certsCount}
                      </span>
                    ) : (
                      <span className="text-ink/30">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink/50 whitespace-nowrap">
                    {new Date(s.createdAt).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    <button
                      onClick={() => openEdit(s)}
                      className="p-1.5 text-ink/50 hover:text-teal hover:bg-teal/5 rounded transition-colors"
                      title="Edit student"
                    >
                      <Edit2 size={13} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-line rounded-xl max-w-md w-full p-6 shadow-xl relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setEditingStudent(null)}
              className="absolute right-4 top-4 text-ink/40 hover:text-ink transition-colors"
            >
              <X size={18} />
            </button>

            <h3 className="font-display font-semibold text-lg text-ink mb-1">Edit Student Profile</h3>
            <p className="text-xs text-ink/50 mb-5">Correct student name, email, or institutional info.</p>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-ink/60 tracking-wider mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-field text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-ink/60 tracking-wider mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="input-field text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-ink/60 tracking-wider mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="input-field text-sm"
                  placeholder="e.g. +91 9876543210"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-ink/60 tracking-wider mb-1">
                  College / University
                </label>
                <input
                  type="text"
                  value={form.college}
                  onChange={(e) => setForm({ ...form, college: e.target.value })}
                  className="input-field text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-ink/60 tracking-wider mb-1">
                  Degree Program
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

              {err && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{err}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="btn-ghost text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary text-xs flex items-center gap-1.5"
                >
                  <Check size={13} /> {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
