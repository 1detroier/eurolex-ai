-- ================================================================
-- HYBRID SEARCH MIGRATION
-- Adds full-text search capability to legal_chunks table
-- Execute this in Supabase SQL Editor
-- ================================================================

-- Step 1: Add tsvector column (generated, instant, no data rewrite)
ALTER TABLE legal_chunks
ADD COLUMN IF NOT EXISTS search_vector tsvector
GENERATED ALWAYS AS (to_tsvector('english', COALESCE(content, ''))) STORED;

-- Step 2: GIN index for fast full-text search
-- CONCURRENTLY avoids locking the table during index creation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_chunks_fts
ON legal_chunks USING GIN (search_vector);

-- Step 3: Hybrid search RPC function
-- Combines vector similarity (60%) + full-text rank (40%) via RRF
CREATE OR REPLACE FUNCTION hybrid_search_legal_chunks(
    query_embedding vector(768),
    query_text text,
    match_count int DEFAULT 10,
    p_regulation text DEFAULT NULL
)
RETURNS TABLE(
    id uuid,
    content text,
    metadata jsonb,
    similarity float
) AS $$
BEGIN
    RETURN QUERY
    WITH vector_results AS (
        SELECT
            lc.id,
            lc.content,
            lc.metadata,
            1 - (lc.embedding <=> query_embedding) AS vector_score,
            ROW_NUMBER() OVER (ORDER BY lc.embedding <=> query_embedding) AS vector_rank
        FROM legal_chunks lc
        WHERE 1 - (lc.embedding <=> query_embedding) > 0.1
            AND (p_regulation IS NULL OR lc.metadata->>'regulation' = p_regulation)
        ORDER BY lc.embedding <=> query_embedding
        LIMIT 50
    ),
    fts_results AS (
        SELECT
            lc.id,
            lc.content,
            lc.metadata,
            ts_rank(lc.search_vector, plainto_tsquery('english', query_text)) AS fts_score,
            ROW_NUMBER() OVER (ORDER BY ts_rank(lc.search_vector, plainto_tsquery('english', query_text)) DESC) AS fts_rank
        FROM legal_chunks lc
        WHERE lc.search_vector @@ plainto_tsquery('english', query_text)
            AND (p_regulation IS NULL OR lc.metadata->>'regulation' = p_regulation)
        ORDER BY ts_rank(lc.search_vector, plainto_tsquery('english', query_text)) DESC
        LIMIT 50
    ),
    combined AS (
        SELECT
            COALESCE(v.id, f.id) AS result_id,
            COALESCE(v.content, f.content) AS result_content,
            COALESCE(v.metadata, f.metadata) AS result_metadata,
            -- RRF: 1/(k + rank), k=60 is standard
            COALESCE(1.0 / (60 + v.vector_rank), 0) * 0.6 +
            COALESCE(1.0 / (60 + f.fts_rank), 0) * 0.4 AS combined_score
        FROM vector_results v
        FULL OUTER JOIN fts_results f ON v.id = f.id
    )
    SELECT
        c.result_id AS id,
        c.result_content AS content,
        c.result_metadata AS metadata,
        c.combined_score AS similarity
    FROM combined c
    ORDER BY c.combined_score DESC
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Verify
-- SELECT count(*) FROM legal_chunks WHERE search_vector IS NOT NULL;
-- Should return total chunk count
