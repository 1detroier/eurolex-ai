# EuroLex AI

A Retrieval-Augmented Generation (RAG) assistant that answers questions about European Union regulations — grounded entirely in the official EUR-Lex legal texts. Ask in plain language and receive contextualised answers with verifiable citations pointing to the exact articles the AI used as source material.

EuroLex AI is designed as a reusable RAG framework. The same pipeline, schema, and search architecture can be adapted to any document corpus: internal company policies, technical reports, compliance manuals, clinical guidelines, or any set of structured documents you want to query conversationally. See [Adapting to other document types](#adapting-to-other-document-types).

---

## Why this matters

Large language models hallucinate. They produce confident-sounding answers that may have no basis in the source material. For legal, medical, or compliance topics this is unacceptable. EuroLex AI tackles that problem structurally:

- **Grounded responses.** Every answer is built from chunks retrieved from the actual regulation text. If the corpus doesn't contain the information, the system says so instead of inventing an answer.
- **Verifiable citations.** Each claim is tagged with a `[[Regulation — Article N]]` reference. Users can click the citation to read the exact paragraph in a side modal, so they can verify the AI's reasoning against the primary source.
- **Contextualised over generalist.** The model doesn't rely on its pre-training knowledge — it reasons over the documents you provide. This eliminates the "I think the DSA says…" pattern and replaces it with "Article 34 of the DSA requires…".
- **Private document support.** Because ingestion is a local ETL step, you can point the pipeline at confidential internal documents without sending them to any external API during the indexing phase. Only the user's query goes to the LLM at runtime.

These properties make the system trustworthy enough to use in domains where getting the wrong answer has real consequences.

---

## Regulations included

| Regulation | CELEX ID | Chunks |
|-----------|----------|--------|
| GDPR | 32016R0679 | ~250 |
| AI Act | 52021PC0206 | ~270 |
| Digital Services Act | 32022R2065 | 93 |
| Digital Markets Act | 32022R1925 | ~180 |
| NIS2 Directive | 32022L2555 | 46 |
| Cyber Resilience Act | 32024R2847 | pending seed |

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS, shadcn/ui |
| API | Next.js Route Handlers, custom Server-Sent Events streaming |
| LLM | Groq `llama-3.3-70b-versatile` (primary) · Cerebras `llama3.1-8b` (fallback) |
| Embeddings | HuggingFace Inference API — `all-mpnet-base-v2` (768-dim) |
| Vector DB | Supabase PostgreSQL + pgvector |
| Search | Hybrid: pgvector cosine similarity + tsvector full-text search, fused via Reciprocal Rank Fusion |
| ETL | Python, BeautifulSoup, Sentence-Transformers, EUR-Lex SPARQL + content negotiation |
| Deployment | Vercel |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser  (Next.js 14 + React + Tailwind)           │
│  Chat UI, suggestion chips, citation modal, sidebar │
└──────────────────────┬──────────────────────────────┘
                       │ SSE
                       ▼
┌─────────────────────────────────────────────────────┐
│  /api/chat  (Next.js Route Handler)                  │
│  1. Detect regulation from sidebar filter            │
│  2. generateEmbedding(query)  → HuggingFace API     │
│  3. hybridSearch(ftsQuery, embedding, regulation)    │
│     → Supabase RPC  hybrid_search_rrf               │
│  4. buildContext(chunks)  +  prompt template         │
│  5. streamText(model, prompt)  → Groq / Cerebras     │
│  6. Parse [[citation]] tokens → SSE citation events  │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Supabase  (PostgreSQL + pgvector)                   │
│  legal_chunks: content, embedding(768), metadata     │
│  tsvector column + GIN index  (full-text search)     │
│  RPC: hybrid_search_rrf  (vector + FTS fused)        │
│  RPC: match_legal_chunks  (vector-only fallback)     │
└─────────────────────────────────────────────────────┘
```

### ETL pipeline

```
EUR-Lex SPARQL  ──►  XHTML fetch (content negotiation, /DOC_1 redirect)
                     │
                     ▼
              BeautifulSoup parse  ──►  Article chunking
                                       │
                                       ▼
                              all-mpnet-base-v2 (local)  ──►  Supabase insert
```

---

## Getting started

### Prerequisites

- Node 18+
- Python 3.10+ (for ETL only)
- A Supabase project (free tier, EU region recommended)
- API keys: Groq, Cerebras, HuggingFace

### 1. Install

```bash
git clone https://github.com/1detroier/eurolex-ai.git
cd eurolex-ai
npm install
pip install -r scripts/requirements.txt
```

### 2. Environment variables

Copy the example file and fill in your keys:

```bash
cp .env.example .env
cp .env.example .env.local
```

Then edit both files with your real credentials. **Never commit `.env` or `.env.local`** — they are already in `.gitignore`.

```bash
# LLM Providers
CEREBRAS_API_KEY=your_cerebras_api_key_here
GROQ_API_KEY=your_groq_api_key_here

# Embeddings (HuggingFace Inference API - free tier)
HUGGINGFACE_API_KEY=your_huggingface_api_key_here

# Database (Supabase)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# Optional — sessions (Vercel KV)
KV_URL=your_kv_url_here
KV_REST_API_TOKEN=your_kv_token_here
```

### 3. Database setup

Run the SQL files in your Supabase SQL Editor:

1. `supabase/schema.sql` — creates the `legal_chunks` table and `match_legal_chunks` RPC.
2. `supabase/hybrid_search_migration.sql` — adds `search_vector` (tsvector) column, GIN index, and `hybrid_search_rrf` RPC.

### 4. Seed regulations

```bash
# All regulations
python scripts/seed_legal.py

# Single regulation
python scripts/seed_legal.py --regulation dsa

# Dry run (no insert)
python scripts/seed_legal.py --dry-run
```

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## How search works

1. **User types a query** (e.g. "DSA obligations for very large platforms").
2. `expandQuery` detects acronyms and expands them — `dsa` → `"digital services act very large online platforms moderation systemic risk obligations"` — so full-text search matches the correct documents.
3. `generateEmbedding` sends the query to HuggingFace and returns a 768-dim vector.
4. `hybrid_search_rrf` (Supabase RPC) runs:
   - `tsvector` search with `websearch_to_tsquery` (ranked by `ts_rank_cd`).
   - `pgvector` cosine similarity search.
   - Fuses both result sets with Reciprocal Rank Fusion and returns the top hits.
5. The API handler builds a context from the chunks, sends it to Groq (or Cerebras on failure), and streams the response.
6. `[[Regulation — Article N]]` tokens in the streamed text are parsed by `parseCitations` and sent as SSE `citation` events so the UI can render clickable badges.

---

## Adapting to other document types

EuroLex AI ships with EU regulations, but the pipeline and schema are document-agnostic. To point it at a different corpus — company policies, technical manuals, compliance reports, clinical protocols, or any structured documents — you need to adjust a few things:

### 1. Ingestion (`scripts/seed_legal.py`)

- Replace the `REGULATIONS` dict with your own document list (title, ID, description).
- Replace `fetch_regulation_xhtml` / `sparql_query` with your own document source: filesystem, S3, a CMS API, a PDF parser, etc.
- Adapt `parse_articles` to the structure of your documents. EUR-Lex uses `<div id="art_N">`; yours might use markdown headers, XML sections, or numbered paragraphs.
- If your documents are unstructured (plain text without clear section markers), use the `chunk_text` fallback path which splits by character count.

### 2. Embeddings model

- The default model is `all-mpnet-base-v2` (768 dimensions). If you switch models, update:
  - `scripts/seed_legal.py` → `EMBEDDING_MODEL` and `EMBEDDING_DIMS`
  - `lib/ai/embeddings.ts` → `HF_API_URL` and `EXPECTED_DIMENSIONS`
  - Supabase column type: `vector(768)` → `vector(new_dim)`
  - Rebuild the IVFFlat index

### 3. Citations (`lib/utils/citations.ts`)

- The default parser expects `[[Regulation — Article N]]` format. Update the regex to match whatever reference format your document chunks emit in the LLM's output.
- Update `lib/ai/prompts.ts` system prompt to instruct the model to cite in your chosen format.

### 4. Search synonyms (`lib/db/supabase.ts`)

- Replace the `expansions` array in `expandQuery` with domain-specific synonyms relevant to your corpus.

### 5. Supabase schema

- No changes needed if you keep the same column structure (`content`, `embedding`, `metadata`). The `metadata` JSONB field is schemaless, so you can add fields like `department`, `policy_type`, `version`, etc. without migrations.

### 6. Sidebar filters

- Update `components/sidebar.tsx` to reflect your document categories instead of EU regulation names.

### Things to keep in mind

- **Chunk size matters.** Too large and retrieval accuracy drops; too small and context is lost. The default 4000-char truncation works well for legal articles but may need tuning for your documents.
- **Embedding quality depends on the corpus.** If your documents use heavy jargon or domain-specific terminology, consider fine-tuning the embedding model or adding more aggressive synonym expansion.
- **Private documents stay local during indexing.** The ETL step (`seed_legal.py`) runs on your machine. Only the user's query and the retrieved chunks are sent to the LLM at runtime. If you need fully private inference, you can swap the Groq/Cerebras API calls for a local model (e.g. via Ollama).

---

## Project structure

```
eurolex-ai/
├── app/
│   ├── api/chat/route.ts          # Streaming chat endpoint
│   ├── page.tsx                   # Main page
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── chat/
│   │   ├── chat-container.tsx     # Core chat logic + SSE stream
│   │   ├── chat-input.tsx         # Textarea with suggestions
│   │   ├── chat-message.tsx       # Message + citation badges
│   │   ├── message-list.tsx       # Chat history
│   │   └── citation-modal.tsx     # Legal text preview
│   ├── sidebar.tsx                # Regulation filter + chat history
│   └── chat-layout.tsx            # Responsive shell
├── lib/
│   ├── ai/
│   │   ├── llm-client.ts          # Groq + Cerebras config
│   │   ├── embeddings.ts          # HuggingFace wrapper
│   │   └── prompts.ts             # System prompt + templates
│   ├── db/
│   │   └── supabase.ts            # Search, expandQuery, hybrid RPC
│   └── utils/
│       ├── citations.ts           # Regex parser for [[Reg-Article]]
│       └── pdf-generator.ts       # Client-side PDF export
├── scripts/
│   ├── seed_legal.py              # EUR-Lex → chunk → embed → insert
│   └── requirements.txt
├── supabase/
│   ├── schema.sql                 # Base tables + vector search RPC
│   └── hybrid_search_migration.sql  # tsvector + GIN + hybrid RPC
├── types/
│   └── legal.ts                   # Shared TypeScript interfaces
├── PDR.md                         # Product Design Review
├── PDR-original.md                # Historical PDR (v4.0, 2026-03-30)
└── README.md
```

---

## Disclaimer

> EuroLex AI provides information based on publicly available EU regulations. It does **not** constitute legal advice. Always consult a qualified legal professional for specific matters.

---

## License

This project uses EUR-Lex public-domain legal texts. The application code is released under the [MIT License](LICENSE) (or your preferred license — add one).
