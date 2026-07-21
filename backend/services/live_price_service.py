from __future__ import annotations

import base64
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

from backend.services.preferences_service import find_preference_for_keyword, list_preferences


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


def search_live_prices(query: str, location: str | None = None, user_id: str = "john", retailer: str | None = None) -> dict[str, Any]:
    query = " ".join(str(query or "").split())[:160]
    location = " ".join(str(location or os.getenv("JARVIS_SHOPPING_LOCATION", "")).split())[:160] or None
    if not query:
        return {"verified": False, "query": query, "offers": [], "providers": [], "reason": "A product name is required."}

    preference = _resolve_preference(user_id, query)
    provider_query = _preferred_search_query(query, preference)
    providers = []
    stores = _google_places(location) if location else []
    if location:
        providers.append({"provider": "google_places", "configured": bool(os.getenv("GOOGLE_PLACES_API_KEY")), "stores_found": len(stores)})

    offers: list[dict] = []
    retailer = str(retailer or "").strip().lower() or None
    searches = (_kroger_prices, _searchapi_walmart, _serpapi_walmart, _instacart_prices)
    if retailer == "kroger":
        searches = (_kroger_prices,)
    elif retailer == "walmart":
        searches = (_searchapi_walmart, _serpapi_walmart)
    elif retailer == "instacart":
        searches = (_instacart_prices,)
    for search in searches:
        try:
            result = search(provider_query, location)
        except Exception as exc:
            result = {"provider": search.__name__.strip("_").replace("_prices", ""), "configured": True, "error": type(exc).__name__, "offers": []}
        providers.append({key: value for key, value in result.items() if key != "offers"})
        offers.extend(result.get("offers") or [])

    offers = _rank_preferred_offers(offers, preference, query)
    return {
        "verified": bool(offers),
        "query": query,
        "provider_query": provider_query,
        "preference": preference,
        "retailer_filter": retailer,
        "location": location,
        "offers": offers[:12],
        "validated_stores": stores[:10],
        "providers": providers,
        "reason": None if offers else "No configured provider returned a verifiable current price.",
    }


def search_obsession_deals(user_id: str = "john", location: str | None = None, retailer: str | None = None) -> dict[str, Any]:
    """Search only active saved obsessions and retain provider evidence per offer."""
    obsessions = [
        row for row in list_preferences(user_id, "obsession")
        if row.get("is_active", True) and row.get("item_keyword")
    ]
    if not obsessions:
        return {"verified": False, "query": "saved obsessions", "offers": [], "providers": [], "obsessions": [], "reason": "No active obsessions are saved."}
    offers, providers = [], []
    for obsession in obsessions[:5]:
        result = search_live_prices(str(obsession["item_keyword"]), location, user_id, retailer)
        providers.extend(result.get("providers") or [])
        for offer in result.get("offers") or []:
            offers.append({**offer, "matched_obsession": obsession["item_keyword"]})
    offers.sort(key=lambda offer: float(offer.get("price") or float("inf")))
    deal_offers = [offer for offer in offers if offer.get("is_deal")]
    return {
        "verified": bool(offers), "query": "saved obsessions", "offers": offers[:12],
        "deal_offers": deal_offers[:12], "has_verified_deals": bool(deal_offers),
        "providers": providers, "obsessions": [row["item_keyword"] for row in obsessions[:5]],
        "reason": None if offers else "No configured provider returned a verifiable current offer for the saved obsessions.",
    }


def _resolve_preference(user_id: str, query: str) -> dict | None:
    normalized = query.lower().replace("redbull", "red bull").replace("toliet", "toilet")
    candidates = [normalized]
    candidates.extend(part.strip() for part in ("red bull", "toothpaste", "toilet paper", "butter") if part in normalized)
    for keyword in dict.fromkeys(candidates):
        try:
            matches = find_preference_for_keyword(user_id, keyword)
        except Exception:
            matches = []
        if matches:
            item = matches[0]
            notes = str(item.get("notes") or "")
            return {
                "id": item.get("id"), "item_keyword": item.get("item_keyword"),
                "preferred_brand": item.get("preferred_brand"),
                "preferred_product_name": item.get("preferred_product_name"),
                "preferred_size": item.get("preferred_size"), "preferred_unit": item.get("preferred_unit"),
                "all_sizes": "all sizes" in notes.lower(), "notes": notes,
            }
    return None


