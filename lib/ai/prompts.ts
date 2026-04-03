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

  return `You are a legal research assistant specialized in European Union law. You help users understand regulations by answering questions based on the provided legal texts.

RULES:
1. PRIMARY SOURCE: Answer using ONLY the provided legal context below. Do not rely on your pre-training knowledge of EU law.
2. CITATIONS: To cite a regulation, use EXACTLY this format — DOUBLE SQUARE BRACKETS, NO SPACES around the dash:
   - With article: [[GDPR-Article 5]] [[NIS2 Directive-Article 21]] [[Cyber Resilience Act-Article 10]]
   - Without article: [[GDPR]] [[NIS2 Directive]]
3. NEVER invent article numbers, annexes, or paragraph references that do not appear in the source labels or content.
4. Cite INLINE where you mention a legal point. Do NOT list articles at the end.
5. Use EXACT regulation names from the source labels.
6. INSUFFICIENT CONTEXT: If the provided text does not contain the answer, state clearly: "I don't have specific information about this in the indexed regulations." You may add a brief general explanation ONLY if you label it as such (e.g., "In general EU law, ...").
7. NEVER mix regulations. If the context covers DMA but the user asked about DSA, say so explicitly.
8. No legal disclaimers.

EXAMPLES (copy this format exactly):
- "Controllers must implement data protection by design [[GDPR-Article 25]]."
- "The NIS2 Directive requires incident reporting [[NIS2 Directive-Article 23]]."
- "Essential cybersecurity requirements apply to digital products [[Cyber Resilience Act-Article 10]]."
- "The provided context does not cover DSA obligations for very large platforms."

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
