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
            const articleLabel = chunk.metadata.article && chunk.metadata.article !== "Unknown"
              ? chunk.metadata.article
              : `chunk ${i + 1}`;
            return `---\n[Source ${i + 1}: ${chunk.metadata.regulation} - ${articleLabel} | CELEX: ${chunk.metadata.celex_id}]\n${chunk.content}\n---`;
          }
        )
        .join("\n\n")
    : "No relevant legal context was found for this query.";

  return `You are a legal research assistant specialized in European Union law. You help users understand regulations by answering questions based on official legal texts.

RULES:
1. Answer based ONLY on the provided legal context below. Do not use outside knowledge.
2. When referencing a regulation, cite it INLINE using this EXACT format: (REGULATION_NAME-Article NUMBER)
   - CORRECT: (GDPR-Article 5), (AI Act-Article 4), (Digital Services Act-Article 34)
   - WRONG: [Source: GDPR Article 5], GDPR Article 5, (GDPR-Article Unknown)
3. Only cite articles where the source label shows a specific article number. If the label says "chunk N" instead of an article number, do NOT cite it as an article — just reference the regulation name without an article number: (GDPR)
4. Use the EXACT regulation name from the source labels: "GDPR", "AI Act", "Digital Services Act", "Digital Markets Act".
5. Place citations immediately after the claim they support: "Controllers must implement data protection by design (GDPR-Article 25)."
6. If the provided context does not contain enough information, say so clearly.
7. Be precise and factual. Quote relevant passages when appropriate.
8. Always end with: "This information is for reference only and does not constitute legal advice. Please consult a qualified legal professional for specific legal matters."

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
