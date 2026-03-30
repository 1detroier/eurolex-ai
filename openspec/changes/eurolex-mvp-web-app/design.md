# Design: EuroLex AI MVP Web App

## Technical Approach

Greenfield Next.js 14 App Router project implementing a RAG legal research assistant. User queries get embedded via HuggingFace Inference API, matched against pre-computed chunks in Supabase (pgvector), and streamed back via Cerebras/Groq with EUR-Lex citations.

**Stack**: Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui + Vercel AI SDK + Supabase (pgvector) + HuggingFace Inference + Cerebras/Groq.

---

## Architecture Decisions

### Decision: Query Embedding at Runtime via HuggingFace Inference API

| Option | Tradeoff | Decision |
|--------|----------|----------|
| HuggingFace Inference API | Free tier, same model as ETL (all-MiniLM-L6-v2), rate-limited | **CHOSEN** |
| OpenAI embeddings API | Better perf but costs money, different model than ETL | Rejected |
| Local inference (edge) | No latency dependency but can't run on Vercel Edge | Rejected |

**Rationale**: ETL uses `sentence-transformers` locally. Runtime must use the SAME model (`all-MiniLM-L6-v2`, 384d) for embedding consistency. HuggingFace Inference API is free and returns compatible vectors.

### Decision: Cerebras Primary → Groq Fallback (No Vercel AI SDK Provider Abstraction)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Direct fetch to both APIs | Full control, custom error handling, no SDK lock-in | **CHOSEN** |
| Vercel AI SDK providers (`@ai-sdk/cerebras`) | Cleaner API but adds abstraction overhead for 2 providers | Rejected |

**Rationale**: We only need streaming + fallback. Direct `fetch` with `ReadableStream` gives us full control over the fallback trigger (5s timeout) without SDK abstraction layers. The Vercel AI SDK `useChat` hook is still used client-side for SSE parsing.

### Decision: Edge Middleware — Headers Only (No KV Enforcement)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Informative headers only | $0, stateless, no enforcement but signals intent | **CHOSEN** |
| KV-backed enforcement | Accurate but 30k ops/month limit | Deferred to Phase 2 |

**Rationale**: MVP is greenfield with no user base. Informative `X-RateLimit-*` headers cost nothing and prepare the API contract. Real enforcement via Vercel KV added in Phase 2.

### Decision: No Vercel KV in MVP

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Skip KV entirely | Stateless sessions, no persistence, simpler deploy | **CHOSEN** |
| KV for session history | Better UX but adds dependency + 30k ops/month budget | Deferred |

**Rationale**: Chat history lives client-side in React state. No server-side session persistence needed for MVP demo. KV added in Phase 2 with sidebar session management.

---

## Data Flow

```
Browser (React)
  │
  │  POST /api/chat { message, history[] }
  │
  ▼
Edge Middleware
  │  • Add X-RateLimit-Limit: 5
  │  • Add security headers (CSP, X-Frame-Options)
  │  • Pass through
  │
  ▼
/api/chat/route.ts
  │
  ├─ 1. Parse request body
  │     message: string, history: ChatMessage[]
  │
  ├─ 2. Generate query embedding
  │     POST https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2
  │     Body: { inputs: message }
  │     Response: number[384]
  │
  ├─ 3. Vector search (Supabase)
  │     supabase.rpc('match_legal_chunks', {
  │       query_embedding: embedding,
  │       match_threshold: 0.5,
  │       match_count: 5
  │     })
  │     → [{ id, content, metadata, similarity }]
  │
  ├─ 4. Build prompt
  │     System prompt + context chunks + conversation history + user message
  │
  ├─ 5. Stream LLM response
  │     try: Cerebras (5s timeout)
  │     catch: Groq (5s timeout)
  │     → ReadableStream (SSE)
  │
  ├─ 6. Parse citations from streamed text
  │     Regex: /Article\s+(\d+).*?(GDPR|AI Act|DSA|DMA)/gi
  │     → inject citation metadata into stream
  │
  └─ 7. Return SSE Response
        headers: { 'Content-Type': 'text/event-stream' }
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/layout.tsx` | Create | Root layout with Inter font, Tailwind, metadata |
| `app/page.tsx` | Create | Landing page rendering ChatContainer |
| `app/globals.css` | Create | Tailwind directives + custom CSS variables |
| `app/api/chat/route.ts` | Create | **Core**: embed → search → prompt → stream → parse citations |
| `lib/ai/embeddings.ts` | Create | HuggingFace Inference API wrapper with retry |
| `lib/ai/llm-client.ts` | Create | Cerebras primary + Groq fallback, streaming |
| `lib/ai/prompts.ts` | Create | System prompt template with legal context injection |
| `lib/db/supabase.ts` | Create | Supabase client (service role for RPC calls) |
| `middleware.ts` | Create | Edge middleware: rate limit headers + security headers |
| `components/chat/chat-container.tsx` | Create | Main chat state management, useChat integration |
| `components/chat/message-list.tsx` | Create | Renders message history + streaming display |
| `components/chat/message-input.tsx` | Create | Text input + send button form |
| `components/chat/citation-badge.tsx` | Create | Clickable badge linking to EUR-Lex |
| `components/chat/citation-modal.tsx` | Create | Modal with chunk source preview |
| `components/disclaimer-banner.tsx` | Create | Legal disclaimer (persistent, dismissible) |
| `types/legal.ts` | Create | TypeScript interfaces for chunks, citations, messages |
| `lib/utils/citations.ts` | Create | Citation parser: extract refs from LLM text |
| `package.json` | Create | Project dependencies |
| `tailwind.config.ts` | Create | Tailwind + shadcn/ui configuration |
| `tsconfig.json` | Create | TypeScript config (Next.js defaults) |
| `next.config.js` | Create | Next.js configuration |
| `.env.example` | Create | Environment variable template |

