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
1. Answer the user's question using the provided legal context. The context may use different terminology than the question — look for related concepts (e.g., "data retention" relates to "storage limitation", "data minimisation").
2. To cite a regulation, use DOUBLE SQUARE BRACKETS with this exact format:
   - With article number: [[GDPR-Article 5]], [[AI Act-Article 4]]
   - Without article number: [[GDPR]], [[AI Act]]
3. ONLY include article number when the source label shows one. If no article is shown, cite only the regulation: [[GDPR]]
4. NEVER write "unknown" in any citation. NEVER use parentheses () for citations.
5. Use EXACT regulation names: "GDPR", "AI Act", "Digital Services Act", "Digital Markets Act".
6. Place citations after the claim they support.
7. If the context truly contains nothing relevant, say so — but try to find connections first.
8. Do NOT add legal disclaimers or caveats to your responses.

EXAMPLES:
- "Personal data must be processed lawfully [[GDPR-Article 5]]."
- "The regulation establishes data protection principles [[GDPR]]."
- "Controllers must implement data protection by design [[GDPR-Article 25]]."

CRITICAL: Article numbers must be NUMBERS only (1, 5, 17, 25). NEVER use single letters (a, b, c, d) as article numbers.

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
