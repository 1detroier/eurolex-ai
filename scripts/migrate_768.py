"""
Migration: resize embedding column from 384 to 768 dimensions
and re-seed with all-mpnet-base-v2 model.
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / ".env")

def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    supabase = create_client(url, key)

    print("Step 1: Deleting existing chunks...")
    result = supabase.table("legal_chunks").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    print(f"  Deleted.")

    print("\nStep 2: Resizing embedding column (384 -> 768)...")
    # Execute raw SQL to alter the column type
    # This requires the pgvector extension to support the new dimension
    try:
        supabase.postgrest.rpc("exec_sql", {
            "sql": """
                ALTER TABLE legal_chunks ALTER COLUMN embedding TYPE vector(768);
                DROP INDEX IF EXISTS idx_legal_chunks_embedding;
                CREATE INDEX idx_legal_chunks_embedding 
                ON legal_chunks USING ivfflat (embedding vector_cosine_ops) 
                WITH (lists = 100);
            """
        }).execute()
        print("  Column resized and index recreated.")
    except Exception as e:
        print(f"  RPC failed ({e})")
        print("  You may need to run this SQL manually in Supabase SQL Editor:")
        print("  ALTER TABLE legal_chunks ALTER COLUMN embedding TYPE vector(768);")
        print("  DROP INDEX IF EXISTS idx_legal_chunks_embedding;")
        print("  CREATE INDEX idx_legal_chunks_embedding ON legal_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);")

    print("\nStep 3: Now run: python scripts/seed_legal.py")

if __name__ == "__main__":
    main()
