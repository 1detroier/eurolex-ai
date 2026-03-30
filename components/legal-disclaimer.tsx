"use client";

import { AlertTriangle } from "lucide-react";

export function LegalDisclaimer() {
  return (
    <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-600 dark:text-amber-400">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="flex-1">
        <strong>Not Legal Advice:</strong> EuroLex AI provides information based
        on EU regulations but does not constitute legal advice. Always consult a
        qualified legal professional for specific matters.
      </p>
    </div>
  );
}
