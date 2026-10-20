import React, { useState, useEffect } from 'react';
import {
  Phone,
  Play,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Shield,
  ArrowRight,
  Trash2,
  Sliders,
  ChevronRight,
} from 'lucide-react';
import type { Call, SystemHealth } from '../types/index.ts';
import { fetchAllCalls, deleteCallSession, startSimulatedCall } from '../lib/apiClient.ts';
import { SCRIPTED_CALLS } from '../server/services/simulatedCalls.ts';

interface HomePageProps {
  onStartCall: (callId: string) => void;
  onReviewCall: (callId: string) => void;
  health: SystemHealth | null;
}

export const HomePage: React.FC<HomePageProps> = ({
  onStartCall,
  onReviewCall,
  health,
}) => {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [consentAcknowledged, setConsentAcknowledged] = useState<boolean>(true);
  const [selectedScript, setSelectedScript] = useState<string>('clean_support_call');
  const [isStartingSim, setIsStartingSim] = useState<boolean>(false);

  const loadCalls = () => {
    fetchAllCalls()
      .then(setCalls)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCalls();
  }, []);

  const handleStartSim = async (scriptKey: string) => {
    setIsStartingSim(true);
    try {
      const res = await startSimulatedCall(scriptKey);
      onStartCall(res.call.id);
    } catch (err) {
      console.error('Failed to start simulation:', err);
    } finally {
      setIsStartingSim(false);
    }
  };

  const handleDeleteCall = async (e: React.MouseEvent, callId: string) => {
    e.stopPropagation();
    if (!confirm(`Purge call ${callId}? This cannot be undone.`)) return;
    try {
      await deleteCallSession(callId);
      setCalls((prev) => prev.filter((c) => c.id !== callId));
    } catch (err) {
      console.error('Failed to delete call:', err);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-2xl p-6 sm:p-8 text-white shadow-md">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-indigo-400" />
            <span>Support Agent Call Spectator</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Yani listens so the agent can focus on the customer.
          </h1>

          <p className="text-sm text-slate-300 leading-relaxed">
            Yani is a silent spectator. It listens to both sides of the call, spots unique identifiers (mobile, email, 15-digit IMEI, serial numbers, order IDs, PINs), captures candidates with evidence, and builds live notes in real time.
            <strong className="text-white block mt-1">
              It never speaks on the call: speech recognition proposes, a human confirms.
            </strong>
          </p>

          {/* Consent Banner Checkbox (Section 13) */}
          <div className="pt-2">
            <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/60">
              <input
                type="checkbox"
                checked={consentAcknowledged}
                onChange={(e) => setConsentAcknowledged(e.target.checked)}
                className="rounded border-slate-600 text-indigo-500 focus:ring-indigo-400"
              />
              <span>
                <strong>Compliance Acknowledgement:</strong> Customer has been informed that this call is being transcribed for quality and note-taking per organizational policy.
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Action Cards: 3 Scripted Simulated Scenarios */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Start Scripted Synthetic Call (1-Click Demo)
            </h2>
            <p className="text-xs text-slate-500">
              Replays pre-packaged synthetic two-speaker conversations with realistic timing through the real pipeline.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Preset 1: Clean E-Commerce Support */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-indigo-400 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-bold tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                  Clean Audio
                </span>
                <span className="text-xs text-slate-400 font-mono">5 Details</span>
              </div>
              <h3 className="font-bold text-sm text-slate-900 mb-1">
                1. Order Status & Details
              </h3>
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                Customer shares Name (Rahul Sharma), 10-digit mobile, email address, order ID (ORD12345678), and Bangalore PIN (560001).
              </p>
            </div>

            <button
              onClick={() => handleStartSim('clean_support_call')}
              disabled={isStartingSim}
              className="w-full inline-flex items-center justify-center gap-2 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Launch Clean Call</span>
            </button>
          </div>

          {/* Preset 2: Telephony Device Replacement (15-digit IMEI) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-indigo-400 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-bold tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                  Telephony 8kHz
                </span>
                <span className="text-xs text-slate-400 font-mono">3 Details</span>
              </div>
              <h3 className="font-bold text-sm text-slate-900 mb-1">
                2. Device Warranty (IMEI & Serial)
              </h3>
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                Customer provides 15-digit IMEI verified via Luhn modulo-10 algorithm, contact phone, and NATO-spelled hardware serial.
              </p>
            </div>

            <button
              onClick={() => handleStartSim('noisy_device_call')}
              disabled={isStartingSim}
              className="w-full inline-flex items-center justify-center gap-2 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Launch Telephony Call</span>
            </button>
          </div>

          {/* Preset 3: Spoken Correction (Supersession) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-indigo-400 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-bold tracking-wider bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                  Correction Scenario
                </span>
                <span className="text-xs text-slate-400 font-mono">Supersession</span>
              </div>
              <h3 className="font-bold text-sm text-slate-900 mb-1">
                3. Mid-Call Spoken Correction
              </h3>
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                Customer says a number, catches verbal error ("no, it is 4 not 5", "last digit 7"), superseding earlier value while keeping full history.
              </p>
            </div>

            <button
              onClick={() => handleStartSim('spoken_correction_call')}
              disabled={isStartingSim}
              className="w-full inline-flex items-center justify-center gap-2 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Launch Correction Call</span>
            </button>
          </div>
        </div>
      </div>

      {/* Past Calls List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <h2 className="font-bold text-sm text-slate-900">Recent Call Sessions</h2>
          </div>

          <span className="text-xs text-slate-400 font-mono">{calls.length} calls recorded</span>
        </div>

        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="p-6 text-center text-xs text-slate-400">Loading call history...</div>
          ) : calls.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No call sessions yet. Click any preset above to launch a call!
            </div>
          ) : (
            calls.map((c) => (
              <div
                key={c.id}
                onClick={() => onReviewCall(c.id)}
                className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      c.state === 'listening'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    <Phone className="w-4 h-4" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-900">
                        {c.id}
                      </span>
                      <span
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                          c.mode === 'simulated'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {c.mode}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        State: {c.state}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Started: {new Date(c.startedAt).toLocaleTimeString()} · Language: {c.language}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onReviewCall(c.id);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium border border-slate-300 transition-colors"
                  >
                    <span>Review</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={(e) => handleDeleteCall(e, c.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                    title="Purge call data"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
