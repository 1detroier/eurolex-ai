"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Citation } from "@/types/legal";

interface CitationModalProps {
  citation: Citation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CitationModal({
  citation,
  open,
  onOpenChange,
}: CitationModalProps) {
  if (!citation) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-slate-900 border border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">
            {citation.regulation} — {citation.article}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Retrieved from EuroLex AI context with{" "}
            {Math.round(citation.similarity * 100)}% similarity.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {citation.chunk_content && (
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-3 text-sm leading-relaxed text-slate-300">
              {citation.chunk_content}
            </div>
          )}

          {citation.celex_id && (
            <p className="text-xs text-slate-500">
              CELEX: {citation.celex_id}
            </p>
          )}
        </div>

        <DialogFooter>
          {citation.eurlex_url ? (
            <Button
              variant="outline"
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
              render={
                <a
                  href={citation.eurlex_url}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View on EUR-Lex
            </Button>
          ) : (
            <Button variant="outline" disabled>
              No EUR-Lex link available
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
