# Supabase Setup — EuroLex AI

## What's in this directory?

| File | Purpose |
|------|---------|
| `schema.sql` | Full SQL schema — run this in your Supabase dashboard |
| `README.md` | This file — setup instructions |

## How to Execute

### 1. Open your Supabase project

Go to [supabase.com](https://supabase.com), sign in, and open your project.

### 2. Go to SQL Editor

In the left sidebar, click **SQL Editor** (the database icon with a play button).

### 3. Run the schema

1. Click **New query**
2. Copy the entire contents of `schema.sql`
3. Paste into the editor
4. Click **Run** (or press `Ctrl+Enter`)

### 4. Verify it worked

Run this in the same SQL Editor:

```sql
-- Should return 'legal_chunks'
SELECT tablename FROM pg_tables WHERE tablename = 'legal_chunks';

-- Should return 'match_legal_chunks'
SELECT proname FROM pg_proc WHERE proname = 'match_legal_chunks';
```

If both queries return a row, you're good.

## What gets created?

- **`vector` extension** — pgvector for similarity search
- **`legal_chunks` table** — stores document chunks with 384-dim embeddings
- **`ivfflat` index** — fast cosine similarity search
- **`match_legal_chunks()` function** — semantic search API
- **RLS policies** — public read-only access, writes require `service_role` key

## Environment Variables

After running the schema, make sure these are in your `.env`:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...          # For read-only queries
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # For inserting data (ingestion pipeline)
```

## Tuning the Index

The default `lists = 50` works well for up to ~50K chunks. If you're ingesting more:

```sql
-- For 500K+ chunks, recreate with more lists:
DROP INDEX idx_legal_chunks_embedding_ivfflat;
CREATE INDEX idx_legal_chunks_embedding_ivfflat
    ON legal_chunks
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 500);
```

At query time, set probes for better recall:

```sql
SET ivfflat.probes = 7;  -- sqrt(50) ≈ 7 for lists=50
```
