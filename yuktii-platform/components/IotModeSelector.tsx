'use client';

import { useState } from 'react';
import { Cpu, Monitor, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';

type Props = {
  enrollmentId: string;
};

export default function IotModeSelector({ enrollmentId }: Props) {
  const [selectedMode, setSelectedMode] = useState<'simulation' | 'hardware' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    if (!selectedMode) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/enrollments/set-iot-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId, iotMode: selectedMode }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save IoT mode');

      // Reload page to display generated master project
      window.location.reload();
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="rounded-2xl border border-teal/30 bg-white p-8 shadow-xl">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <span className="badge badge-teal mb-3">REQUIRED CHOICE — IOT DOMAIN</span>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink">
            How would you like to complete this IoT Track?
          </h2>
          <p className="text-ink/65 text-sm mt-2 leading-relaxed">
            Select your preferred completion mode. Your project problem statement, component instructions, and simulator links will be customized for your choice. This choice locks in alongside your project scenario.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Option 1: Software Simulation */}
          <div
            onClick={() => setSelectedMode('simulation')}
            className={`cursor-pointer rounded-xl border-2 p-6 transition-all relative ${
              selectedMode === 'simulation'
                ? 'border-teal bg-teal/5 shadow-md'
                : 'border-line bg-paper/50 hover:border-teal/50 hover:bg-white'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-teal/10 text-teal flex items-center justify-center">
                <Monitor size={24} />
              </div>
              {selectedMode === 'simulation' && (
                <CheckCircle2 size={22} className="text-teal" />
              )}
            </div>

            <h3 className="font-display text-lg font-bold text-ink mb-1">
              Option 1: Software Simulation
            </h3>
            <p className="text-xs text-teal font-medium mb-3">
              100% Free & Open-Source Online Simulators
            </p>

            <ul className="space-y-2 text-xs text-ink/75 mb-4">
              <li className="flex items-start gap-1.5">
                <span className="text-teal">✓</span> Simulated with free tools (Wokwi, Tinkercad Circuits, Proteus)
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-teal">✓</span> No physical components required — build in browser
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-teal">✓</span> Virtual circuit wiring & firmware code debugging
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-teal">✓</span> Mandatory 3-5 min screen-recording demo video to Google Drive
              </li>
            </ul>
          </div>

          {/* Option 2: Hardware Model Development */}
          <div
            onClick={() => setSelectedMode('hardware')}
            className={`cursor-pointer rounded-xl border-2 p-6 transition-all relative ${
              selectedMode === 'hardware'
                ? 'border-amber-500 bg-amber-50/50 shadow-md'
                : 'border-line bg-paper/50 hover:border-amber-400 hover:bg-white'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <Cpu size={24} />
              </div>
              {selectedMode === 'hardware' && (
                <CheckCircle2 size={22} className="text-amber-600" />
              )}
            </div>

            <h3 className="font-display text-lg font-bold text-ink mb-1">
              Option 2: Hardware Model Development
            </h3>
            <p className="text-xs text-amber-700 font-medium mb-3">
              Build Real Physical Circuit & Prototype
            </p>

            <ul className="space-y-2 text-xs text-ink/75 mb-4">
              <li className="flex items-start gap-1.5">
                <span className="text-amber-600">✓</span> Students purchase their own physical components
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-amber-600">✓</span> Complete component list provided for easy procurement
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-amber-600">✓</span> Step-by-step physical wiring & assembly instructions
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-amber-600">✓</span> Mandatory 3-5 min physical model demo video to Google Drive
              </li>
            </ul>

            <div className="pt-3 border-t border-amber-200 text-[11px] text-amber-800 flex items-start gap-1.5">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              <span>Safety Disclaimer: Low-voltage components only (3.3V-5V). Avoid mains voltage.</span>
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
            {submitting ? 'Confirming Choice...' : 'Confirm & Generate IoT Project →'}
          </button>
        </div>
      </div>
    </div>
  );
}
