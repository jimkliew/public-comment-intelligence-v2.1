"""Regulations.gov API client — fetch dockets, documents, and comments."""

import asyncio
import httpx
from config import get_settings

BASE_URL = "https://api.regulations.gov/v4"


def _headers():
    return {"X-Api-Key": get_settings().regulations_gov_api_key}


async def get_docket(docket_id: str) -> dict:
    """Get docket metadata."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{BASE_URL}/dockets/{docket_id}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def get_documents_for_docket(docket_id: str,
                                   document_type: str | None = "Proposed Rule") -> list[dict]:
    """Get all documents for a docket."""
    params = {
        "filter[docketId]": docket_id,
        "page[size]": 25,
    }
    if document_type:
        params["filter[documentType]"] = document_type

    all_docs = []
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            resp = await client.get(f"{BASE_URL}/documents", params=params, headers=_headers())
            resp.raise_for_status()
            data = resp.json()
            all_docs.extend(data.get("data", []))
            next_url = data.get("links", {}).get("next")
            if not next_url:
                break
            # Regulations.gov next links are full URLs
            resp = await client.get(next_url, headers=_headers())
            resp.raise_for_status()
            data = resp.json()
            all_docs.extend(data.get("data", []))
            if not data.get("links", {}).get("next"):
                break
    return all_docs


async def get_comment_object_id(docket_id: str) -> str | None:
    """Get the objectId for the NPRM document (needed to fetch comments)."""
    docs = await get_documents_for_docket(docket_id, document_type="Proposed Rule")
    if docs:
        return docs[0].get("attributes", {}).get("objectId")
    # Fallback: try without type filter
    docs = await get_documents_for_docket(docket_id, document_type=None)
    for doc in docs:
        if doc.get("attributes", {}).get("objectId"):
            return doc["attributes"]["objectId"]
    return None


async def fetch_comments(
    comment_on_id: str,
    max_comments: int = 5000,
    page_size: int = 250,
) -> list[dict]:
    """Fetch comments for a document objectId with pagination and rate limiting."""
    all_comments = []
    page_number = 1

    async with httpx.AsyncClient(timeout=60) as client:
        while len(all_comments) < max_comments:
            params = {
                "filter[commentOnId]": comment_on_id,
                "page[size]": min(page_size, 250),
                "page[number]": page_number,
                "sort": "postedDate",
            }

            try:
                resp = await client.get(
                    f"{BASE_URL}/comments", params=params, headers=_headers()
                )

                if resp.status_code == 429:
                    # Rate limited — back off
                    retry_after = int(resp.headers.get("Retry-After", "10"))
                    print(f"[regulations.gov] Rate limited. Waiting {retry_after}s...")
                    await asyncio.sleep(retry_after)
                    continue

                resp.raise_for_status()
                data = resp.json()

            except httpx.HTTPStatusError as e:
                if e.response.status_code >= 500:
                    print(f"[regulations.gov] Server error {e.response.status_code}, retrying...")
                    await asyncio.sleep(5)
                    continue
                raise

            comments = data.get("data", [])
            if not comments:
                break

            all_comments.extend(comments)
            print(f"[regulations.gov] Fetched {len(all_comments)} comments...")

            if not data.get("links", {}).get("next"):
                break

            page_number += 1
            # Courtesy delay — respect rate limits
            await asyncio.sleep(0.5)

    return all_comments[:max_comments]


async def fetch_comments_by_docket(
    docket_id: str,
    max_comments: int = 5000,
    page_size: int = 250,
) -> list[dict]:
    """Fetch comments by docketId filter with reliable pagination.

    Note: Regulations.gov links.next is unreliable (often False even when
    more pages exist). We paginate based on result count instead.
    """
    all_comments = []
    page_number = 1
    seen_ids: set[str] = set()

    async with httpx.AsyncClient(timeout=60) as client:
        while len(all_comments) < max_comments:
            params = {
                "filter[docketId]": docket_id,
                "page[size]": min(page_size, 250),
                "page[number]": page_number,
                "sort": "postedDate",
            }

            try:
                resp = await client.get(
                    f"{BASE_URL}/comments", params=params, headers=_headers()
                )

                if resp.status_code == 429:
                    retry_after = int(resp.headers.get("Retry-After", "10"))
                    print(f"[regulations.gov] Rate limited. Waiting {retry_after}s...")
                    await asyncio.sleep(retry_after)
                    continue

                resp.raise_for_status()
                data = resp.json()

            except httpx.HTTPStatusError as e:
                if e.response.status_code >= 500:
                    print("[regulations.gov] Server error, retrying...")
                    await asyncio.sleep(5)
                    continue
                raise

            comments = data.get("data", [])
            if not comments:
                break

            # Deduplicate — API sometimes returns overlapping pages
            new_comments = []
            for c in comments:
                cid = c.get("id", "")
                if cid and cid not in seen_ids:
                    seen_ids.add(cid)
                    new_comments.append(c)

            if not new_comments:
                break  # All duplicates = we've exhausted results

            all_comments.extend(new_comments)
            print(f"[regulations.gov] Fetched {len(all_comments)} comments (page {page_number})...")

            # Stop if this page was less than full (last page)
            if len(comments) < page_size:
                break

            page_number += 1
            await asyncio.sleep(0.5)

    return all_comments[:max_comments]


async def get_comment_detail(comment_id: str) -> dict:
    """Get individual comment with full body and attachments."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{BASE_URL}/comments/{comment_id}",
            params={"include": "attachments"},
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def fetch_comment_bodies(
    comment_ids: list[str],
    batch_delay: float = 0.3,
    extract_attachments: bool = True,
) -> dict[str, str]:
    """Fetch full comment bodies + attachment text for a list of comment IDs.

    The list endpoint doesn't return body text — need individual GETs.
    For stub comments ("See Attached"), downloads and extracts PDF/DOCX attachments.

    Returns dict mapping comment_id -> body text (body + attachment text combined).
    """
    from processing.attachments import fetch_attachment_text
    from processing.normalize import is_stub_comment

    bodies = {}
    attachment_count = 0
    attachment_extracted = 0

    async with httpx.AsyncClient(timeout=30) as client:
        for i, cid in enumerate(comment_ids):
            try:
                resp = await client.get(
                    f"{BASE_URL}/comments/{cid}",
                    params={"include": "attachments"},
                    headers=_headers(),
                )

                if resp.status_code == 429:
                    retry_after = int(resp.headers.get("Retry-After", "10"))
                    print(f"[regulations.gov] Rate limited. Waiting {retry_after}s...")
                    await asyncio.sleep(retry_after)
                    resp = await client.get(
                        f"{BASE_URL}/comments/{cid}",
                        params={"include": "attachments"},
                        headers=_headers(),
                    )

                if resp.status_code == 200:
                    data = resp.json()
                    body = data.get("data", {}).get("attributes", {}).get("comment", "") or ""
                    included = data.get("included", [])

                    # If the body is a stub and there are attachments, extract text
                    if extract_attachments and included and is_stub_comment(body):
                        attachment_count += 1
                        att_text = await fetch_attachment_text(cid, included)
                        if att_text and len(att_text.strip()) > 20:
                            # Use attachment text as the body
                            body = att_text
                            attachment_extracted += 1
                    elif extract_attachments and included and body:
                        # Body exists but there are also attachments — append attachment text
                        att_text = await fetch_attachment_text(cid, included)
                        if att_text and len(att_text.strip()) > 50:
                            attachment_count += 1
                            body = body + "\n\n--- ATTACHMENT ---\n\n" + att_text
                            attachment_extracted += 1

                    bodies[cid] = body

                if (i + 1) % 50 == 0:
                    print(f"[regulations.gov] Fetched bodies: {i+1}/{len(comment_ids)} "
                          f"(attachments: {attachment_extracted}/{attachment_count})")

            except Exception as e:
                print(f"[regulations.gov] Error fetching {cid}: {e}")
                bodies[cid] = ""

            await asyncio.sleep(batch_delay)

    print(f"[regulations.gov] Body fetch complete: {len(bodies)} comments, "
          f"{attachment_count} with attachments, {attachment_extracted} texts extracted")
    return bodies