---

## Interfaces / Contracts

```typescript
// types/legal.ts

interface LegalChunk {
  id: string;
  content: string;
  metadata: {
    regulation: string;       // "GDPR", "AI Act", "DSA", "DMA"
    article: string;          // "Article 17"
    celex_id: string;         // "32016R0679"
    chunk_index: number;
  };
  similarity: number;         // 0.0 - 1.0
}

interface Citation {
  id: string;
  regulation: string;
  article: string;
  celex_id: string;
  eurlex_url: string;         // Generated: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:{celex_id}#art_{article}
  chunk_content: string;      // Source text for modal preview
  similarity: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  timestamp: number;
}

// API request/response
interface ChatRequest {
  message: string;
  history: ChatMessage[];     // Last 10 messages (sliding window)
}

// SSE event types
type SSEEvent =
  | { type: 'token'; data: string }
  | { type: 'citation'; data: Citation }
  | { type: 'done'; data: null }
  | { type: 'error'; data: { message: string } };
```

---

## API Route Design: `/api/chat`

### HuggingFace Integration

```typescript
// lib/ai/embeddings.ts

const HF_API_URL =
  'https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2';

async function generateEmbedding(text: string, retries = 2): Promise<number[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: text }),
    });

    if (response.ok) {
      const embedding: number[] = await response.json();
      if (embedding.length !== 384) {
        throw new Error(`Expected 384 dimensions, got ${embedding.length}`);
      }
      return embedding;
    }

    // Model loading (cold start) — retry after delay
    if (response.status === 503) {
      const { estimated_time } = await response.json();
      await sleep((estimated_time ?? 20) * 1000);
      continue;
    }

    if (response.status === 429) {
      await sleep(1000 * (attempt + 1)); // Exponential backoff
      continue;
    }

    throw new Error(`HuggingFace API error: ${response.status}`);
  }
  throw new Error('HuggingFace API: max retries exceeded');
}
```

### LLM Client (Direct Fetch — Streaming)

```typescript
// lib/ai/llm-client.ts

interface LLMStreamResult {
  stream: ReadableStream<string>;
  provider: 'cerebras' | 'groq';
}

async function streamLLM(prompt: string): Promise<LLMStreamResult> {
  try {
    const stream = await callCerebras(prompt);
    return { stream, provider: 'cerebras' };
  } catch {
    const stream = await callGroq(prompt);
    return { stream, provider: 'groq' };
  }
}

function callCerebras(prompt: string): Promise<ReadableStream<string>> {
  return callProvider({
    url: 'https://api.cerebras.ai/v1/chat/completions',
    apiKey: process.env.CEREBRAS_API_KEY!,
    model: 'llama3.1-8b',
    prompt,
  });
}

function callGroq(prompt: string): Promise<ReadableStream<string>> {
  return callProvider({
    url: 'https://api.groq.com/openai/v1/chat/completions',
    apiKey: process.env.GROQ_API_KEY!,
    model: 'llama-3.1-8b-instant',
    prompt,
  });
}

async function callProvider(config: {
  url: string;
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<ReadableStream<string>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: config.prompt }],
      max_tokens: 1024,
      stream: true,
    }),
    signal: controller.signal,
  });

  clearTimeout(timeout);

  if (!response.ok) throw new Error(`${config.url}: ${response.status}`);

  // Parse SSE from provider → return as ReadableStream<string>
  return parseProviderSSE(response.body!);
}
```

