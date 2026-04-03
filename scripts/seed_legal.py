"""
EuroLex AI -- Seed Script
========================
Fetches EU regulations from EUR-Lex, parses articles, generates embeddings,
and inserts them into Supabase.

Usage:
    1. Install dependencies: pip install -r scripts/requirements.txt
    2. Run: python scripts/seed_legal.py
    3. Optional: python scripts/seed_legal.py --dry-run (log without inserting)
    4. Optional: python scripts/seed_legal.py --regulation gdpr (process one)

Pipeline:
    CELEX ID -> SPARQL metadata -> XHTML fetch -> Article parsing ->
    Semantic chunking -> Embeddings -> Supabase insert

Fallback:
    If EUR-Lex fetch fails, reads from scripts/data/{name}.txt

Supported regulations:
    - GDPR (32016R0679)
    - AI Act (52021PC0206)
    - Digital Services Act (32022R2065)
    - Digital Markets Act (32022R1925)
    - NIS2 Directive (32022L2555)
    - Cyber Resilience Act (32024R2847)
"""

import os
import re
import json
import hashlib
import time
import logging
from pathlib import Path
from typing import Optional

import numpy as np
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client
from tqdm import tqdm

logger = logging.getLogger(__name__)

# Load .env from project root
load_dotenv(Path(__file__).parent.parent / ".env")

# Config
CHUNK_SIZE = 500  # characters
CHUNK_OVERLAP = 50  # characters
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMS = 1536
GOOGLE_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent"
EMBEDDING_BATCH_SIZE = 5  # Google AI allows up to 5 texts per batch request


# ---------------------------------------------------------------------------
# Google AI Embeddings
# ---------------------------------------------------------------------------

def get_google_embeddings(texts: list[str], api_key: str) -> list[list[float] | None]:
    """Get embeddings for a batch of texts via Google AI Studio API.
    
    Returns a list of embeddings (or None for failed ones).
    """
    url = f"{GOOGLE_API_URL}?key={api_key}"
    results: list[list[float] | None] = [None] * len(texts)
    
    # Google API accepts max 5 texts per batch via batchEmbedContents
    batch_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key={api_key}"
    
    requests_list = []
    for i, text in enumerate(texts):
        requests_list.append({
            "model": "models/gemini-embedding-001",
            "content": {"parts": [{"text": text}]},
            "outputDimensionality": EMBEDDING_DIMS,
        })
    
    # Try batch embedding first with retry
    for attempt in range(3):
        try:
            resp = requests.post(batch_url, json={"requests": requests_list}, timeout=60)
            
            if resp.status_code == 429:
                wait = (attempt + 1) * 3
                logger.warning(f"Batch rate limited, retry {attempt+1}, waiting {wait}s")
                time.sleep(wait)
                continue
            
            resp.raise_for_status()
            data = resp.json()
            for i, emb_obj in enumerate(data.get("embeddings", [])):
                values = emb_obj.get("values", [])
                if len(values) == EMBEDDING_DIMS:
                    results[i] = values
                else:
                    logger.warning(f"Embedding {i}: expected {EMBEDDING_DIMS} dims, got {len(values)}")
            return results
        except Exception as e:
            logger.warning(f"Batch embedding failed (attempt {attempt+1}): {e}")
            if attempt < 2:
                time.sleep((attempt + 1) * 3)
    
    logger.warning("Batch embedding exhausted retries, falling back to individual")
    
    # Fallback: individual requests with retry + backoff
    for i, text in enumerate(texts):
        for attempt in range(3):
            try:
                resp = requests.post(url, json={
                    "model": "models/gemini-embedding-001",
                    "content": {"parts": [{"text": text}]},
                    "outputDimensionality": EMBEDDING_DIMS,
                }, timeout=30)
                
                if resp.status_code == 429:
                    wait = (attempt + 1) * 2
                    logger.warning(f"Rate limited on text {i}, retry {attempt+1}, waiting {wait}s")
                    time.sleep(wait)
                    continue
                
                resp.raise_for_status()
                values = resp.json().get("embedding", {}).get("values", [])
                if len(values) == EMBEDDING_DIMS:
                    results[i] = values
                break
            except Exception as e:
                logger.warning(f"Individual embedding {i} failed (attempt {attempt+1}): {e}")
                if attempt < 2:
                    time.sleep((attempt + 1) * 2)
        time.sleep(0.3)  # Rate limit courtesy between individual requests
    
    return results

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
    "nis2": {
        "name": "NIS2 Directive",
        "celex_id": "32022L2555",
        "description": "Network and Information Security Directive 2",
    },
    "cra": {
        "name": "Cyber Resilience Act",
        "celex_id": "32024R2847",
        "description": "Cyber Resilience Act",
    },
}

