"""Ingestion orchestrator — pulls data from APIs and streams into Neo4j.

Key design:
- Each comment is written to Neo4j IMMEDIATELY after its body is fetched
- If interrupted, already-loaded comments persist — resume skips them
- Parallel body downloads (semaphore-controlled) for 5-10x speed
"""

import asyncio
import hashlib
import uuid
import httpx
from tqdm import tqdm

from ingestion.regulations_gov import (
    get_docket, get_comment_object_id, fetch_comments, get_documents_for_docket,
    fetch_comments_by_docket,
)
from processing.normalize import (
    normalize_text, compute_hash, extract_commenter_info,
    is_stub_comment, comment_word_count,
)
from processing.attachments import fetch_attachment_text
from graph import (
    init_schema, upsert_agency, upsert_docket, upsert_document,
    upsert_comment, upsert_commenter, run_write, run_query,
)
from config import get_settings


def _headers():
    return {"X-Api-Key": get_settings().regulations_gov_api_key}


async def _fetch_and_store_comment(
    comment_data: dict,
    default_doc_id: str,
    semaphore: asyncio.Semaphore,
    client: httpx.AsyncClient,
    stats: dict,
    commenter_ids: set,
    pbar: tqdm,
):
    """Fetch one comment's body + attachments, then immediately write to Neo4j."""
    attrs = comment_data.get("attributes", {})
    comment_id = comment_data.get("id", attrs.get("commentId", str(uuid.uuid4())))

    async with semaphore:
        try:
            # Fetch individual comment with attachments
            resp = await client.get(
                f"https://api.regulations.gov/v4/comments/{comment_id}",
                params={"include": "attachments"},
                headers=_headers(),
            )

            if resp.status_code == 429:
                retry = int(resp.headers.get("Retry-After", "10"))
                await asyncio.sleep(retry)
                resp = await client.get(
                    f"https://api.regulations.gov/v4/comments/{comment_id}",
                    params={"include": "attachments"},
                    headers=_headers(),
                )

            if resp.status_code != 200:
                pbar.update(1)
                return

            data = resp.json()
            body = data.get("data", {}).get("attributes", {}).get("comment", "") or ""
            included = data.get("included", [])

            # Extract attachment text for stubs
            if included and is_stub_comment(body):
                att_text = await fetch_attachment_text(comment_id, included)
                if att_text and len(att_text.strip()) > 20:
                    body = att_text
                    stats["attachments_extracted"] += 1
            elif included and body:
                att_text = await fetch_attachment_text(comment_id, included)
                if att_text and len(att_text.strip()) > 50:
                    body = body + "\n\n--- ATTACHMENT ---\n\n" + att_text
                    stats["attachments_extracted"] += 1

        except Exception:
            pbar.update(1)
            return

    # ── Normalize and write to Neo4j immediately ──
    body_normalized = normalize_text(body)
    body_hash = compute_hash(body)
    word_count = comment_word_count(body)
    stub = is_stub_comment(body)
    doc_id = attrs.get("commentOnDocumentId", "") or default_doc_id

    upsert_comment(
        comment_id=comment_id,
        document_id=doc_id,
        body=body_normalized[:10000],
        body_normalized=body_normalized[:10000],
        body_hash=body_hash,
        title=attrs.get("title", ""),
        posted_date=attrs.get("postedDate", ""),
        received_date=attrs.get("receivedDate", ""),
        has_attachments=bool(included),
        attachment_count=len(included),
        withdrawn=attrs.get("withdrawn", False),
        needs_human_review=False,
        is_duplicate=False,
        is_stub=stub,
        word_count=word_count,
    )

    if stub:
        stats["stub_comments"] += 1
    else:
        stats["comments_with_body"] += 1

    # Commenter
    commenter_info = extract_commenter_info(comment_data)
    commenter_key = f"{commenter_info['name']}|{commenter_info['organization']}".lower()
    commenter_id = (
        hashlib.sha256(commenter_key.encode()).hexdigest()[:16]
        if commenter_key.strip("|")
        else f"anon-{comment_id[-8:]}"
    )

    if commenter_id not in commenter_ids:
        upsert_commenter(commenter_id=commenter_id, comment_id=comment_id, **commenter_info)
        commenter_ids.add(commenter_id)
        stats["commenters"] += 1
    else:
        run_write("""
            MATCH (c:Comment {comment_id: $comment_id})
            MATCH (cm:Commenter {commenter_id: $commenter_id})
            MERGE (c)-[:SUBMITTED_BY]->(cm)
        """, dict(comment_id=comment_id, commenter_id=commenter_id))

    stats["comments_loaded"] += 1
    pbar.update(1)


