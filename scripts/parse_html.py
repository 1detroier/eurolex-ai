"""
Parse EUR-Lex HTML files into clean text for the seed script.
"""

import re
from pathlib import Path
from bs4 import BeautifulSoup


def clean_text(text: str) -> str:
    """Clean extracted text: remove excessive whitespace, fix encoding."""
    # Fix common encoding issues
    text = text.replace("\xa0", " ")
    text = text.replace("\u2019", "'")
    text = text.replace("\u2018", "'")
    text = text.replace("\u201c", '"')
    text = text.replace("\u201d", '"')
    
    # Remove excessive blank lines (more than 2)
    text = re.sub(r"\n{3,}", "\n\n", text)
    
    # Remove lines that are just whitespace
    lines = [line.strip() for line in text.split("\n")]
    text = "\n".join(lines)
    
    return text.strip()


def parse_eurlex_html(html_path: Path, output_path: Path):
    """Parse a EUR-Lex HTML file into clean text."""
    print(f"Parsing {html_path.name} -> {output_path.name}")
    
    html = html_path.read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")
    
    # Remove script, style, nav, header, footer elements
    for tag in soup(["script", "style", "nav", "header", "footer", "aside"]):
        tag.decompose()
    
    # Try to find the main content area
    # EUR-Lex uses various containers for the legal text
    content = None
    for selector in [
        "div#TexteOnly",           # Main text container
        "div.wrapper",             # Alternative container  
        "div.tabContent",          # Tab content
        "article",                 # Semantic article
        "body",                    # Fallback to body
    ]:
        content = soup.select_one(selector)
        if content:
            break
    
    if not content:
        content = soup.body or soup
    
    # Get text
    text = content.get_text(separator="\n")
    text = clean_text(text)
    
    output_path.write_text(text, encoding="utf-8")
    
    # Stats
    chars = len(text)
    print(f"  Output: {chars:,} chars")
    
    return chars


def main():
    data_dir = Path(__file__).parent / "data"
    
    html_files = list(data_dir.glob("*.html"))
    if not html_files:
        print("No HTML files found in scripts/data/")
        return
    
    total_chars = 0
    
    for html_file in sorted(html_files):
        txt_file = data_dir / f"{html_file.stem}.txt"
        chars = parse_eurlex_html(html_file, txt_file)
        total_chars += chars
    
    print(f"\nDone! Total: {total_chars:,} chars across {len(html_files)} files")
    
    # List output files
    print("\nGenerated .txt files:")
    for txt_file in sorted(data_dir.glob("*.txt")):
        size = txt_file.stat().st_size
        print(f"  {txt_file.name} ({size:,} bytes)")


if __name__ == "__main__":
    main()
