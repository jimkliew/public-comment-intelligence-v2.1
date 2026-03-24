"""Text normalization pipeline for public comments."""

import hashlib
import html
import re
import unicodedata

# Patterns that indicate an attachment-only or stub comment
STUB_PATTERNS = [
    r"^see\s+attach",
    r"^please\s+see\s+attach",
    r"^attached\b",
    r"^refer\s+to\s+attach",
    r"^comment\s+attach",
    r"^see\s+enclosed",
    r"^see\s+the\s+attach",
    r"^please\s+refer\s+to",
    r"^n/?a$",
    r"^no\s+comment",
    r"^test$",
    r"^\.$",
    r"^-$",
]

_stub_re = re.compile("|".join(STUB_PATTERNS), re.IGNORECASE)

# Minimum word count to consider a comment as having substantive body text
MIN_WORDS_FOR_ANALYSIS = 8


def normalize_text(text: str) -> str:
    """Normalize comment text for deduplication and analysis.

    Pipeline:
    1. Decode HTML entities (&amp; &#39; etc.)
    2. Unicode NFKC normalization
    3. Strip HTML tags and <br/> to spaces
    4. Strip URLs
    5. Collapse whitespace
    """
    if not text:
        return ""

    # Decode HTML entities first (handles &#39; &amp; &lt; etc.)
    text = html.unescape(text)

    # Unicode normalization
    text = unicodedata.normalize("NFKC", text)

    # Replace <br>, <br/>, <p>, </p> with newlines first (preserve structure)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</?p\s*/?>", "\n", text, flags=re.IGNORECASE)

    # Strip remaining HTML tags
    text = re.sub(r"<[^>]+>", " ", text)

    # Strip URLs
    text = re.sub(r"https?://\S+", " ", text)

    # Collapse multiple newlines
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Collapse horizontal whitespace (preserve newlines)
    text = re.sub(r"[^\S\n]+", " ", text)

    return text.strip()


def normalize_for_hash(text: str) -> str:
    """Aggressive normalization for exact duplicate detection."""
    text = normalize_text(text).lower()
    # Flatten newlines to spaces for hash comparison
    text = text.replace("\n", " ")
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def compute_hash(text: str) -> str:
    """SHA-256 hash of aggressively normalized text."""
    normalized = normalize_for_hash(text)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def is_stub_comment(text: str) -> bool:
    """Check if a comment is just a stub/attachment reference with no real body text.

    Returns True if the comment body is effectively empty or just says
    'see attached' or similar.
    """
    if not text:
        return True

    cleaned = normalize_text(text).strip()

    if not cleaned:
        return True

    # Check word count
    words = cleaned.split()
    if len(words) < MIN_WORDS_FOR_ANALYSIS:
        # Short text — check if it matches stub patterns
        flat = " ".join(words)
        if _stub_re.search(flat):
            return True
        # Even without matching a pattern, < 3 words is always a stub
        if len(words) < 3:
            return True

    return False


def comment_word_count(text: str) -> int:
    """Count words in normalized comment text."""
    if not text:
        return 0
    return len(normalize_text(text).split())


def extract_commenter_info(comment_data: dict) -> dict:
    """Extract commenter metadata from Regulations.gov comment attributes."""
    attrs = comment_data.get("attributes", {})

    first = attrs.get("firstName", "") or ""
    last = attrs.get("lastName", "") or ""
    org = attrs.get("organization", "") or ""
    city = attrs.get("city", "") or ""
    state = attrs.get("stateProvinceRegion", "") or ""
    category = attrs.get("category", "") or ""

    commenter_type = "individual"
    cat_lower = category.lower() if category else ""
    org_lower = org.lower() if org else ""

    if any(kw in cat_lower for kw in ["government", "federal", "state", "local"]):
        commenter_type = "government"
    elif any(kw in cat_lower for kw in ["congress", "senator", "representative"]):
        commenter_type = "congressional"
    elif any(kw in org_lower for kw in ["law firm", "llp", "attorneys", "legal"]):
        commenter_type = "law_firm"
    elif any(kw in org_lower for kw in [
        "association", "institute", "federation", "council", "coalition",
        "chamber", "society", "board", "commission",
    ]):
        commenter_type = "trade_association"
    elif any(kw in org_lower for kw in ["university", "college", "research", "lab"]):
        commenter_type = "academic"
    elif any(kw in org_lower for kw in [
        "city of", "county of", "state of", "town of", "village of",
        "department of", "district", "authority", "utility", "utilities",
        "water", "municipal",
    ]):
        commenter_type = "government"
    elif org:
        commenter_type = "organization"
    elif not first and not last:
        commenter_type = "anonymous"

    return {
        "name": f"{first} {last}".strip(),
        "organization": org,
        "commenter_type": commenter_type,
        "city": city,
        "state": state,
    }
