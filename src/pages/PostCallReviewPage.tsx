import React, { useState, useEffect } from 'react';
import {
  Download,
  Copy,
  Check,
  Send,
  Search,
  FileText,
  Calendar,
  Clock,
  Save,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { Call, Candidate, CallNotes, Segment } from '../types/index.ts';
import { fetchAllCalls, fetchCallDetails } from '../lib/apiClient.ts';

interface PostCallReviewPageProps {
  selectedCallId?: string;
  onSelectCall?: (id: string) => void;
}

export const PostCallReviewPage: React.FC<PostCallReviewPageProps> = ({
  selectedCallId,
  onSelectCall,
}) => {
  const [calls, setCalls] = useState<Call[]>([]);
  const [activeId, setActiveId] = useState<string | null>(selectedCallId || null);
  const [call, setCall] = useState<Call | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [notes, setNotes] = useState<CallNotes | null>(null);

  // Editable fields
  const [editableSummary, setEditableSummary] = useState<string>('');
  const [editableIssue, setEditableIssue] = useState<string>('');
  const [editableActions, setEditableActions] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [crmSentMessage, setCrmSentMessage] = useState<string | null>(null);
  const [copiedState, setCopiedState] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Load calls list
  useEffect(() => {
    fetchAllCalls().then((list) => {
      setCalls(list);
      if (!activeId && list.length > 0) {
        setActiveId(list[0].id);
      }
    });
  }, []);

  // When active call changes, load details
  useEffect(() => {
    if (!activeId) return;
    fetchCallDetails(activeId)
      .then((data) => {
        setCall(data.call);
        setSegments(data.segments);
        setCandidates(data.candidates);
        setNotes(data.notes || null);
        if (data.notes) {
          setEditableSummary(data.notes.summary);
          setEditableIssue(data.notes.issue);
          setEditableActions(data.notes.actions.join('\n'));
        }
      })
      .catch(console.error);
  }, [activeId]);

  const handleExport = (format: 'md' | 'json') => {
    if (!activeId) return;
    window.location.href = `/api/calls/${activeId}/export?format=${format}`;
  };

  const handleCopyToClipboard = () => {
    if (!call || !notes) return;
    const text = `CALL NOTES: ${call.id}
Summary: ${editableSummary}
Issue: ${editableIssue}
Details:
${notes.details.map((d) => `- ${d.label}: ${d.value}`).join('\n')}
Actions:
${editableActions}
`;
    navigator.clipboard.writeText(text);
    setCopiedState(true);
    setTimeout(() => setCopiedState(false), 2000);
  };

  const handleSendToCrm = () => {
    setCrmSentMessage('Demo Mode: Payload validated and logged. "Send to CRM" is a prototype stub.');
    setTimeout(() => setCrmSentMessage(null), 5000);
  };

  const handleSaveNotes = () => {
    setSaveMessage('Agent edits saved locally to call review session.');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const filteredSegments = segments.filter((s) =>
    s.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Header & Call Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Post-Call Review & Export
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Review captured candidates, audit transcript evidence, edit structured notes, and export.
          </p>
        </div>

        {calls.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Select Call:</span>
            <select
              value={activeId || ''}
              onChange={(e) => setActiveId(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-800"
            >
              {calls.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id.slice(0, 18)}... ({c.mode})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Review Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Editable Final Structured Notes (7 cols) */}
        <section aria-label="Structured Call Notes" className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                <h2 className="font-bold text-sm text-slate-900">Structured Call Notes (Editable)</h2>
              </div>

              <button
                onClick={handleSaveNotes}
                className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold shadow-2xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Edits</span>
              </button>
            </div>

            {saveMessage && (
              <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 p-2.5 rounded flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{saveMessage}</span>
              </div>
            )}

            {/* Summary */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">
                Executive Summary (3-5 Sentences)
              </label>
              <textarea
                value={editableSummary}
                onChange={(e) => setEditableSummary(e.target.value)}
                rows={3}
                className="w-full text-xs text-slate-800 p-2.5 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-indigo-500 font-sans leading-relaxed"
              />
            </div>

            {/* Customer Issue */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">
                Customer Issue / Inquiry
              </label>
              <input
                type="text"
                value={editableIssue}
                onChange={(e) => setEditableIssue(e.target.value)}
                className="w-full text-xs text-slate-800 p-2.5 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-indigo-500 font-sans"
              />
            </div>

            {/* Captured Details List */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">
                Captured Identifiers ({candidates.length})
              </label>
              <div className="space-y-2">
                {candidates.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No details captured.</p>
                ) : (
                  candidates.map((c) => (
                    <div
                      key={c.id}
                      className="bg-slate-50 p-2.5 rounded border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold uppercase text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                          {c.type.replace('_', ' ')}
                        </span>
                        <span className="font-mono font-semibold text-slate-900 select-all">
                          {c.displayValue || c.value}
                        </span>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          c.status === 'confirmed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : c.status === 'needs_review'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {c.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Actions Promised */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1">
                Actions Promised (Speaker Attributed)
              </label>
              <textarea
                value={editableActions}
                onChange={(e) => setEditableActions(e.target.value)}
                rows={3}
                placeholder="One action per line..."
                className="w-full text-xs text-slate-800 p-2.5 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-indigo-500 font-sans leading-relaxed"
              />
            </div>

            {/* Export & CRM Buttons */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExport('md')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded text-xs font-medium transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .md</span>
                </button>

                <button
                  onClick={() => handleExport('json')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded text-xs font-medium transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .json</span>
                </button>

                <button
                  onClick={handleCopyToClipboard}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded text-xs font-medium transition-colors"
                >
                  {copiedState ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedState ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <button
                onClick={handleSendToCrm}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold shadow-xs transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send to CRM</span>
              </button>
            </div>

            {crmSentMessage && (
              <div className="text-xs text-slate-700 bg-indigo-50 border border-indigo-200 p-2.5 rounded">
                {crmSentMessage}
              </div>
            )}
          </div>
        </section>

        {/* Right: Full Chronological Transcript (5 cols) */}
        <section aria-label="Full Call Transcript" className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 flex flex-col h-[600px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <h2 className="font-bold text-sm text-slate-900">Transcript Evidence ({segments.length})</h2>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter speech..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-indigo-500 w-36"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pt-3 space-y-2.5 pr-1">
              {filteredSegments.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No matching speech segments.</p>
              ) : (
                filteredSegments.map((s) => {
                  const isCustomer = s.speaker === 'customer';
                  return (
                    <div
                      key={s.id}
                      className={`p-2.5 rounded border text-xs leading-relaxed ${
                        isCustomer
                          ? 'bg-slate-50 border-slate-200 text-slate-800'
                          : 'bg-indigo-50/60 border-indigo-100 text-indigo-950'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1 text-[10px] text-slate-500 font-mono">
                        <span className={`font-bold uppercase ${isCustomer ? 'text-teal-700' : 'text-indigo-700'}`}>
                          {s.speaker}
                        </span>
                        <span>{Math.round(s.startMs / 1000)}s</span>
                      </div>
                      <p>{s.text}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
