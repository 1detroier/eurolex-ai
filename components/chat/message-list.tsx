"use client";

import * as React from "react";
import { ChatMessage } from "@/components/chat/chat-message";
import { LoadingIndicator } from "@/components/chat/loading-indicator";
import type { ChatMessage as ChatMessageType, Citation } from "@/types/legal";

interface MessageListProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  onOpenCitationModal: (citation: Citation) => void;
}

const SUGGESTIONS = [
  "What does the GDPR say about data retention?",
  "Explain the AI Act's risk classification system.",
  "What are the DSA obligations for very large platforms?",
  "How does the DMA regulate gatekeepers?",
];

export function MessageList({
  messages,
  isLoading,
  onOpenCitationModal,
}: MessageListProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or streaming tokens
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isLoading]);

  const isEmpty = messages.length === 0;

  if (isEmpty && !isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">
            Welcome to EuroLex AI
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Ask questions about European Union regulations — GDPR, AI Act, DSA,
            DMA — and get answers grounded in the actual legal text.
          </p>
        </div>

        <div className="grid w-full max-w-md gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              className="rounded-lg border bg-muted/30 px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => {
                // Suggestions are handled by the parent via a custom event
                const event = new CustomEvent("eurolex-suggestion", {
                  detail: suggestion,
                });
                window.dispatchEvent(event);
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto scroll-smooth px-3 py-4 sm:px-4"
    >
      <div className="mx-auto flex max-w-[800px] flex-col gap-4">
        {messages.map((message, index) => (
          <ChatMessage
            key={`${message.timestamp}-${index}`}
            message={message}
            onOpenCitationModal={onOpenCitationModal}
          />
        ))}

        {isLoading && <LoadingIndicator />}
      </div>
    </div>
  );
}
