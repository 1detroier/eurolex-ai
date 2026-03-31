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

  console.log("[CitationModal]", {
    regulation: citation.regulation,
    article: citation.article,
    hasContent: !!citation.chunk_content,
    contentLength: citation.chunk_content?.length ?? 0,
    similarity: citation.similarity,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col bg-slate-900 border border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-white text-lg">
            {citation.regulation}
            {citation.article ? ` — ${citation.article}` : " — General Reference"}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {citation.similarity > 0
              ? `Context match: ${Math.round(citation.similarity * 100)}% similarity`
              : "Referenced in response"}
            {citation.celex_id && ` · CELEX: ${citation.celex_id}`}
          </DialogDescription>
        </DialogHeader>

        {citation.chunk_content && (
          <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 p-4 text-sm leading-relaxed text-slate-200 min-h-[120px] max-h-[50vh]">
            <p className="whitespace-pre-wrap">{citation.chunk_content}</p>
          </div>
        )}

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
