# LyricFlow

LyricFlow is deployed automatically to GitHub Pages from `main`:

`https://casperboi14.github.io/LyricFlow/`

The GitHub Pages workflow builds the Vite app and publishes `dist`. Songs play
through Spotify when an account is connected (Premium required), with the
YouTube IFrame player as the fallback when Spotify cannot play a track.
Microphone recognition uses AudD, and lyrics come from LRCLIB.

Search has separate Songs and Artists modes. Artist profiles use iTunes artist
IDs for song lists and a Wikipedia photo when available. The Settings tab holds
Spotify connection, playback sync, volume, lyric timing, visual themes, a floating
lyrics widget, and an optional ambient screensaver. The app also has a local
listening dashboard and timeline, and full-screen lyric controls.
Artist and song data come from the existing providers.

Active Spotify Connect playback is checked every 12 seconds by default while
playing on a visible page. Settings allows 3–30 seconds; idle and hidden tabs
check less often. Mobile browsers may suspend JavaScript while another app is
in front, so the page refreshes playback when it becomes visible again unless
Spotify has asked the app to wait. Actual Spotify `Retry-After` responses are
respected across API calls. The playlist browser retains the last loaded list,
automatically retries after a rate limit, and offers a manual retry when allowed.
The last loaded tracks for up to eight playlists are also available during rate
limits. An upstream 429 cannot be removed by the website.

## Spotify setup

Spotify is connected from **Settings → Spotify** with **Connect Spotify**. The server owns the
OAuth exchange, so the browser never sees the client secret:

- `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` — create an app at
  [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and
  add the redirect URI the app displays under **Spotify → Redirect URI** exactly
  as shown, trailing slash included. Spotify requires HTTPS and no longer accepts
  `localhost`, so local dev uses `http://127.0.0.1:5173/` (the app switches over
  from `localhost` automatically) and the deployed site needs
  `https://casperboi14.github.io/LyricFlow/`. Register every origin you sign in
  from; a mismatch fails with `redirect_uri: Not matching configuration`.
- The Fastify server reads `backend/.env`; Vercel functions read the project's
  environment variables. The Vite dev server also reads `backend/.env`.
- Playback uses the Web Playback SDK and requires Spotify Premium plus the
  `streaming` scope, which **Connect Spotify** requests.

`VITE_AUDD_API_TOKEN` can bake an AudD token into the build (or enter it under
**Song recognition** in the app). Keys entered in the app are stored in
`localStorage` on the user's device.

To connect the full API backend instead, set
`VITE_API_BASE_URL=https://your-backend.example.com` in the GitHub Actions
repository variables (or in `.env` locally) and rebuild. Leaving it empty uses
the same origin, which is useful when one server hosts both `dist` and `/api`.

For an always available public backend, import this repository into Vercel. The
root `api/` directory contains the API functions; `vercel.json` selects Vite
and the `dist` output. In Vercel's project settings, leave Root Directory empty
so the repository root is deployed. Verify `https://<project>.vercel.app/api/health`, then set
the GitHub Actions repository variable `VITE_API_BASE_URL` to that Vercel origin
and run the Pages workflow. The deployed address replaces any temporary tunnel
saved by an earlier `?api=` link. Set `SPOTIFY_CLIENT_ID` in Vercel's Production
environment so new devices can
connect without entering the ID. `SPOTIFY_CLIENT_SECRET` is optional; browser
PKCE works with the Client ID alone. Redeploy after changing environment variables.

## Backend contract

The frontend expects these JSON endpoints:

- `GET /api/audio/find?q=...` -> `{ "youtubeId": "..." }` or `{ "audioUrl": "..." }`, optional `cover`
- `GET /api/music/search?q=...` -> `{ "results": [...] }` or an array of tracks
- `GET /api/lyrics/search?q=...` -> LRCLIB search array
- `GET /api/lyrics/get?artist_name=...&track_name=...` -> LRCLIB record
- `POST /api/identify` with `{ "sample": "<base64 wav>" }` -> `{ "title", "artist", "album", "cover", "url" }`
- `GET /api/spotify/config` -> `{ "configured", "clientId", "serverTokenExchange" }`
- `GET /api/spotify/login?state=...&challenge=...&redirect_uri=...` -> `{ "url": "https://accounts.spotify.com/authorize?..." }`
- `POST /api/spotify/token` with a JSON token request body -> Spotify token response

Full songs are played with the YouTube IFrame player. If the backend returns a
licensed `audioUrl`, the frontend plays it directly instead.

## Local development

```sh
npm ci
npm run dev
```

## Use a backend on another computer

Build the site and run `node --env-file=backend/.env server.mjs` on the computer
hosting LyricFlow. The server serves both the website and API on port 8787 by
default. Other devices on the same network can open `http://<server-ip>:8787/`.
Spotify sign-in needs HTTPS (or a loopback address), so use the GitHub Pages
site with an HTTPS backend address for Spotify on other devices.

When no deployed backend is configured, point the GitHub Pages site at an HTTPS backend by opening it once with
`?api=https://your-backend.example.com`. LyricFlow saves that address in this
browser, including across Spotify sign-in redirects. Use `?api=off` to clear it.
The backend must allow `https://casperboi14.github.io` in `CORS_ORIGIN`.

## Production build

```sh
npm run build
```

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
