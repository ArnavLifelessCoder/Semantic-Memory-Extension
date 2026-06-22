from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.db.postgres import get_session
from app.models.user import User

router = APIRouter()


# --- Request / Response schemas ---


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    email: str
    created_at: str


# --- Endpoints ---


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Register a new user with email + password."""
    # Check for existing user
    existing = await session.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    token = create_access_token(str(user.id), user.email)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Authenticate with email + password, receive a JWT."""
    result = await session.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    token = create_access_token(str(user.id), user.email)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
async def get_me(user: Annotated[User, Depends(get_current_user)]):
    """Return the currently authenticated user's profile."""
    return UserResponse(
        id=str(user.id),
        email=user.email,
        created_at=user.created_at.isoformat(),
    )
