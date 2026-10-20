import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  PhoneOff,
  Pause,
  Play,
  Copy,
  Check,
  Edit2,
  X,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Volume2,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import type {
  Call,
  Segment,
  Candidate,
  CallNotes,
  EntityType,
  SystemHealth,
} from '../types/index.ts';
import {
  createCallSession,
  fetchCallDetails,
  sendCallChunk,
  pauseCallSession,
  resumeCallSession,
  endCallSession,
  sendCandidateAction,
  regenerateCallNotes,
  startSimulatedCall,
} from '../lib/apiClient.ts';
import { formatReadBackLine } from '../lib/fieldEngine.ts';
import { SCRIPTED_CALLS } from '../server/services/simulatedCalls.ts';

interface LiveCallPageProps {
  health: SystemHealth | null;
  activeCallId?: string;
  onCallEnded?: (callId: string) => void;
}

export const LiveCallPage: React.FC<LiveCallPageProps> = ({
  health,
  activeCallId: initialCallId,
  onCallEnded,
}) => {
  const [call, setCall] = useState<Call | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [notes, setNotes] = useState<CallNotes | null>(null);

  // UI state
  const [callDuration, setCallDuration] = useState<number>(0);
  const [isPausedHover, setIsPausedHover] = useState<boolean>(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showConsentModal, setShowConsentModal] = useState<boolean>(false);
  const [consentAcknowledged, setConsentAcknowledged] = useState<boolean>(true);
  const [selectedScript, setSelectedScript] = useState<string>('clean_support_call');
  const [collapsedSuperseded, setCollapsedSuperseded] = useState<Record<string, boolean>>({});
  const [isRegeneratingNotes, setIsRegeneratingNotes] = useState<boolean>(false);
  const [audioMode, setAudioMode] = useState<'simulated' | 'mic_tab' | 'upload'>('simulated');
  const [micActive, setMicActive] = useState<boolean>(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [ariaAnnouncement, setAriaAnnouncement] = useState<string>('');

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Load existing call if provided
  useEffect(() => {
    if (initialCallId) {
      fetchCallDetails(initialCallId)
        .then((data) => {
          setCall(data.call);
          setSegments(data.segments);
          setCandidates(data.candidates);
          setNotes(data.notes || null);
        })
        .catch(console.error);
    }
  }, [initialCallId]);

  // Subscribe to live SSE events when call is active
  useEffect(() => {
    if (!call?.id || call.state === 'ended') return;

    const eventSource = new EventSource(`/api/calls/${call.id}/events`);

    eventSource.addEventListener('segment', (event) => {
      const seg = JSON.parse(event.data) as Segment;
      setSegments((prev) => {
        if (prev.some((s) => s.id === seg.id)) return prev;
        return [...prev, seg];
      });
    });

    eventSource.addEventListener('candidate', (event) => {
      const cand = JSON.parse(event.data) as Candidate;
      setCandidates((prev) => {
        const idx = prev.findIndex((c) => c.id === cand.id);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = cand;
          return updated;
        }
        setAriaAnnouncement(`New ${cand.type} candidate captured: ${cand.displayValue || cand.value}`);
        return [cand, ...prev];
      });
    });

    eventSource.addEventListener('notes', (event) => {
      const n = JSON.parse(event.data) as CallNotes;
      setNotes(n);
    });

    eventSource.addEventListener('status', (event) => {
      const data = JSON.parse(event.data);
      if (data.state) {
        setCall((prev) => (prev ? { ...prev, state: data.state, endedAt: data.endedAt } : prev));
      }
    });

    return () => {
      eventSource.close();
    };
  }, [call?.id, call?.state]);

  // Call timer ticker
  useEffect(() => {
    if (call?.state !== 'listening') return;
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [call?.state]);

  // Auto-scroll transcript unless hovered
  useEffect(() => {
    if (!isPausedHover && transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [segments, isPausedHover]);

  // Keyboard shortcuts (C = Confirm, E = Edit, D = Dismiss)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (!selectedCandidateId) return;

      const cand = candidates.find((c) => c.id === selectedCandidateId);
      if (!cand || cand.status === 'confirmed' || cand.status === 'dismissed') return;

      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleCandidateAction(cand.id, 'confirm');
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        handleCandidateAction(cand.id, 'dismiss');
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        setEditingCandidateId(cand.id);
        setEditValue(cand.value);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCandidateId, candidates]);

  const handleStartSimulatedCall = async (scriptKey: string) => {
    try {
      setSegments([]);
      setCandidates([]);
      setNotes(null);
      setCallDuration(0);

      const res = await startSimulatedCall(scriptKey);
      setCall(res.call);
    } catch (err) {
      console.error('Failed to start simulation:', err);
    }
  };

  const handleStartLiveCall = async () => {
    if (!consentAcknowledged) {
      setShowConsentModal(true);
      return;
    }

    try {
      setSegments([]);
      setCandidates([]);
      setNotes(null);
      setCallDuration(0);

      const newCall = await createCallSession({
        mode: audioMode,
        language: 'en-IN',
        consentShown: true,
      });

      setCall(newCall);

      if (audioMode === 'mic_tab') {
        startBrowserAudioCapture(newCall.id);
      }
    } catch (err) {
      console.error('Failed to start live call:', err);
    }
  };

  const startBrowserAudioCapture = async (callId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicActive(true);
      setMicError(null);

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      let seq = 0;
      let startMs = 0;

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          seq++;
          await sendCallChunk({
            callId,
            channel: 'agent',
            seq,
            startMs,
            endMs: startMs + 3000,
            audioBlob: e.data,
          });
          startMs += 3000;
        }
      };

      recorder.start(3000); // 3-second audio slices
    } catch (err) {
      setMicError('Microphone access denied or unavailable.');
      setMicActive(false);
    }
  };

  const stopBrowserAudioCapture = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
    }
    setMicActive(false);
  };

  const handlePauseResume = async () => {
    if (!call) return;
    if (call.state === 'listening') {
      await pauseCallSession(call.id);
      setCall((c) => (c ? { ...c, state: 'paused' } : null));
    } else if (call.state === 'paused') {
      await resumeCallSession(call.id);
      setCall((c) => (c ? { ...c, state: 'listening' } : null));
    }
  };

  const handleEndCall = async () => {
    if (!call) return;
    stopBrowserAudioCapture();
    try {
      const res = await endCallSession(call.id);
      setCall(res.call);
      if (res.notes) setNotes(res.notes);
      onCallEnded?.(call.id);
    } catch (err) {
      console.error('Failed to end call:', err);
    }
  };

  const handleCandidateAction = async (
    candidateId: string,
    action: 'confirm' | 'edit' | 'dismiss',
    customVal?: string
  ) => {
    if (!call) return;
    try {
      const updated = await sendCandidateAction(call.id, candidateId, action, customVal);
      setCandidates((prev) => prev.map((c) => (c.id === candidateId ? updated : c)));
      setEditingCandidateId(null);
    } catch (err) {
      console.error(`Failed to ${action} candidate:`, err);
    }
  };

  const handleCopyReadBack = (candidate: Candidate) => {
    const text = formatReadBackLine(candidate);
    navigator.clipboard.writeText(text);
    setCopiedId(candidate.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRegenerateNotes = async () => {
    if (!call) return;
    setIsRegeneratingNotes(true);
    try {
      const updated = await regenerateCallNotes(call.id);
      setNotes(updated);
    } catch (err) {
      console.error('Failed to regenerate notes:', err);
    } finally {
      setIsRegeneratingNotes(false);
    }
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Group candidates: active vs superseded
  const activeCandidates = candidates.filter((c) => c.status !== 'superseded');
  const supersededByParent = candidates
    .filter((c) => c.status === 'superseded')
    .reduce<Record<string, Candidate[]>>((acc, c) => {
      // Find the candidate that superseded this one
      const parent = candidates.find((p) => p.supersedes === c.id);
      const parentId = parent ? parent.id : 'orphan';
      if (!acc[parentId]) acc[parentId] = [];
      acc[parentId].push(c);
      return acc;
    }, {});

  // Template requirement checklist
  const templateEntities: EntityType[] = ['name', 'mobile', 'email', 'order_id', 'postal_pin'];

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-100 text-slate-900 overflow-hidden">
      {/* Hidden ARIA live region for screen readers */}
      <div className="sr-only" aria-live="polite">
        {ariaAnnouncement}
      </div>

      {/* TOP CALL CONTROL RIBBON */}
      <section aria-label="Call Status and Controls" className="bg-white border-b border-slate-200 px-4 py-2.5 shrink-0 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Call Status & Timer */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span
                className={`w-3 h-3 rounded-full ${
                  call?.state === 'listening'
                    ? 'bg-emerald-500 animate-pulse'
                    : call?.state === 'paused'
                    ? 'bg-amber-500'
                    : call?.state === 'ended'
                    ? 'bg-slate-400'
                    : 'bg-slate-300'
                }`}
              />
              <span className="font-bold text-sm tracking-wide capitalize">
                {call ? call.state : 'Idle / Ready'}
              </span>
            </div>

            <div className="font-mono text-lg font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200">
              {formatTimer(callDuration)}
            </div>

            {call && (
              <span className="text-xs text-slate-500 font-mono hidden sm:inline">
                ID: {call.id.slice(0, 16)}...
              </span>
            )}
          </div>

          {/* Quick Script & Audio Mode Pickers */}
          {!call || call.state === 'ended' ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg border border-slate-300 bg-slate-50 p-0.5">
                <button
                  onClick={() => setAudioMode('simulated')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    audioMode === 'simulated' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Simulated
                </button>
                <button
                  onClick={() => setAudioMode('mic_tab')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    audioMode === 'mic_tab' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Live Mic
                </button>
              </div>

              {audioMode === 'simulated' ? (
                <div className="flex items-center gap-2">
                  <select
                    value={selectedScript}
                    onChange={(e) => setSelectedScript(e.target.value)}
                    className="text-xs bg-white border border-slate-300 rounded-md px-2 py-1.5 font-medium text-slate-700 focus:outline-indigo-500"
                  >
                    <option value="clean_support_call">1. Clean Support Call (Name, Phone, Email)</option>
                    <option value="noisy_device_call">2. Telephony Call (15-digit IMEI, Serial)</option>
                    <option value="spoken_correction_call">3. Spoken Correction (4 not 5, last 7)</option>
                  </select>

                  <button
                    onClick={() => handleStartSimulatedCall(selectedScript)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-semibold shadow-xs transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Start Call</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleStartLiveCall}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold shadow-xs transition-colors"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Start Live Call</span>
                </button>
              )}
            </div>
          ) : (
            /* Live Call Action Controls */
            <div className="flex items-center gap-2">
              <button
                onClick={handlePauseResume}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-md text-xs font-medium transition-colors"
              >
                {call.state === 'listening' ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Resume</span>
                  </>
                )}
              </button>

              <button
                onClick={handleEndCall}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-xs font-semibold shadow-xs transition-colors"
              >
                <PhoneOff className="w-3.5 h-3.5" />
                <span>End Call</span>
              </button>
            </div>
          )}
        </div>

        {/* Warning messages if mic or STT error */}
        {micError && (
          <div className="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{micError}</span>
          </div>
        )}
      </section>

      {/* THREE-COLUMN WORKSPACE */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
        {/* COLUMN 1: LIVE TRANSCRIPT (4 cols on lg) */}
        <section
          aria-label="Live Transcript"
          className="lg:col-span-4 bg-white border-r border-slate-200 flex flex-col h-full overflow-hidden"
          onMouseEnter={() => setIsPausedHover(true)}
          onMouseLeave={() => setIsPausedHover(false)}
        >
          <div className="p-3 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs tracking-wider uppercase text-slate-700">
                Live Transcript
              </span>
              <span className="text-[11px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-full font-mono">
                {segments.length}
              </span>
            </div>
            {isPausedHover && (
              <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-medium border border-amber-200">
                Scroll Paused (Hover)
              </span>
            )}
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-3 font-sans">
            {segments.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-6">
                <Volume2 className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm font-medium">Yani is listening silently.</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Transcript bubbles will stream in real time. It never speaks into the call.
                </p>
              </div>
            ) : (
              segments.map((seg) => {
                const isCustomer = seg.speaker === 'customer';
                const isGap = seg.text.startsWith('[Audio gap');

                return (
                  <div
                    key={seg.id}
                    className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-500 font-mono">
                      <span
                        className={`font-bold uppercase px-1.5 py-0.5 rounded text-[10px] ${
                          isCustomer
                            ? 'bg-teal-100 text-teal-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {isCustomer ? 'Customer' : 'Agent'}
                      </span>
                      <span>{Math.round(seg.startMs / 1000)}s</span>
                      {seg.sttLatencyMs > 0 && (
                        <span className="text-slate-400">({seg.sttLatencyMs}ms)</span>
                      )}
                    </div>

                    <div
                      className={`max-w-[85%] rounded-lg px-3.5 py-2 text-sm leading-relaxed ${
                        isGap
                          ? 'bg-rose-50 text-rose-800 border border-rose-300 italic'
                          : isCustomer
                          ? 'bg-slate-100 text-slate-900 border border-slate-200/80 rounded-tl-none'
                          : 'bg-indigo-50 text-indigo-950 border border-indigo-200/80 rounded-tr-none'
                      }`}
                    >
                      {seg.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={transcriptEndRef} />
          </div>
        </section>

        {/* COLUMN 2: CAPTURED DETAILS (5 cols on lg) */}
        <section
          aria-label="Captured Details"
          className="lg:col-span-5 bg-slate-50 border-r border-slate-200 flex flex-col h-full overflow-hidden"
        >
          <div className="p-3 border-b border-slate-200 bg-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs tracking-wider uppercase text-slate-700">
                Captured Details
              </span>
              <span className="text-[11px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full">
                {activeCandidates.length} Active
              </span>
            </div>

            <div className="text-[11px] text-slate-500">
              Shortcuts: <kbd className="px-1 py-0.5 bg-slate-100 border rounded text-[10px]">C</kbd> Confirm · <kbd className="px-1 py-0.5 bg-slate-100 border rounded text-[10px]">E</kbd> Edit · <kbd className="px-1 py-0.5 bg-slate-100 border rounded text-[10px]">D</kbd> Dismiss
            </div>
          </div>

          <div className="flex-1 p-3 overflow-y-auto space-y-3">
            {activeCandidates.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-6">
                <Sliders className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm font-medium">No candidates detected yet.</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  When the customer speaks names, phones, emails, IMEIs or orders, Yani captures them as candidate cards.
                </p>
              </div>
            ) : (
              activeCandidates.map((candidate) => {
                const isSelected = selectedCandidateId === candidate.id;
                const isEditing = editingCandidateId === candidate.id;
                const supersededList = supersededByParent[candidate.id] || [];
                const isSupersededExpanded = Boolean(collapsedSuperseded[candidate.id]);

                return (
                  <article
                    key={candidate.id}
                    onClick={() => setSelectedCandidateId(candidate.id)}
                    className={`bg-white rounded-lg border transition-all shadow-xs p-3.5 cursor-pointer relative ${
                      isSelected
                        ? 'border-indigo-500 ring-2 ring-indigo-200'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Header: Type icon, Status Chip, Verbal Tag */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                          {candidate.type.replace('_', ' ')}
                        </span>
                        {candidate.alternativeType && (
                          <span className="text-[10px] text-slate-500 italic">
                            (Alt: {candidate.alternativeType})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {candidate.customerVerbalConfirm && (
                          <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-600" />
                            Customer verbally confirmed
                          </span>
                        )}

                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            candidate.status === 'confirmed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : candidate.status === 'needs_review'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : candidate.status === 'edited'
                              ? 'bg-purple-100 text-purple-800'
                              : candidate.status === 'dismissed'
                              ? 'bg-slate-200 text-slate-600 line-through'
                              : 'bg-blue-50 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {candidate.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Value in large monospace */}
                    {isEditing ? (
                      <div className="my-2 flex items-center gap-2">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="flex-1 font-mono text-lg font-bold px-2 py-1 border border-indigo-400 rounded focus:outline-none focus:ring-2 focus:ring-indigo-300"
                          autoFocus
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCandidateAction(candidate.id, 'edit', editValue);
                          }}
                          className="px-2.5 py-1 bg-indigo-600 text-white rounded text-xs font-semibold"
                        >
                          Save
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCandidateId(null);
                          }}
                          className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="my-2">
                        <div className="font-mono text-xl sm:text-2xl font-bold tracking-tight text-slate-900 select-all">
                          {candidate.displayValue || candidate.value}
                        </div>
                      </div>
                    )}

                    {/* Copy-Ready Read-Back Text Line for Agent (Section 6, Item 7) */}
                    <div className="mt-2 bg-slate-50 border border-slate-200/80 rounded p-2 flex items-center justify-between gap-2">
                      <div className="text-xs text-slate-700">
                        <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                          Agent Read-Back Line (Say to Customer)
                        </span>
                        <span className="font-medium text-slate-800">
                          "{formatReadBackLine(candidate)}"
                        </span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyReadBack(candidate);
                        }}
                        className="p-1.5 hover:bg-white border border-transparent hover:border-slate-300 rounded text-slate-600 transition-colors shrink-0"
                        title="Copy read-back text"
                      >
                        {copiedId === candidate.id ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {/* Evidence Quote & Timestamp */}
                    <div className="mt-2 text-xs text-slate-500 italic">
                      "{candidate.evidence.quote}" · {Math.round(candidate.evidence.atMs / 1000)}s
                    </div>

                    {/* Validation checks as small ticks */}
                    {candidate.validation.checks.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                        {candidate.validation.checks.map((check, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded text-[10px] border border-emerald-200"
                          >
                            <Check className="w-2.5 h-2.5" />
                            {check}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Warnings (if any) */}
                    {candidate.validation.warnings.length > 0 && (
                      <div className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
                        {candidate.validation.warnings[0]}
                      </div>
                    )}

                    {/* Action Buttons: Confirm, Edit, Dismiss */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {candidate.status !== 'confirmed' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCandidateAction(candidate.id, 'confirm');
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold shadow-2xs transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Confirm</span>
                          </button>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCandidateId(candidate.id);
                            setEditValue(candidate.value);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium border border-slate-300 transition-colors"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>

                        {candidate.status !== 'dismissed' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCandidateAction(candidate.id, 'dismiss');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded text-xs transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Dismiss</span>
                          </button>
                        )}
                      </div>

                      {/* Confidence pill */}
                      <span className="text-[10px] font-mono text-slate-400">
                        {Math.round(candidate.confidence * 100)}% conf
                      </span>
                    </div>

                    {/* Collapsed Superseded Values (History) */}
                    {supersededList.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-dashed border-slate-200">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCollapsedSuperseded((prev) => ({
                              ...prev,
                              [candidate.id]: !prev[candidate.id],
                            }));
                          }}
                          className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium"
                        >
                          {isSupersededExpanded ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                          <span>
                            {supersededList.length} superseded value(s) in history
                          </span>
                        </button>

                        {isSupersededExpanded && (
                          <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-slate-200 text-xs">
                            {supersededList.map((sup) => (
                              <div
                                key={sup.id}
                                className="bg-slate-100 p-2 rounded text-slate-600 line-through font-mono"
                              >
                                {sup.displayValue || sup.value}
                                <span className="ml-2 text-[10px] text-slate-400 no-underline inline-block">
                                  (superseded: "{sup.evidence.quote}")
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </section>

        {/* COLUMN 3: LIVE NOTES (3 cols on lg) */}
        <section
          aria-label="Live Call Notes"
          className="lg:col-span-3 bg-white flex flex-col h-full overflow-hidden"
        >
          <div className="p-3 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
            <span className="font-semibold text-xs tracking-wider uppercase text-slate-700">
              Live Call Notes
            </span>

            <button
              onClick={handleRegenerateNotes}
              disabled={isRegeneratingNotes || !call}
              className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium disabled:opacity-50"
              title="Refresh notes from current transcript and candidates"
            >
              <RefreshCw className={`w-3 h-3 ${isRegeneratingNotes ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs leading-relaxed">
            {/* Template Requirements Checklist */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-2">
                Required Details Checklist
              </span>
              <div className="space-y-1">
                {templateEntities.map((type) => {
                  const matchingCandidate = candidates.find(
                    (c) => c.type === type && c.status !== 'dismissed' && c.status !== 'superseded'
                  );
                  const isConfirmed = matchingCandidate?.status === 'confirmed';
                  const isCaptured = Boolean(matchingCandidate);

                  return (
                    <div key={type} className="flex items-center justify-between text-xs py-0.5">
                      <span className="capitalize text-slate-700">
                        {type.replace('_', ' ')}
                      </span>
                      {isConfirmed ? (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1 text-[11px]">
                          <Check className="w-3 h-3 text-emerald-600" />
                          Confirmed
                        </span>
                      ) : isCaptured ? (
                        <span className="text-amber-700 font-medium text-[11px]">
                          Unconfirmed
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Missing</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Notes Sections */}
            {notes ? (
              <div className="space-y-3">
                <div>
                  <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-1">
                    Summary So Far
                  </h4>
                  <p className="text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200">
                    {notes.summary}
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-1">
                    Customer Issue
                  </h4>
                  <p className="text-slate-700 bg-slate-50 p-2 rounded border border-slate-200">
                    {notes.issue}
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-1">
                    Actions Promised
                  </h4>
                  {notes.actions.length === 0 ? (
                    <p className="text-slate-400 italic">None yet.</p>
                  ) : (
                    <ul className="list-disc pl-4 space-y-1 text-slate-700">
                      {notes.actions.map((act, i) => (
                        <li key={i}>{act}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-1">
                    Follow-Ups
                  </h4>
                  {notes.followUps.length === 0 ? (
                    <p className="text-slate-400 italic">None yet.</p>
                  ) : (
                    <ul className="list-disc pl-4 space-y-1 text-slate-700">
                      {notes.followUps.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {notes.openItems.length > 0 && (
                  <div>
                    <h4 className="font-bold text-amber-900 uppercase tracking-wider text-[10px] mb-1">
                      Open Items / Unclear
                    </h4>
                    <ul className="list-disc pl-4 space-y-1 text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                      {notes.openItems.map((o, i) => (
                        <li key={i}>{o}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-slate-400 py-6">
                <Sparkles className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p>Notes will auto-generate as the conversation progresses.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
