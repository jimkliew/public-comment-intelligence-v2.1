"""Download and extract text from Regulations.gov comment attachments.

Handles PDF and DOCX files. Falls back gracefully on unsupported formats.
"""

import io

import httpx
import pdfplumber
from docx import Document as DocxDocument


SUPPORTED_FORMATS = {"pdf", "docx", "doc"}
MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024  # 2 MB — skip large PDFs, note them instead
MAX_TEXT_LENGTH = 3_000  # First 3000 chars — enough for classification, fast extraction


def extract_text_from_pdf(content: bytes) -> str:
    """Extract text from PDF bytes using pdfplumber. Stops early once we have enough."""
    text_parts = []
    total_len = 0
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
                    total_len += len(page_text)
                    if total_len >= MAX_TEXT_LENGTH:
                        break  # We have enough — don't process remaining pages
    except Exception as e:
        print(f"  [attachments] PDF extraction error: {e}")
        return ""
    return "\n\n".join(text_parts)[:MAX_TEXT_LENGTH]


def extract_text_from_docx(content: bytes) -> str:
    """Extract text from DOCX bytes using python-docx."""
    text_parts = []
    try:
        doc = DocxDocument(io.BytesIO(content))
        for para in doc.paragraphs:
            if para.text.strip():
                text_parts.append(para.text)
    except Exception as e:
        print(f"  [attachments] DOCX extraction error: {e}")
        return ""
    return "\n\n".join(text_parts)[:MAX_TEXT_LENGTH]


async def download_attachment(url: str, timeout: int = 30) -> bytes | None:
    """Download an attachment file. Returns bytes or None on failure.

    Note: downloads.regulations.gov requires a browser-like User-Agent header.
    Without it, many attachments return 403. (See memory/feedback_attachment_parsing.md)
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
        "Accept": "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,*/*",
    }
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                if len(resp.content) > MAX_ATTACHMENT_SIZE:
                    print(f"  [attachments] Skipping — too large ({len(resp.content)} bytes)")
                    return None
                return resp.content
            elif resp.status_code == 403:
                # Some attachments are access-restricted — skip gracefully
                return None
            else:
                print(f"  [attachments] Download failed: HTTP {resp.status_code}")
                return None
    except Exception as e:
        print(f"  [attachments] Download error: {e}")
        return None


def extract_text(content: bytes, format: str) -> str:
    """Extract text from attachment bytes based on format."""
    fmt = format.lower().strip(".")
    if fmt == "pdf":
        return extract_text_from_pdf(content)
    elif fmt in ("docx", "doc"):
        return extract_text_from_docx(content)
    else:
        return ""


async def fetch_attachment_text(comment_id: str, included: list[dict]) -> str:
    """Given the 'included' array from a Regulations.gov comment response,
    download and extract text from all supported attachments.

    Args:
        comment_id: For logging
        included: The 'included' array from the API response

    Returns:
        Combined extracted text from all attachments, or empty string.
    """
    all_text = []

    for att in included:
        attrs = att.get("attributes", {})
        file_formats = attrs.get("fileFormats", [])

        for fmt_entry in file_formats:
            # fileFormats is a list of DICTS: {'fileUrl': '...', 'format': 'pdf', 'size': 123}
            # NOT a list of strings (common mistake — see memory/feedback_attachment_parsing.md)
            if isinstance(fmt_entry, dict):
                url = fmt_entry.get("fileUrl", "")
                fmt = fmt_entry.get("format", "")
                size = fmt_entry.get("size", 0)
            elif isinstance(fmt_entry, str):
                # Fallback: sometimes the API returns just URLs as strings
                url = fmt_entry
                fmt = url.rsplit(".", 1)[-1] if "." in url else ""
                size = 0
            else:
                continue

            if not url:
                continue

            fmt_lower = fmt.lower().strip(".")
            if fmt_lower not in SUPPORTED_FORMATS:
                continue

            if size and size > MAX_ATTACHMENT_SIZE:
                print(f"  [attachments] {comment_id}: Skipping {fmt} ({size} bytes — too large)")
                continue

            print(f"  [attachments] {comment_id}: Downloading {fmt_lower} ({size or '?'} bytes)...")
            content = await download_attachment(url)
            if content:
                text = extract_text(content, fmt_lower)
                if text and len(text.strip()) > 20:
                    all_text.append(text)
                    print(f"  [attachments] {comment_id}: Extracted {len(text)} chars from {fmt_lower}")
                else:
                    print(f"  [attachments] {comment_id}: No text extracted from {fmt_lower}")

    return "\n\n---\n\n".join(all_text)
