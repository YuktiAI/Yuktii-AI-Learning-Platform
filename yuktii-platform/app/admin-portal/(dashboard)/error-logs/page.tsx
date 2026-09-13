'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, CheckCircle2, XCircle, RefreshCw,
  ChevronDown, ChevronRight, Shield, Clock, Filter,
  Search, Eye, EyeOff, Check
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ErrorLogEntry {
  id: string;
  service: string;
  errorMessage: string;
  errorCode: string | null;
  severity: 'critical' | 'transient';
  studentId: string | null;
  enrollmentId: string | null;
  evaluationId: string | null;
  alertCount: number;
  alertSentAt: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolution: string | null;
  createdAt: string;
}

interface ErrorLogDetail extends ErrorLogEntry {
  stackTrace: string | null;
  context: string | null;
}

interface Stats {
  total: number;
  criticalUnresolved: number;
  totalUnresolved: number;
}

// ── Severity Badge ─────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: 'critical' | 'transient' }) {
  return severity === 'critical' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-700 bg-red-100 text-red-700 border border-red-200">
      <XCircle size={10} />
      CRITICAL
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-700 bg-amber-100 text-amber-700 border border-amber-200">
      <AlertTriangle size={10} />
      TRANSIENT
    </span>
  );
}

// ── Time Format ────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({
  logId,
  onClose,
  onResolved,
}: {
  logId: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [log, setLog] = useState<ErrorLogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState('');
  const [showStack, setShowStack] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/error-logs/${logId}`)
      .then(r => r.json())
      .then(d => { setLog(d.log); setLoading(false); });
  }, [logId]);

  async function toggleResolve() {
    if (!log) return;
    setResolving(true);
    const res = await fetch(`/api/admin/error-logs/${logId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution }),
    });
    const data = await res.json();
    if (data.log) setLog(data.log);
    setResolving(false);
    onResolved();
  }

  const safeParseContext = (ctx: string | null) => {
    if (!ctx) return null;
    try { return JSON.stringify(JSON.parse(ctx), null, 2); } catch { return ctx; }
  };

  if (loading) return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="ml-auto w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl flex items-center justify-center">
        <RefreshCw size={20} className="animate-spin text-ink/40" />
      </div>
    </div>
  );

  if (!log) return null;

  const ctxFormatted = safeParseContext(log.context);
  const isCritical = log.severity === 'critical';

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="ml-auto w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col relative z-10">
        {/* Header */}
        <div className={`px-6 py-5 border-b border-line ${isCritical ? 'bg-red-50' : 'bg-amber-50'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] tracking-widest text-ink/40 uppercase font-semibold mb-1">Error Detail</p>
              <h2 className="text-lg font-bold text-ink font-mono">{log.service}</h2>
              <div className="flex items-center gap-2 mt-2">
                <SeverityBadge severity={log.severity} />
                {log.resolvedAt && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-700 bg-green-100 text-green-700 border border-green-200">
                    <Check size={10} /> RESOLVED
                  </span>
                )}
                {log.alertCount > 1 && (
                  <span className="text-[11px] text-ink/50">{log.alertCount}× occurrences</span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-ink/40 hover:text-ink p-1.5 rounded-lg hover:bg-white/70 transition-colors">
              <XCircle size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-5">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-ink/40 font-semibold mb-1">Error Log ID</p>
              <p className="font-mono text-xs text-ink/70">{log.id}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-ink/40 font-semibold mb-1">Created</p>
              <p className="text-xs text-ink/70">{new Date(log.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
            </div>
            {log.errorCode && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-ink/40 font-semibold mb-1">Error Code</p>
                <p className="font-mono text-xs text-red-600">{log.errorCode}</p>
              </div>
            )}
            {log.alertSentAt && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-ink/40 font-semibold mb-1">Alert Sent</p>
                <p className="text-xs text-ink/70">{timeAgo(log.alertSentAt)}</p>
              </div>
            )}
            {log.studentId && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-ink/40 font-semibold mb-1">Student ID</p>
                <p className="font-mono text-xs text-ink/70">{log.studentId}</p>
              </div>
            )}
            {log.enrollmentId && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-ink/40 font-semibold mb-1">Enrollment ID</p>
                <p className="font-mono text-xs text-ink/70">{log.enrollmentId}</p>
              </div>
            )}
            {log.evaluationId && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-ink/40 font-semibold mb-1">Evaluation ID</p>
                <p className="font-mono text-xs text-ink/70">{log.evaluationId}</p>
              </div>
            )}
          </div>

          {/* Error message */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ink/40 font-semibold mb-2">Error Message</p>
            <pre className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 whitespace-pre-wrap break-all font-mono">
              {log.errorMessage}
            </pre>
          </div>

          {/* Context */}
          {ctxFormatted && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-ink/40 font-semibold mb-2">Context</p>
              <pre className="bg-gray-50 border border-line rounded-lg p-4 text-xs text-ink/70 whitespace-pre-wrap break-all font-mono">
                {ctxFormatted}
              </pre>
            </div>
          )}

          {/* Stack trace (collapsible) */}
          {log.stackTrace && (
            <div>
              <button
                onClick={() => setShowStack(s => !s)}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-ink/40 font-semibold mb-2 hover:text-ink transition-colors"
              >
                {showStack ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Stack Trace
              </button>
              {showStack && (
                <pre className="bg-[#1e1e2e] text-[#cdd6f4] rounded-lg p-4 text-[11px] whitespace-pre-wrap break-all font-mono overflow-x-auto">
                  {log.stackTrace}
                </pre>
              )}
            </div>
          )}

          {/* Resolution */}
          {log.resolvedAt ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={16} className="text-green-600" />
                <p className="text-sm font-semibold text-green-800">Resolved</p>
              </div>
              <p className="text-xs text-green-700">
                By <span className="font-mono">{log.resolvedBy}</span> · {timeAgo(log.resolvedAt)}
              </p>
              {log.resolution && (
                <p className="text-xs text-green-700 mt-1">{log.resolution}</p>
              )}
            </div>
          ) : (
            <div className="border border-line rounded-lg p-4">
              <p className="text-sm font-semibold text-ink mb-3">Mark as Resolved</p>
              <textarea
                value={resolution}
                onChange={e => setResolution(e.target.value)}
                placeholder="Optional: describe how this was fixed or what action was taken…"
                rows={3}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink/30 resize-none focus:outline-none focus:ring-2 focus:ring-teal/30 mb-3"
              />
              <button
                onClick={toggleResolve}
                disabled={resolving}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {resolving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                Mark Resolved
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ErrorLogsPage() {
  const [logs, setLogs]           = useState<ErrorLogEntry[]>([]);
  const [stats, setStats]         = useState<Stats | null>(null);
  const [loading, setLoading]     = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch]       = useState('');
  const [severity, setSeverity]   = useState('');
  const [resolved, setResolved]   = useState('false'); // default: show unresolved
  const [page, setPage]           = useState(1);
  const [total, setTotal]         = useState(0);
  const LIMIT = 25;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (search)   params.set('search',   search);
    if (severity) params.set('severity', severity);
    if (resolved) params.set('resolved', resolved);

    const res  = await fetch(`/api/admin/error-logs?${params}`);
    const data = await res.json();
    setLogs(data.logs ?? []);
    setStats(data.stats ?? null);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [page, search, severity, resolved]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="p-8 max-w-[1100px]">
      {/* Header */}
      <div className="mb-7">
        <p className="text-[11px] tracking-widest text-ink/40 uppercase mb-1">Admin Portal</p>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
              <Shield size={22} className="text-red-500" />
              Error Logs
            </h1>
            <p className="text-sm text-ink/50 mt-0.5">
              Internal failure log. Students see only a generic message — full detail is here.
            </p>
          </div>
          <button
            onClick={fetchLogs}
            className="flex items-center gap-2 px-3 py-2 text-sm text-ink/60 hover:text-ink border border-line rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Banner */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-[11px] uppercase tracking-widest text-red-500 font-semibold mb-1">Critical Unresolved</p>
            <p className="text-3xl font-bold text-red-700">{stats.criticalUnresolved}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-[11px] uppercase tracking-widest text-amber-600 font-semibold mb-1">Total Unresolved</p>
            <p className="text-3xl font-bold text-amber-700">{stats.totalUnresolved}</p>
          </div>
          <div className="bg-white border border-line rounded-xl p-4">
            <p className="text-[11px] uppercase tracking-widest text-ink/40 font-semibold mb-1">All Time Logged</p>
            <p className="text-3xl font-bold text-ink">{stats.total}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
          <input
            type="text"
            placeholder="Search service, message, student ID…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-teal/30"
          />
        </div>
        <select
          value={severity}
          onChange={e => { setSeverity(e.target.value); setPage(1); }}
          className="px-3 py-2.5 text-sm border border-line rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-teal/30"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical only</option>
          <option value="transient">Transient only</option>
        </select>
        <select
          value={resolved}
          onChange={e => { setResolved(e.target.value); setPage(1); }}
          className="px-3 py-2.5 text-sm border border-line rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-teal/30"
        >
          <option value="false">Unresolved</option>
          <option value="true">Resolved</option>
          <option value="">All</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-line rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-gray-50">
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest text-ink/40 font-semibold">Severity</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest text-ink/40 font-semibold">Service</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest text-ink/40 font-semibold">Error</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest text-ink/40 font-semibold">Count</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest text-ink/40 font-semibold">When</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest text-ink/40 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-ink/40">
                  <RefreshCw size={18} className="animate-spin mx-auto mb-2" />
                  Loading error logs…
                </td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12">
                  <CheckCircle2 size={28} className="mx-auto mb-2 text-green-500" />
                  <p className="text-sm text-ink/50">No errors match the current filter. 🎉</p>
                </td></tr>
              ) : logs.map(log => (
                <tr
                  key={log.id}
                  onClick={() => setSelectedId(log.id)}
                  className={`border-b border-line cursor-pointer transition-colors hover:bg-gray-50 ${
                    log.severity === 'critical' && !log.resolvedAt ? 'bg-red-50/30' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <SeverityBadge severity={log.severity} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-ink/80">{log.service}</span>
                  </td>
                  <td className="px-4 py-3 max-w-[300px]">
                    <p className="text-xs text-ink/70 truncate">{log.errorMessage}</p>
                    {log.errorCode && (
                      <span className="text-[10px] font-mono text-red-500">{log.errorCode}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {log.alertCount > 1 ? (
                      <span className="text-xs font-semibold text-orange-600">{log.alertCount}×</span>
                    ) : (
                      <span className="text-xs text-ink/40">1</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-ink/50">{timeAgo(log.createdAt)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {log.resolvedAt ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-green-600 font-semibold">
                        <CheckCircle2 size={12} /> Resolved
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-red-500 font-semibold">
                        <XCircle size={12} /> Open
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-line text-sm">
            <p className="text-ink/50 text-xs">
              Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs border border-line rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                Previous
              </button>
              <span className="text-xs text-ink/50">Page {page} of {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border border-line rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      {selectedId && (
        <DetailDrawer
          logId={selectedId}
          onClose={() => setSelectedId(null)}
          onResolved={fetchLogs}
        />
      )}
    </div>
  );
}
