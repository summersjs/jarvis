# Evidence-gated live shopping

Jarvis routes current product price, availability, and nearby-store questions through `search_live_prices`. The model never supplies these facts from memory. If no provider returns a numeric price with request-scoped evidence, Jarvis answers that it has no verified live source and does not quote a price.

Evidence classes, from strongest to supporting-only:

- `official_retailer_api`: Kroger location-specific product results.
- `retailer_web_result`: structured Walmart results from SearchAPI.io or SerpApi.
- `marketplace_result`: approved Instacart Developer Platform results (pending account access).
- `place_registry`: Google Places store identity/address validation; never treated as product-price evidence.

Configure secrets only in the root `.env`; see `.env.example`. Kroger requires client credentials and a location ID. Walmart requires either SearchAPI.io or SerpApi. Google Places is optional store validation. Instacart remains unavailable until an approved Developer Platform key and supported product-search endpoint are issued for this application.