def _preferred_search_query(query: str, preference: dict | None) -> str:
    if not preference:
        return query
    product_name = preference.get("preferred_product_name")
    if str(preference.get("item_keyword") or "").lower() == "red bull" and str(product_name or "").lower() == "original":
        product_name = None
    terms = [preference.get("preferred_brand") or query, product_name]
    if preference.get("preferred_size") and not preference.get("all_sizes"):
        terms.extend([preference.get("preferred_size"), preference.get("preferred_unit")])
    return " ".join(str(term).strip() for term in terms if term).strip()


def _rank_preferred_offers(offers: list[dict], preference: dict | None, query: str = "") -> list[dict]:
    verified = [offer for offer in offers if isinstance(offer.get("price"), (int, float)) and offer.get("evidence")]
    if preference:
        brand = str(preference.get("preferred_brand") or "").lower()
        product = str(preference.get("preferred_product_name") or "").lower()
        if brand:
            verified = [offer for offer in verified if brand in str(offer.get("title") or "").lower()]
        original_red_bull = str(preference.get("item_keyword") or "").lower() == "red bull" and product == "original"
        if product and not original_red_bull:
            verified = [offer for offer in verified if product in str(offer.get("title") or "").lower()]
        notes = str(preference.get("notes") or "").lower()
        if "regular" in notes or "original flavor" in notes:
            excluded = ("sugar free", "sugar-free", "sugarfree", "zero", "edition", "watermelon", "peach", "coconut", "berry", "lime", "strawberry", "apricot", "dragon fruit")
            verified = [offer for offer in verified if not any(term in str(offer.get("title") or "").lower() for term in excluded)]
    elif query:
        required = [token for token in re_words(query) if len(token) > 2]
        if required:
            verified = [offer for offer in verified if all(token in str(offer.get("title") or "").lower() for token in required)]
    verified.sort(key=lambda offer: offer["price"])
    if preference and preference.get("all_sizes"):
        cheapest_by_size = {}
        for offer in verified:
            size = str(offer.get("size") or "size not listed").strip().lower()
            retailer = str(offer.get("retailer") or "retailer").strip().lower()
            cheapest_by_size.setdefault((retailer, size), offer)
        return list(cheapest_by_size.values())[:12]
    return verified[:12] if preference else verified[:1]


def re_words(text: str) -> list[str]:
    import re
    return re.findall(r"[a-z0-9]+", text.lower())


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
    client_id, secret = os.getenv("KROGER_CLIENT_ID"), os.getenv("KROGER_CLIENT_SECRET")
    if not all((client_id, secret)):
        return {"provider": "kroger", "configured": False, "offers": []}
    token_url = os.getenv("KROGER_TOKEN_URL", "https://api.kroger.com/v1/connect/oauth2/token")
    base_url = os.getenv("KROGER_BASE_URL", "https://api.kroger.com/v1").rstrip("/")
    token_req = urllib.request.Request(token_url, data=urllib.parse.urlencode({"grant_type": "client_credentials", "scope": "product.compact"}).encode(), headers={
        "Authorization": "Basic " + base64.b64encode(f"{client_id}:{secret}".encode()).decode(),
        "Content-Type": "application/x-www-form-urlencoded",
    }, method="POST")
    with urllib.request.urlopen(token_req, timeout=12) as response:
        token = json.loads(response.read().decode())["access_token"]
    location_id = os.getenv("KROGER_LOCATION_ID") or _nearest_kroger_location(base_url, token, os.getenv("KROGER_DEFAULT_ZIP"))
    if not location_id:
        return {"provider": "kroger", "configured": True, "error": "location_required", "offers": []}
    params = urllib.parse.urlencode({"filter.term": query, "filter.locationId": location_id, "filter.limit": 50})
    url = f"{base_url}/products?{params}"
    data = _json_request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
    offers = []
    for product in data.get("data") or []:
        for item in product.get("items") or []:
            price_data = item.get("price") or {}
            regular, promo = price_data.get("regular"), price_data.get("promo")
            price = promo or regular
            if isinstance(price, (int, float)):
                is_deal = isinstance(promo, (int, float)) and isinstance(regular, (int, float)) and promo < regular
                offers.append({
                    "retailer": "Kroger", "title": product.get("description"), "size": item.get("size"),
                    "price": float(price), "regular_price": float(regular) if isinstance(regular, (int, float)) else None,
                    "promo_price": float(promo) if isinstance(promo, (int, float)) else None, "is_deal": is_deal,
                    "availability": "listed", "evidence": _evidence("kroger", "official_retailer_api", url, store={"location_id": location_id}),
                })
    return {"provider": "kroger", "configured": True, "offers": offers}


