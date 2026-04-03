# EuroLex AI — Product Design Review (PDR)

**Document Version**: 6.0
**Date**: 2026-04-04
**Status**: Active development
**Stack**: Next.js 14, Python (ETL), Supabase (pgvector), Vercel, Groq, Cerebras, Google AI Studio
**Constraint**: 100% Free Tier
**Previous version**: PDR-original.md (v4.0, 2026-03-30)

---

## 1. Executive Summary

EuroLex AI is a RAG (Retrieval-Augmented Generation) assistant specialised in European Union regulations. It is designed as a reusable framework: the same pipeline, schema, and search architecture can be adapted to any document corpus — corporate policies, technical reports, compliance manuals, clinical protocols, or any set of structured documents.

**Core value proposition**: eliminate LLM hallucinations in domains where accuracy is non-negotiable. Every answer is grounded in the source documents, tagged with verifiable citations, and never relies on pre-training knowledge alone.

**Current architecture highlights**:
- **Hybrid search**: pgvector cosine similarity + tsvector full-text search, fused via Reciprocal Rank Fusion (RRF)
- **Streaming**: custom Server-Sent Events implementation for real-time token delivery
- **LLM**: Groq `llama-3.3-70b-versatile` (primary), Cerebras `llama3.1-8b` (fallback)
- **Embeddings**: Google AI Studio (`gemini-embedding-001`, 1536-dim)
- **ETL**: Python pipeline fetching directly from EUR-Lex SPARQL + content negotiation
- **Session persistence**: browser localStorage (no server-side KV required)

---

## 2. Product Value

### 2.1 Problem

Large language models produce confident-sounding answers that may have no basis in the source material. For legal, medical, or compliance topics this is unacceptable. Users cannot distinguish fact from fabrication.

### 2.2 Solution

A retrieval-augmented system that:

1. **Grounds every answer in source documents.** If the corpus doesn't contain the information, the system says so.
2. **Provides verifiable citations.** Each claim is tagged with a `[[Regulation — Article N]]` reference. Users click the citation to read the exact paragraph.
3. **Delivers contextualised responses.** The model reasons over the provided documents, not pre-training memory.
4. **Supports private documents.** Ingestion is a local ETL step; only the user's query goes to the LLM at runtime.

### 2.3 Reusability

While the current corpus covers EU regulations, the architecture is document-agnostic. Any corpus with parseable structure can be ingested:
- Replace the ETL source (filesystem, CMS, S3 instead of EUR-Lex SPARQL)
- Adapt the parser to the document structure
- Update citation format and sidebar filters
- The Supabase schema, search RPCs, and UI remain unchanged

---

## 3. Dataset & Knowledge Base

### 3.1 Current corpus

| Regulation | CELEX ID | Chunks | Notes |
|------------|----------|--------|-------|
| GDPR | 32016R0679 | 99 | EUR-Lex fetch |
| AI Act | 52021PC0206 | 258 | EUR-Lex fetch, cleaned from proposal noise |
| Digital Services Act | 32022R2065 | 93 | EUR-Lex fetch, one chunk per article |
| Digital Markets Act | 32022R1925 | 53 | EUR-Lex fetch |
| NIS2 Directive | 32022L2555 | 45 | EUR-Lex fetch |
| Cyber Resilience Act | 32024R2847 | 71 | EUR-Lex fetch |

### 3.2 Chunking strategy

- Article-level chunks (one chunk per article from EUR-Lex XHTML)
- Truncated at 4000 characters to stay within embedding model context
- `content_hash` in metadata for deduplication on reseed
- Each chunk stores: regulation name, CELEX ID, article number, article title

### 3.3 Multi-language

- **Indexing**: English (EUR-Lex authoritative text)
- **Queries**: any language (multilingual embeddings)
- **Responses**: match the user's query language

---

## 4. Architecture

### 4.1 System diagram

```
┌─────────────────────────────────────────────────────┐
│  Browser  (Next.js 14 + React + Tailwind)           │
│  Chat UI, suggestion chips, citation modal, sidebar │
│  Session state in localStorage                      │
└──────────────────────┬──────────────────────────────┘
                       │ SSE
                       ▼
┌─────────────────────────────────────────────────────┐
│  /api/chat  (Next.js Route Handler)                  │
│  1. detectRegulation(prompt) — optional auto-filter  │
│  2. generateEmbedding(query)  → HuggingFace API     │
│  3. expandQuery(query) — acronym/synonym expansion   │
│  4. hybridSearch(query, embedding, regulation)       │
│     → Supabase RPC hybrid_search_rrf                │
│  5. buildContext(chunks) + system prompt             │
│  6. streamText(model, prompt)  → Groq / Cerebras     │
│  7. Parse [[citation]] tokens → SSE citation events  │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Supabase  (PostgreSQL + pgvector)                   │
│  legal_chunks: content, embedding(768), metadata     │
│  search_vector tsvector (GIN index)                  │
│  RPC: hybrid_search_rrf  (vector + FTS, RRF fusion)  │
│  RPC: match_legal_chunks  (vector-only fallback)     │
│  RLS: public read, no client writes                  │
└─────────────────────────────────────────────────────┘
```

### 4.2 ETL pipeline

```
EUR-Lex SPARQL endpoint
  → query by CELEX ID → get manifestation URI
  → content negotiation (application/xhtml+xml)
  → handle 300 Multiple-Choice → follow /DOC_1 redirect
  → BeautifulSoup parse <div id="art_N">
  → article-level chunking (truncated at 4000 chars)
  → content_hash for dedup
  → all-mpnet-base-v2 embedding (768-dim, local)
  → Supabase insert (batch of 100)
```

