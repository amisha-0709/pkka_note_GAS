import React from 'react';
import type { StateChangeEvent } from '../types/index.ts';
import { ArrowRight, CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react';

interface SessionTimelineProps {
  events: StateChangeEvent[];
}

export const SessionTimeline: React.FC<SessionTimelineProps> = ({ events }) => {
  if (!events || events.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-slate-500">
        No state events recorded yet for this session.
      </div>
    );
  }

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {events.map((event, eventIdx) => {
          const isLast = eventIdx === events.length - 1;
          const isConfirmed = event.newState === 'confirmed';
          const isRejected = event.newState === 'rejected';
          const isFailed = event.newState === 'failed';

          let iconBg = 'bg-slate-100 text-slate-600 border-slate-300';
          if (isConfirmed) iconBg = 'bg-emerald-100 text-emerald-700 border-emerald-300';
          if (isRejected) iconBg = 'bg-rose-100 text-rose-700 border-rose-300';
          if (isFailed) iconBg = 'bg-amber-100 text-amber-700 border-amber-300';

          return (
            <li key={event.eventId} className="relative pb-6">
              {!isLast && (
                <span
                  className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-slate-200"
                  aria-hidden="true"
                />
              )}
              <div className="relative flex items-start space-x-3">
                <div
                  className={`relative flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${iconBg}`}
                >
                  {isConfirmed ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : isRejected ? (
                    <XCircle className="w-4 h-4" />
                  ) : isFailed ? (
                    <AlertCircle className="w-4 h-4" />
                  ) : (
                    <Clock className="w-3.5 h-3.5" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono">{event.previousState}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span className="font-mono text-indigo-700 font-bold">{event.newState}</span>
                      {event.finalValueIfConfirmed && (
                        <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded font-mono font-bold text-[11px]">
                          Final: {event.finalValueIfConfirmed}
                        </span>
                      )}
                    </div>
                    <time className="text-[11px] text-slate-400 font-mono tabular-nums whitespace-nowrap">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </time>
                  </div>

                  {event.metadata && (
                    <div className="mt-1 text-xs text-slate-600 bg-slate-50 border border-slate-200/80 rounded p-2 font-mono text-[11px] overflow-x-auto">
                      {JSON.stringify(event.metadata)}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
