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
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-code:text-xs prose-pre:my-2">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}

        {/* Citation badges for assistant messages */}
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