### SSE Stream Format

Events sent to the client:
```
event: token
data: {"type":"token","data":"Article"}

event: token
data: {"type":"token","data":" 17"}

event: citation
data: {"type":"citation","data":{...Citation object}}

event: done
data: {"type":"done","data":null}
```

---

## Edge Middleware

```typescript
// middleware.ts

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api-inference.huggingface.co https://api.cerebras.ai https://api.groq.com https://*.supabase.co;",
};

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Rate limit headers (informative only — no enforcement in MVP)
  response.headers.set('X-RateLimit-Limit', '5');
  response.headers.set('X-RateLimit-Window', '60');

  // Security headers
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
```

---

## UI Component Architecture

```
app/page.tsx
  └── ChatContainer (client component)
        ├── DisclaimerBanner (persistent, top)
        ├── MessageList
        │     ├── MessageBubble (user)
        │     └── MessageBubble (assistant)
        │           ├── StreamingText (word-by-word render)
        │           └── CitationBadge[] (clickable)
        │                 └── CitationModal (on click)
        └── MessageInput (textarea + send button)
```

### ChatContainer

- `'use client'` component
- Manages `messages: ChatMessage[]` state via `useState`
- Handles `sendMessage()` → `fetch('/api/chat', { stream: true })` → reads SSE → updates state
- Sliding window: sends last 10 messages as history

### MessageList

- Renders messages array
- Assistant messages support streaming: appends tokens as they arrive
- Auto-scrolls to bottom on new content

### MessageInput

- Controlled textarea (Enter to send, Shift+Enter for newline)
- Disabled while streaming
- Character limit: 1000

### CitationBadge

- Inline in assistant message text
- Shows regulation name + article (e.g., "GDPR Art. 17")
- Click opens CitationModal
- Hover tooltip with similarity score

### CitationModal

- shadcn/ui Dialog
- Shows: regulation, article, chunk content preview, EUR-Lex link button
- Link opens in new tab: `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:{celex_id}#art_{article}`

### DisclaimerBanner

- Sticky top banner, amber/yellow background
- "⚠️ Not Legal Advice" text
- Dismissible (localStorage persistence)
- Re-appears on new session

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CEREBRAS_API_KEY` | Yes | Cerebras API key (`sk-cbrs-...`). Primary LLM provider. Free tier: 1M tokens/day. |
| `GROQ_API_KEY` | Yes | Groq API key (`gsk_...`). Fallback LLM provider. Free tier: 500K tokens/day. |
| `HUGGINGFACE_API_KEY` | Yes | HuggingFace API key (`hf_...`). Used for runtime query embedding generation via `all-MiniLM-L6-v2` Inference API. |
| `SUPABASE_URL` | Yes | Supabase project URL (`https://xxxx.supabase.co`). EU region recommended. |
| `SUPABASE_ANON_KEY` | Yes | Supabase anonymous key (public, RLS-restricted). Used for client-side reads if needed. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (**server-side only**, bypasses RLS). Used in API routes for `match_legal_chunks` RPC calls. |

**Note**: `NEXT_PUBLIC_` prefix omitted — all Supabase calls happen server-side in API routes. No keys are exposed to the browser.

---

## Dependencies

```json
{
  "name": "eurolex-ai",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "ai": "^3.4.0",
    "@supabase/supabase-js": "^2.45.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.5.0",
    "lucide-react": "^0.400.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/react": "^18.3.0",
    "@types/node": "^20.14.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.0"
  }
}
```

