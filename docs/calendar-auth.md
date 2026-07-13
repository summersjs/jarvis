# Google Calendar reauthentication

The home-page Calendar Sync control now starts a browser OAuth flow when the saved Google token is missing, expired, revoked, or missing Calendar scope.

Jarvis uses this local callback by default:

```text
http://127.0.0.1:8000/calendar/oauth/callback
```

Set `JARVIS_CALENDAR_REDIRECT_URI` if the backend is served at another approved address. The Google OAuth client in `credentials.json` must be an installed/desktop application client that permits a loopback callback. The callback uses a short-lived random state, writes `token.json` with mode `600`, and never returns token contents to the frontend.
