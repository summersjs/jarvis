# Jarvis Desktop for Windows

Jarvis Desktop is a secure Electron shell around the existing Next.js `/desktop` route. It does not copy or bundle a second frontend. The Next.js frontend and FastAPI backend remain the source of truth for phones, browsers, and Electron. The temporary legacy assistant URL redirects to `/jarvis`; it never loads a separate prompt or assistant implementation.

## Architecture

- `frontend/electron/main.cjs`: Electron lifecycle, separate dashboard and compact assistant windows, connection monitor, tray, shortcut, login-item setting, native telemetry, preferences, and navigation controls.
- `frontend/electron/preload.cjs`: narrow `contextBridge` API. Node.js and raw Electron APIs are not exposed to the web renderer.
- `frontend/electron/offline.html`: local, secret-free offline screen with Retry and Open logs actions.
- `frontend/electron/dev-launcher.cjs`: reuses a running frontend or starts one, waits for `/desktop`, starts Electron, and cleans up only the frontend process it created.
- `frontend/electron/windows-media.ps1`: fixed, allowlisted Windows media-session and volume operations. It cannot execute renderer-supplied commands.
- Electron stores non-secret window, startup, weather, media, and assistant UI preferences in its per-user application data directory.

## Requirements

- Windows 11 with WSL2 and localhost forwarding.
- Node.js and npm installed on Windows for Electron packaging.
- Jarvis frontend and backend dependencies installed in WSL.
- The root `.env` and `frontend/.env.local` configured as described by the project.

## Run Jarvis in WSL

The installed user services can start the web stack:

```bash
cd /home/john/development/jarvis
systemctl --user start jarvis.target
systemctl --user status jarvis-backend.service jarvis-frontend.service
```

For manual development, use two WSL terminals:

```bash
cd /home/john/development/jarvis
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

```bash
cd /home/john/development/jarvis/frontend
npm install
npm run dev -- --hostname 127.0.0.1
```

The default Electron target is `http://localhost:3000/desktop`.

## Launch Electron on Windows

Use PowerShell in the Windows checkout, not the WSL shell, so npm installs the Windows Electron binary:

```powershell
cd C:\Development\jarvis\frontend
npm install
$env:JARVIS_DESKTOP_URL = "http://localhost:3000/desktop"
npm run desktop:dev
```

`desktop:dev` connects to an existing frontend when available. If nothing is listening, it starts Next.js and stops that child server when Electron exits. To connect without managing Next.js, use `npm run desktop:start`.

## Package for Windows

Create an unpacked Windows build:

```powershell
npm run desktop:build
```

Create the NSIS installer and portable executable:

```powershell
npm run desktop:package
```

Artifacts are written to `frontend\dist-electron`. No auto-updater is configured.

## Configuration

- `JARVIS_DESKTOP_URL`: full trusted Jarvis URL. Default: `http://localhost:3000/desktop`.
- `JARVIS_ASSISTANT_ROUTE`: canonical assistant route. Default: `/jarvis`.
- `JARVIS_MUSIC_URL`: approved YouTube Music fallback URL. Default: `https://music.youtube.com/`. The native launcher prefers the installed YouTube Music PWA.
- `JARVIS_WEATHER_LOCATION`: optional default city/state used when the user has not saved a location or granted browser geolocation.
- `JARVIS_WEATHER_CACHE_SECONDS`: live Open-Meteo cache duration. Default: 600.
- `JARVIS_STARTUP_PREFERENCE_PATH`: optional absolute path for Electron window/startup preferences. The default is Electron's user-data directory.
- `ELECTRON_IS_DEV=1`: enables development logging; `desktop:dev` sets it automatically.

Do not put API keys, tokens, cookies, or credentials in these URLs. Query strings are stripped from logs and the offline screen, but authenticated Jarvis access should continue using the existing web application mechanism.

## Native behavior

- Closing the window hides it in the system tray.
- Use tray **Quit** to terminate Electron completely.
- Alt+C creates or focuses exactly one compact Jarvis assistant window. The dashboard remains a separate window.
- Closing the compact assistant hides it. Its bottom-right position, size, display, and optional always-on-top setting are remembered.
- The tray's **Launch at startup** checkbox uses Electron's supported login-item API and defaults to off.
- Window size, position, display, and fullscreen state are remembered and corrected if a monitor is removed.
- External HTTP(S) and mail links open outside Electron. Untrusted navigation, popups, `file:`, `data:`, and `javascript:` navigation are blocked.

## Logs and troubleshooting

Use **Open logs** on the offline screen. Packaged Windows logs normally live under:

```text
%APPDATA%\Jarvis Desktop\logs\jarvis-desktop.log
```

Development builds may use `%APPDATA%\frontend\logs`. Logs include lifecycle and connection events but exclude cookies, tokens, query strings, and message content.

If the shell says Jarvis is offline:

1. Open `http://localhost:3000/desktop` in a normal Windows browser.
2. Check the WSL user services with `systemctl --user status jarvis.target`.
3. Confirm Windows can reach WSL localhost and that no firewall rule blocks ports 3000 or 8000.
4. Set `JARVIS_DESKTOP_URL` to the reachable deployed Jarvis URL if the frontend is not local.

Windows media transport uses the current Global System Media Transport Controls session. If the installed YouTube Music PWA is not running or has not created a media session, the dashboard reports media unavailable; **Music** still opens the installed PWA (or the configured web URL as fallback). Account playlist search and login automation are intentionally absent.

CPU/RAM/uptime come from Electron's local OS view. The fixed read-only Windows telemetry helper adds NVIDIA GPU utilization/temperature, system-drive usage, and network throughput when Windows exposes them. Missing sensors remain labeled unavailable instead of receiving demo values.

Weather comes from validated Open-Meteo responses. Set a city/state in Desktop Settings, choose Fahrenheit or Celsius, or explicitly grant browser geolocation. Jarvis shows an unavailable state instead of demo readings when location or the provider is unavailable.

## Source checkout workflow

The WSL checkout is the source of truth:

1. Implement, test, commit, and push in `/home/john/development/jarvis`.
2. In Windows PowerShell, run `cd C:\Development\jarvis; git pull`.
3. Run `npm install` inside `C:\Development\jarvis\frontend` only when dependencies changed.
4. Run or package Electron from that Windows checkout.

Never copy `node_modules`, `.next`, Python virtual environments, `dist-electron`, generated caches, or temporary files between WSL and Windows.

Push-to-talk, continuous microphone capture, wake words, Hermes, playlist/account automation, and auto-update remain intentionally out of scope.
