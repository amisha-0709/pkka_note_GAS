import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Square,
  Upload,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  FileAudio,
} from 'lucide-react';
import type {
  FieldType,
  LanguageCode,
  STTFormatMode,
  ConfirmationState,
  ReadBackResult,
  SystemHealth,
} from '../types/index.ts';
import { FIELD_PROFILES } from '../lib/fieldProfiles.ts';
import {
  captureAudio,
  requestReadBack,
  submitConfirmation,
  submitCorrection,
  CaptureResponse,
} from '../lib/apiClient.ts';
import { encodeWAV, generateSyntheticWavAudio } from '../lib/audioUtils.ts';
import { ReadBackPlayer } from '../components/ReadBackPlayer.tsx';

interface CapturePageProps {
  health: SystemHealth | null;
  onSessionUpdated?: () => void;
}

export const CapturePage: React.FC<CapturePageProps> = ({ health, onSessionUpdated }) => {
  const [selectedField, setSelectedField] = useState<FieldType>('mobile_number');
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>('en-IN');
  const [sttFormat, setSttFormat] = useState<STTFormatMode>('transcribe');

  // Session state
  const [sessionId, setSessionId] = useState<string>(() => `sess_${Date.now()}`);
  const [attemptCount, setAttemptCount] = useState<number>(1);
  const [currentState, setCurrentState] = useState<ConfirmationState>('idle');

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // Audio & Pipeline Data
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioSourceType, setAudioSourceType] = useState<'mic' | 'upload' | 'synthetic_preset'>('mic');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Results
  const [captureResult, setCaptureResult] = useState<CaptureResponse | null>(null);
  const [readBackResult, setReadBackResult] = useState<ReadBackResult | null>(null);
  const [isReadingBack, setIsReadingBack] = useState(false);

  // Correction panel
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [correctionMode, setCorrectionMode] = useState<'full' | 'replace_last_n'>('full');
  const [correctionValue, setCorrectionValue] = useState('');
  const [lastNCount, setLastNCount] = useState(2);
  const [confirmationNotice, setConfirmationNotice] = useState<string | null>(null);

  const isGnaniConfigured = Boolean(health?.gnaniConfig.sttConfigured && health?.gnaniConfig.ttsConfigured);
  const audioUrlRef = useRef<string | null>(null);
  const maxDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateAudioUrl = (newUrl: string | null) => {
    if (audioUrlRef.current && audioUrlRef.current !== newUrl) {
      URL.revokeObjectURL(audioUrlRef.current);
    }
    audioUrlRef.current = newUrl;
    setAudioUrl(newUrl);
  };

  // Cleanup audio tracks and object URLs on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (maxDurationTimeoutRef.current) clearTimeout(maxDurationTimeoutRef.current);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  // 30-second recording timer limit
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 30) {
            stopRecording();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  const startRecording = async () => {
    setErrorMessage(null);
    setCaptureResult(null);
    setReadBackResult(null);
    setConfirmationNotice(null);
    setIsCorrecting(false);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Audio recording is not supported in this browser environment. Please use audio upload or synthetic presets.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const rawBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        try {
          // Convert to standard mono 16kHz WAV PCM
          const arrayBuffer = await rawBlob.arrayBuffer();
          const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          const wavBlob = encodeWAV(audioBuffer);

          setCapturedBlob(wavBlob);
          updateAudioUrl(URL.createObjectURL(wavBlob));
          setAudioSourceType('mic');
          setCurrentState('captured');
        } catch (err) {
          console.warn('[Audio] PCM conversion fallback, using raw container:', err);
          setCapturedBlob(rawBlob);
          updateAudioUrl(URL.createObjectURL(rawBlob));
          setAudioSourceType('mic');
          setCurrentState('captured');
        } finally {
          // Release microphone tracks safely
          if (audioStreamRef.current) {
            audioStreamRef.current.getTracks().forEach((track) => track.stop());
            audioStreamRef.current = null;
          }
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);

      // Hard safety timer for 30 seconds
      if (maxDurationTimeoutRef.current) clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = setTimeout(() => {
        stopRecording();
      }, 30000);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Could not access microphone. Check browser permissions or use file upload.'
      );
    }
  };

  const stopRecording = () => {
    if (maxDurationTimeoutRef.current) {
      clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/') && !file.name.match(/\.(wav|mp3|m4a|ogg|webm|flac|aac)$/i)) {
      setErrorMessage('Invalid file type. Please upload an audio file (.wav, .mp3, .m4a, .ogg, or .webm).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('Audio file size exceeds 10MB limit. Please upload a shorter sample.');
      return;
    }

    setErrorMessage(null);
    setCaptureResult(null);
    setReadBackResult(null);
    setCapturedBlob(file);
    updateAudioUrl(URL.createObjectURL(file));
    setAudioSourceType('upload');
    setCurrentState('captured');
  };

  const loadPreset = (
    presetName: string,
    field: FieldType,
    transcriptText: string
  ) => {
    setSelectedField(field);
    setErrorMessage(null);
    setCaptureResult(null);
    setReadBackResult(null);
    setConfirmationNotice(null);
    setIsCorrecting(false);

    // Generate test synthetic audio wave
    const synthAudio = generateSyntheticWavAudio(2.0, 500);
    setCapturedBlob(synthAudio);
    updateAudioUrl(URL.createObjectURL(synthAudio));
    setAudioSourceType('synthetic_preset');
    setCurrentState('captured');

    // Trigger process with simulated fixture or live
    executeCapture(synthAudio, true, transcriptText);
  };

  const handleProcessRecording = async () => {
    if (!capturedBlob) {
      setErrorMessage('No audio captured. Please record or upload audio first.');
      return;
    }
    await executeCapture(capturedBlob, false);
  };

  const executeCapture = async (
    blob: Blob,
    isSimulatedPreset = false,
    presetTranscript?: string
  ) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setCurrentState('transcribing');

    try {
      const response = await captureAudio({
        audioBlob: blob,
        field: selectedField,
        language: selectedLanguage,
        format: sttFormat,
        sessionId,
        attempt: attemptCount,
        isSimulatedFixture: isSimulatedPreset,
        simulatedTranscript: presetTranscript,
      });

      setCaptureResult(response);
      setCurrentState(response.valid ? 'valid_candidate' : response.status);

      // If candidate is valid, automatically request read-back via Gnani Timbre
      if (response.valid && response.normalizedCandidate) {
        await executeReadBack(response.normalizedCandidate, response.captureId);
      }

      if (onSessionUpdated) onSessionUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transcription request failed.';
      setErrorMessage(msg);
      setCurrentState('failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const executeReadBack = async (candidate: string, captureId: string) => {
    setIsReadingBack(true);
    setCurrentState('reading_back');
    try {
      const rb = await requestReadBack({
        candidate,
        field: selectedField,
        language: selectedLanguage,
        sessionId,
        captureId,
        attempt: attemptCount,
      });
      setReadBackResult(rb);
      setCurrentState('read_back');
    } catch (err: unknown) {
      console.warn('[ReadBack] Read-back fallback displayed:', err);
      // Graceful fallback display
      setReadBackResult({
        captureId,
        spokenText: `The captured ${FIELD_PROFILES[selectedField].name} is: ${candidate}. Please confirm.`,
        audioMimeType: 'audio/wav',
        latencyMs: 0,
        model: 'Gnani Timbre',
        voice: 'Nalini',
        success: false,
        errorMessage: err instanceof Error ? err.message : 'Read-back service unavailable.',
      });
      setCurrentState('read_back');
    } finally {
      setIsReadingBack(false);
    }
  };

  const handleConfirmCandidate = async () => {
    if (!captureResult?.normalizedCandidate) return;

    try {
      const res = await submitConfirmation({
        sessionId,
        captureId: captureResult.captureId,
        candidate: captureResult.normalizedCandidate,
        action: 'confirm',
        attempt: attemptCount,
      });

      if (res.confirmed) {
        setCurrentState('confirmed');
        setConfirmationNotice(res.message);
        if (onSessionUpdated) onSessionUpdated();
      } else {
        setErrorMessage(res.message || 'Confirmation was not accepted by server.');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Confirmation failed to record.');
    }
  };

  const handleRejectCandidate = async () => {
    if (!captureResult?.normalizedCandidate) return;

    try {
      await submitConfirmation({
        sessionId,
        captureId: captureResult.captureId,
        candidate: captureResult.normalizedCandidate,
        action: 'reject',
        attempt: attemptCount,
      });

      setCurrentState('rejected');
      setIsCorrecting(true);
      setCorrectionValue(captureResult.normalizedCandidate);
      if (onSessionUpdated) onSessionUpdated();
    } catch (err) {
      setErrorMessage('Rejection failed to record.');
    }
  };

  const handleApplyCorrection = async () => {
    if (!captureResult?.normalizedCandidate || !correctionValue) return;

    try {
      const res = await submitCorrection({
        sessionId,
        captureId: captureResult.captureId,
        field: selectedField,
        previousCandidate: captureResult.normalizedCandidate,
        mode: correctionMode,
        correctionInput: correctionValue,
        lastN: lastNCount,
        attempt: attemptCount + 1,
      });

      setAttemptCount((prev) => prev + 1);

      if (res.success) {
        // Update local candidate with the corrected value
        setCaptureResult((prev) =>
          prev
            ? {
                ...prev,
                normalizedCandidate: res.mergedCandidate,
                valid: true,
                status: 'valid_candidate',
                validationMessage: res.validationMessage,
              }
            : null
        );
        setIsCorrecting(false);
        setCurrentState('valid_candidate');

        // Request spoken read-back for the corrected value
        await executeReadBack(res.mergedCandidate, captureResult.captureId);
      } else {
        setErrorMessage(res.validationMessage);
      }

      if (onSessionUpdated) onSessionUpdated();
    } catch (err) {
      setErrorMessage('Failed to apply correction.');
    }
  };

  const handleResetSession = () => {
    setSessionId(`sess_${Date.now()}`);
    setAttemptCount(1);
    setCurrentState('idle');
    setCapturedBlob(null);
    setAudioUrl(null);
    setCaptureResult(null);
    setReadBackResult(null);
    setIsCorrecting(false);
    setErrorMessage(null);
    setConfirmationNotice(null);
  };

  const profile = FIELD_PROFILES[selectedField];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Workflow Indicator */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
        <div className="flex items-center justify-between text-xs text-slate-500 overflow-x-auto pb-1 gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">Verification Pipeline:</span>
            <span className="font-mono text-slate-400">CAPTURE → TRANSCRIBE → PARSE → VALIDATE → READ BACK → CONFIRM</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span>Session ID:</span>
            <span className="font-mono font-medium text-slate-800">{sessionId}</span>
            <span>·</span>
            <span>Attempt:</span>
            <span className="font-mono font-medium text-slate-800">{attemptCount}</span>
            <button
              onClick={handleResetSession}
              className="ml-2 text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>New Session</span>
            </button>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-lg text-sm flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-600 hover:text-rose-900 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {confirmationNotice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-medium">{confirmationNotice}</span>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Configuration & Capture (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Step 1: Field & Language Selection */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              01. Field & Language Configuration
            </h2>

            {/* Field Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Target Field Profile
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(FIELD_PROFILES) as FieldType[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      setSelectedField(f);
                      setCaptureResult(null);
                      setReadBackResult(null);
                    }}
                    className={`p-2.5 text-left rounded-md border text-xs transition-colors ${
                      selectedField === f
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 font-semibold'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="font-semibold">{FIELD_PROFILES[f].name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{FIELD_PROFILES[f].tagline}</div>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {profile.formatDescription}
              </p>
            </div>

            {/* Language & STT Mode */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Spoken Language
                </label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value as LanguageCode)}
                  className="w-full text-xs border border-slate-200 rounded-md py-1.5 px-2 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="en-IN">English (India) [en-IN]</option>
                  <option value="hi-IN">Hindi (India) [hi-IN]</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Prisma STT Mode
                </label>
                <select
                  value={sttFormat}
                  onChange={(e) => setSttFormat(e.target.value as STTFormatMode)}
                  className="w-full text-xs border border-slate-200 rounded-md py-1.5 px-2 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="transcribe">Transcribe (ITN)</option>
                  <option value="verbatim">Verbatim</option>
                </select>
              </div>
            </div>
          </section>

          {/* Step 2: Audio Capture */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                02. Audio Capture
              </h2>
              <span className="text-[11px] text-slate-500">30s Max Limit</span>
            </div>

            {/* Microphone Recording Surface */}
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 text-center space-y-3">
              <div className="flex items-center justify-center">
                {isRecording ? (
                  <div className="w-14 h-14 rounded-full bg-rose-600 text-white flex items-center justify-center animate-pulse shadow-md">
                    <Mic className="w-7 h-7" />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md">
                    <Mic className="w-7 h-7" />
                  </div>
                )}
              </div>

              <div>
                {isRecording ? (
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-rose-700 uppercase tracking-wider">
                      Recording in progress...
                    </div>
                    <div className="text-xl font-bold font-mono tabular-nums text-slate-900">
                      00:{recordingSeconds.toString().padStart(2, '0')} / 00:30
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-600">
                    Press Record and speak the {profile.name}.
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-3 pt-1">
                {isRecording ? (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop Recording</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Start Recording</span>
                  </button>
                )}

                {/* File Upload Alternative */}
                <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-md cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload WAV</span>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {audioUrl && (
                <div className="pt-2 border-t border-slate-200/80">
                  <audio controls src={audioUrl} className="w-full h-8" />
                  <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                    <span>Source: {audioSourceType}</span>
                    <button
                      onClick={() => {
                        setCapturedBlob(null);
                        setAudioUrl(null);
                      }}
                      className="text-rose-600 hover:underline"
                    >
                      Clear Audio
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Synthetic Audio Presets */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Quick Test Presets (Instant Evaluation)</span>
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    loadPreset('mobile_clean', 'mobile_number', 'nine eight seven six five four three two one zero')
                  }
                  className="px-2.5 py-1.5 text-left text-xs bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 rounded text-slate-700 flex items-center justify-between"
                >
                  <span className="font-medium">10-Digit Clean Mobile: 9876543210</span>
                  <span className="text-[10px] text-slate-400">Valid</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    loadPreset('mobile_trunc8', 'mobile_number', 'nine eight seven six five four three two')
                  }
                  className="px-2.5 py-1.5 text-left text-xs bg-slate-50 hover:bg-rose-50/70 border border-slate-200 rounded text-slate-700 flex items-center justify-between"
                >
                  <span className="font-medium">Truncated 8-Digit Mobile: 98765432</span>
                  <span className="text-[10px] text-rose-600">Must Reject</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    loadPreset('tag_nato', 'service_tag', 'Alpha Bravo seven four Kilo nine Quebec')
                  }
                  className="px-2.5 py-1.5 text-left text-xs bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 rounded text-slate-700 flex items-center justify-between"
                >
                  <span className="font-medium">NATO Service Tag: AB74K9Q</span>
                  <span className="text-[10px] text-slate-400">7-Char Alphanumeric</span>
                </button>
                <button
                  type="button"
                  onClick={() => loadPreset('spelled_name', 'spelled_name', 'R A H U L')}
                  className="px-2.5 py-1.5 text-left text-xs bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 rounded text-slate-700 flex items-center justify-between"
                >
                  <span className="font-medium">Spelled Name: R-A-H-U-L</span>
                  <span className="text-[10px] text-slate-400">Experimental</span>
                </button>
              </div>
            </div>

            {/* Action Trigger */}
            <button
              type="button"
              disabled={!capturedBlob || isProcessing}
              onClick={handleProcessRecording}
              className={`w-full py-2.5 px-4 text-xs font-bold rounded-md shadow-xs transition-colors flex items-center justify-center gap-2 ${
                !capturedBlob || isProcessing
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {isProcessing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Calling Gnani Prisma STT...</span>
                </>
              ) : (
                <>
                  <span>Process Recording with Gnani Prisma</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </section>
        </div>

        {/* Right Column: Transparent Pipeline Inspection (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Step 3: Transparent 4-way Pipeline Inspector */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                03. Transparent Verification Pipeline
              </h2>
              <div className="text-xs text-slate-500">
                Candidate State:{' '}
                <span className="font-mono font-bold text-indigo-700 uppercase">{currentState}</span>
              </div>
            </div>

            {/* 4 Diagnostic Quadrants */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Box 1: Raw Speech Transcript */}
              <div className="border border-slate-200 rounded-md p-3.5 bg-slate-50/60 space-y-1.5">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                  <span>Prisma Raw Transcript</span>
                  {captureResult?.latencyMs && (
                    <span className="font-mono text-slate-400 tabular-nums">{captureResult.latencyMs}ms</span>
                  )}
                </div>
                <div className="text-sm font-medium text-slate-900 min-h-[44px] flex items-center">
                  {captureResult?.rawTranscript ? (
                    `"${captureResult.rawTranscript}"`
                  ) : (
                    <span className="text-slate-400 italic">Awaiting speech audio...</span>
                  )}
                </div>
              </div>

              {/* Box 2: FieldEngine Normalized Candidate */}
              <div className="border border-slate-200 rounded-md p-3.5 bg-slate-50/60 space-y-1.5">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Normalized Candidate
                </div>
                <div className="text-sm font-mono font-bold text-slate-900 min-h-[44px] flex items-center">
                  {captureResult?.normalizedCandidate ? (
                    <span className="text-base text-indigo-900 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                      {captureResult.normalizedCandidate}
                    </span>
                  ) : (
                    <span className="text-slate-400 font-normal italic">None extracted yet</span>
                  )}
                </div>
              </div>

              {/* Box 3: Format Validity */}
              <div className="border border-slate-200 rounded-md p-3.5 bg-slate-50/60 space-y-1.5">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Format Validation
                </div>
                <div className="min-h-[44px] flex items-center">
                  {captureResult ? (
                    captureResult.valid ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Valid Format</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded bg-rose-50 text-rose-800 border border-rose-200">
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Format Error</span>
                      </span>
                    )
                  ) : (
                    <span className="text-slate-400 text-xs italic">Pending validation</span>
                  )}
                </div>
              </div>

              {/* Box 4: Confirmation State */}
              <div className="border border-slate-200 rounded-md p-3.5 bg-slate-50/60 space-y-1.5">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Confirmation Status
                </div>
                <div className="min-h-[44px] flex items-center">
                  {currentState === 'confirmed' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded bg-emerald-100 text-emerald-900 border border-emerald-300">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Explicitly Confirmed</span>
                    </span>
                  ) : currentState === 'rejected' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded bg-rose-100 text-rose-900 border border-rose-300">
                      <XCircle className="w-3.5 h-3.5 text-rose-700" />
                      <span>User Rejected</span>
                    </span>
                  ) : currentState === 'read_back' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded bg-amber-50 text-amber-800 border border-amber-200">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Read Back (Awaiting User Confirm)</span>
                    </span>
                  ) : (
                    <span className="text-slate-400 text-xs italic">Unconfirmed</span>
                  )}
                </div>
              </div>
            </div>

            {/* Validation Message & Warnings */}
            {captureResult?.validationMessage && (
              <div
                className={`text-xs p-3 rounded-md border ${
                  captureResult.valid
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50/70 border-rose-200 text-rose-900'
                }`}
              >
                <div className="font-semibold mb-0.5">{captureResult.validationMessage}</div>
                <div className="text-[11px] opacity-80">
                  {profile.syntheticWarning}
                </div>
              </div>
            )}

            {/* Normalization Audit Steps */}
            {captureResult?.normalizationSteps && captureResult.normalizationSteps.length > 0 && (
              <div className="border-t border-slate-100 pt-3">
                <div className="text-xs font-semibold text-slate-700 mb-2">
                  Normalization Transformations ({captureResult.normalizationSteps.length} steps):
                </div>
                <div className="space-y-1.5">
                  {captureResult.normalizationSteps.map((step, idx) => (
                    <div
                      key={idx}
                      className="text-xs font-mono bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                    >
                      <div className="text-indigo-700 font-semibold text-[11px]">
                        Step {idx + 1}: {step.step} — {step.description}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[11px]">
                        <span className="text-slate-500">"{step.before}"</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span className="text-indigo-900 font-bold">"{step.after}"</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Step 4: Spoken Read-Back Player */}
          {captureResult?.valid && (
            <ReadBackPlayer
              readBack={readBackResult}
              isLoading={isReadingBack}
              isApiConfigured={isGnaniConfigured}
              onReplayRequest={() => {
                if (captureResult?.normalizedCandidate) {
                  executeReadBack(captureResult.normalizedCandidate, captureResult.captureId);
                }
              }}
            />
          )}

          {/* Step 5: Explicit Human Confirmation & Targeted Correction */}
          {captureResult?.valid && (
            <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  05. Human Confirmation or Correction
                </h2>
                <span className="text-xs text-slate-500">
                  Strict Rule: No Auto-Confirmation
                </span>
              </div>

              {currentState !== 'confirmed' ? (
                <div className="space-y-4">
                  <p className="text-xs text-slate-600">
                    Did the read-back match what the customer spoke? The agent or customer must explicitly confirm before the value is finalized into the audit record.
                  </p>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleConfirmCandidate}
                      className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-md shadow-xs transition-colors flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Yes, Confirm Identifier</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleRejectCandidate}
                      className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-md shadow-xs transition-colors flex items-center justify-center gap-2"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>No, Reject & Correct</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-emerald-900 text-sm flex items-center justify-between">
                  <div>
                    <div className="font-bold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Final Confirmed Value: {captureResult.normalizedCandidate}
                    </div>
                    <div className="text-xs text-emerald-700 mt-0.5">
                      Audited in session log with explicit human confirmation timestamp.
                    </div>
                  </div>
                  <button
                    onClick={handleResetSession}
                    className="text-xs font-semibold px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                  >
                    Start Next Capture
                  </button>
                </div>
              )}

              {/* Targeted Correction Panel */}
              {isCorrecting && (
                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-900 uppercase">
                      Targeted Correction Workflow
                    </h3>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setCorrectionMode('full')}
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          correctionMode === 'full'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        Full Replacement
                      </button>
                      <button
                        type="button"
                        onClick={() => setCorrectionMode('replace_last_n')}
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          correctionMode === 'replace_last_n'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        Fix Last N Digits
                      </button>
                    </div>
                  </div>

                  {correctionMode === 'replace_last_n' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">
                          Digits to Replace from End:
                        </label>
                        <select
                          value={lastNCount}
                          onChange={(e) => setLastNCount(parseInt(e.target.value, 10))}
                          className="w-full text-xs border border-slate-200 rounded p-1.5 bg-white text-slate-800"
                        >
                          <option value={1}>Last 1 digit</option>
                          <option value={2}>Last 2 digits</option>
                          <option value={3}>Last 3 digits</option>
                          <option value={4}>Last 4 digits</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">
                          Correct Replacement:
                        </label>
                        <input
                          type="text"
                          value={correctionValue}
                          onChange={(e) => setCorrectionValue(e.target.value)}
                          placeholder="e.g. 10"
                          className="w-full text-xs border border-slate-200 rounded p-1.5 bg-white text-slate-800 font-mono"
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Full Correct Value:
                      </label>
                      <input
                        type="text"
                        value={correctionValue}
                        onChange={(e) => setCorrectionValue(e.target.value)}
                        placeholder={`Correct ${profile.name}`}
                        className="w-full text-xs border border-slate-200 rounded p-1.5 bg-white text-slate-800 font-mono"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsCorrecting(false)}
                      className="px-3 py-1.5 border border-slate-200 text-xs text-slate-600 rounded hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyCorrection}
                      className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded hover:bg-indigo-700"
                    >
                      Re-validate & Read Back
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
