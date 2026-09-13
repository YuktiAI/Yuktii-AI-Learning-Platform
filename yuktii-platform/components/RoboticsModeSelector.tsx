"use client";

import { useState } from "react";
import { Cpu, Monitor, AlertTriangle, CheckCircle2, Bot } from "lucide-react";

type Props = {
  enrollmentId: string;
};

export default function RoboticsModeSelector({ enrollmentId }: Props) {
  const [selectedMode, setSelectedMode] = useState<"simulation" | "hardware" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    if (!selectedMode) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/enrollments/set-robotics-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId, roboticsMode: selectedMode }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save Robotics mode");

      window.location.reload();
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="rounded-2xl border border-rose-200 bg-white p-8 shadow-xl">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 mb-3">
            <Bot size={14} /> REQUIRED CHOICE — ROBOTICS DOMAIN
          </span>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink">
            Choose Your Robotics Track Completion Mode
          </h2>
          <p className="text-ink/65 text-sm mt-2 leading-relaxed">
            Select whether you want to build a physical robotic system or simulate using approved physics simulators. Your blueprint, components, and evaluation requirements will lock in based on this choice.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Option 1: Software Simulation */}
          <div
            onClick={() => setSelectedMode("simulation")}
            className={`cursor-pointer rounded-xl border-2 p-6 transition-all relative ${
              selectedMode === "simulation"
                ? "border-rose-600 bg-rose-50/40 shadow-md"
                : "border-line bg-paper/50 hover:border-rose-400 hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                <Monitor size={24} />
              </div>
              {selectedMode === "simulation" && (
                <CheckCircle2 size={22} className="text-rose-600" />
              )}
            </div>

            <h3 className="font-display text-lg font-bold text-ink mb-1">
              Option 1: Software Simulation
            </h3>
            <p className="text-xs text-rose-700 font-medium mb-3">
              Approved Robotics Simulators (Webots, Gazebo, Wokwi, TinkerCAD, CoppeliaSim)
            </p>

            <ul className="space-y-2 text-xs text-ink/75 mb-4">
              <li className="flex items-start gap-1.5">
                <span className="text-rose-600">✓</span> Realistic 3D robotics physics simulation without buying hardware
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-rose-600">✓</span> Kinematics, sensors (LiDAR/IMU/Camera), and motor controller code
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-rose-600">✓</span> Strict approved-simulator verification on submission
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-rose-600">✓</span> Mandatory 3-5 min screen recording demo video
              </li>
            </ul>
          </div>

          {/* Option 2: Physical Hardware Robot */}
          <div
            onClick={() => setSelectedMode("hardware")}
            className={`cursor-pointer rounded-xl border-2 p-6 transition-all relative ${
              selectedMode === "hardware"
                ? "border-amber-500 bg-amber-50/50 shadow-md"
                : "border-line bg-paper/50 hover:border-amber-400 hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <Cpu size={24} />
              </div>
              {selectedMode === "hardware" && (
                <CheckCircle2 size={22} className="text-amber-600" />
              )}
            </div>

            <h3 className="font-display text-lg font-bold text-ink mb-1">
              Option 2: Hardware Robot Assembly
            </h3>
            <p className="text-xs text-amber-700 font-medium mb-3">
              Build Real Physical Robot & Mechanical System
            </p>

            <ul className="space-y-2 text-xs text-ink/75 mb-4">
              <li className="flex items-start gap-1.5">
                <span className="text-amber-600">✓</span> Students source their own components (chassis, motors, sensors)
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-amber-600">✓</span> Circuit schematics & mechanical assembly blueprint provided
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-amber-600">✓</span> Real-world microcontroller firmware & calibration
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-amber-600">✓</span> Mandatory 3-5 min physical robot working demo video
              </li>
            </ul>

            <div className="pt-3 border-t border-amber-200 text-[11px] text-amber-800 flex items-start gap-1.5">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              <span>Safety Disclaimer: Low-voltage DC only (5V/12V). No mains AC voltage. Handle LiPo batteries safely.</span>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 text-center mb-4">
            {error}
          </p>
        )}

        <div className="text-center">
          <button
            onClick={handleConfirm}
            disabled={!selectedMode || submitting}
            className="btn-gold px-8 py-3 text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
          >
            {submitting ? "Confirming Choice..." : "Confirm & Generate Robotics Project →"}
          </button>
        </div>
      </div>
    </div>
  );
}