**Key decisions**:
- `ai` (Vercel AI SDK): Used ONLY for client-side `useChat` SSE parsing. Server-side streaming uses direct `fetch` to LLM providers.
- `@supabase/supabase-js`: Server-side client with `service_role` key for RPC calls.
- `shadcn/ui` components are copied into the project (not installed as a package) — uses `class-variance-authority` + `clsx` + `tailwind-merge`.

---

## Sequence Diagram

```
User types question → clicks Send
  │
  ▼
ChatContainer.sendMessage()
  │  POST /api/chat { message, history: last10 }
  │
  ▼
Edge Middleware
  │  Add X-RateLimit-Limit: 5
  │  Add CSP, X-Frame-Options, etc.
  │
  ▼
/api/chat/route.ts
  │
  ├─► HuggingFace Inference API
  │   POST /models/all-MiniLM-L6-v2
  │   ← number[384] embedding
  │
  ├─► Supabase (service_role)
  │   RPC: match_legal_chunks(embedding, 0.5, 5)
  │   ← [{ content, metadata, similarity }]
  │
  ├─ Build prompt:
  │   System: "You are a legal assistant specialized in EU law..."
  │   + Context: joined chunk contents
  │   + History: last 10 messages
  │   + User: current message
  │
  ├─► Cerebras API (with 5s AbortController)
  │   POST /v1/chat/completions { stream: true }
  │   ├─ Success → stream tokens
  │   └─ Timeout/Error → fallback
  │       ├─► Groq API (with 5s AbortController)
  │       │   POST /openai/v1/chat/completions { stream: true }
  │       │   └─ stream tokens
  │
  ├─ Parse stream for citations:
  │   /Article\s+(\d+).*?(GDPR|AI Act|DSA|DMA)/gi
  │   Match against chunks → emit citation events
  │
  └─ Return SSE Response
      │
      ▼
ChatContainer receives SSE
  │  Appends tokens to last message (streaming)
  │  Adds CitationBadge components when citation events arrive
  │
  ▼
User sees response appearing word-by-word
  with clickable citation badges
```

---

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `generateEmbedding()` mock HF response, validate 384d | Jest + fetch mock |
| Unit | `parseCitations()` regex accuracy on sample LLM text | Jest |
| Unit | `callProvider()` fallback trigger on timeout | Jest + AbortController mock |
| Unit | `match_legal_chunks` prompt builder with chunks | Jest snapshot |
| Integration | `/api/chat` full flow with mocked externals | Jest + MSW |
| E2E | Send message → see streaming response → click citation | Playwright |

---

## Migration / Rollback

**No migration required** — greenfield project. Rollback = delete `openspec/changes/eurolex-mvp-web-app/`.

**Supabase schema**: User runs `seed.sql` manually (provided in repo). Schema includes `legal_chunks` table + `match_legal_chunks` function + IVFFlat index + RLS policies.

---

## Open Questions

- [ ] HuggingFace free tier cold start: model loading can take 20s+ on first request. Should we add a health-check warmup call on app startup?
- [ ] Citation regex accuracy: LLM may cite articles in non-standard formats. Need empirical testing with real responses.
- [ ] Should `SUPABASE_ANON_KEY` be prefixed with `NEXT_PUBLIC_` if we want client-side Supabase calls in Phase 2? Currently all server-side, so no prefix needed.

---

## Phase 2 Architecture Notes

### PDF Export
- Client-side via `@react-pdf/renderer` — zero server load
- New component: `components/pdf-export.tsx`
- Template: logo, date, conversation, citations with EUR-Lex links, disclaimer
- Trigger: button in ChatContainer header
- No API changes needed

### Sidebar (Session Management)
- Requires Vercel KV integration
- New: `lib/rate-limit/kv-store.ts` — Redis client wrapper
- Session schema: `session:{id}` → `{ messages: ChatMessage[], created_at, updated_at }`
- TTL: 24 hours
- Sidebar component lists recent sessions, loads on click
- `app/api/sessions/route.ts` — CRUD endpoints

### KV Sessions Integration Points
- `/api/chat` route: save each message turn to KV after streaming completes
- `/api/sessions` route: list, get, delete sessions
- ChatContainer: load session from KV on mount if session ID in URL
- New env vars: `KV_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`

### Comparator Mode (Post-MVP)
- Detect regulation keywords in user query
- If multiple regulations referenced: run parallel vector searches (one per regulation)
- Group results by regulation in prompt
- UI: tabbed view showing per-regulation context
