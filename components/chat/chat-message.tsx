"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { CitationBadge } from "@/components/chat/citation-badge";
import type { ChatMessage as ChatMessageType, Citation } from "@/types/legal";

interface ChatMessageProps {
  message: ChatMessageType;
  onOpenCitationModal: (citation: Citation) => void;
}

/**
 * Renders text with inline citations as clickable links.
 * Citation format: (Regulation-Article N) e.g., (GDPR-Article 17)
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
  const citationRegex = /\(([A-Za-z\s]+?)-Article\s+(\d+)\)/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationRegex.exec(text)) !== null) {
    // Add text before the citation
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const regulation = match[1].trim();
    const article = match[2];
    const fullMatch = match[0];

    // Find matching citation
    const citation = citations.find(
      (c) =>
        c.regulation.toLowerCase() === regulation.toLowerCase() &&
        c.article === `Article ${article}`
    );

    if (citation && citation.eurlex_url) {
      parts.push(
        <a
          key={`${regulation}-${article}-${match.index}`}
          href={citation.eurlex_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            onOpenCitationModal(citation);
          }}
          className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:bg-primary/10 hover:decoration-primary cursor-pointer"
          title={`${regulation} — Article ${article}`}
        >
          {fullMatch}
        </a>
      );
    } else {
      // No matching citation found — render as plain text
      parts.push(
        <span
          key={`${regulation}-${article}-${match.index}`}
          className="text-muted-foreground"
        >
          {fullMatch}
        </span>
      );
    }

    lastIndex = match.index + fullMatch.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
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
