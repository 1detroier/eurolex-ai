"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import type { Citation } from "@/types/legal";

interface CitationBadgeProps {
  citation: Citation;
  onOpenModal: (citation: Citation) => void;
}

export function CitationBadge({ citation, onOpenModal }: CitationBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[hsl(var(--accent-50)/0.2)] bg-[hsl(var(--accent-50)/0.08)] px-2 py-0.5 text-xs font-medium text-[hsl(var(--accent-60))] transition-colors hover:bg-[hsl(var(--accent-50)/0.15)]"
        onClick={() => onOpenModal(citation)}
      >
        <span>
          {citation.article
            ? `${citation.regulation} ${citation.article.replace("Article ", "Art. ")}`
            : citation.regulation}
        </span>
        <ExternalLink className="h-3 w-3 opacity-50" />
      </TooltipTrigger>
      <TooltipContent side="top">
        {citation.chunk_content ? (
          <p className="max-w-[250px]">
            {citation.chunk_content.length > 150
              ? citation.chunk_content.slice(0, 150) + "…"
              : citation.chunk_content}
          </p>
        ) : (
          <p>Click to view source</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
