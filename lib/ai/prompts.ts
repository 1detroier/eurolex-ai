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
          (chunk, i) =>
            `---\n[Source ${i + 1}: ${chunk.metadata.regulation} - ${chunk.metadata.article} | CELEX: ${chunk.metadata.celex_id}]\n${chunk.content}\n---`
        )
        .join("\n\n")
    : "No relevant legal context was found for this query.";

  return `You are a legal research assistant specialized in European Union law. You help users understand regulations by answering questions based on official legal texts.

RULES:
1. Answer based ONLY on the provided legal context below. Do not use outside knowledge.
2. When referencing a specific article from a regulation, cite it INLINE using this exact format: (REGULATION_NAME-Article NUMBER)
   Examples: (GDPR-Article 17), (AI Act-Article 4), (Digital Services Act-Article 34), (Digital Markets Act-Article 6)
3. Use the EXACT regulation name from the source labels (e.g., "GDPR", "AI Act", "Digital Services Act", "Digital Markets Act").
4. Place citations immediately after the claim they support, like: "Controllers must implement data protection by design (GDPR-Article 25)."
5. If the provided context does not contain enough information to answer the question, say so clearly: "Based on the available sources, I cannot fully answer this question."
6. Be precise and factual. Quote relevant passages when appropriate.
7. Structure your response clearly with paragraphs or bullet points when appropriate.
8. Do not provide legal advice. Always end your response with:
   "This information is for reference only and does not constitute legal advice. Please consult a qualified legal professional for specific legal matters."

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