# --- EUR-Lex Client Constants ------------------------------------------
SPARQL_ENDPOINT = "https://publications.europa.eu/webapi/rdf/sparql"
RATE_LIMIT_DELAY = 0.5  # seconds between requests
MAX_RETRIES = 3
RETRY_BACKOFF = 2  # exponential base


class EURLexError(Exception):
    """Custom exception for EUR-Lex API errors."""
    pass


# --- EUR-Lex Client Functions ------------------------------------------

def _rate_limit():
    """Enforce minimum delay between API requests."""
    time.sleep(RATE_LIMIT_DELAY)


def sparql_query(celex_id: str) -> dict:
    """Run SPARQL query to get document metadata and manifestation URIs.

    Queries the CELLAR SPARQL endpoint for work/expression/manifestation
    triples filtered by CELEX ID and English language.

    Args:
        celex_id: The CELEX identifier (e.g., "32016R0679" for GDPR).

    Returns:
        Dict with keys: work_uri, expression_uri, manifestation_uri, doc_type.

    Raises:
        EURLexError: If SPARQL query fails or returns no results.
    """
    query = f"""
    PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    SELECT ?work ?expression ?manifestation ?type WHERE {{
      ?work cdm:resource_legal_id_celex ?celex .
      FILTER(?celex = "{celex_id}"^^xsd:string) .
      ?expression cdm:expression_belongs_to_work ?work .
      ?expression cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
      ?manifestation cdm:manifestation_manifests_expression ?expression .
      ?manifestation cdm:manifestation_type ?type .
    }}
    LIMIT 10
    """

    _rate_limit()

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.post(
                SPARQL_ENDPOINT,
                data={"query": query},
                headers={
                    "Accept": "application/sparql-results+json",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                timeout=30,
            )
            resp.raise_for_status()

            data = resp.json()
            results = data.get("results", {}).get("bindings", [])

            if not results:
                raise EURLexError(
                    f"SPARQL returned no results for CELEX {celex_id}"
                )

            # Extract URIs -- prefer XHTML manifestation type
            xhtml_binding = None
            for b in results:
                if b.get("type", {}).get("value") == "xhtml":
                    xhtml_binding = b
                    break
            binding = xhtml_binding or results[0]

            return {
                "work_uri": binding.get("work", {}).get("value", ""),
                "expression_uri": binding.get("expression", {}).get("value", ""),
                "manifestation_uri": binding.get("manifestation", {}).get("value", ""),
                "doc_type": binding.get("type", {}).get("value", ""),
            }

        except requests.RequestException as e:
            wait = RETRY_BACKOFF ** attempt
            logger.warning(
                f"SPARQL attempt {attempt + 1}/{MAX_RETRIES} failed for "
                f"{celex_id}: {e}. Retrying in {wait}s..."
            )
            time.sleep(wait)

    raise EURLexError(
        f"SPARQL query failed after {MAX_RETRIES} retries for CELEX {celex_id}"
    )


def fetch_xhtml(manifestation_uri: str) -> str:
    """Fetch XHTML content via content negotiation.

    Handles 300 Multiple-Choice responses by following the DOC_1 link.

    Args:
        manifestation_uri: Full URI from SPARQL query.

    Returns:
        XHTML string (complete document).

    Raises:
        EURLexError: If fetch fails after retries.
    """
    _rate_limit()
    headers = {"Accept": "application/xhtml+xml"}

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(manifestation_uri, headers=headers, timeout=60)

            # Handle 300 Multiple-Choice: follow DOC_1 link
            if resp.status_code == 300:
                import re as _re
                doc_match = _re.search(r'href="([^"]*DOC_1[^"]*)"', resp.text)
                if doc_match:
                    doc_url = doc_match.group(1)
                    logger.info(f"  Following 300 redirect to DOC_1")
                    resp = requests.get(doc_url, headers=headers, timeout=60)

            resp.raise_for_status()
            return resp.text

        except requests.RequestException as e:
            wait = RETRY_BACKOFF ** attempt
            logger.warning(
                f"XHTML fetch attempt {attempt + 1}/{MAX_RETRIES} failed: "
                f"{e}. Retrying in {wait}s..."
            )
            time.sleep(wait)

    raise EURLexError(
        f"Failed to fetch XHTML after {MAX_RETRIES} retries: {manifestation_uri}"
    )


def parse_articles(xhtml: str) -> list[dict]:
    """Extract articles from XHTML content.

    Looks for <div id="art_N"> patterns (EUR-Lex standard structure).
    Extracts article number, title, and body text.
    Falls back to full-text extraction if no article divs found.

    Args:
        xhtml: Raw XHTML string.

    Returns:
        List of dicts with keys: article_number, title, body, sub_paragraphs.
    """
    soup = BeautifulSoup(xhtml, "lxml-xml")
    articles = []

    # Try standard EUR-Lex article divs: <div id="art_1">, <div id="art_2">, etc.
    # Use $ anchor to exclude sub-elements like art_1.tit_1
    art_divs = soup.find_all("div", id=re.compile(r"^art_\d+$"))

    if art_divs:
        for div in art_divs:
            article_num = str(div.get("id", "")).replace("art_", "")

            # Extract title: look for <p class="title"> or <h2> or <p class="sti-art">
            title_tag = (
                div.find("p", class_="title")
                or div.find("h2")
                or div.find("p", class_=re.compile(r"sti-art"))
            )
            title = title_tag.get_text(strip=True) if title_tag else f"Article {article_num}"

            # Extract body text (strip tags but preserve structure)
            body_parts = []
            sub_paragraphs = []

            for child in div.find_all(["p", "div"], recursive=True):
                text = child.get_text(separator=" ", strip=True)
                if text and len(text) > 5:
                    # Check for sub-paragraph markers: (a), (b), 1., 2.
                    sp_match = re.match(r"^\(?([a-z]|\d+)[\.\)]\s*", text)
                    if sp_match:
                        sub_paragraphs.append({
                            "id": sp_match.group(1),
                            "text": text,
                        })
                    body_parts.append(text)

            body = "\n".join(body_parts)

            articles.append({
                "article_number": int(article_num) if article_num.isdigit() else 0,
                "title": title,
                "body": body,
                "sub_paragraphs": sub_paragraphs,
            })

        logger.info(f"Parsed {len(articles)} articles from XHTML")
        return articles

    # Fallback: no art_N divs found -- extract full text
    logger.warning(
        "No <div id='art_N'> found in XHTML. "
        "Falling back to full-text extraction."
    )

    # Strip all tags, get clean text
    full_text = soup.get_text(separator="\n", strip=True)

    # Try to split by "Article N" pattern in text
    article_splits = re.split(r"(Article\s+\d+)", full_text)

    if len(article_splits) > 1:
        # Recombine title + body pairs
        for i in range(1, len(article_splits), 2):
            title = article_splits[i].strip()
            body = article_splits[i + 1].strip() if i + 1 < len(article_splits) else ""
            num_match = re.search(r"\d+", title)
            articles.append({
                "article_number": int(num_match.group()) if num_match else 0,
                "title": title,
                "body": body,
                "sub_paragraphs": [],
            })

        logger.info(f"Fallback parsed {len(articles)} articles by text splitting")
        return articles

    # Last resort: return entire text as single chunk
    logger.warning("Could not split into articles. Returning full text as single chunk.")
    return [{
        "article_number": 0,
        "title": "Full Document",
        "body": full_text,
        "sub_paragraphs": [],
    }]


# --- Semantic Chunking (Phase 2) --------------------------------------

MAX_ARTICLE_CHARS = 3200  # ~800 tokens, threshold for subdivision
SUB_PARAGRAPH_PATTERN = re.compile(
    r"(?=\n?\s*(?:\(([a-z])\)|(\d+)\.\s|[IVXLC]+\.\s))"
)


def subdivide_article(article: dict, max_chars: int = MAX_ARTICLE_CHARS) -> list[dict]:
    """Split long articles by sub-paragraphs.

    If article body <= max_chars, returns it as-is.
    Otherwise splits by (a), (b), (c) or 1., 2., 3. patterns.

    Each sub-chunk gets an identifier like "Article 5(a)", "Article 5(b)".

    Args:
        article: Dict with article_number, title, body, sub_paragraphs.
        max_chars: Maximum characters before subdivision triggers.

    Returns:
        List of article dicts (may be 1 if short enough).
    """
    body = article["body"]

    if len(body) <= max_chars:
        return [article]

    # Split body by sub-paragraph markers
    # Pattern: (a), (b), ... or 1., 2., ... at line start
    parts = re.split(
        r"\n\s*(?=\([a-z]\)\s|\d+\.\s|[IVXLC]+\.\s)",
        body,
    )

    # Filter out empty/very short parts
    parts = [p.strip() for p in parts if len(p.strip()) > 10]

    if len(parts) <= 1:
        # Couldn't split meaningfully, return original
        return [article]

    sub_articles = []
    for i, part in enumerate(parts):
        # Extract the sub-paragraph marker if present
        marker_match = re.match(r"^\(?([a-z]|\d+|[IVXLC]+)\)?[\.\)]\s*", part)
        sub_id = marker_match.group(1) if marker_match else str(i + 1)

        # Build identifier: "Article 5(a)" or "Article 5(1)"
        art_num = article["article_number"]
        identifier = f"Article {art_num}({sub_id})" if art_num else f"Sub-paragraph ({sub_id})"

        sub_articles.append({
            "article_number": art_num,
            "title": article["title"],
            "body": part,
            "sub_paragraphs": [],
            "_sub_id": sub_id,
            "_identifier": identifier,
        })

    return sub_articles


def _content_hash(content: str, metadata: dict) -> str:
    """Generate SHA-256 hash for deduplication.

    Hashes normalized content + key metadata fields.
    """
    normalized = " ".join(content.split()).lower()
    key = f"{metadata.get('celex_id', '')}:{metadata.get('article', '')}:{normalized}"
    return hashlib.sha256(key.encode()).hexdigest()


def build_article_chunks(
    articles: list[dict],
    regulation_key: str,
) -> list[dict]:
    """Convert parsed articles into chunks — one chunk per article.

    Args:
        articles: List from parse_articles().
        regulation_key: Key in REGULATIONS dict.

    Returns:
        List of {content, metadata} dicts ready for embedding.
    """
    meta = REGULATIONS[regulation_key]
    chunks = []

    for i, article in enumerate(articles):
        art_num = article["article_number"]
        art_title = article.get("title", "")
        body = article["body"]

        # Clean duplicated content (XHTML sometimes repeats paragraphs)
        lines = body.split("\n")
        seen = []
        for line in lines:
            stripped = line.strip()
            if stripped and stripped not in seen:
                seen.append(stripped)
        clean_body = "\n".join(seen)

        # Truncate very long articles to ~4000 chars
        if len(clean_body) > 4000:
            clean_body = clean_body[:4000] + "…"

        # Build chunk with article context prefix
        article_label = f"Article {art_num}"
        prefix = f"[{meta['name']} - {article_label}"
        if art_title:
            prefix += f" - {art_title}"
        prefix += "]\n\n"

        content = prefix + clean_body

        chunk_meta = {
            "regulation": meta["name"],
            "celex_id": meta["celex_id"],
            "article": article_label,
            "article_title": art_title,
            "chunk_index": i,
        }

        chunk_meta["content_hash"] = _content_hash(content, chunk_meta)

        chunks.append({
            "content": content,
            "metadata": chunk_meta,
        })

    return chunks


def fetch_regulation_xhtml(celex_id: str, lang: str = "ENG") -> str:
    """Fetch XHTML for a regulation from EUR-Lex.

    Strategy:
    1. SPARQL query to get manifestation URI
    2. Content negotiation to fetch XHTML
    3. If SPARQL fails, try direct content negotiation on EUR-Lex

    Args:
        celex_id: CELEX identifier (e.g., "32016R0679").
        lang: Language code (default: "ENG").

    Returns:
        XHTML string.
    """
    try:
        sparql_result = sparql_query(celex_id)
        manifestation_uri = sparql_result["manifestation_uri"]
        logger.info(f"SPARQL returned manifestation: {manifestation_uri}")
        return fetch_xhtml(manifestation_uri)

    except EURLexError as e:
        logger.warning(f"SPARQL path failed: {e}. Trying direct content negotiation...")

    # Fallback: direct content negotiation on EUR-Lex
    # Pattern: http://publications.europa.eu/resource/celex/{celex_id}?lang=eng
    fallback_url = f"http://publications.europa.eu/resource/celex/{celex_id}?lang={lang.lower()}"
    logger.info(f"Fallback URL: {fallback_url}")

    try:
        return fetch_xhtml(fallback_url)
    except EURLexError:
        raise EURLexError(
            f"All fetch strategies failed for CELEX {celex_id}. "
            f"SPARQL and direct content negotiation both failed."
        )


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
                "content_hash": _content_hash(chunk_content, {
                    "regulation": meta["name"],
                    "celex_id": meta["celex_id"],
                    "article": article or "Unknown",
                }),
            },
        })

        start += CHUNK_SIZE - CHUNK_OVERLAP

    return chunks


