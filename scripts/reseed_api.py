"""
Re-seed using HuggingFace API embeddings for consistency with runtime.
"""

import os
import json
import time
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client
from tqdm import tqdm

load_dotenv(Path(__file__).parent.parent / ".env")

CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
HF_API_URL = "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-mpnet-base-v2/pipeline/feature-extraction"
HF_TOKEN = os.environ.get("HUGGINGFACE_API_KEY")

REGULATIONS = {
    "gdpr": {"name": "GDPR", "celex_id": "32016R0679"},
    "ai-act": {"name": "AI Act", "celex_id": "52021PC0206"},
    "dsa": {"name": "Digital Services Act", "celex_id": "32022R2065"},
    "dma": {"name": "Digital Markets Act", "celex_id": "32022R1925"},
}


def chunk_text(text, reg_key):
    import re
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        content = text[start:end].strip()
        if len(content) < 50:
            break

        # Find article
        search_start = max(0, start - 500)
        preceding = text[search_start:start]
        matches = list(re.finditer(r"(?:Article|Art\.)\s+(\d+)", preceding))
        article = f"Article {matches[-1].group(1)}" if matches else "Unknown"

        meta = REGULATIONS[reg_key]
        chunks.append({
            "content": content,
            "metadata": {
                "regulation": meta["name"],
                "celex_id": meta["celex_id"],
                "article": article,
                "chunk_index": len(chunks),
            },
        })
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


def get_embedding_api(text):
    """Get embedding from HuggingFace API (same as runtime)."""
    import requests
    headers = {"Authorization": f"Bearer {HF_TOKEN}", "Content-Type": "application/json"}
    payload = {"inputs": [text]}

    for attempt in range(3):
        try:
            resp = requests.post(HF_API_URL, headers=headers, json=payload, timeout=30)
            if resp.status_code == 503:
                time.sleep(resp.json().get("estimated_time", 10))
                continue
            resp.raise_for_status()
            data = resp.json()
            return data[0] if isinstance(data[0], list) else data
        except Exception as e:
            if attempt == 2:
                raise
            time.sleep(2)


def main():
    supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    data_dir = Path(__file__).parent / "data"

    # Clear existing
    print("Clearing existing chunks...")
    supabase.table("legal_chunks").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()

    # Process all files
    all_chunks = []
    for file_path in sorted(data_dir.glob("*.txt")):
        reg_key = file_path.stem.lower()
        if reg_key not in REGULATIONS:
            continue
        text = file_path.read_text(encoding="utf-8")
        chunks = chunk_text(text, reg_key)
        print(f"{REGULATIONS[reg_key]['name']}: {len(chunks)} chunks")
        all_chunks.extend(chunks)

    print(f"\nTotal: {len(all_chunks)} chunks")
    print("Generating embeddings via HuggingFace API...")

    # Generate embeddings via API (batched)
    batch_size = 10
    for i in tqdm(range(0, len(all_chunks), batch_size)):
        batch = all_chunks[i:i + batch_size]
        for chunk in batch:
            try:
                emb = get_embedding_api(chunk["content"])
                chunk["embedding"] = emb
            except Exception as e:
                print(f"  Error at chunk {i}: {e}")
                chunk["embedding"] = None

        # Small delay to respect rate limits
        time.sleep(0.5)

    # Filter out failed embeddings
    valid_chunks = [c for c in all_chunks if c.get("embedding") is not None]
    print(f"\nValid chunks with embeddings: {len(valid_chunks)}")

    # Insert into Supabase
    print("Inserting into Supabase...")
    inserted = 0
    for i in tqdm(range(0, len(valid_chunks), 100)):
        batch = valid_chunks[i:i + 100]
        rows = [{"content": c["content"], "embedding": c["embedding"], "metadata": c["metadata"]} for c in batch]
        result = supabase.table("legal_chunks").insert(rows).execute()
        if result.data:
            inserted += len(result.data)

    print(f"Done! Inserted {inserted} chunks")


if __name__ == "__main__":
    main()
