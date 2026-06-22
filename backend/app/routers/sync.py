from typing import Annotated
import base64

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.postgres import get_session
from app.models.user import User
from app.models.page import IndexSnapshot

router = APIRouter()


# --- Request / Response schemas ---


class PushRequest(BaseModel):
    """Client sends encrypted HNSW index + metadata."""
    encrypted_index_b64: str  # Base64-encoded AES-256-GCM encrypted blob
    encrypted_metadata_b64: str  # Base64-encoded AES-256-GCM encrypted blob
    version: int


class PullResponse(BaseModel):
    encrypted_index_b64: str
    encrypted_metadata_b64: str
    version: int


class SyncStatusResponse(BaseModel):
    latest_version: int
    snapshot_count: int


# --- Endpoints ---


@router.post("/push", status_code=status.HTTP_201_CREATED)
async def push_index(
    body: PushRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """
    Accept encrypted HNSW index snapshot from client.

    The server stores opaque blobs — no decryption keys are ever server-side.
    Encryption/decryption is entirely client-side using AES-256-GCM with
    keys derived from the user's auth token via PBKDF2.
    """
    try:
        encrypted_index = base64.b64decode(body.encrypted_index_b64)
        encrypted_metadata = base64.b64decode(body.encrypted_metadata_b64)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid base64 encoding",
        )

    # Validate minimum blob size (IV + tag + at least 1 byte of ciphertext)
    # AES-256-GCM: 12 bytes IV + 16 bytes auth tag = 28 bytes minimum
    if len(encrypted_index) < 28 or len(encrypted_metadata) < 28:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Encrypted blobs are too small — likely malformed",
        )

    snapshot = IndexSnapshot(
        user_id=user.id,
        encrypted_index=encrypted_index,
        encrypted_metadata=encrypted_metadata,
        version=body.version,
    )
    session.add(snapshot)
    await session.commit()

    return {"status": "ok", "version": body.version}


@router.get("/pull", response_model=PullResponse)
async def pull_index(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """
    Return latest encrypted index snapshot for cross-device restore.
    The client decrypts locally using their derived key.
    """
    result = await session.execute(
        select(IndexSnapshot)
        .where(IndexSnapshot.user_id == user.id)
        .order_by(desc(IndexSnapshot.created_at))
        .limit(1)
    )
    snapshot = result.scalar_one_or_none()

    if not snapshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No snapshots found — sync has not been configured",
        )

    return PullResponse(
        encrypted_index_b64=base64.b64encode(snapshot.encrypted_index).decode(),
        encrypted_metadata_b64=base64.b64encode(snapshot.encrypted_metadata).decode(),
        version=snapshot.version,
    )


@router.get("/status", response_model=SyncStatusResponse)
async def sync_status(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Check the latest sync version and total snapshot count."""
    from sqlalchemy import func

    result = await session.execute(
        select(
            func.count(IndexSnapshot.id).label("count"),
            func.coalesce(func.max(IndexSnapshot.version), 0).label("max_version"),
        ).where(IndexSnapshot.user_id == user.id)
    )
    row = result.one()

    return SyncStatusResponse(
        latest_version=row.max_version,
        snapshot_count=row.count,
    )
