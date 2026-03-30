/**
 * Prompt templates for the EuroLex legal assistant.
 *
 * All prompts are server-side only — never expose system prompts to the client.
 */
import type { LegalChunk, ChatMessage } from "@/types/legal";

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

/**
 * Build the system prompt with injected legal context chunks.
 *
 * The system prompt instructs the LLM to:
 * - Answer ONLY based on the provided context (no hallucination)
 * - Cite sources with a specific format
 * - Include a legal disclaimer
 */
export function buildSystemPrompt(chunks: LegalChunk[]): string {
  const contextBlock = chunks.length > 0
    ? chunks
        .map(
          (chunk, i) =>
            `---\n[Source ${i + 1}: ${chunk.metadata.regulation} ${chunk.metadata.article} | CELEX: ${chunk.metadata.celex_id}]\n${chunk.content}\n---`
        )
        .join("\n\n")
    : "No relevant legal context was found for this query.";

  return `You are a legal research assistant specialized in European Union law. You help users understand regulations by answering questions based on official legal texts.

RULES:
1. Answer based ONLY on the provided legal context below. Do not use outside knowledge.
2. When referencing a regulation, cite it using this exact format: [Source: REGULATION_NAME Article NUMBER]
   Example: [Source: GDPR Article 17] or [Source: DSA Article 34]
3. If the provided context does not contain enough information to answer the question, say so clearly: "Based on the available sources, I cannot fully answer this question."
4. Be precise and factual. Quote relevant passages when appropriate.
5. Do not provide legal advice. Always end your response with:
   "This information is for reference only and does not constitute legal advice. Please consult a qualified legal professional for specific legal matters."

LEGAL CONTEXT:
${contextBlock}

Now answer the user's question based on the context above.`;
}

// ---------------------------------------------------------------------------
// History formatting
// ---------------------------------------------------------------------------

/**
 * Format conversation history for inclusion in the prompt.
 * Truncates long messages to keep context window manageable.
 */
export function formatHistory(history: ChatMessage[]): string {
  if (history.length === 0) return "";

  const MAX_HISTORY_CHARS = 2000;

  const formatted = history
    .slice(-10) // Sliding window: last 10 messages
    .map((msg) => {
      const content =
        msg.content.length > MAX_HISTORY_CHARS
          ? msg.content.slice(0, MAX_HISTORY_CHARS) + "…"
          : msg.content;
      return `${msg.role === "user" ? "User" : "Assistant"}: ${content}`;
    })
    .join("\n\n");

  return `\n\nCONVERSATION HISTORY:\n${formatted}\n`;
}

// ---------------------------------------------------------------------------
// Full prompt builder
// ---------------------------------------------------------------------------

/**
 * Build the complete prompt: system + history + user message.
 *
 * Returns an object with system and user prompts separated so the LLM client
 * can use the provider's chat API format (system role / user role).
 */
export function buildPrompt(
  chunks: LegalChunk[],
  history: ChatMessage[],
  userMessage: string
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = buildSystemPrompt(chunks);
  const historySection = formatHistory(history);
  const userPrompt = `${historySection}\n\nCURRENT QUESTION:\n${userMessage}`;

  return { systemPrompt, userPrompt };
}
