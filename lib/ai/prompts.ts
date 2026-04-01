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
          (chunk) => {
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
1. Answer using the provided legal context. Look for related concepts if exact terms don't match.
2. To cite a regulation, use EXACTLY this format — DOUBLE SQUARE BRACKETS, NO SPACES around the dash:
   - With article: [[GDPR-Article 5]] [[NIS2 Directive-Article 21]] [[Cyber Resilience Act-Article 10]]
   - Without article: [[GDPR]] [[NIS2 Directive]]
3. NEVER use single brackets [X] — ONLY double brackets [[X]].
4. NEVER list articles at the end (no "- Article 15" lists). Cite INLINE where you mention them.
5. Use EXACT regulation names from source labels.
6. If context is insufficient, say so.
7. No legal disclaimers.

EXAMPLES (copy this format exactly):
- "Controllers must implement data protection by design [[GDPR-Article 25]]."
- "The NIS2 Directive requires incident reporting [[NIS2 Directive-Article 23]]."
- "Essential cybersecurity requirements apply to digital products [[Cyber Resilience Act-Article 10]]."

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
