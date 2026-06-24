# Semantic Memory — Privacy-First Semantic Browser History

> A Chrome extension that indexes everything you browse using local ML embeddings and lets you query your history semantically — entirely on-device, zero data leaves the browser.

<p align="center">
  <strong> Search by meaning, not keywords</strong> · <strong> 100% on-device by default</strong> · <strong> Optional encrypted sync</strong>
</p>

---
Link to the Extension - https://addons.mozilla.org/en-US/firefox/addon/semantic-memory-of-browsing/

## Table of Contents

- [How It Works](#how-it-works)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick Start — Extension Only (Offline)](#quick-start--extension-only-offline)
- [Quick Start — With Backend (Sync + Re-ranking)](#quick-start--with-backend-sync--re-ranking)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Development](#development)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## How It Works

```
You browse the web
       ↓
Content script extracts clean text (Readability.js)
       ↓
Text is chunked (512 tokens, 64 overlap)
       ↓
Chunks are embedded in-browser (MiniLM-L6-v2, ONNX int8, ~23ms/chunk)
       ↓
Embeddings stored in an in-memory vector index + IndexedDB (persisted)
       ↓
You search from the popup: "that article about transformers"
       ↓
Query is embedded → ANN search → ranked results with similarity scores
```

Everything above runs **entirely in your browser**. No servers, no API calls, no data leaves your machine.

The **optional backend** adds:
-  Cross-device sync (end-to-end encrypted — server sees only opaque blobs)
-  Cross-encoder re-ranking for precision boost
-  Topic clustering + knowledge graph (UMAP + k-means)

---

## Features

The popup is organised into four tabs, all powered by on-device ML:

| Feature | What it does |
|---|---|
|  **Semantic Search** | Natural-language search over your history with per-result similarity scores. Matching query terms are **highlighted** in titles and previews, and results are **deduplicated by page** (best-scoring chunk wins). |
|  **Quick Summary** | One-click extractive summary + key points of the page you're currently on (centroid-based sentence ranking). |
|  **Find Similar** | Surfaces related pages from your history based on the current page's content. |
|  **Timeline** | Your browsing history grouped by day, filterable by today / week / month / all. |
|  **Analytics** | Total pages, chunks, domains, reading time, and a top-domains breakdown. |
|  **Settings** | Domain blacklist (skip indexing), opt-in encrypted sync config, and data **export / clear**. |
|  **Context menu** | Right-click selected text → "Search Semantic Memory" (opens the popup pre-filled). |
|  **Shortcut** | `Ctrl+Shift+S` (`Cmd+Shift+S` on macOS) opens the popup. |

Recent searches, animated stats, and a live "index active" indicator round out the UI.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension | Manifest V3, TypeScript, React, Vite |
| ML (in-browser) | Transformers.js, MiniLM-L6-v2 (int8 ONNX), pure-JS cosine vector search |
| Validation | Zod (DOM boundary), branded types (compile-time safety) |
| Persistence | IndexedDB |
| Backend | FastAPI, Python 3.12 |
| Database | PostgreSQL 16 + pgvector |
| Cache/Queue | Redis 7 |
| Re-ranking | ms-marco-MiniLM cross-encoder |
| Clustering | UMAP + k-means (scikit-learn) |
| Auth | JWT (python-jose) + bcrypt |
| Encryption | AES-256-GCM (WebCrypto API, client-side) |
| Infrastructure | Docker, Docker Compose |

---

## Project Structure

```
semantic-memory-extension/
├── extension/                        # Chrome extension (client)
│   ├── manifest.json                 # MV3 manifest
│   ├── popup.html                    # Popup entry HTML
│   ├── package.json                  # Node dependencies
│   ├── vite.config.ts                # Vite + CRXJS config
│   ├── tsconfig.json                 # Strict TypeScript config
│   ├── public/
│   │   ├── icons/                    # Extension icons (16/48/128)
│   │   └── models/                   # ONNX model weights (auto-downloaded)
│   └── src/
│       ├── background/
│       │   ├── service-worker.ts     # Thin router + context menu + badge
│       │   ├── offscreen.ts          # ML inference + HNSW + IndexedDB (offscreen doc)
│       │   └── embedding-worker.ts   # MiniLM inference (Web Worker)
│       ├── content/
│       │   ├── content-script.ts     # DOM scraper + Readability
│       │   ├── content-schema.ts     # Zod validation
│       │   └── chunker.ts           # Sentence-window chunking
│       ├── popup/
│       │   ├── main.tsx             # React entrypoint (createRoot)
│       │   ├── App.tsx              # Popup root + tab nav + result dedup
│       │   ├── SearchBar.tsx        # Query input + recent searches
│       │   ├── ResultCard.tsx       # Result card + query-term highlighting
│       │   ├── styles.css           # Dark glassmorphism design system
│       │   ├── components/
│       │   │   ├── StatsBar.tsx     # Live index stats (animated)
│       │   │   ├── QuickSummary.tsx # Extractive summary of current page
│       │   │   └── SimilarPages.tsx # "Find similar" from history
│       │   └── tabs/
│       │       ├── TimelineTab.tsx  # Browsing history by day
│       │       ├── AnalyticsTab.tsx # Stats + top domains
│       │       └── SettingsTab.tsx  # Blacklist, sync, export/clear
│       ├── store/
│       │   ├── vector-store.ts      # hnswlib-wasm wrapper
│       │   ├── metadata-store.ts    # IndexedDB persistence (singleton)
│       │   ├── idb-adapter.ts       # IDB facade
│       │   └── sync-client.ts       # E2E encrypted sync client
│       └── types/
│           ├── index.ts             # Branded types + message unions
│           └── errors.ts            # Custom error classes
│
├── backend/                          # FastAPI backend (optional)
│   ├── Dockerfile                    # Multi-stage, non-root
│   ├── docker-compose.yml            # API + PostgreSQL + Redis
│   ├── requirements.txt              # Python dependencies
│   ├── .env.example                  # Environment template
│   └── app/
│       ├── main.py                   # FastAPI app (lifespan pattern)
│       ├── core/
│       │   ├── settings.py           # Pydantic settings (env-based)
│       │   └── security.py           # JWT + bcrypt + get_current_user
│       ├── routers/
│       │   ├── auth.py              # /register, /login, /me
│       │   ├── sync.py              # /push, /pull, /status
│       │   ├── rerank.py            # Cross-encoder re-ranking
│       │   └── analytics.py         # UMAP clustering + stats
│       ├── models/
│       │   ├── user.py              # User model
│       │   └── page.py             # Page, Chunk (pgvector), IndexSnapshot
│       ├── services/
│       │   ├── reranker.py          # CrossEncoder wrapper
│       │   ├── embedding.py         # sentence-transformers wrapper
│       │   ├── clustering.py        # UMAP + k-means pipeline
│       │   └── encryption.py        # Blob validation (no decryption)
│       └── db/
│           ├── postgres.py          # Async engine + session factory
│           └── redis.py             # Async Redis pool
│
├── scripts/                          # Utilities (benchmarks, quantization)
├── PLAN.md                           # Full project documentation
└── README.md                         # ← You are here
```

---

## Prerequisites

### Extension Only (no backend needed)
- **Node.js** ≥ 18
- **npm** ≥ 9
- **Google Chrome** (or any Chromium-based browser)

### With Backend
- Everything above, plus:
- **Docker** ≥ 24.0 and **Docker Compose** ≥ 2.20
- Or, for running without Docker:
  - **Python** ≥ 3.12
  - **PostgreSQL** 16 with the [pgvector](https://github.com/pgvector/pgvector) extension
  - **Redis** ≥ 7

---

## Quick Start — Extension Only (Offline)

This gets you a fully working semantic search over your browsing history, entirely on-device.

### 1. Install dependencies

```bash
cd extension
npm install
```

### 2. Build the extension

```bash
npm run build
```

This compiles TypeScript and bundles everything into the `dist/` folder.

### 3. Load into Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked**
4. Select the `extension/dist` folder
5. The Semantic Memory icon appears in your toolbar

### 4. Use it

- **Browse normally** — every page you visit is automatically parsed, chunked, and embedded
- **Click the extension icon** to open the popup
- **Type a natural language query** like *"that article about HNSW indexing"*
- Results show with similarity scores and timestamps

> **First use:** The MiniLM-L6-v2 model (~23MB) downloads on first page visit and caches in the browser. Subsequent loads are instant.

### Development mode

For hot-reload during development:

```bash
cd extension
npm run dev
```

Then load the `extension/` root folder (not `dist/`) in Chrome. CRXJS handles live updates.

---

## Quick Start — With Backend (Sync + Re-ranking)

### Option A: Docker Compose (recommended)

```bash
cd backend

# Copy and configure environment variables
cp .env.example .env
# Edit .env — at minimum, change JWT_SECRET

# Start all services
docker compose up --build
```

This starts:
- **API** on `http://localhost:8000` (FastAPI with auto-docs at `/docs`)
- **PostgreSQL 16** + pgvector on port `5432`
- **Redis 7** on port `6379`

Health checks ensure services start in the correct order.

### Option B: Manual setup (without Docker)

```bash
cd backend

# Create a virtual environment
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# or
.venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Set environment variables (or create a .env file)
export DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/semantic_memory"
export REDIS_URL="redis://localhost:6379"
export JWT_SECRET="your-secure-secret-here"

# Make sure PostgreSQL is running with pgvector installed
# Make sure Redis is running

# Start the API
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Verify the backend

```bash
# Health check
curl http://localhost:8000/health
# → {"status":"ok"}

# Interactive API docs
open http://localhost:8000/docs
```

### Connect the extension to the backend

1. Register a user:
```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "your-password"}'
# → {"access_token": "eyJ...", "token_type": "bearer"}
```

2. The sync client in the extension (`sync-client.ts`) can be configured with the token. Sync is opt-in — the extension works fully offline by default.

---

## Configuration

### Backend Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/semantic_memory` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `JWT_SECRET` | `change-me-in-production` | **Change this!** Secret for signing JWTs |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `JWT_EXPIRY_HOURS` | `72` | Token lifetime in hours |
| `GOOGLE_CLIENT_ID` | *(empty)* | Google OAuth2 client ID (optional) |
| `GOOGLE_CLIENT_SECRET` | *(empty)* | Google OAuth2 client secret (optional) |
| `ENCRYPTION_KEY_SALT` | `semantic-memory-salt-v1` | Salt for client-side PBKDF2 key derivation |

### Extension Constants (in source)

| Constant | Value | File |
|---|---|---|
| Embedding dimensions | `384` | `vector-store.ts` |
| Vector search | brute-force cosine (normalized → dot product) | `vector-store.ts` |
| Chunk max tokens | `512` | `chunker.ts` |
| Chunk overlap | `64` | `chunker.ts` |
| Keep-alive interval | `25s` | `service-worker.ts` |
| Sync interval | `5 min` | `sync-client.ts` |
| Search timeout | `20s` | `App.tsx` |

---

## API Reference

All endpoints (except health and auth) require a `Bearer` token in the `Authorization` header.

### Auth

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/register` | Register with email + password → JWT |
| `POST` | `/auth/login` | Login with email + password → JWT |
| `GET` | `/auth/me` | Get current user profile |

### Sync

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/sync/push` | Upload encrypted HNSW index snapshot |
| `GET` | `/sync/pull` | Download latest encrypted snapshot |
| `GET` | `/sync/status` | Check latest sync version + snapshot count |

### Re-ranking

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/rerank/` | Re-rank ANN candidates with cross-encoder (max 100) |

### Analytics

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/analytics/clusters` | UMAP + k-means clustering on embeddings (max 50k) |
| `GET` | `/analytics/stats` | Per-user reading stats |

### System

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Interactive Swagger UI |
| `GET` | `/redoc` | ReDoc API documentation |

---

## Development

### Extension

```bash
cd extension

npm run dev          # Start Vite dev server with HMR
npm run build        # Production build to dist/
npm run typecheck    # TypeScript type checking (no emit)
npm run lint         # ESLint
```

### Backend

```bash
cd backend

# With Docker
docker compose up --build          # Start all services
docker compose down                # Stop all services
docker compose down -v             # Stop + remove volumes (reset DB)
docker compose logs -f api         # Follow API logs

# Without Docker
uvicorn app.main:app --reload      # Dev server with auto-reload
```

### Type Safety Notes

The extension uses strict TypeScript with several advanced patterns:
- **Branded types** (`RawText`, `ChunkText`, `Embedding`, `PageId`, `ChunkId`) prevent mixing up data at compile time
- **Discriminated unions** for all cross-worker/runtime messages — exhaustive switch coverage
- **Zod validation** at the DOM boundary before data enters the typed pipeline
- **`noUncheckedIndexedAccess`** forces handling the `undefined` case on every array index

---

## Deployment

### Extension → Chrome Web Store

1. Build the production bundle:
   ```bash
   cd extension && npm run build
   ```
2. Zip the `dist/` folder
3. Upload to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
4. Fill in the listing details and privacy policy
5. Submit for review

### Backend → Production

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full production deployment guides covering:
- Docker Compose (single server)
- Railway / Render / Fly.io (managed platforms)
- AWS ECS / GCP Cloud Run (cloud providers)

**Key production checklist:**
- [ ] Change `JWT_SECRET` to a strong random value (`openssl rand -hex 32`)
- [ ] Set `POSTGRES_PASSWORD` to something secure
- [ ] Enable HTTPS (reverse proxy with Nginx or Caddy)
- [ ] Restrict CORS origins to your extension ID
- [ ] Set up database backups
- [ ] Configure rate limiting

---

## Troubleshooting

### Extension

| Issue | Solution |
|---|---|
| Popup is blank | Make sure you loaded `dist/` (built) not `extension/` root. Run `npm run build` first. |
| "Model loading" takes forever | First load downloads ~23MB. Check your network. Subsequent loads use browser cache. |
| Search returns nothing | Browse at least one page first to build the index (search works even with very few chunks indexed). Check the offscreen/service-worker console for errors. |
| Service worker keeps restarting | This is normal MV3 behavior. The keep-alive ping handles it. |

### Backend

| Issue | Solution |
|---|---|
| `docker compose up` fails | Check Docker is running. Try `docker compose down -v` to reset. |
| Database connection refused | Wait for the health check — Postgres takes a few seconds to start. |
| `pgvector` not found | Make sure you're using `pgvector/pgvector:pg16` image, not plain `postgres`. |
| JWT token expired | Default expiry is 72 hours. Login again to get a new token. |

---

## Privacy & Security

- **All ML inference runs in your browser** — embedding generation never leaves the device
- **IndexedDB storage is local** — your browsing data stays on your machine
- **Sync is opt-in** — the extension works fully offline by default
- **End-to-end encryption** — if you opt into sync, data is encrypted client-side with AES-256-GCM before upload. Keys are derived from your auth token via PBKDF2 (100k iterations). The server stores only opaque encrypted blobs.
- **Zero plaintext on server** — even a full database breach exposes nothing meaningful

---

## License

MIT