def process_regulation_from_xhtml(
    xhtml: str,
    regulation_key: str,
    api_key: str,
) -> list[dict]:
    """Process XHTML into chunks with embeddings (EUR-Lex pipeline).

    Args:
        xhtml: Raw XHTML from EUR-Lex.
        regulation_key: Key in REGULATIONS dict.
        api_key: Google AI API key for embeddings.

    Returns:
        List of chunks with embeddings attached.
    """
    meta = REGULATIONS[regulation_key]
    print(f"\n  Parsing articles from XHTML...")
    articles = parse_articles(xhtml)
    print(f"  Found {len(articles)} articles")

    print(f"  Building semantic chunks...")
    chunks = build_article_chunks(articles, regulation_key)
    print(f"  Generated {len(chunks)} chunks")

    if not chunks:
        return []

    # Generate embeddings via Google AI API
    print(f"  Generating embeddings ({len(chunks)} texts)...")
    texts = [c["content"] for c in chunks]
    
    # Process in batches
    for i in tqdm(range(0, len(texts), EMBEDDING_BATCH_SIZE)):
        batch_texts = texts[i:i + EMBEDDING_BATCH_SIZE]
        batch_chunks = chunks[i:i + EMBEDDING_BATCH_SIZE]
        embeddings = get_google_embeddings(batch_texts, api_key)
        
        for chunk, emb in zip(batch_chunks, embeddings):
            if emb is not None:
                chunk["embedding"] = emb

    return chunks


