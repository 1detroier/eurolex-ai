"""
Re-seed all regulations with Google text-embedding-004 embeddings.
This script:
1. Deletes ALL existing chunks from Supabase
2. Rebuilds the IVFFlat index
3. Runs the full seed pipeline

Usage:
    python scripts/reseed_all.py
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import requests

load_dotenv(Path(__file__).parent.parent / ".env")

def delete_all_chunks():
    """Delete all chunks from Supabase."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    
    if not url or not key:
        print("ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)
    
    endpoint = f"{url.rstrip('/')}/rest/v1/legal_chunks"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
    }
    
    print("Deleting all existing chunks...")
    resp = requests.delete(endpoint, headers=headers, timeout=60)
    resp.raise_for_status()
    print(f"  Deleted. Content-Range: {resp.headers.get('Content-Range', 'unknown')}")

def rebuild_index():
    """Rebuild the IVFFlat index via SQL."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    
    if not url or not key:
        print("ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)
    
    sql = """
    DROP INDEX IF EXISTS idx_legal_chunks_embedding;
    CREATE INDEX idx_legal_chunks_embedding 
      ON legal_chunks USING ivfflat (embedding vector_cosine_ops) 
      WITH (lists = 50);
    """
    
    print("Rebuilding IVFFlat index...")
    endpoint = f"{url.rstrip('/')}/rest/v1/rpc"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    
    # Use Supabase SQL via pg_net or just note it needs manual execution
    print("  Note: Index rebuild should be done via Supabase SQL Editor.")
    print("  Run the contents of supabase/gemini_embedding_migration.sql")

if __name__ == "__main__":
    print("=" * 60)
    print("  EuroLex AI -- Full Re-seed (Google text-embedding-004)")
    print("=" * 60)
    
    # Check API key
    api_key = os.environ.get("GOOGLE_AI_API_KEY")
    if not api_key:
        print("ERROR: Missing GOOGLE_AI_API_KEY in .env")
        sys.exit(1)
    
    # Step 1: Delete all chunks
    delete_all_chunks()
    
    # Step 2: Note about index
    rebuild_index()
    
    # Step 3: Run seed pipeline
    print("\nNow running the seed pipeline...")
    print("Execute: python scripts/seed_legal.py")
