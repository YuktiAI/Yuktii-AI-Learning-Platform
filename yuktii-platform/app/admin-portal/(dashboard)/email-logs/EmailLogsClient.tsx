'use client';

import { useState } from 'react';
import { Mail, CheckCircle2, AlertTriangle, RefreshCw, Search, Send, Clock, Server } from 'lucide-react';
import { useRouter } from 'next/navigation';

type EmailLogItem = {
  id: string;
  recipientEmail: string;
  subject: string;
  status: 'sent' | 'failed' | string;
  errorMessage: string | null;
  smtpHost: string | null;
  attemptedAt: string;
  enrollment?: {
    student?: { name: string; email: string } | null;
    track?: { certificateName: string } | null;
  } | null;
};

type Props = {
  initialLogs: EmailLogItem[];
  stats: {
    total: number;
    sent: number;
    failed: number;
  };
  statusFilter?: string;
  searchQuery?: string;
};

export default function EmailLogsClient({
  initialLogs,
  stats,
  statusFilter = '',
  searchQuery = '',
}: Props) {
  const router = useRouter();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryResult, setRetryResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  async function handleResend(logId: string) {
    setRetryingId(logId);
    setRetryResult(null);

    try {
      const res = await fetch('/api/admin/email-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to resend email');
      }

      setRetryResult({
        id: logId,
        success: true,
        message: 'Email resent successfully!',
      });
      router.refresh();
    } catch (err: any) {
      setRetryResult({
        id: logId,
        success: false,
        message: err.message || 'Resend failed',
      });
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-line rounded-xl p-5">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center text-teal">
              <Mail size={16} />
            </div>
            <p className="text-xs text-ink/50 font-medium">Total Send Attempts</p>
          </div>
          <p className="text-2xl font-bold text-ink">{stats.total}</p>
        </div>

        <div className="bg-white border border-line rounded-xl p-5">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 size={16} />
            </div>
            <p className="text-xs text-ink/50 font-medium">Delivered Successfully</p>
          </div>
          <p className="text-2xl font-bold text-emerald-700">{stats.sent}</p>
        </div>

        <div className="bg-white border border-line rounded-xl p-5">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-600">
              <AlertTriangle size={16} />
            </div>
            <p className="text-xs text-ink/50 font-medium">Failed Attempts</p>
          </div>
          <p className="text-2xl font-bold text-red-700">{stats.failed}</p>
        </div>
      </div>

      {/* Filter and Search controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {[
            { label: 'All', value: '' },
            { label: 'Sent', value: 'sent' },
            { label: 'Failed', value: 'failed' },
          ].map((tab) => (
            <button
              key={tab.label}
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                if (tab.value) params.set('status', tab.value);
                else params.delete('status');
                params.set('page', '1');
                router.push(`?${params.toString()}`);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                statusFilter === tab.value
                  ? 'bg-teal text-white border-teal'
                  : 'bg-white text-ink/60 border-line hover:border-ink/30'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form
          method="GET"
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const input = form.elements.namedItem('q') as HTMLInputElement;
            const params = new URLSearchParams(window.location.search);
            if (input.value) params.set('q', input.value);
            else params.delete('q');
            params.set('page', '1');
            router.push(`?${params.toString()}`);
          }}
        >
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
            <input
              name="q"
              defaultValue={searchQuery}
              placeholder="Search recipient, error…"
              className="input-field pl-8 text-xs py-1.5 w-60"
            />
          </div>
          <button type="submit" className="btn-primary text-xs py-1.5">
            Search
          </button>
        </form>
      </div>

      {/* Result feedback banner */}
      {retryResult && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
            retryResult.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{retryResult.message}</span>
          <button onClick={() => setRetryResult(null)} className="text-ink/40 hover:text-ink">
            ✕
          </button>
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-white border border-line rounded-xl overflow-hidden overflow-x-auto shadow-sm">
        <table className="w-full border-collapse min-w-[800px]">
          <thead>
            <tr className="border-b border-line bg-gray-50/50">
              {['Recipient', 'Subject & Track', 'Status', 'SMTP Host', 'Error Details', 'Attempted', 'Actions'].map((h) => (
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
            {initialLogs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-ink/40">
                  No email logs found.
                </td>
              </tr>
            ) : (
              initialLogs.map((log) => {
                const isSent = log.status === 'sent';
                return (
                  <tr key={log.id} className="hover:bg-gray-50/40 transition-colors">
                    {/* Recipient */}
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <p className="font-semibold text-ink">
                        {log.enrollment?.student?.name ?? log.recipientEmail}
                      </p>
                      <p className="text-[11px] text-ink/50">{log.recipientEmail}</p>
                    </td>

                    {/* Subject */}
                    <td className="px-4 py-3 text-xs max-w-[240px]">
                      <p className="font-medium text-ink truncate" title={log.subject}>
                        {log.subject}
                      </p>
                      {log.enrollment?.track?.certificateName && (
                        <p className="text-[11px] text-teal font-medium">
                          {log.enrollment.track.certificateName}
                        </p>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {isSent ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          <CheckCircle2 size={11} /> Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                          <AlertTriangle size={11} /> Failed
                        </span>
                      )}
                    </td>

                    {/* SMTP Host */}
                    <td className="px-4 py-3 text-xs text-ink/60 whitespace-nowrap font-mono text-[11px]">
                      {log.smtpHost ? (
                        <span className="flex items-center gap-1">
                          <Server size={11} className="text-ink/40" />
                          {log.smtpHost}
                        </span>
                      ) : (
                        <span className="text-ink/30">—</span>
                      )}
                    </td>

                    {/* Error Details */}
                    <td className="px-4 py-3 text-xs max-w-[220px]">
                      {log.errorMessage ? (
                        <p className="text-red-700 bg-red-50/80 px-2 py-1 rounded text-[11px] font-mono break-all line-clamp-2" title={log.errorMessage}>
                          {log.errorMessage}
                        </p>
                      ) : (
                        <span className="text-ink/30 text-[11px]">None</span>
                      )}
                    </td>

                    {/* Attempted At */}
                    <td className="px-4 py-3 text-xs text-ink/50 whitespace-nowrap font-mono text-[11px]">
                      <span className="flex items-center gap-1">
                        <Clock size={11} className="text-ink/40" />
                        {new Date(log.attemptedAt).toLocaleString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <button
                        onClick={() => handleResend(log.id)}
                        disabled={retryingId === log.id}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                          isSent
                            ? 'bg-white border-line text-ink/60 hover:bg-gray-50'
                            : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                        } disabled:opacity-50`}
                      >
                        {retryingId === log.id ? (
                          <>
                            <RefreshCw size={11} className="animate-spin" /> Resending…
                          </>
                        ) : (
                          <>
                            <Send size={11} /> {isSent ? 'Resend' : 'Retry'}
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
