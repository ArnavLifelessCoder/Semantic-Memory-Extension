from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, sync, rerank, analytics
from app.db.postgres import init_db
from app.db.redis import close_redis


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown lifecycle."""
    await init_db()
    yield
    await close_redis()


app = FastAPI(
    title="Semantic Memory API",
    version="1.0.0",
    description="Privacy-first semantic browsing history sync backend",
    lifespan=lifespan,
)

# CORS — allow the Chrome extension to talk to the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Extension origin is chrome-extension://...
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(sync.router, prefix="/sync", tags=["sync"])
app.include_router(rerank.router, prefix="/rerank", tags=["rerank"])
app.include_router(analytics.router, prefix="/analytics", tags=["analytics"])


@app.get("/health")
async def health_check():
    return {"status": "ok"}
