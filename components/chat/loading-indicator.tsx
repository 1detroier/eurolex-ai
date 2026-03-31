"use client";

import { Spinner } from "@/components/ui/spinner";

export function LoadingIndicator() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Spinner size="sm" />
      <span className="text-sm text-muted-foreground">Thinking…</span>
    </div>
  );
}
