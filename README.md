# LyricFlow

LyricFlow is deployed automatically to GitHub Pages from `main`:

`https://casperboi14.github.io/LyricFlow/`

The GitHub Pages workflow builds the Vite app and publishes `dist`. Songs play
through Spotify when an account is connected (Premium required), with the
YouTube IFrame player as the fallback when Spotify cannot play a track.
Microphone recognition uses AudD, and lyrics come from LRCLIB.

## Spotify setup

Spotify is connected from the app with **Connect Spotify**. The server owns the
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
