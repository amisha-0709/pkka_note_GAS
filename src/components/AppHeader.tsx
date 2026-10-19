import React from 'react';
import type { SystemHealth } from '../types/index.ts';

interface AppHeaderProps {
  activeTab: 'capture' | 'history' | 'benchmark' | 'settings';
  setActiveTab: (tab: 'capture' | 'history' | 'benchmark' | 'settings') => void;
  health: SystemHealth | null;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  activeTab,
  setActiveTab,
  health,
}) => {
  const isGnaniReady = health?.gnaniConfig.sttConfigured && health?.gnaniConfig.ttsConfigured;

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-8 h-16">
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setActiveTab('capture')}
              className="text-left group cursor-pointer focus-visible:outline-none"
            >
              <span className="text-xl font-bold tracking-tight text-white group-hover:text-indigo-300 transition-colors whitespace-nowrap">
                Pakka Note
              </span>
            </button>
            <span className="hidden lg:inline text-xs text-slate-400 border-l border-slate-700 pl-3">
              Voice-to-structured-data verification
            </span>
          </div>

          {/* Zone 2: 4 Clean Navigation Links */}
          <nav aria-label="Main Navigation" className="flex items-center gap-1 sm:gap-4 overflow-x-auto">
            <button
              onClick={() => setActiveTab('capture')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'capture'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              Capture
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'history'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              Session History
            </button>
            <button
              onClick={() => setActiveTab('benchmark')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'benchmark'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              Benchmark
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'settings'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              Settings & Status
            </button>
          </nav>

          {/* Zone 3: 1 Primary Status Indicator */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setActiveTab('settings')}
              title="Click to view Gnani integration status"
              className={`px-3 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                isGnaniReady
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                  : 'bg-amber-950/80 text-amber-300 border-amber-800'
              }`}
            >
              {isGnaniReady ? 'Gnani Connected' : 'Config Required'}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
