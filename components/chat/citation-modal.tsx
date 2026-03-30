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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {citation.regulation} — {citation.article}
          </DialogTitle>
          <DialogDescription>
            Retrieved from EuroLex AI context with{" "}
            {Math.round(citation.similarity * 100)}% similarity.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {citation.chunk_content && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed text-muted-foreground">
              {citation.chunk_content}
            </div>
          )}

          {citation.celex_id && (
            <p className="text-xs text-muted-foreground">
              CELEX: {citation.celex_id}
            </p>
          )}
        </div>

        <DialogFooter>
          {citation.eurlex_url ? (
            <Button
              variant="outline"
              render={
                <a
                  href={citation.eurlex_url}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <ExternalLink data-icon="inline-start" className="h-4 w-4" />
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
