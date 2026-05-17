# SpotTheShot - geolocation guessing game

Create a lobby, invite your friends, everyone uploads a handful of photos, and you take turns guessing on a map where each photo was taken. Closer guesses score more points; round-by-round and end-of-game highlights keep score across the lobby. Includes achievements and other fun gamification things.

Optionally drop in an **on-device "AI" player** that guesses for itself and auto-names everyone's photos with one-line commentary. The AI runs entirely on your machine, no API keys, no external services.

**Privacy by design.** Your photos don't leave your server. Photos live on disk only for the duration of the round they're being played in, and are deleted as soon as the round ends.

**Built for modest hardware.** Both AI services are CPU-only and target ~4 GB of RAM at idle.

A self-hosted multiplayer game built around three services: a Node.js + Socket.IO server, a FastAPI image-to-GPS model ([FastGeoCLIP](https://github.com/fbarbe00/FastGeoCLIP)), and a llama.cpp vision LLM for AI commentary and auto-naming.

## Architecture

| Service | Stack | Port | What it does |
|---|---|---|---|
| `client` | React + Vite, nginx | 4080 | Game UI; reverse-proxies API/socket/uploads to `server` |
| `server` | Node.js + Express + Socket.IO | 3001 | Lobby/round state, photo uploads, AI orchestration |
| `geoclip` | FastAPI + PyTorch + FAISS | 8000 | Image → GPS coordinate prediction |
| `vision` | llama.cpp + Ministral-3B-Instruct vision | 8001 | AI commentary, auto-titles for photos, lobby-name generation |

The client's nginx proxies `/api/`, `/uploads/`, and `/socket.io` to `server:3001` over the Docker network. The hostname `server` is hardcoded in `client/nginx.conf`.

## Requirements

- Docker and Docker Compose
- ~6 GB free disk (CLIP vision tower ~1.2 GB, Ministral-3B ~2 GB, GeoCLIP gallery + cache ~400 MB, Docker images ~2 GB)
- ~4 GB RAM at idle. Vision inference is the main bottleneck.
- A multi-core CPU helps both inference services. Both run CPU-only; no GPU required.
- The vision build targets `x86-64-v3` by default.

## Setup

```bash
git clone --recurse-submodules https://github.com/fbarbe00/SpotTheShot.git
cd SpotTheShot
cp .env.example .env
```

### 1. FastGeoCLIP weights and data

The `geoclip/` directory is a submodule pointing at [fbarbe00/FastGeoCLIP](https://github.com/fbarbe00/FastGeoCLIP). The GeoCLIP fine-tuned weights and the 100K-point GPS gallery come bundled with the submodule (in `geoclip/fastgeoclip/`), so the only host-prepared artifacts are the CLIP vision tower and the reverse-geocoding GeoPackage:

```bash
cd geoclip
python reduce_clip_size.py             # downloads CLIP into geoclip/clip/clip-vit-large-vision/
# Optional: drop a GeoPackage at geoclip/data/admin1_clean.gpkg to enable /lookup
# See FastGeoCLIP's README for a wget + convert one-liner.
cd ..
```

Both `geoclip/clip/` and `geoclip/data/` are mounted into the container read-only by `docker-compose.yml`. The first container start spends ~1 minute generating the FAISS index + gallery embeddings, then caches them in the `geoclip_cache` named volume so subsequent starts are fast.

### 2. Vision model

The vision service uses Ministral-3B-Instruct with the `mmproj-F16` multimodal projector. Download it once:

```bash
cd vision
./download-model.sh
cd ..
```

This pulls `Ministral-3-3B-Instruct-2512-IQ4_NL.gguf` + `mmproj-F16.gguf` (~2 GB) into `vision/models/ministral/`. The `entrypoint.sh` is wired to those exact filenames. If you swap models, edit the entrypoint to match.

### 3. Run

```bash
./run_docker.sh up --build
```

The client lands on http://localhost:4080.

Other entry points (`./run_docker.sh dev`, `prod`, `down`, `restart`, `logs`) wrap the obvious docker-compose commands. `dev` mode enables hot-reload via `docker compose --watch`.

## Configuration

Everything is in `.env`. Key knobs:

| Var | Default | Purpose |
|---|---|---|
| `CLIENT_URL` | `http://localhost:4080` | CORS + Socket.IO origin |
| `ROUND_DURATION_SEC` | 30 | Per-round timer (0 = unlimited for progressive/duel modes) |
| `UPLOAD_LIMIT_MB` | 20 | Max photo upload size |
| `MAX_LOBBIES` | 5 | Server-wide lobby cap |
| `DEFAULT_MAX_PLAYERS` | 20 | Per-lobby player cap (overridable per-token) |
| `GEO_CONCURRENCY` | 2 | Parallel GeoCLIP requests in flight |
| `VISION_CONCURRENCY` | 1 | Parallel vision LLM requests (memory-bound) |
| `THREADS`, `NUM_THREADS` | 4 | CPU thread count for vision and geoclip |
| `VITE_MAP_BBOX_*` | Europe | Default in-game map bounding box |

Token-based access control lives in `server/data/tokens.json` (gitignored). The defaults in `.env.example` apply to anyone without a token.

### Access tokens

Tokens let you grant specific users expanded capabilities beyond the server defaults (e.g. more players per lobby, higher photo limits, or unlocked AI features).

Create or edit `server/data/tokens.json` (it is mounted as a Docker volume so it persists across restarts):

```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "secret": "your-long-random-secret-string-at-least-16-chars",
    "name": "Alice (friend)",
    "expiresAt": null,
    "maxPlayersPerLobby": 50,
    "maxPhotosPerPlayer": 20,
    "allowAllMaps": true,
    "allowAIGuessing": true,
    "allowAutoNaming": true,
    "allowVisionCommentary": true
  }
]
```

**Fields:**

| Field | Type | Description |
|---|---|---|
| `id` | UUID string | Unique identifier — any UUID v4 works |
| `secret` | string (≥16 chars) | The value users paste into the token field in-game |
| `name` | string | Human-readable label shown to the user on token acceptance |
| `expiresAt` | ms epoch or `null` | Expiry timestamp in milliseconds (`Date.now()` style), or `null` for never |
| `maxPlayersPerLobby` | number | Per-lobby player cap for lobbies created with this token |
| `maxPhotosPerPlayer` | number | Per-player photo upload cap |
| `allowAllMaps` | boolean | Unlock all map styles (satellite, watercolor, etc.) |
| `allowAIGuessing` | boolean | Allow adding an AI opponent |
| `allowAutoNaming` | boolean | Allow AI auto-naming of photos |
| `allowVisionCommentary` | boolean | Allow AI vision commentary |

Any omitted field falls back to the server default from `.env`. To generate a secret, use any password generator or run `openssl rand -hex 32` in your terminal. Users enter the secret in the lobby UI under *"Have an access token?"*.

## Development

```bash
cd client && npm install && npm run dev          # client only, against running backend
cd server && npm install && node server.js       # server only, against running model services
./install-hooks.sh                                # installs lint + test pre-commit hook
```

Tests and translation audit:

```bash
cd client
npm run test
npm run check-translations
```

## Supported languages

English, French, Italian, Spanish, German, Russian. UI strings, achievements, and end-of-game highlights are translated; AI commentary is generated in the lobby's selected language by the vision LLM.

## Tested on

- **OS:** Ubuntu 24.04.4 LTS (Linux 6.8 x86_64)
- **CPU:** AMD EPYC, 4 cores / 4 threads
- **RAM:** 8 GB
- All services run CPU-only; no GPU required.


## License

Source-available, **non-commercial use only**. You are free to run, modify, and share SpotTheShot for personal, educational, or evaluation purposes. Any commercial use — hosting it as a paid service, bundling it into a paid product, or running it on behalf of a revenue-generating organisation — requires written permission from the maintainer first. Open a GitHub issue at <https://github.com/fbarbe00/SpotTheShot> to request it. Full terms in [LICENSE](LICENSE).

The `geoclip/` submodule ([FastGeoCLIP](https://github.com/fbarbe00/FastGeoCLIP)) is MIT-licensed independently and is unaffected by this restriction.