from __future__ import annotations

import base64
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any


def _json_request(url: str, *, headers: dict[str, str] | None = None, data: dict | None = None, timeout: float = 12) -> dict:
    body = None if data is None else json.dumps(data).encode()
    request = urllib.request.Request(url, data=body, headers=headers or {}, method="POST" if data is not None else "GET")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode())


def _evidence(provider: str, classification: str, source_url: str, *, store: dict | None = None) -> dict:
    return {
        "provider": provider,
        "classification": classification,
        "source_url": source_url,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "store": store,
    }


def search_live_prices(query: str, location: str | None = None) -> dict[str, Any]:
    query = " ".join(str(query or "").split())[:160]
    location = " ".join(str(location or os.getenv("JARVIS_SHOPPING_LOCATION", "")).split())[:160] or None
    if not query:
        return {"verified": False, "query": query, "offers": [], "providers": [], "reason": "A product name is required."}

    providers = []
    stores = _google_places(location) if location else []
    if location:
        providers.append({"provider": "google_places", "configured": bool(os.getenv("GOOGLE_PLACES_API_KEY")), "stores_found": len(stores)})

    offers: list[dict] = []
    for search in (_kroger_prices, _searchapi_walmart, _serpapi_walmart, _instacart_prices):
        try:
            result = search(query, location)
        except Exception as exc:
            result = {"provider": search.__name__.strip("_").replace("_prices", ""), "configured": True, "error": type(exc).__name__, "offers": []}
        providers.append({key: value for key, value in result.items() if key != "offers"})
        offers.extend(result.get("offers") or [])

    offers = [offer for offer in offers if isinstance(offer.get("price"), (int, float)) and offer.get("evidence")]
    offers.sort(key=lambda offer: offer["price"])
    return {
        "verified": bool(offers),
        "query": query,
        "location": location,
        "offers": offers[:12],
        "validated_stores": stores[:10],
        "providers": providers,
        "reason": None if offers else "No configured provider returned a verifiable current price.",
    }


def _google_places(location: str | None) -> list[dict]:
    key = os.getenv("GOOGLE_PLACES_API_KEY")
    if not key or not location:
        return []
    url = "https://places.googleapis.com/v1/places:searchText"
    data = _json_request(url, data={"textQuery": f"grocery stores near {location}", "pageSize": 10}, headers={
        "Content-Type": "application/json", "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.businessStatus,places.googleMapsUri",
    })
    return [{
        "id": place.get("id"), "name": (place.get("displayName") or {}).get("text"),
        "address": place.get("formattedAddress"), "business_status": place.get("businessStatus"),
        "url": place.get("googleMapsUri"),
        "evidence": _evidence("google_places", "place_registry", place.get("googleMapsUri") or url),
    } for place in data.get("places") or []]


def _kroger_prices(query: str, _location: str | None) -> dict:
    client_id, secret, location_id = os.getenv("KROGER_CLIENT_ID"), os.getenv("KROGER_CLIENT_SECRET"), os.getenv("KROGER_LOCATION_ID")
    if not all((client_id, secret, location_id)):
        return {"provider": "kroger", "configured": False, "offers": []}
    token_req = urllib.request.Request("https://api.kroger.com/v1/connect/oauth2/token", data=urllib.parse.urlencode({"grant_type": "client_credentials", "scope": "product.compact"}).encode(), headers={
        "Authorization": "Basic " + base64.b64encode(f"{client_id}:{secret}".encode()).decode(),
        "Content-Type": "application/x-www-form-urlencoded",
    }, method="POST")
    with urllib.request.urlopen(token_req, timeout=12) as response:
        token = json.loads(response.read().decode())["access_token"]
    params = urllib.parse.urlencode({"filter.term": query, "filter.locationId": location_id, "filter.limit": 10})
    url = f"https://api.kroger.com/v1/products?{params}"
    data = _json_request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
    offers = []
    for product in data.get("data") or []:
        for item in product.get("items") or []:
            price = (item.get("price") or {}).get("promo") or (item.get("price") or {}).get("regular")
            if isinstance(price, (int, float)):
                offers.append({"retailer": "Kroger", "title": product.get("description"), "size": item.get("size"), "price": float(price), "availability": "listed", "evidence": _evidence("kroger", "official_retailer_api", url, store={"location_id": location_id})})
    return {"provider": "kroger", "configured": True, "offers": offers}


def _searchapi_walmart(query: str, _location: str | None) -> dict:
    key = os.getenv("SEARCHAPI_API_KEY")
    if not key:
        return {"provider": "searchapi_walmart", "configured": False, "offers": []}
    params = {"engine": "walmart_search", "q": query, "api_key": key}
    if os.getenv("WALMART_STORE_ID"):
        params["store_id"] = os.environ["WALMART_STORE_ID"]
    url = "https://www.searchapi.io/api/v1/search?" + urllib.parse.urlencode(params)
    data = _json_request(url)
    return {"provider": "searchapi_walmart", "configured": True, "offers": _walmart_offers(data, "searchapi", url)}


def _serpapi_walmart(query: str, _location: str | None) -> dict:
    key = os.getenv("SERPAPI_API_KEY")
    if not key:
        return {"provider": "serpapi_walmart", "configured": False, "offers": []}
    url = "https://serpapi.com/search.json?" + urllib.parse.urlencode({"engine": "walmart", "query": query, "api_key": key})
    data = _json_request(url)
    return {"provider": "serpapi_walmart", "configured": True, "offers": _walmart_offers(data, "serpapi", url)}


def _walmart_offers(data: dict, provider: str, source_url: str) -> list[dict]:
    offers = []
    for item in data.get("organic_results") or []:
        raw = item.get("primary_offer") or item
        price = raw.get("offer_price") or raw.get("price") or item.get("price")
        if isinstance(price, str):
            try: price = float(price.replace("$", "").replace(",", ""))
            except ValueError: price = None
        if isinstance(price, (int, float)):
            offers.append({"retailer": "Walmart", "title": item.get("title"), "price": float(price), "availability": item.get("availability") or "listed", "url": item.get("link") or item.get("product_page_url"), "evidence": _evidence(provider, "retailer_web_result", item.get("link") or source_url)})
    return offers


def _instacart_prices(_query: str, _location: str | None) -> dict:
    # Catalog access is partner-approved. Keep it explicit in the capability
    # registry until an endpoint/key issued for this account is configured.
    configured = bool(os.getenv("INSTACART_API_KEY") and os.getenv("INSTACART_CATALOG_ENDPOINT"))
    return {"provider": "instacart", "configured": configured, "access": "partner_catalog_required", "offers": []}
