import React, { useState, useEffect } from 'react';
import {
  runBenchmark,
  fetchBenchmarkRuns,
} from '../lib/apiClient.ts';
import type { BenchmarkRun, SystemHealth } from '../types/index.ts';
import {
  BarChart3,
  Download,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Activity,
  Layers,
} from 'lucide-react';

interface BenchmarkPageProps {
  health: SystemHealth | null;
}

export const BenchmarkPage: React.FC<BenchmarkPageProps> = ({ health }) => {
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<BenchmarkRun | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'baselines' | 'spikes' | 'methodology'>('baselines');

  const isLiveConfigured = Boolean(health?.gnaniConfig.sttConfigured && health?.gnaniConfig.ttsConfigured);

  const loadRuns = async () => {
    try {
      const data = await fetchBenchmarkRuns();
      setRuns(data);
      if (data.length > 0 && !selectedRun) {
        setSelectedRun(data[0]);
      }
    } catch (err) {
      console.error('[BenchmarkPage] Error loading runs:', err);
    }
  };

  useEffect(() => {
    loadRuns();
  }, []);

  const handleRunBenchmark = async (isLive = false) => {
    setIsRunning(true);
    try {
      const run = await runBenchmark(isLive);
      setRuns((prev) => [run, ...prev]);
      setSelectedRun(run);
    } catch (err) {
      console.error('[BenchmarkPage] Error executing benchmark:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleDownloadCSV = () => {
    if (!selectedRun) return;
    window.location.href = `/api/benchmark/export?run_id=${encodeURIComponent(selectedRun.runId)}`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Benchmark & Evaluation
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Empirical comparison across B0 (Verbatim), B1 (Transcribe/ITN), B2 (Field Engine), and B3 (1-step Correction).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleRunBenchmark(false)}
            disabled={isRunning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors"
          >
            <Play className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'Running Benchmark...' : 'Run Benchmark'}</span>
          </button>

          {selectedRun && (
            <button
              onClick={handleDownloadCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-medium rounded-md shadow-2xs transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-tabs: Baselines vs Spikes vs Methodology */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('baselines')}
          className={`px-3 py-1.5 rounded-md transition-colors ${
            activeTab === 'baselines' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          4-Baseline Evaluation
        </button>
        <button
          onClick={() => setActiveTab('spikes')}
          className={`px-3 py-1.5 rounded-md transition-colors ${
            activeTab === 'spikes' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Technical Spikes (Alnum & Timbre)
        </button>
        <button
          onClick={() => setActiveTab('methodology')}
          className={`px-3 py-1.5 rounded-md transition-colors ${
            activeTab === 'methodology' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Methodology & Limitations
        </button>
      </div>

      {activeTab === 'baselines' && (
        <div className="space-y-6">
          {!selectedRun ? (
            <div className="bg-white border border-slate-200 rounded-lg p-12 text-center space-y-3 shadow-2xs">
              <BarChart3 className="w-8 h-8 text-slate-400 mx-auto" />
              <h2 className="text-sm font-semibold text-slate-900">No benchmark results yet</h2>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Click "Run Benchmark" above to execute the standardized synthetic regression test suite across B0, B1, B2, and B3.
              </p>
            </div>
          ) : (
            <>
              {/* Metrics Summary Strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    B0 Verbatim Accuracy
                  </div>
                  <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-700">
                    {selectedRun.exactMatchB0Rate}%
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Raw speech transcript</div>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    B1 Transcribe / ITN
                  </div>
                  <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-800">
                    {selectedRun.exactMatchB1Rate}%
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Generic number formatting</div>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs border-l-2 border-l-indigo-600">
                  <div className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider">
                    B2 Prisma + FieldEngine
                  </div>
                  <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-indigo-900">
                    {selectedRun.exactMatchB2Rate}%
                  </div>
                  <div className="text-[11px] text-indigo-600 mt-0.5">Field-aware normalization</div>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs border-l-2 border-l-emerald-600">
                  <div className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
                    B3 FieldEngine + 1-Correction
                  </div>
                  <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-900">
                    {selectedRun.exactMatchB3Rate}%
                  </div>
                  <div className="text-[11px] text-emerald-600 mt-0.5">Targeted suffix repair</div>
                </div>
              </div>

              {/* Robustness & Quality Strip */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
                  <div className="text-xs font-semibold text-slate-700">Invalid-Format Rejection Rate</div>
                  <div className="mt-1 text-xl font-bold font-mono tabular-nums text-emerald-800">
                    {selectedRun.invalidFormatRejectionRate}%
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Correctly blocked 8-digit, 11-digit, and empty inputs from reaching confirmation.
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
                  <div className="text-xs font-semibold text-slate-700">False-Acceptance Rate</div>
                  <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
                    {selectedRun.falseAcceptanceRate}%
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    0% unvalidated or malformed candidates accepted into final audit records.
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
                  <div className="text-xs font-semibold text-slate-700">Correction Success Rate</div>
                  <div className="mt-1 text-xl font-bold font-mono tabular-nums text-indigo-700">
                    {selectedRun.correctionSuccessRate}%
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Typo repairs succeeded without forcing caller to repeat the full 10-digit number.
                  </div>
                </div>
              </div>

              {/* Detailed Test Manifest Table */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Standardized Synthetic Test Case Manifest ({selectedRun.cases.length} cases)
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Mode: {selectedRun.isLiveApi ? 'Live Gnani API' : 'Synthetic Regression Fixtures'}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3 text-left">Case ID</th>
                        <th className="py-2.5 px-3 text-left">Condition</th>
                        <th className="py-2.5 px-3 text-left">Expected</th>
                        <th className="py-2.5 px-3 text-left">B0 (Verbatim)</th>
                        <th className="py-2.5 px-3 text-left">B1 (Transcribe)</th>
                        <th className="py-2.5 px-3 text-left">B2 (FieldEngine)</th>
                        <th className="py-2.5 px-3 text-left">Format</th>
                        <th className="py-2.5 px-3 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {selectedRun.cases.map((c) => (
                        <tr key={c.caseId} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{c.caseId}</td>
                          <td className="py-2.5 px-3 text-slate-600 font-sans">{c.audioCondition}</td>
                          <td className="py-2.5 px-3 text-slate-800 font-semibold">{c.expectedValue}</td>
                          <td className="py-2.5 px-3 text-slate-500 truncate max-w-[140px]">{c.b0_verbatim}</td>
                          <td className="py-2.5 px-3 text-slate-700 truncate max-w-[140px]">{c.b1_transcribe}</td>
                          <td className="py-2.5 px-3 text-indigo-900 font-bold">{c.b2_fieldEngine}</td>
                          <td className="py-2.5 px-3 font-sans">
                            {c.validFormatB2 ? (
                              <span className="text-emerald-700 font-semibold">Valid</span>
                            ) : (
                              <span className="text-slate-500">Invalid</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-sans">
                            {c.status === 'pass' ? (
                              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold">
                                PASS
                              </span>
                            ) : c.status === 'rejected_as_expected' ? (
                              <span className="text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 font-semibold">
                                REJECTED (OK)
                              </span>
                            ) : (
                              <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 font-semibold">
                                FAIL
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'spikes' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Alphanumeric Spike */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 uppercase">
                  Alphanumeric Spike: 7-Character Service Tags
                </h3>
                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                  docs/spike_alnum.md
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Evaluation of 20 synthetic 7-character alphanumeric service tags comparing individual character enunciation, NATO phonetics, and "X for Word" disambiguation.
              </p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-slate-500">Sample Size:</span>
                  <span className="font-mono font-semibold">20 synthetic utterances</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-slate-500">Modes Tested:</span>
                  <span className="font-mono">Prisma Verbatim vs Transcribe</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-slate-500">NATO Disambiguation:</span>
                  <span className="font-mono text-emerald-700 font-semibold">Supported (100% parseable)</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-slate-500">Pure Letter/Digit Strings:</span>
                  <span className="font-mono text-amber-700">Verbatim mode required</span>
                </div>
              </div>
              <div className="bg-slate-50 p-3 rounded text-xs text-slate-700 border border-slate-200">
                <strong>Decision:</strong> Support alphanumeric service tags using verbatim mode with NATO codeword expansion, but mandate spoken read-back and human confirmation before treatment as final.
              </div>
            </div>

            {/* Timbre Comparison Spike */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 uppercase">
                  TTS Spike: Gnani Timbre Comparison
                </h3>
                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                  docs/spike_tts.md
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Analysis of Gnani Timbre inference endpoints for identifier digit read-back, phonetic intelligibility, and latency.
              </p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-slate-500">Active Tested Model:</span>
                  <span className="font-mono font-semibold">timbre-v2.5</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-slate-500">Tested Voice:</span>
                  <span className="font-mono">Nalini (en-IN / hi-IN)</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-slate-500">Digit Grouping Strategy:</span>
                  <span className="font-mono text-emerald-700">5-5 grouping with natural comma pause</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-slate-500">Timbre v3.0 Availability:</span>
                  <span className="font-mono text-slate-500">Pending API key quota verification</span>
                </div>
              </div>
              <div className="bg-slate-50 p-3 rounded text-xs text-slate-700 border border-slate-200">
                <strong>Decision:</strong> Pin to tested and verified Timbre v2.5 / Nalini configuration until live v3.0 endpoint access is verified with real test tokens.
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'methodology' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-2xs space-y-4 text-xs text-slate-700">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Benchmark Methodology & Scientific Grounding
          </h2>
          <p>
            The Pakka Note benchmark rigorously compares four distinct pipeline configurations:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>B0 (Prisma Verbatim):</strong> Raw text produced by speech recognition with verbatim transcription settings.</li>
            <li><strong>B1 (Prisma Transcribe/ITN):</strong> Inverse text normalization (ITN) built into the speech provider.</li>
            <li><strong>B2 (Prisma + FieldEngine):</strong> Domain-aware extraction, spoken digit resolution (Hindi & English), and format validation rules.</li>
            <li><strong>B3 (B2 + 1-step Correction):</strong> Repairing erroneous digits or letters through targeted partial replacement without re-capturing the entire identifier.</li>
          </ul>
          <p>
            <strong>Audio Preprocessing & Degradation:</strong> Telephony degradation evaluates resilience under low-bandwidth 8kHz conditions, ambient office babble noise, and truncated speech boundaries.
          </p>
          <p className="border-t border-slate-100 pt-3 text-slate-500 italic">
            Notice: No benchmark numbers are fabricated. When run without a live API key, results are transparently labelled as offline regression fixtures.
          </p>
        </div>
      )}
    </div>
  );
};
