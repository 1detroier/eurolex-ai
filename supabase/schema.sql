-- ============================================================
-- EuroLex AI — Supabase Schema
-- ============================================================
--
-- PURPOSE:
--   Creates the vector storage infrastructure for EuroLex AI,
--   an EU legal document semantic search engine powered by
--   all-mpnet-base-v2 embeddings (768 dimensions).
--
-- HOW TO RUN:
--   1. Open your Supabase project dashboard
--   2. Go to SQL Editor
--   3. Paste this entire file and click "Run"
--   4. Verify: the legal_chunks table and match_legal_chunks
--      function should appear in Table Editor and Database > Functions
--
-- ============================================================


-- ============================================================
-- STEP 1: Enable pgvector extension
-- ============================================================
-- pgvector provides the vector data type and similarity
-- operators (<=> for cosine distance, <-> for L2, etc.)
-- Required before any vector column can be created.

create extension if not exists vector;


-- ============================================================
-- STEP 2: Create the main table — legal_chunks
-- ============================================================
-- Each row represents a chunk of an EU legal document with
-- its vector embedding and extracted metadata.
--
-- Columns:
--   id           — UUID primary key, auto-generated
--   content      — The raw text chunk (article paragraph, recital, etc.)
--   embedding    — 384-dim vector from all-MiniLM-L6-v2
--   metadata     — Full JSON blob (regulation, article, celex_id, etc.)
--   regulation   — Extracted from metadata for fast filtering
--   article      — Extracted from metadata for fast filtering
--   celex_id     — Extracted from metadata for fast filtering
--   created_at   — Timestamp of insertion
--
-- NOTE: regulation, article, and celex_id are GENERATED ALWAYS
-- columns — they auto-extract from metadata so you don't need
-- to maintain them manually. They also enable efficient indexes.

create table if not exists legal_chunks (
    id uuid default gen_random_uuid() primary key,
    content text not null,
    embedding vector(768) not null,
    metadata jsonb not null,

    -- Generated columns: auto-extracted from metadata JSON
    regulation text generated always as (metadata->>'regulation') stored,
    article text generated always as (metadata->>'article') stored,
    celex_id text generated always as (metadata->>'celex_id') stored,

    created_at timestamp with time zone default now()
);

-- Add a comment for documentation
comment on table legal_chunks is 'Stores chunks of EU legal documents with vector embeddings for semantic search';
comment on column legal_chunks.embedding is 'all-MiniLM-L6-v2 embedding — 384 dimensions';
comment on column legal_chunks.metadata is 'Full metadata blob: regulation, article, celex_id, chunk_index, etc.';


-- ============================================================
-- STEP 3: Create the vector index (IVFFlat)
-- ============================================================
-- IVFFlat is the recommended index for cosine similarity on
-- datasets up to ~1M vectors. It partitions the vector space
-- into lists, then probes the nearest lists at query time.
--
-- Tuning notes:
--   - lists = 50 is a good default for datasets up to ~50K chunks
--   - For larger datasets: lists = rows / 1000 (e.g., 500K rows → lists=500)
--   - At query time, set ivfflat.probes = sqrt(lists) for good recall
--     e.g., SET ivfflat.probes = 7;  (for lists=50)
--
-- IMPORTANT: The index requires data to exist before it works well.
-- After first bulk insert, consider REINDEX for optimal performance.

create index idx_legal_chunks_embedding_ivfflat
    on legal_chunks
    using ivfflat (embedding vector_cosine_ops)
    with (lists = 50);

-- Additional indexes for common filter queries
create index if not exists idx_legal_chunks_regulation
    on legal_chunks (regulation);

create index if not exists idx_legal_chunks_celex_id
    on legal_chunks (celex_id);


-- ============================================================
-- STEP 4: Create the similarity search function
-- ============================================================
-- match_legal_chunks() is the primary query interface.
-- It performs cosine similarity search with optional regulation
-- filtering and a similarity threshold.
--
-- Parameters:
--   query_embedding  — The vector to search against (384-dim)
--   match_threshold  — Minimum similarity score (0.0 to 1.0)
--                      Recommended: 0.3–0.5 for broad search,
--                      0.7+ for high-precision matches
--   match_count      — Maximum number of results to return
--   p_regulation     — Optional: filter by regulation name
--                      Pass NULL to search all regulations
--
-- Returns:
--   id, content, metadata, similarity (float, 0.0–1.0)

create or replace function match_legal_chunks(
    query_embedding vector(768),
    match_threshold float,
    match_count int,
    p_regulation text default null
)
returns table (
    id uuid,
    content text,
    metadata jsonb,
    similarity float
)
as $$
begin
    return query
    select
        lc.id,
        lc.content,
        lc.metadata,
        1 - (lc.embedding <=> query_embedding) as similarity
    from legal_chunks lc
    where 1 - (lc.embedding <=> query_embedding) > match_threshold
        and (p_regulation is null or lc.regulation = p_regulation)
    order by lc.embedding <=> query_embedding
    limit match_count;
end;
$$ language plpgsql security definer;

comment on function match_legal_chunks is 'Semantic search: finds the most similar legal chunks to a query embedding, with optional regulation filter';


-- ============================================================
-- STEP 5: Row Level Security (RLS)
-- ============================================================
-- The legal_chunks table is READ-ONLY for public access.
-- Writes are denied — data is only inserted via the admin/API
-- key (service_role), bypassing RLS.
--
-- This means:
--   - anon key: can SELECT (read) — for the search UI
--   - anon key: cannot INSERT/UPDATE/DELETE
--   - service_role key: bypasses RLS — for the ingestion pipeline

alter table legal_chunks enable row level security;

-- Allow anyone with the anon key to read chunks
create policy "allow_public_read"
    on legal_chunks
    for select
    using (true);

-- Deny all writes from public (anon) keys
-- Only service_role can write (it bypasses RLS)
create policy "deny_all_writes"
    on legal_chunks
    for all
    using (false);


-- ============================================================
-- DONE — Quick verification queries
-- ============================================================
-- Run these after executing the schema to verify everything works:

-- 1. Check table exists
--    SELECT tablename FROM pg_tables WHERE tablename = 'legal_chunks';

-- 2. Check function exists
--    SELECT proname FROM pg_proc WHERE proname = 'match_legal_chunks';

-- 3. Check RLS is enabled
--    SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'legal_chunks';

-- 4. Test search with a dummy vector (returns 0 rows if table is empty, no error)
--    SELECT * FROM match_legal_chunks(
--        array_fill(0.1, ARRAY[384])::vector(768),
--        0.3,
--        5
--    );
