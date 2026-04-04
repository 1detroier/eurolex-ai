"use client";

import * as React from "react";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { CitationModal } from "@/components/chat/citation-modal";
import { PDFExport } from "@/components/chat/pdf-export";
import type { ChatMessage, Citation, SSEEvent } from "@/types/legal";

interface CitationEventData {
  regulation: string;
  article: string;
  celexId: string;
  eurlexUrl: string;
  excerpt: string;
  similarity: number;
}

interface ChatContainerProps {
  selectedRegulation?: string | null;
}

// ---------------------------------------------------------------------------
// User-friendly error messages
// ---------------------------------------------------------------------------

const FRIENDLY_ERRORS: Record<string, string> = {
  "Embedding service unavailable":
    "I'm having trouble processing your question right now. Please try again in a moment.",
  "AI service unavailable":
    "My brain is taking a short break. Please wait a few seconds and try again.",
  "Message is required":
    "Please type a question before sending.",
};

function getFriendlyErrorMessage(status: number, errorCode: string): string {
  // Check for known error codes first
  for (const [code, msg] of Object.entries(FRIENDLY_ERRORS)) {
    if (errorCode.includes(code)) return msg;
  }

  // Map HTTP status codes to friendly messages
  switch (status) {
    case 400:
      return "I couldn't understand your request. Please try rephrasing your question.";
    case 429:
      return "You're sending messages too quickly. Please wait a moment before trying again.";
    case 500:
      return "Something went wrong on my end. Please try again in a moment.";
    case 503:
      return "I'm temporarily unavailable. Please wait a few seconds and try again.";
    case 0:
    default:
      return "I couldn't connect to the server. Please check your internet connection and try again.";
  }
}

function getFriendlyErrorFromMessage(errorMsg: string): string {
  for (const [code, msg] of Object.entries(FRIENDLY_ERRORS)) {
    if (errorMsg.includes(code)) return msg;
  }
  return "Something went wrong while generating a response. Please try again.";
}

