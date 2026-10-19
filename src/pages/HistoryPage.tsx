import React, { useState, useEffect } from 'react';
import { fetchAllSessions, fetchSessionRecords } from '../lib/apiClient.ts';
import type { SessionRecord, CaptureRecord, StateChangeEvent } from '../types/index.ts';
import { SessionTimeline } from '../components/SessionTimeline.tsx';
import { ArrowLeft, Clock, ShieldCheck, Download, RefreshCw } from 'lucide-react';

export const HistoryPage: React.FC = () => {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<{
    session?: SessionRecord;
    captures: CaptureRecord[];
    events: StateChangeEvent[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAllSessions();
      setSessions(data);
      if (data.length > 0 && !selectedSessionId) {
        setSelectedSessionId(data[0].sessionId);
      }
    } catch (err) {
      console.error('[HistoryPage] Error loading sessions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (!selectedSessionId) {
      setSessionDetail(null);
      return;
    }

    fetchSessionRecords(selectedSessionId)
      .then((data) => setSessionDetail(data))
      .catch((err) => console.error('[HistoryPage] Error loading detail:', err));
  }, [selectedSessionId]);

  const handleExportJSON = () => {
    if (!sessionDetail) return;
    const blob = new Blob([JSON.stringify(sessionDetail, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pakka_note_audit_${selectedSessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Session Audit Trail
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cryptographically disciplined, chronological state transition logs with zero customer PII.
          </p>
        </div>

        <button
          onClick={loadSessions}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-xs font-medium text-slate-700 rounded-md hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center space-y-3 shadow-2xs">
          <Clock className="w-8 h-8 text-slate-400 mx-auto" />
          <h2 className="text-sm font-semibold text-slate-900">No session records yet</h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Once you capture, validate, or confirm spoken identifiers on the Capture tab, complete audit logs will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Session List */}
          <div className="lg:col-span-4 space-y-2">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
              Recorded Sessions ({sessions.length})
            </h2>
            <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
              {sessions.map((s) => (
                <button
                  key={s.sessionId}
                  onClick={() => setSelectedSessionId(s.sessionId)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedSessionId === s.sessionId
                      ? 'bg-indigo-50/70 border-indigo-400 shadow-2xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-slate-900 truncate">
                      {s.sessionId}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        s.status === 'confirmed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : s.status === 'rejected'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="capitalize">{s.selectedField.replace('_', ' ')} · {s.selectedLanguage}</span>
                    <span className="font-mono tabular-nums">
                      {new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {s.finalValue && (
                    <div className="mt-1.5 text-xs text-emerald-800 font-mono font-bold bg-emerald-50/60 px-2 py-0.5 rounded border border-emerald-200/60 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      <span>Final: {s.finalValue}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Detailed Session Audit */}
          <div className="lg:col-span-8">
            {sessionDetail ? (
              <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-2xs space-y-6">
                <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 font-mono">
                      {sessionDetail.session?.sessionId}
                    </h2>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                      <span>Field: <strong className="text-slate-800">{sessionDetail.session?.selectedField}</strong></span>
                      <span>·</span>
                      <span>Lang: <strong className="text-slate-800">{sessionDetail.session?.selectedLanguage}</strong></span>
                      <span>·</span>
                      <span>Status: <strong className="text-slate-800 uppercase">{sessionDetail.session?.status}</strong></span>
                    </div>
                  </div>

                  <button
                    onClick={handleExportJSON}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-md shadow-xs transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Audit JSON</span>
                  </button>
                </div>

                {/* Captures in this session */}
                <div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Speech Captures ({sessionDetail.captures.length})
                  </h3>
                  <div className="space-y-2">
                    {sessionDetail.captures.map((cap) => (
                      <div
                        key={cap.captureId}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-slate-500 font-semibold">{cap.captureId}</span>
                          <span className="font-mono text-slate-400 tabular-nums">
                            Latency: {cap.latencyMs}ms · Mode: {cap.mode}
                          </span>
                        </div>
                        <div className="text-slate-800">
                          <strong>Transcript:</strong> "{cap.rawTranscript}"
                        </div>
                        <div className="text-slate-800 font-mono">
                          <strong>Candidate:</strong> {cap.normalizedCandidate || '(None)'}
                        </div>
                        <div className="text-slate-600 text-[11px]">
                          <strong>Validation:</strong> {cap.validationMessage}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* State Timeline */}
                <div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">
                    Chronological State Events ({sessionDetail.events.length})
                  </h3>
                  <SessionTimeline events={sessionDetail.events} />
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-500 text-xs">
                Select a session on the left to inspect its chronological audit trail.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
