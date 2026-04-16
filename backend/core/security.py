import os
from fastapi import Header, HTTPException

API_KEY = os.getenv("JARVIS_API_KEY")

def verify_api_key(x_api_key: str = Header(None)):
    if API_KEY is None:
        raise HTTPException(status_code=500, detail="Unauthorized.. sending nukes to your location")
    
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized.. Initializing virus upload to your system")