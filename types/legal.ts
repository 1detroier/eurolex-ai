/**
 * Core domain types for EuroLex AI.
 */

/** A chunk of legal text retrieved from Supabase via vector search. */
export interface LegalChunk {
  id: string;
  content: string;
  metadata: {
    regulation: string; // "GDPR", "AI Act", "DSA", "DMA"
    article: string; // "Article 17"
    celex_id: string; // "32016R0679"
    chunk_index: number;
  };
  similarity: number; // 0.0 – 1.0
}

/** A citation linking back to the source regulation on EUR-Lex. */
export interface Citation {
  id: string;
  regulation: string;
  article: string;
  celex_id: string;
  eurlex_url: string; // Generated URL
  chunk_content: string; // Source text for modal preview
  similarity: number;
}

/** A single message in the chat conversation. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  timestamp: number;
}

/** Body of POST /api/chat requests. */
export interface ChatRequest {
  message: string;
  history: ChatMessage[]; // Last 10 messages (sliding window)
}

/** Result shape returned by the `match_legal_chunks` Supabase RPC. */
export interface SearchResult {
  id: string;
  content: string;
  metadata: {
    regulation: string;
    article: string;
    celex_id: string;
    chunk_index: number;
  };
  similarity: number;
}

/** Server-Sent Events emitted by the API route. */
export type SSEEvent =
  | { type: "token"; data: string }
  | { type: "citation"; data: Citation }
  | { type: "done"; data: null }
  | { type: "error"; data: { message: string } };

/** Result of the LLM streaming call — includes which provider was used. */
export interface LLMStreamResult {
  stream: ReadableStream<string>;
  provider: "cerebras" | "groq";
}
