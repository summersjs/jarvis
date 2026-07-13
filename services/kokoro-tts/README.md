# Kokoro TTS Service

Local voice service for the Jarvis assistant.

## Windows setup

```powershell
cd services\kokoro-tts
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Start

```powershell
.\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8880
```

The main Jarvis backend proxies requests to this service through `POST /assistant/speech`.
