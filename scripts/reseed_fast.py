"""
Fast re-seed using HuggingFace API with batched requests.
"""
import os, json, time, re, requests
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / ".env")

HF_URL = "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-mpnet-base-v2/pipeline/feature-extraction"
HF_HEADERS = {"Authorization": f"Bearer {os.environ['HUGGINGFACE_API_KEY']}", "Content-Type": "application/json"}

REGULATIONS = {
    "gdpr": {"name": "GDPR", "celex_id": "32016R0679"},
    "ai-act": {"name": "AI Act", "celex_id": "52021PC0206"},
    "dsa": {"name": "Digital Services Act", "celex_id": "32022R2065"},
    "dma": {"name": "Digital Markets Act", "celex_id": "32022R1925"},
}

CHUNK_SIZE, CHUNK_OVERLAP = 500, 50


def chunk_text(text, reg_key):
    chunks, start = [], 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        content = text[start:end].strip()
        if len(content) < 50:
            break
        preceding = text[max(0, start-500):start]
        m = list(re.finditer(r"(?:Article|Art\.)\s+(\d+)", preceding))
        article = f"Article {m[-1].group(1)}" if m else "Unknown"
        chunks.append({"content": content, "metadata": {
            "regulation": REGULATIONS[reg_key]["name"],
            "celex_id": REGULATIONS[reg_key]["celex_id"],
            "article": article, "chunk_index": len(chunks)
        }})
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


def get_embeddings_batch(texts, retries=3):
    """Get embeddings for multiple texts in one API call."""
    for attempt in range(retries):
        try:
            resp = requests.post(HF_URL, headers=HF_HEADERS, json={"inputs": texts}, timeout=120)
            if resp.status_code == 503:
                time.sleep(resp.json().get("estimated_time", 5))
                continue
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            if attempt == retries - 1:
                print(f"  FAILED: {e}")
                return None
            time.sleep(2)


def main():
    supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    data_dir = Path(__file__).parent / "data"

    # Build chunks
    all_chunks = []
    for f in sorted(data_dir.glob("*.txt")):
        key = f.stem.lower()
        if key in REGULATIONS:
            chunks = chunk_text(f.read_text(encoding="utf-8"), key)
            print(f"{REGULATIONS[key]['name']}: {len(chunks)} chunks")
            all_chunks.extend(chunks)

    print(f"\nTotal: {len(all_chunks)} chunks")
    print("Generating embeddings via API (batched)...\n")

    # Process in batches of 20 (HF API handles arrays)
    BATCH = 20
    success = 0
    for i in range(0, len(all_chunks), BATCH):
        batch = all_chunks[i:i+BATCH]
        texts = [c["content"] for c in batch]
        embeddings = get_embeddings_batch(texts)

        if embeddings:
            rows = []
            for chunk, emb in zip(batch, embeddings):
                rows.append({"content": chunk["content"], "embedding": emb, "metadata": chunk["metadata"]})

            result = supabase.table("legal_chunks").insert(rows).execute()
            if result.data:
                success += len(result.data)

        pct = min(100, (i + BATCH) * 100 // len(all_chunks))
        print(f"\r  Progress: {pct}% ({success} inserted)", end="", flush=True)

    print(f"\n\nDone! Inserted {success} chunks")


if __name__ == "__main__":
    main()
