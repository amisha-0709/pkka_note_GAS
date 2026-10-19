import React from 'react';
import { ShieldAlert } from 'lucide-react';

export const SyntheticDataBanner: React.FC = () => {
  return (
    <aside 
      aria-label="Synthetic Data Warning"
      className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-medium">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
          <span>
            SYNTHETIC TEST DATA ONLY — Do not enter real customer information, personal identifiers, banking credentials, or authentication PINs.
          </span>
        </div>
        <div className="hidden sm:block text-amber-700 text-[11px] whitespace-nowrap">
          Great Indian AI Internship Challenge 2026 Prototype
        </div>
      </div>
    </aside>
  );
};
