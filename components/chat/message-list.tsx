"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
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
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(var(--accent-50)/0.1)]">
          <Sparkles className="h-6 w-6 text-[hsl(var(--accent-50))]" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-foreground">
            How can I help?
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Ask about EU regulations — GDPR, AI Act, DSA, DMA.
          </p>
        </div>

        <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              className="rounded-xl border border-[hsl(var(--neutral-20))] bg-[hsl(var(--neutral-5))] px-3.5 py-3 text-left text-sm text-foreground transition-all hover:border-[hsl(var(--accent-50)/0.3)] hover:bg-[hsl(var(--accent-50)/0.04)]"
              onClick={() => {
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
