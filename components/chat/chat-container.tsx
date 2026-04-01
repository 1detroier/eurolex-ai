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

export function ChatContainer({ selectedRegulation = null }: ChatContainerProps) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [selectedCitation, setSelectedCitation] = React.useState<Citation | null>(null);
  const [citationModalOpen, setCitationModalOpen] = React.useState(false);

  const handleOpenCitationModal = React.useCallback((citation: Citation) => {
    setSelectedCitation(citation);
    setCitationModalOpen(true);
  }, []);

  const sendMessage = React.useCallback(
    async (content: string) => {
      if (!content || !content.trim() || isLoading) return;

      // Add user message to state
      const userMessage: ChatMessage = {
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      };

      // Add placeholder assistant message for streaming
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: "",
        citations: [],
        timestamp: Date.now() + 1,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsLoading(true);

      try {
        // Build history: last 10 messages (excluding the placeholder)
        const history = messages.slice(-10).map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        }));

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content.trim(),
            history,
            regulation: selectedRegulation,
          }),
        });

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        // Parse SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedContent = "";

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split("\n");
          // Keep the last potentially incomplete line in the buffer
          buffer = lines.pop() ?? "";

          let currentEventType = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const dataStr = line.slice(6).trim();

              if (!dataStr || !currentEventType) continue;

              try {
                const data = JSON.parse(dataStr);

                switch (currentEventType) {
                  case "chunk": {
                    accumulatedContent += data.content;
                    setMessages((prev) => {
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
                    const citeData = data as CitationEventData;
                    const citation: Citation = {
                      id: `${citeData.regulation}:${citeData.article}`,
                      regulation: citeData.regulation,
                      article: citeData.article,
                      celex_id: citeData.celexId,
                      eurlex_url: citeData.eurlexUrl,
                      chunk_content: citeData.excerpt,
                      similarity: citeData.similarity ?? 0,
                    };

                    setMessages((prev) => {
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
                    // Stream complete — nothing to do
                    break;

                  case "error": {
                    const errorMsg =
                      data.message || "An error occurred during the response.";
                    setMessages((prev) => {
                      const updated = [...prev];
                      const last = updated[updated.length - 1];
                      if (last && last.role === "assistant" && !last.content) {
                        updated[updated.length - 1] = {
                          ...last,
                          content: `⚠️ ${errorMsg}`,
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
        console.error("Chat request failed:", error);
        // Update the placeholder assistant message with an error
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant" && !last.content) {
            updated[updated.length - 1] = {
              ...last,
              content:
                "⚠️ Sorry, I couldn't connect to the server. Please try again later.",
            };
          }
          return updated;
        });
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages, selectedRegulation]
  );

  // Listen for suggestion clicks from MessageList
  React.useEffect(() => {
    const handleSuggestion = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        sendMessage(customEvent.detail);
      }
    };
    window.addEventListener("eurolex-suggestion", handleSuggestion);
    return () =>
      window.removeEventListener("eurolex-suggestion", handleSuggestion);
  }, [sendMessage]);

  const handleClearChat = React.useCallback(() => {
    setMessages([]);
    setSelectedCitation(null);
    setCitationModalOpen(false);
  }, []);

  return (
    <div className="flex h-full flex-1 flex-col">
      <MessageList
        messages={messages}
        isLoading={isLoading}
        onOpenCitationModal={handleOpenCitationModal}
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

      <ChatInput onSend={sendMessage} disabled={isLoading} />
      <CitationModal
        citation={selectedCitation}
        open={citationModalOpen}
        onOpenChange={setCitationModalOpen}
      />
    </div>
  );
}
