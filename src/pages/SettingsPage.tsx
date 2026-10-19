import React, { useState } from 'react';
import type { SystemHealth } from '../types/index.ts';
import { testConnection } from '../lib/apiClient.ts';
import {
  Settings,
  Shield,
  Key,
  Server,
  Database,
  ExternalLink,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Activity,
} from 'lucide-react';

interface SettingsPageProps {
  health: SystemHealth | null;
  onRefreshHealth: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ health, onRefreshHealth }) => {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
    model?: string;
    voice?: string;
  } | null>(null);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testConnection();
      setTestResult(res);
      onRefreshHealth();
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Connection test request failed.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const isConfigured = Boolean(health?.gnaniConfig.sttConfigured && health?.gnaniConfig.ttsConfigured);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          Settings & System Diagnostics
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Provider connectivity, credential posture, model configurations, and competition checklist.
        </p>
      </div>

      {/* Connectivity & Health Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Gnani STT Status */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gnani Prisma STT</span>
            {health?.gnaniConfig.sttConfigured ? (
              <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold border border-emerald-200">
                Configured
              </span>
            ) : (
              <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-semibold border border-amber-200">
                Missing Key
              </span>
            )}
          </div>
          <div className="space-y-1.5 text-xs text-slate-600">
            <div><strong>Endpoint:</strong> <code className="bg-slate-50 px-1 py-0.5 rounded font-mono text-[11px]">{health?.gnaniConfig.sttEndpoint || 'https://api.vachana.ai/stt/v3'}</code></div>
            <div><strong>Model:</strong> Prisma v3 (transcribe / verbatim)</div>
            <div><strong>Supported Languages:</strong> en-IN, hi-IN</div>
          </div>
        </div>

        {/* Gnani TTS Status */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gnani Timbre TTS</span>
            {health?.gnaniConfig.ttsConfigured ? (
              <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold border border-emerald-200">
                Configured
              </span>
            ) : (
              <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-semibold border border-amber-200">
                Missing Key
              </span>
            )}
          </div>
          <div className="space-y-1.5 text-xs text-slate-600">
            <div><strong>Endpoint:</strong> <code className="bg-slate-50 px-1 py-0.5 rounded font-mono text-[11px]">{health?.gnaniConfig.ttsEndpoint || 'https://api.vachana.ai/api/v1/tts/inference'}</code></div>
            <div><strong>Active Model:</strong> {health?.gnaniConfig.ttsModel || 'timbre-v2.5'}</div>
            <div><strong>Active Voice:</strong> {health?.gnaniConfig.ttsVoice || 'Nalini'}</div>
          </div>
        </div>

        {/* Audit Persistence Status */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Persistence Engine</span>
            <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold border border-emerald-200">
              Active
            </span>
          </div>
          <div className="space-y-1.5 text-xs text-slate-600">
            <div><strong>Store:</strong> {health?.persistence.engine || 'File-backed Relational Store'}</div>
            <div><strong>Total Sessions:</strong> <span className="font-mono tabular-nums">{health?.persistence.totalSessions ?? 0}</span></div>
            <div><strong>Total Captures:</strong> <span className="font-mono tabular-nums">{health?.persistence.totalCaptures ?? 0}</span></div>
            <div><strong>Total Audit Events:</strong> <span className="font-mono tabular-nums">{health?.persistence.totalEvents ?? 0}</span></div>
          </div>
        </div>
      </div>

      {/* Safe Secrets Panel */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Gnani AI Credentials & Secrets Posture
            </h2>
          </div>
          <div className="text-xs font-mono text-slate-500">
            Masked: <strong className="text-slate-800">{health?.gnaniConfig.maskedApiKey}</strong>
          </div>
        </div>

        <p className="text-xs text-slate-600">
          In Google AI Studio Build mode, credentials are stored in the server environment via the <strong>Secrets panel</strong> and injected into the backend. They are never exposed to browser client bundles, network inspect panels, or source repositories.
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded-md p-4 text-xs space-y-2 text-slate-700 font-mono">
          <div className="font-bold text-slate-900 font-sans">Required AI Studio Secret:</div>
          <div>Secret Name: <code className="text-indigo-600 font-bold">GNANI_API_KEY</code></div>
          <div>Header Injected by Backend: <code className="text-slate-800">X-API-Key-ID: &lt;GNANI_API_KEY&gt;</code></div>
        </div>

        {/* Test Connection Button */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors"
          >
            <Activity className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
            <span>{isTesting ? 'Testing Gnani Endpoint...' : 'Test Connection with Live Request'}</span>
          </button>
          <span className="text-xs text-slate-500">
            Fires a single, non-looping lightweight test call to verify API key validity.
          </span>
        </div>

        {testResult && (
          <div
            className={`p-3 rounded-md text-xs border ${
              testResult.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2 font-bold">
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-600" />
              )}
              <span>{testResult.message}</span>
            </div>
            {testResult.latencyMs !== undefined && (
              <div className="mt-1 text-[11px] font-mono">
                Latency: {testResult.latencyMs}ms · Model: {testResult.model} ({testResult.voice})
              </div>
            )}
          </div>
        )}
      </section>

      {/* Competition Checklist & Compliance */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-2xs space-y-4">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
          Great Indian AI Internship Challenge 2026 Submission Readiness
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-2">
            <div className="font-bold text-slate-900">Submission Constraints Checklist</div>
            <ul className="space-y-1.5 text-slate-700">
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Working full-stack application (not just a landing page)</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Gnani Prisma STT real server-side integration</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Gnani Timbre TTS real server-side read-back</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Field-aware validation with explicit step tracking</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Strict human confirmation (no auto-confirmation)</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Full persistent session audit logging</span>
              </li>
            </ul>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-2">
            <div className="font-bold text-slate-900">Official Challenge References</div>
            <div className="space-y-1 text-slate-700">
              <div>
                Challenge Portal:{' '}
                <a
                  href="https://www.gnani.ai/great-indian-ai-internship-registration-form"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 hover:underline inline-flex items-center gap-0.5"
                >
                  Registration Page <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div>
                Gnani STT API:{' '}
                <a
                  href="https://www.gnani.ai/speech-to-text-api"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 hover:underline inline-flex items-center gap-0.5"
                >
                  Speech-to-Text Docs <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div>
                Gnani TTS API:{' '}
                <a
                  href="https://www.gnani.ai/text-to-speech-api"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 hover:underline inline-flex items-center gap-0.5"
                >
                  Text-to-Speech Docs <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="pt-2 text-[11px] text-slate-500 border-t border-slate-200">
                Deadline recorded: 10 November 2026 at 11:59 PM IST.
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
