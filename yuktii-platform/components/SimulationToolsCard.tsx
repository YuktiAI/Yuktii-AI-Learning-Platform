"use client";

import React, { useState } from "react";
import {
  Cpu,
  Monitor,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Sparkles,
  HelpCircle,
  Laptop,
} from "lucide-react";

export interface SimulationTool {
  name: string;
  url: string;
  license: string;
  openSource: boolean;
  freeToUse: boolean;
  gpuRequired: boolean;
  os: string;
  description: string;
  bestFor?: string;
  browserBased?: boolean;
  isPrimary?: boolean;
}

interface Props {
  enrollmentId: string;
  stageId?: string;
  domainSlug: string;
  currentPath: "hardware" | "simulation" | null;
  tools?: SimulationTool[];
  isLocked?: boolean;
  onPathChanged?: (newPath: "hardware" | "simulation") => void;
}

export default function SimulationToolsCard({
  enrollmentId,
  stageId,
  domainSlug,
  currentPath = "simulation",
  tools = [],
  isLocked = false,
  onPathChanged,
}: Props) {
  const [activePath, setActivePath] = useState<"hardware" | "simulation">(
    currentPath === "hardware" ? "hardware" : "simulation"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isIotOrRobotics =
    domainSlug.toLowerCase().includes("iot") ||
    domainSlug.toLowerCase().includes("robotics");

  if (!isIotOrRobotics) return null;

  async function handleSelectPath(path: "hardware" | "simulation") {
    if (isLocked || path === activePath || saving) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/enrollments/set-implementation-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enrollmentId,
          stageId,
          implementationPath: path,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update implementation path");
      }

      setActivePath(path);
      onPathChanged?.(path);
    } catch (err: any) {
      setError(err?.message || "Failed to update path");
    } finally {
      setSaving(false);
    }
  }

  // Fallback tools if none passed
  const displayTools: SimulationTool[] =
    tools.length > 0
      ? tools
      : domainSlug.includes("robotics")
      ? [
          {
            name: "Webots",
            url: "https://cyberbotics.com",
            license: "Apache 2.0",
            openSource: true,
            freeToUse: true,
            gpuRequired: false,
            os: "Linux, Windows, macOS",
            description:
              "Open-source 3D robot simulator by Cyberbotics with ready-made models and Python/C++/ROS 2 support.",
            bestFor: "Beginners and intermediate robotics development",
            isPrimary: true,
          },
          {
            name: "ROS 2 + Gazebo",
            url: "https://gazebosim.org",
            license: "Apache 2.0",
            openSource: true,
            freeToUse: true,
            gpuRequired: false,
            os: "Linux (Ubuntu), WSL2",
            description: "Industry-standard physics-accurate robot simulation for ROS 2 navigation and sensors.",
            bestFor: "Advanced SLAM, navigation, and mobile robotics",
          },
          {
            name: "PyBullet",
            url: "https://pybullet.org",
            license: "zlib",
            openSource: true,
            freeToUse: true,
            gpuRequired: false,
            os: "Linux, Windows, macOS",
            description: "Lightweight pure-Python physics simulation for robotics and reinforcement learning.",
            bestFor: "Fast prototyping and low-spec laptops",
          },
        ]
      : [
          {
            name: "Wokwi",
            url: "https://wokwi.com",
            license: "Proprietary (Free online)",
            openSource: false,
            freeToUse: true,
            gpuRequired: false,
            os: "Browser-based (any OS)",
            description:
              "Zero-install browser simulator for Arduino, ESP32, and Raspberry Pi Pico with virtual sensors.",
            bestFor: "ESP32, Arduino, and virtual sensor telemetry",
            browserBased: true,
            isPrimary: true,
          },
          {
            name: "Node-RED",
            url: "https://nodered.org",
            license: "Apache 2.0",
            openSource: true,
            freeToUse: true,
            gpuRequired: false,
            os: "Linux, Windows, macOS, Docker",
            description: "Flow-based low-code visual programming for event-driven IoT sensor simulation.",
            bestFor: "Virtual sensor telemetry and MQTT data flows",
          },
          {
            name: "Eclipse Mosquitto",
            url: "https://mosquitto.org",
            license: "EPL 2.0",
            openSource: true,
            freeToUse: true,
            gpuRequired: false,
            os: "Linux, Windows, macOS",
            description: "High-performance open-source MQTT broker for local device communication.",
            bestFor: "Local MQTT messaging without physical gateway",
          },
        ];

  const primaryTool = displayTools.find((t) => t.isPrimary) || displayTools[0];
  const alternativeTools = displayTools.filter((t) => t !== primaryTool).slice(0, 2);

  return (
    <div className="rounded-xl border border-teal-500/20 bg-gradient-to-br from-teal-50/40 via-white to-sky-50/20 p-5 shadow-sm space-y-4">
      {/* Header & Path Choice */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-teal-500/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-100 text-teal-800">
              <Sparkles size={12} /> {domainSlug.toUpperCase()} IMPLEMENTATION PATH
            </span>
            {isLocked && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800">
                <Lock size={10} /> Locked for this stage
              </span>
            )}
          </div>
          <h3 className="text-sm font-bold text-ink mt-1">Hardware vs Simulation Path</h3>
          <p className="text-xs text-ink/70 leading-relaxed mt-0.5">
            Do you have physical hardware, or do you want to complete this in software simulation?
          </p>
        </div>

        {/* Path Switcher Tabs */}
        <div className="inline-flex p-1 bg-stone-100 rounded-lg border border-stone-200 self-start sm:self-auto shrink-0">
          <button
            type="button"
            disabled={isLocked || saving}
            onClick={() => handleSelectPath("simulation")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
              activePath === "simulation"
                ? "bg-white text-teal-700 shadow-sm"
                : "text-stone-600 hover:text-stone-900"
            } ${isLocked ? "cursor-not-allowed opacity-80" : ""}`}
          >
            <Monitor size={13} />
            <span>Simulation Path</span>
            {activePath === "simulation" && <CheckCircle2 size={12} className="text-teal-600" />}
          </button>
          <button
            type="button"
            disabled={isLocked || saving}
            onClick={() => handleSelectPath("hardware")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
              activePath === "hardware"
                ? "bg-white text-amber-700 shadow-sm"
                : "text-stone-600 hover:text-stone-900"
            } ${isLocked ? "cursor-not-allowed opacity-80" : ""}`}
          >
            <Cpu size={13} />
            <span>Hardware Path</span>
            {activePath === "hardware" && <CheckCircle2 size={12} className="text-amber-600" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
          {error}
        </div>
      )}

      {/* Explanation Banner */}
      <div className="flex items-start gap-2.5 text-xs text-ink/75 bg-white/70 p-3 rounded-lg border border-teal-500/10">
        <HelpCircle size={15} className="text-teal-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>
            <strong>Hardware or simulation?</strong> If you do not have physical boards or sensors, choose{" "}
            <span className="text-teal-700 font-semibold">Simulation</span>. You will build and test using verified,
            free tools right on your computer with zero purchases required.
          </p>
          <p className="text-[11px] text-teal-800">
            ✓ Both paths are held to the same high engineering standard and can achieve the maximum 100% certificate score.
          </p>
        </div>
      </div>

      {/* Path Specific View */}
      {activePath === "simulation" ? (
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
              Recommended Simulation Tools for this Project
            </h4>
            <span className="text-[11px] text-ink/60">Selected from Curated Tool Registry</span>
          </div>

          {/* Primary Recommended Tool */}
          {primaryTool && (
            <div className="rounded-xl border border-teal-300 bg-teal-50/50 p-4 transition hover:shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    <Laptop size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-teal-950">{primaryTool.name}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-200/80 text-teal-900 uppercase">
                        Primary Pick
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800">
                        {primaryTool.openSource ? "Open Source" : "Free to use"}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink/65">License: {primaryTool.license} • OS: {primaryTool.os}</p>
                  </div>
                </div>

                <a
                  href={primaryTool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold shrink-0 transition"
                >
                  <span>Open {primaryTool.name}</span>
                  <ExternalLink size={12} />
                </a>
              </div>

              <p className="text-xs text-ink/80 leading-relaxed mt-1">{primaryTool.description}</p>
              {primaryTool.bestFor && (
                <div className="mt-2 text-[11px] text-teal-900 bg-white/70 px-2.5 py-1 rounded border border-teal-200/60 inline-block">
                  <strong>Best for:</strong> {primaryTool.bestFor}
                </div>
              )}
            </div>
          )}

          {/* Alternative Tools */}
          {alternativeTools.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-3 pt-1">
              {alternativeTools.map((tool, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-stone-200 bg-white p-3 space-y-1.5 hover:border-teal-300 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-ink">{tool.name}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-stone-100 text-stone-700">
                      {tool.openSource ? "Open Source" : "Free"}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink/75 line-clamp-2 leading-relaxed">{tool.description}</p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-ink/50">{tool.os}</span>
                    <a
                      href={tool.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-medium text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"
                    >
                      <span>Website</span>
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="p-3.5 rounded-lg bg-amber-50/60 border border-amber-200 text-xs text-amber-950 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-amber-900">
            <Cpu size={15} />
            <span>Hardware Path Active</span>
          </div>
          <p className="leading-relaxed text-ink/80">
            You have selected the physical hardware path. You will build and test using physical microcontrollers,
            sensors, wiring, or robotic hardware. When submitting, include circuit schematics, clear component
            documentation, and a demonstration video of your physical setup.
          </p>
          {!isLocked && (
            <button
              type="button"
              onClick={() => handleSelectPath("simulation")}
              className="text-[11px] text-teal-700 hover:text-teal-900 font-semibold underline underline-offset-2"
            >
              Don&apos;t have hardware right now? Switch to 100% free Simulation Path
            </button>
          )}
        </div>
      )}
    </div>
  );
}
