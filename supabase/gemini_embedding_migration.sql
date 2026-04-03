-- Migration: Resize embedding column from 768 to 3072 dimensions
-- Required for migration from all-mpnet-base-v2 to gemini-embedding-001
--
-- IMPORTANT: Run this AFTER deleting all chunks and BEFORE re-seeding.
-- The existing vectors will be truncated/padded to 3072 (they won't be valid,
-- but the column type change must happen before inserting new vectors).

-- Step 1: Drop old index
DROP INDEX IF EXISTS idx_legal_chunks_embedding;

-- Step 2: Resize column
ALTER TABLE legal_chunks 
  ALTER COLUMN embedding TYPE vector(3072);

-- Step 3: Rebuild index with appropriate list count
-- Rule of thumb: lists = total_rows / 1000
-- With ~1000 chunks: lists = 1. Using 50 for safety.
CREATE INDEX idx_legal_chunks_embedding 
  ON legal_chunks USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 50);

-- Verify
SELECT column_name, data_type, udt_name 
FROM information_schema.columns 
WHERE table_name = 'legal_chunks' AND column_name = 'embedding';