Fallback: if EUR-Lex fetch fails, reads from `scripts/data/{regulation}.txt`.

### 4.3 Database schema

```sql
create table legal_chunks (
    id uuid default gen_random_uuid() primary key,
    content text not null,
    embedding vector(1536) not null,
    metadata jsonb not null,
    regulation text generated always as (metadata->>'regulation') stored,
    article text generated always as (metadata->>'article') stored,
    celex_id text generated always as (metadata->>'celex_id') stored,
    created_at timestamp with time zone default now()
);

-- Full-text search column
alter table legal_chunks add column search_vector tsvector
  generated always as (to_tsvector('english', content)) stored;

-- Indexes
create index idx_legal_chunks_embedding on legal_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 50);

create index idx_legal_chunks_search on legal_chunks
  using gin (search_vector);
```

### 4.4 Hybrid search (RPC)

`hybrid_search_rrf` combines:
1. **tsvector rank** via `websearch_to_tsquery` + `ts_rank_cd`
2. **pgvector cosine similarity** via `<=>` operator
3. **Reciprocal Rank Fusion** (alpha=0.5) to combine both rankings

Returns the top N results with a combined score cast to `double precision`.

### 4.5 Query expansion

`expandQuery` in `lib/db/supabase.ts` detects acronyms and domain terms, expanding them so the tsvector search doesn't miss documents. Each regulation has two entries (acronym → full name, full name → acronym + keywords).

Current expansions:

| Input | Expansion |
|-------|-----------|
| `dsa` | `"digital services act very large online platforms moderation systemic risk obligations"` |
| `dma` | `"digital markets act gatekeepers interoperability self-preferencing obligation"` |
| `gdpr` | `"general data protection regulation processing lawful basis data subject rights"` |
| `ai act` | `"artificial intelligence act risk classification transparency requirements"` |
| `nis2` | `"nis2 directive cybersecurity incident reporting essential entities"` |
| `cra` | `"cyber resilience act security-by-design vulnerability handling"` |

---

## 5. LLM Strategy

### 5.1 Provider chain

| Priority | Provider | Model | Timeout |
|----------|----------|-------|---------|
| Primary | Groq | `llama-3.3-70b-versatile` | 30s |
| Fallback | Cerebras | `llama3.1-8b` | 30s |

If Groq fails (timeout, rate limit, error), the system automatically tries Cerebras.

### 5.2 Streaming

Custom SSE implementation in `chat-container.tsx`:
- Streams via `response.body.getReader()` with a TextDecoder
- Three event types: `chunk` (token text), `citation` (parsed reference), `error` / `done`
- Per-request stream ID prevents stale streams from mutating state after "New chat"

### 5.3 Citation parsing

The LLM is prompted to emit `[[Regulation — Article N]]` inline. The client-side parser (`lib/utils/citations.ts`) extracts these and emits SSE `citation` events. The UI renders them as clickable badges that open a modal with the source chunk.

---

## 6. Session Management

Sessions are stored in browser `localStorage` under `eurolex-chat-history`. This replaces the earlier Vercel KV approach, removing the session persistence infrastructure from the free-tier budget.

Each session stores:
- `id`: UUID
- `title`: first user message (truncated)
- `messages`: full chat history
- `createdAt`, `updatedAt`

---

## 7. Security

- **RLS**: public read only, all writes blocked from client
- **Service Role Key**: used only in API Routes server-side, never exposed to client
- **Rate limiting**: Edge Middleware (planned, not yet active)
- **.env**: gitignored, never committed; `.env.example` provides a safe template

---

## 8. Cost analysis

| Service | Plan | Monthly cost |
|---------|------|-------------|
| Vercel | Hobby | $0 |
| Supabase | Free (EU) | $0 |
| Cerebras | Free tier | $0 |
| Groq | Free tier | $0 |
| HuggingFace | Inference API (free) | $0 |
| Embeddings | Via HF API (free tier) | $0 |
| **Total** | | **$0** |

Upgrade triggers:
- Supabase: >500 MB data → Pro ($25/mo)
- LLM: sustained >1M tokens/day → pay-as-you-go (~$0.60/1M tokens)

---

## 9. Roadmap

### Completed
- [x] EUR-Lex SPARQL + content negotiation ETL pipeline
- [x] Article-level chunking with content_hash dedup
- [x] Hybrid search (vector + FTS + RRF)
- [x] Groq 70B primary + Cerebras 8B fallback
- [x] Streaming SSE with stale-stream guards
- [x] Citation parsing and modal
- [x] Regulation filter sidebar
- [x] Suggestion chips for common questions
- [x] Session persistence (localStorage)
- [x] Query expansion with acronym synonyms

### Planned
- [ ] Edge rate limiting (Vercel Middleware)
- [ ] PDF export (client-side, `@react-pdf/renderer`)
- [ ] Sub-paragraph chunking for long articles (>4000 chars)
- [ ] Cyber Resilience Act seed
- [ ] Cross-regulation comparator mode
- [ ] Multi-language query support validation

---

## 10. Environment variables

See `.env.example` for a complete, safe template. **Never commit `.env` or `.env.local`.**

---

*Previous version of this document (v4.0, 2026-03-30) is archived as `PDR-original.md`.*