async def ingest_docket(docket_id: str, max_comments: int = 5000) -> dict:
    """Incremental, resumable ingestion pipeline.

    - Streams each comment to Neo4j immediately after fetch
    - Skips comments already in Neo4j (resume support)
    - Parallel downloads with semaphore (10 concurrent)
    """
    print(f"\n{'='*60}")
    print(f"INGESTING DOCKET: {docket_id}")
    print(f"{'='*60}\n")

    init_schema()

    stats = {
        "docket_id": docket_id,
        "documents": 0,
        "comments_fetched": 0,
        "comments_loaded": 0,
        "comments_skipped": 0,
        "comments_with_body": 0,
        "stub_comments": 0,
        "attachments_extracted": 0,
        "commenters": 0,
    }

    # --- Step 1: Docket metadata ---
    print("[1/4] Fetching docket metadata...")
    docs = []
    try:
        docket_data = await get_docket(docket_id)
        docket_attrs = docket_data.get("data", {}).get("attributes", {})
        agency_id = docket_attrs.get("agencyId", docket_id.split("-")[0])
        upsert_agency(agency_id=agency_id, name=docket_attrs.get("agency", agency_id), short_name=agency_id)
        upsert_docket(
            docket_id=docket_id,
            title=docket_attrs.get("title", docket_id),
            agency_id=agency_id,
            abstract=docket_attrs.get("abstract", ""),
            rin=docket_attrs.get("rin", ""),
        )
        print(f"  Docket: {docket_attrs.get('title', docket_id)[:80]}")
    except Exception as e:
        print(f"  Warning: Could not fetch docket metadata: {e}")
        agency_id = docket_id.split("-")[0]
        upsert_agency(agency_id=agency_id, name=agency_id, short_name=agency_id)
        upsert_docket(docket_id=docket_id, title=docket_id, agency_id=agency_id)

    # --- Step 2: Documents ---
    print("[2/4] Fetching documents...")
    try:
        docs = await get_documents_for_docket(docket_id, document_type=None)
        for doc in docs:
            doc_attrs = doc.get("attributes", {})
            doc_id = doc.get("id", doc_attrs.get("documentId", ""))
            upsert_document(
                document_id=doc_id, docket_id=docket_id,
                title=doc_attrs.get("title", ""),
                document_type=doc_attrs.get("documentType", ""),
                posted_date=doc_attrs.get("postedDate", ""),
                object_id=doc_attrs.get("objectId", ""),
            )
            stats["documents"] += 1
        print(f"  Loaded {stats['documents']} documents")
    except Exception as e:
        print(f"  Warning: Could not fetch documents: {e}")

    # --- Step 3: Fetch comment list ---
    print(f"[3/4] Fetching comment list (max {max_comments})...")
    comments = []
    try:
        comments = await fetch_comments_by_docket(docket_id, max_comments=max_comments)
        if not comments:
            object_id = await get_comment_object_id(docket_id)
            if object_id:
                comments = await fetch_comments(object_id, max_comments=max_comments)
        stats["comments_fetched"] = len(comments)
        print(f"  Fetched {len(comments)} comment records")
    except Exception as e:
        print(f"  Error fetching comments: {e}")
        return stats

    if not comments:
        print("  No comments found.")
        return stats

    # --- Step 4: Stream bodies + load into Neo4j (parallel, resumable) ---
    # Check which comments already exist in Neo4j
    existing = run_query("MATCH (c:Comment) RETURN collect(c.comment_id) AS ids")
    existing_ids = set(existing[0]["ids"]) if existing and existing[0]["ids"] else set()

    # Filter to only new comments
    new_comments = []
    for c in comments:
        cid = c.get("id", c.get("attributes", {}).get("commentId", ""))
        if cid in existing_ids:
            stats["comments_skipped"] += 1
        else:
            new_comments.append(c)

    if stats["comments_skipped"] > 0:
        print(f"  Resuming: {stats['comments_skipped']} already in Neo4j, {len(new_comments)} new to fetch")
    else:
        print(f"  {len(new_comments)} comments to fetch and load")

    if not new_comments:
        print("  All comments already loaded!")
        stats["comments_loaded"] = len(existing_ids)
        return stats

    default_doc_id = docs[0].get("id", "") if docs else ""
    commenter_ids = set()
    semaphore = asyncio.Semaphore(8)  # 8 concurrent downloads

    print(f"[4/4] Streaming {len(new_comments)} comments into Neo4j (8 parallel)...")

    pbar = tqdm(total=len(new_comments), desc="Fetching + loading")

    async with httpx.AsyncClient(timeout=30) as client:
        # Process in batches of 50 to avoid overwhelming the event loop
        batch_size = 50
        for i in range(0, len(new_comments), batch_size):
            batch = new_comments[i:i + batch_size]
            tasks = [
                asyncio.wait_for(
                    _fetch_and_store_comment(c, default_doc_id, semaphore, client, stats, commenter_ids, pbar),
                    timeout=30,  # 30s max per comment — skip slow PDFs
                )
                for c in batch
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            # Count timeouts
            for r in results:
                if isinstance(r, asyncio.TimeoutError):
                    pbar.update(1)

    pbar.close()

    total_in_neo4j = stats["comments_loaded"] + stats["comments_skipped"]

    print(f"\n{'='*60}")
    print("INGESTION COMPLETE")
    print(f"  Documents: {stats['documents']}")
    print(f"  Comments in API: {stats['comments_fetched']}")
    print(f"  Newly loaded: {stats['comments_loaded']}")
    print(f"  Resumed (skipped): {stats['comments_skipped']}")
    print(f"  Total in Neo4j: {total_in_neo4j}")
    print(f"  With body text: {stats['comments_with_body']}")
    print(f"  Stub/attachment-only: {stats['stub_comments']}")
    print(f"  Attachments extracted: {stats['attachments_extracted']}")
    print(f"  Unique commenters: {stats['commenters']}")
    print(f"{'='*60}\n")

    return stats


if __name__ == "__main__":
    import sys
    docket = sys.argv[1] if len(sys.argv) > 1 else "EPA-HQ-OAR-2021-0208"
    max_c = int(sys.argv[2]) if len(sys.argv) > 2 else 1000
    asyncio.run(ingest_docket(docket, max_comments=max_c))
