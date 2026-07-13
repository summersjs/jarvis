# Jarvis Desktop for Windows

Jarvis Desktop is a secure Electron shell around the existing Next.js `/desktop` route. It does not copy or bundle a second frontend. The Next.js frontend and FastAPI backend remain the source of truth and can continue serving phones and normal browsers, including the compatibility `/chloe` route.

## Architecture

- `frontend/electron/main.cjs`: Electron lifecycle, secure window, connection monitor, tray, shortcut, login-item setting, native telemetry, and navigation controls.
- `frontend/electron/preload.cjs`: narrow `contextBridge` API. Node.js and raw Electron APIs are not exposed to the web renderer.
- `frontend/electron/offline.html`: local, secret-free offline screen with Retry and Open logs actions.
- `frontend/electron/dev-launcher.cjs`: reuses a running frontend or starts one, waits for `/desktop`, starts Electron, and cleans up only the frontend process it created.
- Electron stores window and startup preferences in its per-user application data directory.

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
cd C:\Users\johnf\OneDrive\Development\jarvis\frontend
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
- `JARVIS_CHLOE_ROUTE`: compatibility assistant route used by Alt+C and the tray. Default: `/chloe`.
- `JARVIS_STARTUP_PREFERENCE_PATH`: optional absolute path for Electron window/startup preferences. The default is Electron's user-data directory.
- `ELECTRON_IS_DEV=1`: enables development logging; `desktop:dev` sets it automatically.

Do not put API keys, tokens, cookies, or credentials in these URLs. Query strings are stripped from logs and the offline screen, but authenticated Jarvis access should continue using the existing web application mechanism.

## Native behavior

- Closing the window hides it in the system tray.
- Use tray **Quit** to terminate Electron completely.
- Alt+C restores a hidden window, focuses an unfocused window, or opens the compatibility Chloe route when already focused.
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

Current native telemetry is intentionally limited to CPU, RAM, and uptime. Native media control, push-to-talk, wake-word listening, notifications, a floating assistant window, TTS integration, and auto-update are future extension points and are not implemented in this pass.
