"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { CitationBadge } from "@/components/chat/citation-badge";
import type { ChatMessage as ChatMessageType, Citation } from "@/types/legal";

interface ChatMessageProps {
  message: ChatMessageType;
  onOpenCitationModal: (citation: Citation) => void;
}

/**
 * Renders text with inline [[citation]] markers as clickable links.
 * Format: [[GDPR-Article 5]] or [[GDPR]]
 */
function InlineCitationText({
  text,
  citations,
  onOpenCitationModal,
}: {
  text: string;
  citations: Citation[];
  onOpenCitationModal: (citation: Citation) => void;
}) {
  const citationRegex = /\[\[([A-Za-z][A-Za-z\s]*?)(?:-Article\s+(\d+))?\]\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const regulation = match[1].trim();
    const article = match[2];
    const fullMatch = match[0];

    const citation = article
      ? citations.find(
          (c) =>
            c.regulation.toLowerCase() === regulation.toLowerCase() &&
            c.article === `Article ${article}`
        )
      : citations.find(
          (c) => c.regulation.toLowerCase() === regulation.toLowerCase()
        );

    if (citation && citation.eurlex_url) {
      parts.push(
        <a
          key={`cite-${match.index}`}
          href={citation.eurlex_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            onOpenCitationModal(citation);
          }}
          className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 cursor-pointer border border-primary/20"
          title={article ? `${regulation} — Article ${article}` : regulation}
        >
          {regulation}{article ? ` Art. ${article}` : ""}
        </a>
      );
    } else {
      parts.push(
        <span key={`plain-${match.index}`} className="text-muted-foreground text-xs">
          {regulation}{article ? ` Art. ${article}` : ""}
        </span>
      );
    }

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <span className="leading-relaxed">{parts}</span>;
}

export function ChatMessage({
  message,
  onOpenCitationModal,
}: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed sm:max-w-[75%]",
          isUser
            ? "bg-primary/15 text-foreground"
            : "bg-muted/50 text-foreground"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <InlineCitationText
            text={message.content}
            citations={message.citations ?? []}
            onOpenCitationModal={onOpenCitationModal}
          />
        )}

        {/* Citation badges at bottom for quick reference */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.citations.map((citation) => (
              <CitationBadge
                key={citation.id}
                citation={citation}
                onOpenModal={onOpenCitationModal}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
