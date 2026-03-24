"""Federal Register API client — fetch NPRMs, documents, and metadata."""

import httpx

BASE_URL = "https://www.federalregister.gov/api/v1"

NPRM_FIELDS = [
    "title", "document_number", "publication_date", "abstract",
    "docket_ids", "regulation_id_number_info", "cfr_references",
    "comment_url", "comments_close_on", "action", "agencies",
    "full_text_xml_url", "pdf_url", "type",
]


async def search_nprms(
    agency_slug: str | None = None,
    date_gte: str | None = None,
    date_lte: str | None = None,
    per_page: int = 20,
    page: int = 1,
) -> dict:
    """Search Federal Register for proposed rules (NPRMs)."""
    params = {
        "conditions[type][]": "PRORULE",
        "per_page": per_page,
        "page": page,
    }
    for field in NPRM_FIELDS:
        params["fields[]"] = params.get("fields[]", [])
    # httpx handles repeated keys via list values
    params["fields[]"] = NPRM_FIELDS

    if agency_slug:
        params["conditions[agencies][]"] = agency_slug
    if date_gte:
        params["conditions[publication_date][gte]"] = date_gte
    if date_lte:
        params["conditions[publication_date][lte]"] = date_lte

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{BASE_URL}/documents.json", params=params)
        resp.raise_for_status()
        return resp.json()


async def get_document(document_number: str) -> dict:
    """Get a specific Federal Register document by document number."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{BASE_URL}/documents/{document_number}.json",
            params={"fields[]": NPRM_FIELDS},
        )
        resp.raise_for_status()
        return resp.json()


async def search_all_nprms(agency_slug: str | None = None,
                           date_gte: str | None = None,
                           date_lte: str | None = None,
                           max_pages: int = 10) -> list[dict]:
    """Paginate through all NPRM results."""
    all_results = []
    for page in range(1, max_pages + 1):
        data = await search_nprms(agency_slug, date_gte, date_lte, per_page=200, page=page)
        results = data.get("results", [])
        all_results.extend(results)
        if not data.get("next_page_url"):
            break
    return all_results
