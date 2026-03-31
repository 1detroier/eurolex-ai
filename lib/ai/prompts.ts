/**
 * Prompt templates for the EuroLex legal assistant.
 *
 * All prompts are server-side only — never expose system prompts to the client.
 */
import type { LegalChunk, ChatMessage } from "@/types/legal";

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export function buildSystemPrompt(chunks: LegalChunk[]): string {
  const contextBlock = chunks.length > 0
    ? chunks
        .map(
          (chunk, i) => {
            const hasArticle = chunk.metadata.article && chunk.metadata.article !== "Unknown";
            const sourceLabel = hasArticle
              ? `[${chunk.metadata.regulation} - ${chunk.metadata.article}]`
              : `[${chunk.metadata.regulation}]`;
            return `${sourceLabel}\n${chunk.content}`;
          }
        )
        .join("\n\n---\n\n")
    : "No relevant legal context was found for this query.";

  return `You are a legal research assistant specialized in European Union law. You help users understand regulations by answering questions based on official legal texts.

RULES:
1. Answer based ONLY on the provided legal context below. Do not use outside knowledge.
2. To cite a regulation, use ONE of these formats INLINE:
   - With article number: (GDPR-Article 5), (AI Act-Article 4), (Digital Services Act-Article 34)
   - Without article number: (GDPR), (AI Act), (Digital Services Act)
3. ONLY use format with article number when the source label shows a specific number like "Article 5". If the label says "chunk N", use the format WITHOUT article number.
4. NEVER write "unknown", "Unknown", or "unknown clause" in any citation. This is strictly forbidden.
5. Use EXACT regulation names: "GDPR", "AI Act", "Digital Services Act", "Digital Markets Act".
6. Place citations after the claim they support.
7. If context is insufficient, say so clearly.
8. Always end with legal disclaimer.

EXAMPLES of correct citations:
- "Personal data must be processed lawfully (GDPR-Article 5)."
- "The regulation establishes data protection principles (GDPR)."
- "High-risk AI systems require conformity assessment (AI Act-Article 43)."

LEGAL CONTEXT:
${contextBlock}

Now answer the user's question based on the context above.`;
}

// ---------------------------------------------------------------------------
// History formatting
// ---------------------------------------------------------------------------

export function formatHistory(history: ChatMessage[]): string {
  if (history.length === 0) return "";

  const MAX_HISTORY_CHARS = 2000;

  const formatted = history
    .slice(-10)
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
