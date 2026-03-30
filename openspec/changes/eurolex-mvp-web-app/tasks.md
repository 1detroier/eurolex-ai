# Tasks: EuroLex AI MVP Web App

## Phase 1: Project Setup

- [x] 1.1 Init Next.js 14 project with TypeScript + App Router in root directory
- [x] 1.2 Install dependencies: `ai @supabase/supabase-js class-variance-authority clsx tailwind-merge lucide-react`
- [x] 1.3 Configure `tailwind.config.ts` with shadcn/ui content paths + CSS variables
- [x] 1.4 Create `postcss.config.js` and `tsconfig.json` (Next.js defaults)
- [x] 1.5 Create `next.config.js` with server-side env validation
- [x] 1.6 Init shadcn/ui: run `npx shadcn-ui@latest init` (default style, slate palette)
- [x] 1.7 Add shadcn components: `dialog`, `tooltip`, `button`, `textarea`
- [x] 1.8 Create `.env.example` with all 6 required vars (CEREBRAS, GROQ, HUGGINGFACE, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS)
- [x] 1.9 Create `lib/utils.ts` with `cn()` helper (clsx + tailwind-merge)

## Phase 2: Supabase Schema

- [ ] 2.1 Create `supabase/seed.sql` with `legal_chunks` table (id uuid PK, content text, metadata jsonb, embedding vector(384))
- [ ] 2.2 Add IVFFlat index on `embedding` column (cosine ops, lists=100)
- [ ] 2.3 Create `match_legal_chunks` RPC function (query_embedding vector, match_threshold float, match_count int) returning table with id, content, metadata, similarity
- [ ] 2.4 Add RLS policies: anon read-only on `legal_chunks`, service_role full access

## Phase 3: Types & Lib Layer

- [x] 3.1 Create `types/legal.ts`: `LegalChunk`, `Citation`, `ChatMessage`, `ChatRequest`, `SSEEvent`, `LLMStreamResult`, `SearchResult` interfaces per design doc
- [x] 3.2 Create `lib/db/supabase.ts`: Supabase client init with `SUPABASE_SERVICE_ROLE_KEY` (server-side only), `matchLegalChunks()` typed RPC helper
- [x] 3.3 Create `lib/ai/embeddings.ts`: `generateEmbedding(text)` → POST to HuggingFace Inference API (`all-MiniLM-L6-v2`), retry logic (503 cold start with estimated_time, 429 exponential backoff), validate 384 dimensions
- [x] 3.4 Create `lib/ai/prompts.ts`: `buildPrompt(chunks, history, userMessage)` → system prompt with legal context + history formatting + user message
- [x] 3.5 Create `lib/ai/llm-client.ts`: `streamLLM(systemPrompt, userPrompt)` with Cerebras primary → Groq fallback, 5s AbortController timeout, OpenAI-compatible SSE parsing → `ReadableStream<string>`, returns `LLMStreamResult`
- [x] 3.6 Create `lib/utils/citations.ts`: `parseCitations(text, chunks)` — regex extraction of `[Source: REGULATION Article N]` markers, match against chunks by regulation+article, deduplicate, generate EUR-Lex URLs

## Phase 4: API Route

- [x] 4.1 Create `app/api/chat/route.ts`: POST handler validating `{ message: string, history: ChatMessage[] }`
- [x] 4.2 Wire RAG pipeline: call `generateEmbedding()` → `matchLegalChunks()` → `buildPrompt()` → `streamLLM()`
- [x] 4.3 Implement SSE streaming response: parse tokens from LLM stream, emit `chunk` events, detect citations in accumulated text, emit `citation` events, emit `done` on completion
- [x] 4.4 Add error handling: return 400 for invalid body, 503 if embedding fails or both LLM providers fail, CORS headers on response
- [x] 4.5 Create `app/api/health/route.ts`: GET endpoint returning `{ status: "ok", timestamp }`

## Phase 5: Middleware

- [x] 5.1 Create `middleware.ts`: add `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers on `/api/*` routes
- [x] 5.2 Add security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Content-Security-Policy` with allowlist for HF/Cerebras/Groq/Supabase origins
- [x] 5.3 Read `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_SECONDS` from env with defaults (100, 3600)
- [x] 5.4 Configure `config.matcher` to exclude `/_next/static`, `/favicon.ico`

## Phase 6: UI Components

- [x] 6.1 `app/globals.css` already existed with Tailwind directives + shadcn CSS variables (dark theme)
- [x] 6.2 Update `app/layout.tsx`: Inter font, metadata (title, description, OG), dark theme
- [x] 6.3 Create `components/legal-disclaimer.tsx`: amber banner, dismissible with `sessionStorage`, re-appears per session
- [x] 6.4 Create `components/chat/chat-input.tsx`: controlled `<textarea>` with auto-resize, Enter to send / Shift+Enter newline, disabled while streaming, 4000 char limit + counter, send button disabled on empty
- [x] 6.5 Create `components/chat/citation-badge.tsx`: badge showing regulation + article, click opens citation modal, hover tooltip with chunk preview (150 chars) or "Source not in retrieved context"
- [x] 6.6 Create `components/chat/citation-modal.tsx`: shadcn Dialog with regulation info, chunk content preview, EUR-Lex link button
- [x] 6.7 Create `components/chat/message-list.tsx`: renders `ChatMessage[]`, user/assistant bubble styling, streaming text append, citation badges at bottom of assistant messages, auto-scroll, empty state with suggestions
- [x] 6.8 Create `components/chat/chat-container.tsx`: `'use client'`, manages messages state, `sendMessage()` → `POST /api/chat`, SSE parsing → chunk/citation/done/error events, sliding window last 10 messages, error display (user-friendly, no internals exposed)
- [x] 6.9 Create `components/chat/loading-indicator.tsx`: animated dots + "EuroLex AI is thinking..." text
- [x] 6.10 Create `components/chat/chat-message.tsx`: renders single message (user right-aligned blue, assistant left-aligned with markdown + citation badges)

## Phase 7: Integration & Pages

- [x] 7.1 Create `app/page.tsx`: header with title/subtitle, LegalDisclaimer banner, ChatContainer centered, footer with disclaimer text
- [x] 7.2 ChatContainer uses custom fetch to POST /api/chat with correct body format (message + history)
- [x] 7.3 Responsive layout: max-w-[800px] centered, mobile-friendly chat input at bottom

## Phase 8: Testing

- [ ] 8.1 Install test deps: `jest @testing-library/react @testing-library/jest-dom ts-jest @types/jest`
- [ ] 8.2 Create `jest.config.ts` with Next.js preset
- [ ] 8.3 Write unit test for `generateEmbedding()`: mock HF response, validate 384d output, test 503 retry, test 429 backoff
- [ ] 8.4 Write unit test for `parseCitations()`: valid markers, malformed markers, no markers, deduplication
- [ ] 8.5 Write unit test for `streamLLM()`: Cerebras success, Cerebras timeout → Groq fallback, both fail → 503
- [ ] 8.6 Write unit test for `buildPrompt()`: snapshot test with sample chunks + history
- [ ] 8.7 Write component test for `MessageInput`: empty submit blocked, char limit enforced, disabled during streaming
- [ ] 8.8 Writ