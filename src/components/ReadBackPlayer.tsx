import React, { useRef, useState, useEffect } from 'react';
import { Volume2, RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ReadBackResult } from '../types/index.ts';

interface ReadBackPlayerProps {
  readBack: ReadBackResult | null;
  isLoading: boolean;
  onReplayRequest?: () => void;
  isApiConfigured: boolean;
}

export const ReadBackPlayer: React.FC<ReadBackPlayerProps> = ({
  readBack,
  isLoading,
  onReplayRequest,
  isApiConfigured,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);

  useEffect(() => {
    // When readBack audio arrives, auto-play once if base64 is available
    if (readBack?.audioBase64 && audioRef.current) {
      const src = `data:${readBack.audioMimeType || 'audio/wav'};base64,${readBack.audioBase64}`;
      audioRef.current.src = src;
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setPlayError(null);
        })
        .catch((err) => {
          console.warn('[ReadBackPlayer] Auto-play was restricted by browser:', err);
          setIsPlaying(false);
        });
    }
  }, [readBack]);

  const handlePlayToggle = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setPlayError(null);
        })
        .catch((err) => {
          setPlayError('Audio playback requires user interaction.');
          setIsPlaying(false);
        });
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
  };

  if (isLoading) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center animate-spin text-indigo-600">
            <Volume2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Synthesizing Read-back with Gnani Timbre...</div>
            <div className="text-xs text-slate-500">Formatting digits and pacing pauses for clear phonetic verification</div>
          </div>
        </div>
      </div>
    );
  }

  if (!readBack) {
    return null;
  }

  return (
    <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-5 space-y-3">
      <audio ref={audioRef} onEnded={handleEnded} className="hidden" />

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-indigo-900 uppercase tracking-wider">
              Step 4: Gnani Timbre Read-back
            </span>
            <span className="text-xs text-indigo-700">·</span>
            <span className="text-xs text-indigo-700 font-mono tabular-nums">
              {readBack.model || 'Timbre v2.5'} ({readBack.voice || 'Nalini'})
            </span>
            {readBack.latencyMs > 0 && (
              <>
                <span className="text-xs text-indigo-700">·</span>
                <span className="text-xs text-indigo-700 font-mono tabular-nums">
                  {readBack.latencyMs}ms
                </span>
              </>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-800 font-medium">
            "{readBack.spokenText}"
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {readBack.audioBase64 ? (
            <>
              <button
                type="button"
                onClick={handlePlayToggle}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>{isPlaying ? 'Pause' : 'Play Audio'}</span>
              </button>
              {onReplayRequest && (
                <button
                  type="button"
                  onClick={onReplayRequest}
                  title="Re-synthesize read-back"
                  className="p-1.5 text-indigo-700 hover:text-indigo-900 hover:bg-indigo-100 rounded-md transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-1 text-xs text-amber-700 bg-amber-100/70 border border-amber-200 px-2.5 py-1 rounded">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Audio stream unavailable</span>
            </div>
          )}
        </div>
      </div>

      {!isApiConfigured && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Gnani API Key Not Configured:</span> To hear genuine audio from Gnani Timbre, configure <code className="bg-amber-100 px-1 rounded">GNANI_API_KEY</code> in Google AI Studio Secrets. The exact text above shows what will be spoken to the caller.
          </div>
        </div>
      )}

      {playError && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
          {playError}
        </div>
      )}
    </div>
  );
};
