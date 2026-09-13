"use client";
import { useState, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Download } from "lucide-react";

// Brand palette — all readable on white backgrounds
const COLORS = ["#7c3aed", "#2563eb", "#059669", "#d97706", "#db2777", "#0891b2", "#dc2626", "#65a30d"];

// Shared light-theme tooltip style
const tooltipStyle = {
  background: "#ffffff",
  border: "1px solid #dfe1da",
  borderRadius: 8,
  fontSize: 12,
  color: "#171923",
};

// Dark axis tick labels on white background
const axisStyle = { fontSize: 11, fill: "#74786f" };

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col gap-1.5 p-5 bg-white border border-line rounded-xl shadow-sm">
      <p className="text-[11px] text-ink/40 uppercase tracking-widest font-medium">{label}</p>
      <p className="text-[28px] font-bold text-ink leading-none">{value}</p>
      {sub && <p className="text-xs text-ink/40">{sub}</p>}
    </div>
  );
}

const ChartWrap = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-white border border-line rounded-xl p-5">
    <p className="text-sm font-semibold text-ink mb-4">{title}</p>
    {children}
  </div>
);

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<any>(null);
  const [domains, setDomains] = useState<any[]>([]);
  const [timeSeries, setTimeSeries] = useState<any[]>([]);
  const [byDegree, setByDegree] = useState<any[]>([]);
  const [byDuration, setByDuration] = useState<any[]>([]);
  const [gran, setGran] = useState("week");
  const [days, setDays] = useState(90);

  useEffect(() => {
    const from = new Date(Date.now() - days * 86400000).toISOString();
    const to = new Date().toISOString();
    Promise.all([
      fetch("/api/admin-portal/analytics?type=overview").then(r => r.json()),
      fetch("/api/admin-portal/analytics?type=domains").then(r => r.json()),
      fetch(`/api/admin-portal/analytics?type=time-series&gran=${gran}&from=${from}&to=${to}`).then(r => r.json()),
      fetch("/api/admin-portal/analytics?type=by-degree").then(r => r.json()),
      fetch("/api/admin-portal/analytics?type=by-duration").then(r => r.json()),
    ]).then(([ov, dm, ts, deg, dur]) => {
      setOverview(ov); setDomains(dm); setTimeSeries(ts); setByDegree(deg); setByDuration(dur);
    });
  }, [gran, days]);

  return (
    <div className="p-8 max-w-[1200px]">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-[11px] tracking-widest text-ink/40 uppercase mb-1">Admin Portal</p>
          <h1 className="text-2xl font-bold text-ink">Analytics</h1>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-2 items-center">
          {[30, 90, 180, 365].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                days === d ? "bg-violet-700 text-white border-violet-700" : "bg-white text-ink/60 border-line hover:border-ink/30"
              }`}
            >
              {d}d
            </button>
          ))}
          <div className="w-px h-6 bg-line" />
          {["day", "week", "month"].map(g => (
            <button
              key={g}
              onClick={() => setGran(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${
                gran === g ? "bg-teal text-white border-teal" : "bg-white text-ink/60 border-line hover:border-ink/30"
              }`}
            >
              {g}
            </button>
          ))}
          <div className="w-px h-6 bg-line" />
          <a
            href="/api/admin-portal/export?format=csv"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-line rounded-lg text-xs text-ink/60 hover:text-ink hover:border-ink/30 transition-colors"
          >
            <Download size={12} /> CSV
          </a>
          <a
            href="/api/admin-portal/export?format=xlsx"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-line rounded-lg text-xs text-ink/60 hover:text-ink hover:border-ink/30 transition-colors"
          >
            <Download size={12} /> Excel
          </a>
        </div>
      </div>

      {/* Overview stat cards */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-7">
          <StatCard label="Total Students" value={overview.totalStudents} />
          <StatCard label="Total Enrollments" value={overview.totalEnrollments} />
          <StatCard label="Active" value={overview.activeEnrollments} sub="in-progress tracks" />
          <StatCard label="Completed Tracks" value={overview.completedEnrollments} />
          <StatCard label="Certificates Issued" value={overview.certificatesIssued} />
          <StatCard label="Evaluations Done" value={overview.evaluationsCompleted} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Enrollment & completion trend — line chart */}
        <ChartWrap title="Enrollment & Completion Trend">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={timeSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe1da" />
              <XAxis dataKey="date" tick={axisStyle} />
              <YAxis tick={axisStyle} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, color: "#171923" }} />
              <Line type="monotone" dataKey="enrollments" stroke="#7c3aed" strokeWidth={2} dot={false} name="Enrollments" />
              <Line type="monotone" dataKey="completions" stroke="#059669" strokeWidth={2} dot={false} name="Completions" />
            </LineChart>
          </ResponsiveContainer>
        </ChartWrap>

        {/* Domain distribution — pie chart */}
        <ChartWrap title="Enrollment Distribution by Domain">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={domains}
                dataKey="total"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }: any) => `${name.split(" ")[0]} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
                style={{ fontSize: 10, fill: "#171923" }}
              >
                {domains.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartWrap>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Per-domain enrollments vs completions */}
        <ChartWrap title="Enrollments vs Completions per Domain">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={domains} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe1da" horizontal={false} />
              <XAxis type="number" tick={axisStyle} />
              <YAxis type="category" dataKey="name" tick={{ ...axisStyle, width: 100 }} width={90} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, color: "#171923" }} />
              <Bar dataKey="total" fill="#7c3aed" name="Enrolled" radius={[0, 4, 4, 0]} />
              <Bar dataKey="completed" fill="#059669" name="Completed" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartWrap>

        {/* Average evaluation score per domain */}
        <ChartWrap title="Average Evaluation Score by Domain">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={domains.filter((d: any) => d.avgEvalScore !== null)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe1da" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={axisStyle} />
              <YAxis type="category" dataKey="name" tick={{ ...axisStyle, width: 100 }} width={90} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v}/100`, "Avg Score"]} />
              <Bar dataKey="avgEvalScore" name="Avg Score" radius={[0, 4, 4, 0]}>
                {domains.filter((d: any) => d.avgEvalScore !== null).map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartWrap>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* By degree program */}
        <ChartWrap title="Enrollments by Degree Program">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byDegree}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe1da" />
              <XAxis dataKey="degree" tick={axisStyle} />
              <YAxis tick={axisStyle} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="Students" radius={[4, 4, 0, 0]}>
                {byDegree.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartWrap>

        {/* By track duration */}
        <ChartWrap title="Enrollments by Track Duration">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byDuration}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe1da" />
              <XAxis dataKey="duration" tick={axisStyle} tickFormatter={v => `${v}d`} />
              <YAxis tick={axisStyle} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any, _: any, props: any) => [v, `${props.payload.duration}-day`]} />
              <Bar dataKey="count" name="Enrollments" radius={[4, 4, 0, 0]}>
                {byDuration.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartWrap>
      </div>
    </div>
  );
}
