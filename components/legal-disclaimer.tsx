"use client";

import { AlertTriangle } from "lucide-react";

export function LegalDisclaimer() {
  return (
    <div className="flex items-center gap-2.5 border-b border-border bg-[hsl(var(--info-50)/0.06)] px-4 py-2 text-xs text-muted-foreground">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--info-50))]" aria-hidden="true" />
      <p>
        <strong className="font-medium text-foreground">Not Legal Advice:</strong>{" "}
        Responses are informational only. Always verify against official sources on EUR-Lex.
      </p>
    </div>
  );
}