def _nearest_kroger_location(base_url: str, token: str, zip_code: str | None) -> str | None:
    if not zip_code:
        return None
    params = urllib.parse.urlencode({"filter.zipCode.near": zip_code.strip(), "filter.limit": 1})
    data = _json_request(f"{base_url}/locations?{params}", headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
    locations = data.get("data") or []
    return str(locations[0].get("locationId")) if locations and locations[0].get("locationId") else None


def _searchapi_walmart(query: str, _location: str | None) -> dict:
    key = os.getenv("SEARCHAPI_API_KEY") or os.getenv("SEARCH_API_KEY")
    if not key:
        return {"provider": "searchapi_walmart", "configured": False, "offers": []}
    params = {"engine": "walmart_search", "q": query, "api_key": key}
    if os.getenv("WALMART_STORE_ID"):
        params["store_id"] = os.environ["WALMART_STORE_ID"]
    url = "https://www.searchapi.io/api/v1/search?" + urllib.parse.urlencode(params)
    data = _json_request(url)
    offers = _walmart_offers(data, "searchapi", url)
    if params.get("store_id"):
        for offer in offers:
            offer["evidence"]["store"] = {"store_id": str(params["store_id"])}
    return {"provider": "searchapi_walmart", "configured": True, "store_id": params.get("store_id"), "offers": offers}


def _serpapi_walmart(query: str, _location: str | None) -> dict:
    key = os.getenv("SERPAPI_API_KEY")
    if not key:
        return {"provider": "serpapi_walmart", "configured": False, "offers": []}
    url = "https://serpapi.com/search.json?" + urllib.parse.urlencode({"engine": "walmart", "query": query, "api_key": key})
    data = _json_request(url)
    return {"provider": "serpapi_walmart", "configured": True, "offers": _walmart_offers(data, "serpapi", url)}


def _walmart_offers(data: dict, provider: str, source_url: str) -> list[dict]:
    offers = []
    seen = set()
    for item in data.get("organic_results") or []:
        raw = item.get("primary_offer") or item
        price = raw.get("offer_price") or raw.get("price") or item.get("price")
        if isinstance(price, str):
            try: price = float(price.replace("$", "").replace(",", ""))
            except ValueError: price = None
        if isinstance(price, (int, float)):
            title = str(item.get("title") or "")
            link = item.get("link") or item.get("product_page_url")
            identity = (link or title, float(price))
            if identity in seen:
                continue
            seen.add(identity)
            offers.append({"retailer": "Walmart", "title": title, "size": _extract_retail_size(title), "price": float(price), "availability": item.get("availability") or "listed", "url": link, "evidence": _evidence(provider, "retailer_web_result", link or source_url)})
    return offers


def _extract_retail_size(title: str) -> str | None:
    import re
    size_match = re.search(r"(\d+(?:\.\d+)?)\s*fl\.?\s*oz\.?", title, re.IGNORECASE)
    if not size_match:
        return None
    unit_size = f"{size_match.group(1)} fl oz"
    pack_match = re.search(r"(?:pack of|\b)(\d+)\s*(?:cans?|ct|count|pk)\b", title, re.IGNORECASE)
    return f"{pack_match.group(1)} pk / {unit_size}" if pack_match and int(pack_match.group(1)) > 1 else unit_size


def _instacart_prices(_query: str, _location: str | None) -> dict:
    # Catalog access is partner-approved. Keep it explicit in the capability
    # registry until an endpoint/key issued for this account is configured.
    configured = bool(os.getenv("INSTACART_API_KEY") and os.getenv("INSTACART_CATALOG_ENDPOINT"))
    return {"provider": "instacart", "configured": configured, "access": "partner_catalog_required", "offers": []}
