# Proposal: EuroLex AI MVP Web App

## Intent

Build a RAG legal research assistant for EU regulations. Users ask legal questions, system retrieves chunks from Supabase (pgvector), streams LLM responses with EUR-Lex citations.

**Problem**: No source code exists. Critical gap: PDR doesn't address runtime query embedding generation.

## Scope

### In Scope (MVP)
- Next.js 14 scaffold (App Router, TypeScript, Tailwind, shadcn/ui)
- `.env.example` + Supabase schema SQL (user executes manually)
- `/api/chat` route: Cerebras → Groq fallback, streaming via Vercel AI SDK
- HuggingFace Inference API for query embeddings (`all-MiniLM-L6-v2`, 384d)
- Edge Middleware: informative rate limit headers (no enforcement)
- Chat UI: streaming messages, input form
- Citation system: clickable badges → EUR-Lex links
- Legal disclaimer banner

### Out of Scope (Phase 2)
- PDF export, Sidebar, Session persistence (KV), Comparator mode, ETL scripts

## Approach

### Decision: Runtime Embeddings via HuggingFace
- **ETL** (local): `sentence-transformers` → pre-computed embeddings
- **Runtime** (query): HuggingFace Inference API → same model, free tier

### Decision: Rate Limiting
- **MVP**: Edge Middleware headers only ($0, stateless)
- **Post-MVP**: Vercel KV counters

### Key Files

| File | Purpose |
|------|---------|
| `app/api/chat/route.ts` | Streaming: embed → search → LLM stream |
| `lib/ai/llm-client.ts` | Cerebras/Groq fallback, 5s timeout |
| `lib/ai/embeddings.ts` | HuggingFace API wrapper |
| `lib/db/supabase.ts` | Supabase client (service role) |
| `middleware.ts` | Rate limit headers |
| `components/chat/chat-container.tsx` | useChat hook, message logic |
| `components/chat/citation-badge.tsx` | EUR-Lex links |
| `types/legal.ts` | TypeScript interfaces |

## Environment Variables

```bash
CEREBRAS_API_KEY=sk-cbrs-...
GROQ_API_KEY=gsk_...
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
HUGGINGFACE_API_KEY=hf_...
```

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| HuggingFace rate limits | Medium | Cache queries; keyword fallback |
| Both LLM providers down | Low | Two-provider chain |
| Supabase not provisioned | High | Provide SQL + setup guide |

## Rollback

Delete `openspec/changes/eurolex-mvp-web-app/`. Greenfield — no existing code affected.

## Dependencies

- User: create Supabase project (EU region) + run schema SQL
- User: obtain API keys (Cerebras, Groq, HuggingFace)
- User: create Vercel project + link repo

## Success Criteria

- [ ] Streaming legal Q&A works end-to-end
- [ ] Clickable citation badges link to EUR-Lex
- [ ] Cerebras → Groq fallback verified
- [ ] Query embeddings via HuggingFace (same ETL model)
- [ ] Deploys to Vercel without errors
- [ ] Legal disclaimer visible