def process_regulation_from_file(
    file_path: Path,
    regulation_key: str,
    api_key: str,
) -> list[dict]:
    """Fallback: process .txt file with old character-based chunking.

    Used when EUR-Lex fetch fails.
    """
    print(f"\n  Reading from file: {file_path.name}")
    text = file_path.read_text(encoding="utf-8")
    print(f"  Text length: {len(text):,} chars")

    chunks = chunk_text(text, regulation_key)
    print(f"  Chunks: {len(chunks)}")

    if not chunks:
        return []

    print(f"  Generating embeddings...")
    texts = [c["content"] for c in chunks]
    
    # Process in batches
    for i in tqdm(range(0, len(texts), EMBEDDING_BATCH_SIZE)):
        batch_texts = texts[i:i + EMBEDDING_BATCH_SIZE]
        batch_chunks = chunks[i:i + EMBEDDING_BATCH_SIZE]
        embeddings = get_google_embeddings(batch_texts, api_key)
        
        for chunk, emb in zip(batch_chunks, embeddings):
            if emb is not None:
                chunk["embedding"] = emb

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

    # Filter out chunks that failed embedding
    valid_chunks = [c for c in chunks if "embedding" in c]
    failed = len(chunks) - len(valid_chunks)
    if failed > 0:
        print(f"  WARNING: {failed} chunks missing embeddings (rate limited), skipping")

    # Batch insert (Supabase handles up to 1000 rows per request)
    batch_size = 100
    for i in tqdm(range(0, len(valid_chunks), batch_size)):
        batch = valid_chunks[i : i + batch_size]
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
    import argparse

    parser = argparse.ArgumentParser(
        description="Seed EU regulation chunks into Supabase via EUR-Lex pipeline."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Log chunks without inserting to Supabase.",
    )
    parser.add_argument(
        "--regulation",
        type=str,
        default=None,
        help="Process only one regulation (e.g., 'gdpr', 'ai-act').",
    )
    args = parser.parse_args()

    data_dir = Path(__file__).parent / "data"

    # Determine which regulations to process
    if args.regulation:
        if args.regulation not in REGULATIONS:
            print(f"ERROR: Unknown regulation '{args.regulation}'")
            print(f"Available: {', '.join(REGULATIONS.keys())}")
            return
        regulations_to_process = {args.regulation: REGULATIONS[args.regulation]}
    else:
        regulations_to_process = REGULATIONS

    print(f"\n{'='*60}")
    print(f"  EuroLex AI -- Seed Pipeline")
    print(f"  Regulations: {len(regulations_to_process)}")
    print(f"  Mode: {'DRY RUN' if args.dry_run else 'LIVE INSERT'}")
    print(f"{'='*60}")

    # Get Google AI API key
    api_key = os.environ.get("GOOGLE_AI_API_KEY")
    if not api_key:
        print("ERROR: Missing GOOGLE_AI_API_KEY in .env")
        return

    print(f"\nEmbedding model: {EMBEDDING_MODEL} (Google AI Studio, {EMBEDDING_DIMS} dims)")

    # Process each regulation
    all_chunks = []
    stats = {"success": 0, "fallback": 0, "failed": 0}

    for reg_key, meta in regulations_to_process.items():
        celex_id = meta["celex_id"]
        print(f"\n{'-'*60}")
        print(f"  [{meta['name']}] CELEX: {celex_id}")
        print(f"{'-'*60}")

        chunks = []

        # Try EUR-Lex pipeline first
        try:
            print(f"  Fetching XHTML from EUR-Lex...")
            xhtml = fetch_regulation_xhtml(celex_id)
            print(f"  XHTML fetched ({len(xhtml):,} chars)")
            chunks = process_regulation_from_xhtml(xhtml, reg_key, api_key)
            stats["success"] += 1
        except EURLexError as e:
            print(f"  EUR-Lex fetch FAILED: {e}")
            print(f"  Trying .txt file fallback...")

            # Fallback to .txt file
            txt_file = data_dir / f"{reg_key}.txt"
            if txt_file.exists():
                chunks = process_regulation_from_file(txt_file, reg_key, api_key)
                stats["fallback"] += 1
            else:
                print(f"  No fallback file found: {txt_file}")
                stats["failed"] += 1
                continue

        if chunks:
            print(f"  Result: {len(chunks)} chunks ready")
            all_chunks.extend(chunks)
        else:
            print(f"  WARNING: No chunks generated for {meta['name']}")
            stats["failed"] += 1

    if not all_chunks:
        print(f"\n{'='*60}")
        print("  No chunks generated for any regulation. Check logs.")
        print(f"{'='*60}")
        return

    # Summary
    print(f"\n{'='*60}")
    print(f"  Pipeline Summary")
    print(f"{'='*60}")
    print(f"  Total chunks: {len(all_chunks)}")
    print(f"  EUR-Lex direct: {stats['success']}")
    print(f"  File fallback:  {stats['fallback']}")
    print(f"  Failed:         {stats['failed']}")

    # Deduplicate by content hash
    seen_hashes = set()
    unique_chunks = []
    for chunk in all_chunks:
        h = chunk["metadata"].get("content_hash", "")
        if h and h in seen_hashes:
            continue
        seen_hashes.add(h)
        unique_chunks.append(chunk)

    if len(unique_chunks) < len(all_chunks):
        print(f"  Deduplicated: {len(all_chunks)} -> {len(unique_chunks)} chunks")
    all_chunks = unique_chunks

    if args.dry_run:
        print(f"\n  DRY RUN -- Not inserting to Supabase.")
        print(f"\n  Sample chunks:")
        for chunk in all_chunks[:5]:
            m = chunk["metadata"]
            print(f"    [{m['article']}] ({m['unit_type']}) {chunk['content'][:80]}...")
        print(f"\n  Total unique chunks that would be inserted: {len(all_chunks)}")
        return

    # Insert into Supabase
    inserted = insert_into_supabase(all_chunks)
    print(f"\n  Done! Inserted {inserted} chunks into Supabase")


if __name__ == "__main__":
    main()
