# LyricFlow

LyricFlow is deployed automatically to GitHub Pages from `main`:

`https://casperboi14.github.io/LyricFlow/`

The GitHub Pages workflow builds the Vite app and publishes `dist`. Full-song
playback, song identification and Spotify token exchange use a backend. Without
a backend the app still works with 30-second iTunes previews and direct LRCLIB /
iTunes requests.

To connect a backend, set `VITE_API_BASE_URL=https://your-backend.example.com`
in the GitHub Actions repository variables (or in `.env` locally) and rebuild.
Leaving it empty uses the same origin, which is useful when one server hosts
both `dist` and `/api`.

## Backend contract

The frontend expects these JSON endpoints:

- `GET /api/audio/find?q=...` -> `{ "youtubeId": "..." }` or `{ "audioUrl": "..." }`, optional `cover`
- `GET /api/music/search?q=...` -> `{ "results": [...] }` or an array of tracks
- `GET /api/lyrics/search?q=...` -> LRCLIB search array
- `GET /api/lyrics/get?artist_name=...&track_name=...` -> LRCLIB record
- `POST /api/identify` with `{ "sample": "<base64 wav>" }` -> `{ "title", "artist", "album", "cover", "url" }`
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
