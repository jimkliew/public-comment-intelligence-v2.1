"""Tests for text normalization, hashing, and commenter classification."""

import pytest

from processing.normalize import (
    normalize_text,
    normalize_for_hash,
    compute_hash,
    is_stub_comment,
    comment_word_count,
    extract_commenter_info,
)


# ---------------------------------------------------------------------------
# normalize_text
# ---------------------------------------------------------------------------

class TestNormalizeText:
    def test_html_entities(self):
        assert "AT&T" in normalize_text("AT&amp;T")
        assert "it's" in normalize_text("it&#39;s")

    def test_html_tags_stripped(self):
        result = normalize_text("<b>bold</b> and <i>italic</i>")
        assert "<b>" not in result
        assert "bold" in result

    def test_br_becomes_newline(self):
        result = normalize_text("line1<br/>line2")
        assert "\n" in result

    def test_urls_stripped(self):
        result = normalize_text("Visit https://www.epa.gov/pfas for details")
        assert "https://" not in result
        assert "details" in result

    def test_whitespace_collapsed(self):
        result = normalize_text("too   many    spaces")
        assert "  " not in result

    def test_empty_string(self):
        assert normalize_text("") == ""
        assert normalize_text(None) == ""

    def test_unicode_normalization(self):
        result = normalize_text("\ufb01nance")  # fi ligature
        assert "fi" in result


# ---------------------------------------------------------------------------
# normalize_for_hash
# ---------------------------------------------------------------------------

class TestNormalizeForHash:
    def test_lowercased(self):
        assert normalize_for_hash("HELLO World") == "hello world"

    def test_punctuation_stripped(self):
        result = normalize_for_hash("Hello, world!")
        assert "," not in result
        assert "!" not in result

    def test_identical_hashes_for_equivalent_text(self):
        a = normalize_for_hash("I support this rule.")
        b = normalize_for_hash("  I   SUPPORT  this  rule  ")
        assert a == b

    def test_newlines_flattened(self):
        result = normalize_for_hash("line1\nline2\nline3")
        assert "\n" not in result


# ---------------------------------------------------------------------------
# compute_hash
# ---------------------------------------------------------------------------

class TestComputeHash:
    def test_deterministic(self):
        h1 = compute_hash("Test comment")
        h2 = compute_hash("Test comment")
        assert h1 == h2

    def test_different_text_different_hash(self):
        assert compute_hash("Comment A") != compute_hash("Comment B")

    def test_case_insensitive(self):
        assert compute_hash("Hello World") == compute_hash("hello world")

    def test_sha256_length(self):
        assert len(compute_hash("test")) == 64


# ---------------------------------------------------------------------------
# is_stub_comment
# ---------------------------------------------------------------------------

class TestIsStubComment:
    @pytest.mark.parametrize("text", [
        "",
        None,
        ".",
        "-",
        "N/A",
        "n/a",
        "See attached",
        "see attachment",
        "Please see attached document",
        "test",
        "no comment",
        "hi",
        "ok",
    ])
    def test_stubs_detected(self, text):
        assert is_stub_comment(text) is True

    @pytest.mark.parametrize("text", [
        "I strongly support the proposed PFAS regulation because clean drinking water is essential for public health.",
        "The compliance costs estimated by EPA are understated. Our utility serves 50,000 customers and we estimate $12M in capital costs.",
        "Under 42 USC 300f, EPA has broad authority to regulate contaminants.",
    ])
    def test_substantive_comments_not_stubs(self, text):
        assert is_stub_comment(text) is False

    def test_short_but_not_pattern_match(self):
        # 4 words, doesn't match stub pattern — not a stub
        assert is_stub_comment("I oppose this rule strongly") is False


# ---------------------------------------------------------------------------
# comment_word_count
# ---------------------------------------------------------------------------

class TestCommentWordCount:
    def test_basic(self):
        assert comment_word_count("one two three") == 3

    def test_html_stripped_before_count(self):
        assert comment_word_count("<b>one</b> <i>two</i> three") == 3

    def test_empty(self):
        assert comment_word_count("") == 0
        assert comment_word_count(None) == 0


# ---------------------------------------------------------------------------
# extract_commenter_info
# ---------------------------------------------------------------------------

class TestExtractCommenterInfo:
    def test_individual(self):
        data = {"attributes": {"firstName": "Jane", "lastName": "Doe"}}
        info = extract_commenter_info(data)
        assert info["commenter_type"] == "individual"
        assert info["name"] == "Jane Doe"

    def test_anonymous(self):
        data = {"attributes": {}}
        info = extract_commenter_info(data)
        assert info["commenter_type"] == "anonymous"

    def test_government_from_category(self):
        data = {"attributes": {"firstName": "John", "lastName": "Smith", "category": "Federal Government"}}
        assert extract_commenter_info(data)["commenter_type"] == "government"

    def test_law_firm(self):
        data = {"attributes": {"firstName": "A", "lastName": "B", "organization": "Baker McKenzie LLP"}}
        assert extract_commenter_info(data)["commenter_type"] == "law_firm"

    def test_trade_association(self):
        data = {"attributes": {"firstName": "A", "lastName": "B", "organization": "American Water Works Association"}}
        assert extract_commenter_info(data)["commenter_type"] == "trade_association"

    def test_academic(self):
        data = {"attributes": {"firstName": "A", "lastName": "B", "organization": "MIT Research Lab"}}
        assert extract_commenter_info(data)["commenter_type"] == "academic"

    def test_government_from_org_name(self):
        data = {"attributes": {"firstName": "A", "lastName": "B", "organization": "City of Chicago Water Department"}}
        assert extract_commenter_info(data)["commenter_type"] == "government"

    def test_generic_org(self):
        data = {"attributes": {"firstName": "A", "lastName": "B", "organization": "Acme Corp"}}
        assert extract_commenter_info(data)["commenter_type"] == "organization"
