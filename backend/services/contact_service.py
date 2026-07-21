from __future__ import annotations

from backend.utils.local_store import read_json


def resolve_contact_email(user_id: str, name_or_alias: str) -> dict | None:
    normalized = name_or_alias.strip().casefold()
    for contact in read_json("assistant_contacts.json", {}).get(user_id, []):
        names = [str(contact.get("name") or ""), *(contact.get("aliases") or [])]
        if normalized in {name.strip().casefold() for name in names if name}:
            return {"name": contact.get("name"), "email": contact.get("email"), "matched_alias": name_or_alias}
    return None
