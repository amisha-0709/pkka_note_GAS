import React, { useState, useEffect } from 'react';
import { AppHeader } from './components/AppHeader.tsx';
import { SyntheticDataBanner } from './components/SyntheticDataBanner.tsx';
import { CapturePage } from './pages/CapturePage.tsx';
import { HistoryPage } from './pages/HistoryPage.tsx';
import { BenchmarkPage } from './pages/BenchmarkPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { fetchHealth } from './lib/apiClient.ts';
import type { SystemHealth } from './types/index.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<'capture' | 'history' | 'benchmark' | 'settings'>('capture');
  const [health, setHealth] = useState<SystemHealth | null>(null);

  const loadHealth = async () => {
    try {
      const data = await fetchHealth();
      setHealth(data);
    } catch (err) {
      console.warn('[App] Health prober error:', err);
    }
  };

  useEffect(() => {
    loadHealth();
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900">
      {/* Persistent Synthetic Test Data Banner */}
      <SyntheticDataBanner />

      {/* Top Navigation Bar adhering to Top Bar Contract */}
      <AppHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        health={health}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {activeTab === 'capture' && (
          <CapturePage health={health} onSessionUpdated={loadHealth} />
        )}
        {activeTab === 'history' && <HistoryPage />}
        {activeTab === 'benchmark' && <BenchmarkPage health={health} />}
        {activeTab === 'settings' && (
          <SettingsPage health={health} onRefreshHealth={loadHealth} />
        )}
      </main>

      {/* Clean Enterprise Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div>
            Pakka Note · Voice-to-Structured-Data Verification Framework
          </div>
          <div className="flex items-center gap-3">
            <span>Powered by Gnani Prisma & Timbre</span>
            <span>·</span>
            <span>Synthetic Data Only</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