export function ChatContainer({ selectedRegulation = null }: ChatContainerProps) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [selectedCitation, setSelectedCitation] = React.useState<Citation | null>(null);
  const [citationModalOpen, setCitationModalOpen] = React.useState(false);
  const activeStreamIdRef = React.useRef(0);
  const streamControllerRef = React.useRef<AbortController | null>(null);

  const handleOpenCitationModal = React.useCallback((citation: Citation) => {
    setSelectedCitation(citation);
    setCitationModalOpen(true);
  }, []);

  const sendMessage = React.useCallback(
    async (content: string) => {
      const text = typeof content === "string" ? content : String(content ?? "");
      if (!text.trim() || isLoading) return;

      // Increment stream id and abort any in-flight request
      const streamId = activeStreamIdRef.current + 1;
      activeStreamIdRef.current = streamId;

      if (streamControllerRef.current) {
        streamControllerRef.current.abort();
      }
      const controller = new AbortController();
      streamControllerRef.current = controller;

      const isStaleStream = () => activeStreamIdRef.current !== streamId;

      // Add user message to state
      const userMessage: ChatMessage = {
        role: "user",
        content: text.trim(),
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);

      // Add placeholder assistant message
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", timestamp: Date.now() },
      ]);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text.trim(),
            history: messages,
            regulation: selectedRegulation,
          }),
          signal: controller.signal,
        });

        // Handle non-200 responses with user-friendly messages
        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          const errorCode = errorBody?.error ?? "";
          const friendlyMsg = getFriendlyErrorMessage(response.status, errorCode);

          if (isStaleStream()) return;

          setMessages((prev) => {
            if (activeStreamIdRef.current !== streamId) return prev;
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === "assistant" && !last.content) {
              updated[updated.length - 1] = {
                ...last,
                content: friendlyMsg,
              };
            }
            return updated;
          });
          return;
        }

        // ── Stream SSE response ───────────────────────────────────────────
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedContent = "";
        let currentEventType = "";

        while (true) {
          if (isStaleStream()) {
            try {
              await reader.cancel();
            } catch {
              // Reader may already be closed
            }
            break;
          }

          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const dataStr = line.slice(6).trim();

              if (!dataStr || dataStr === "[DONE]") continue;

              try {
                const data = JSON.parse(dataStr) as Record<string, unknown>;

                switch (currentEventType) {
                  case "chunk": {
                    if (isStaleStream()) break;
                    accumulatedContent += data.content;
                    setMessages((prev) => {
                      if (isStaleStream()) return prev;
                      const updated = [...prev];
                      const last = updated[updated.length - 1];
                      if (last && last.role === "assistant") {
                        updated[updated.length - 1] = {
                          ...last,
                          content: accumulatedContent,
                        };
                      }
                      return updated;
                    });
                    break;
                  }

                  case "citation": {
                    if (isStaleStream()) break;
                    const citeData = data as unknown as CitationEventData;
                    const citation: Citation = {
                      id: `${citeData.regulation}:${citeData.article}`,
                      regulation: citeData.regulation,
                      article: citeData.article,
                      celex_id: citeData.celexId,
                      eurlex_url: citeData.eurlexUrl,
                      chunk_content: citeData.excerpt,
                      similarity: citeData.similarity,
                    };

                    setMessages((prev) => {
                      if (isStaleStream()) return prev;
                      const updated = [...prev];
                      const last = updated[updated.length - 1];
                      if (last && last.role === "assistant") {
                        const existing = last.citations ?? [];
                        // Deduplicate by regulation:article
                        const key = `${citation.regulation}:${citation.article}`;
                        const alreadyExists = existing.some(
                          (c) =>
                            `${c.regulation}:${c.article}` === key
                        );
                        if (!alreadyExists) {
                          updated[updated.length - 1] = {
                            ...last,
                            citations: [...existing, citation],
                          };
                        }
                      }
                      return updated;
                    });
                    break;
                  }

                  case "done":
                    if (isStaleStream()) break;
                    break;

                  case "error": {
                    if (isStaleStream()) break;
                    const errorMsg =
                      typeof data.message === "string"
                        ? data.message
                        : "An error occurred during the response.";
                    setMessages((prev) => {
                      if (isStaleStream()) return prev;
                      const updated = [...prev];
                      const last = updated[updated.length - 1];
                      if (last && last.role === "assistant" && !last.content) {
                        updated[updated.length - 1] = {
                          ...last,
                          content: getFriendlyErrorFromMessage(errorMsg),
                        };
                      }
                      return updated;
                    });
                    break;
                  }
                }
              } catch {
                // Skip malformed JSON
                console.warn("Failed to parse SSE data:", dataStr);
              }

              currentEventType = "";
            } else if (line.trim() === "") {
              // Empty line — reset event type
              currentEventType = "";
            }
          }
        }
      } catch (error) {
        if (controller.signal.aborted || activeStreamIdRef.current !== streamId) {
          return;
        }

        console.error("Chat request failed:", error);
        // Update the placeholder assistant message with a friendly error
        setMessages((prev) => {
          if (activeStreamIdRef.current !== streamId) return prev;
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant" && !last.content) {
            updated[updated.length - 1] = {
              ...last,
              content: getFriendlyErrorMessage(0, ""),
            };
          }
          return updated;
        });
      } finally {
        if (activeStreamIdRef.current === streamId) {
          setIsLoading(false);
          if (streamControllerRef.current === controller) {
            streamControllerRef.current = null;
          }
        }
      }
    },
    [isLoading, messages, selectedRegulation]
  );

  const handleClearChat = React.useCallback(() => {
    activeStreamIdRef.current += 1;
    if (streamControllerRef.current) {
      streamControllerRef.current.abort();
      streamControllerRef.current = null;
    }
    setMessages([]);
    setIsLoading(false);
    setSelectedCitation(null);
    setCitationModalOpen(false);
  }, []);

  return (
    <div className="flex h-full flex-1 flex-col">
      <MessageList
        messages={messages}
        isLoading={isLoading}
        onOpenCitationModal={handleOpenCitationModal}
        onSuggestion={sendMessage}
      />
      {/* Action toolbar */}
      {messages.length > 0 && (
        <div className="flex justify-end gap-2 border-t border-border px-3 py-2 sm:px-4">
          <div className="mx-auto flex w-full max-w-[800px] justify-end gap-2">
            <PDFExport messages={messages} />
            <button
              onClick={handleClearChat}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[hsl(var(--neutral-20))] bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-[hsl(var(--neutral-10))] hover:text-foreground"
            >
              New chat
            </button>
          </div>
        </div>
      )}

      <ChatInput
        onSend={sendMessage}
        disabled={isLoading}
        maxLength={4000}
      />
      <CitationModal
        citation={selectedCitation}
        open={citationModalOpen}
        onOpenChange={setCitationModalOpen}
      />
      <PDFExport messages={messages} />
    </div>
  );
}
