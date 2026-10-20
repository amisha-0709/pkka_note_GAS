import React from 'react';
import type { SystemHealth } from '../types/index.ts';

export type ActiveNavTab = 'home' | 'live_call' | 'post_review' | 'evaluation' | 'settings';

interface AppHeaderProps {
  activeTab: ActiveNavTab;
  setActiveTab: (tab: ActiveNavTab) => void;
  health: SystemHealth | null;
  callMode?: 'live' | 'simulated' | 'upload';
  isCallActive?: boolean;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  activeTab,
  setActiveTab,
  health,
  callMode = 'simulated',
  isCallActive = false,
}) => {
  const isPrismaReady = health?.gnaniConfig.sttConfigured;
  const isGeminiReady = health?.geminiConfig?.configured;

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 h-16">
          {/* Brand Wordmark & Mode Badge */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setActiveTab('home')}
              className="text-left group cursor-pointer focus-visible:outline-none flex items-center gap-2"
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-sm">
                Y
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold tracking-tight text-white group-hover:text-indigo-300 transition-colors">
                    Pakka Note: Yani
                  </span>
                  <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                    Call Spectator
                  </span>
                </div>
              </div>
            </button>

            {/* Persistent Spectator Rule Indicator (Section 11) */}
            <div className="hidden xl:flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-950/70 border border-emerald-800/80 px-3 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Yani is listening. It does not speak on this call.</span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav aria-label="Main Navigation" className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-1">
            <button
              onClick={() => setActiveTab('home')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'home'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              Calls
            </button>

            <button
              onClick={() => setActiveTab('live_call')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${
                activeTab === 'live_call'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              {isCallActive && <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />}
              <span>Live Call Workspace</span>
            </button>

            <button
              onClick={() => setActiveTab('post_review')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'post_review'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              Post-Call Review
            </button>

            <button
              onClick={() => setActiveTab('evaluation')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'evaluation'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              Evaluation
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'settings'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              Settings
            </button>
          </nav>

          {/* Status Dots & Mode Badge */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Mode badge: Live, Simulated, Offline */}
            <span
              className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider rounded border ${
                callMode === 'simulated'
                  ? 'bg-amber-950/70 text-amber-300 border-amber-800'
                  : callMode === 'live'
                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              {callMode === 'simulated' ? 'Simulated' : callMode === 'live' ? 'Live' : 'Upload'}
            </span>

            {/* Health status dots */}
            <div className="hidden sm:flex items-center gap-3 text-xs text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700/60">
              <span className="flex items-center gap-1.5" title={isPrismaReady ? 'Prisma Connected' : 'Prisma Offline'}>
                <span className={`w-2 h-2 rounded-full ${isPrismaReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                Prisma
              </span>
              <span className="text-slate-600">|</span>
              <span className="flex items-center gap-1.5" title={isGeminiReady ? 'Gemini 3.8 Flash Ready' : 'Gemini Fallback'}>
                <span className={`w-2 h-2 rounded-full ${isGeminiReady ? 'bg-emerald-400' : 'bg-sky-400'}`} />
                Gemini
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
