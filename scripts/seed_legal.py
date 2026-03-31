"""
EuroLex AI — Seed Script
========================
Processes EU regulation texts into chunks with embeddings and inserts
them into Supabase.

Usage:
    1. Install dependencies: pip install -r scripts/requirements.txt
    2. Place regulation text files in scripts/data/ (one per regulation)
    3. Run: python scripts/seed_legal.py

Data format (scripts/data/):
    Each .txt file should contain the regulation text. The script will:
    - Split into chunks (~500 chars with 50 char overlap)
    - Generate 384-dim embeddings using all-MiniLM-L6-v2 (local CPU)
    - Insert into Supabase legal_chunks table

Supported regulations:
    - GDPR (32016R0679)
    - AI Act (52021PC0206)
    - Digital Services Act (32022D2065)
    - Digital Markets Act (32022R1925)
"""

import os
import re
import json
import hashlib
from pathlib import Path
from typing import Optional

import numpy as np
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from supabase import create_client
from tqdm import tqdm

# Load .env from project root
load_dotenv(Path(__file__).parent.parent / ".env")

# Config
CHUNK_SIZE = 500  # characters
CHUNK_OVERLAP = 50  # characters
EMBEDDING_MODEL = "all-mpnet-base-v2"
EMBEDDING_DIMS = 768

# Regulation metadata
REGULATIONS = {
    "gdpr": {
        "name": "GDPR",
        "celex_id": "32016R0679",
        "description": "General Data Protection Regulation",
    },
    "ai-act": {
        "name": "AI Act",
        "celex_id": "52021PC0206",
        "description": "Artificial Intelligence Act",
    },
    "dsa": {
        "name": "Digital Services Act",
        "celex_id": "32022R2065",
        "description": "Digital Services Act",
    },
    "dma": {
        "name": "Digital Markets Act",
        "celex_id": "32022R1925",
        "description": "Digital Markets Act",
    },
}


def extract_article(text: str, position: int) -> Optional[str]:
    """Try to find which article a chunk belongs to based on position."""
    # Look backwards from position for "Article N" pattern
    search_start = max(0, position - 500)
    preceding = text[search_start:position]

    # Match "Article N" or "Art. N" patterns
    matches = list(re.finditer(r"(?:Article|Art\.)\s+(\d+)", preceding))
    if matches:
        return f"Article {matches[-1].group(1)}"
    return None


def chunk_text(text: str, regulation_key: str) -> list[dict]:
    """Split text into overlapping chunks with metadata."""
    chunks = []
    start = 0

    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        chunk_content = text[start:end].strip()

        if len(chunk_content) < 50:  # Skip tiny chunks
            break

        article = extract_article(text, start)
        meta = REGULATIONS[regulation_key]

        chunks.append({
            "content": chunk_content,
            "metadata": {
                "regulation": meta["name"],
                "celex_id": meta["celex_id"],
                "article": article or "Unknown",
                "chunk_index": len(chunks),
                "char_start": start,
                "char_end": end,
            },
        })

        start += CHUNK_SIZE - CHUNK_OVERLAP

    return chunks


def process_regulation(file_path: Path, model: SentenceTransformer) -> list[dict]:
    """Process a single regulation file into chunks with embeddings."""
    reg_key = file_path.stem.lower()

    if reg_key not in REGULATIONS:
        print(f"  WARNING: Unknown regulation '{reg_key}', skipping")
        return []

    print(f"\nProcessing: {REGULATIONS[reg_key]['name']} ({file_path.name})")

    text = file_path.read_text(encoding="utf-8")
    print(f"  Text length: {len(text):,} chars")

    chunks = chunk_text(text, reg_key)
    print(f"  Chunks: {len(chunks)}")

    if not chunks:
        return []

    # Generate embeddings (batch for efficiency)
    print(f"  Generating embeddings...")
    texts = [c["content"] for c in chunks]
    embeddings = model.encode(texts, show_progress_bar=True, batch_size=32)

    # Attach embeddings to chunks
    for chunk, emb in zip(chunks, embeddings):
        chunk["embedding"] = emb.tolist()

    return chunks


def insert_into_supabase(chunks: list[dict]) -> int:
    """Insert chunks into Supabase. Returns count of inserted rows."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")

    supabase = create_client(url, key)
    inserted = 0

    print(f"\nInserting {len(chunks)} chunks into Supabase...")

    # Batch insert (Supabase handles up to 1000 rows per request)
    batch_size = 100
    for i in tqdm(range(0, len(chunks), batch_size)):
        batch = chunks[i : i + batch_size]
        rows = [
            {
                "content": c["content"],
                "embedding": c["embedding"],
                "metadata": c["metadata"],
            }
            for c in batch
        ]

        result = supabase.table("legal_chunks").insert(rows).execute()

        if result.data:
            inserted += len(result.data)
        else:
            print(f"  ERROR at batch {i // batch_size}: {result}")

    return inserted


def main():
    data_dir = Path(__file__).parent / "data"

    if not data_dir.exists():
        print(f"Creating {data_dir}/ directory...")
        data_dir.mkdir(parents=True)
        print(f"\nPlease place regulation text files in {data_dir}/")
        print("Supported files:")
        for key, meta in REGULATIONS.items():
            print(f"  {key}.txt — {meta['description']} ({meta['celex_id']})")
        return

    # Find regulation files
    files = list(data_dir.glob("*.txt"))
    if not files:
        print(f"No .txt files found in {data_dir}/")
        return

    print(f"Found {len(files)} regulation file(s)")

    # Load embedding model
    print(f"\nLoading embedding model: {EMBEDDING_MODEL}")
    model = SentenceTransformer(EMBEDDING_MODEL)
    print(f"  Model loaded ({EMBEDDING_DIMS} dimensions)")

    # Process all regulations
    all_chunks = []
    for file_path in sorted(files):
        chunks = process_regulation(file_path, model)
        all_chunks.extend(chunks)

    if not all_chunks:
        print("\nNo chunks generated. Check your input files.")
        return

    print(f"\n{'='*50}")
    print(f"Total chunks: {len(all_chunks)}")
    print(f"{'='*50}")

    # Insert into Supabase
    inserted = insert_into_supabase(all_chunks)
    print(f"\n✅ Done! Inserted {inserted} chunks into Supabase")


if __name__ == "__main__":
    main()
