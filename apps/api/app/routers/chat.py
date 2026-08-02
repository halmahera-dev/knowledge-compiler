"""Copilot conversations: sessions, their turns, and the history behind them.

A session belongs to a workspace, not to the person who opened it. What is being
asked about is the workspace's compiled wiki, so the thread belongs where its
evidence does — and a colleague added to the workspace can read how a conclusion
was reached rather than only the conclusion.

Turns are appended whole. A question stored without its answer would render as a
thread that hangs, and the agent has both by the time it reports back.
"""

from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import case, delete, func, select

from ..deps import DbDep, MemberScope, ScopeDep
from ..models import ChatMessage, ChatSession
from ..schemas import (
    AppendTurnRequest,
    ChatMessageOut,
    ChatSessionDetailOut,
    ChatSessionOut,
    CreateSessionRequest,
)

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])

#: How much of a first question becomes the session title.
TITLE_CHARS = 60


def derive_title(question: str) -> str:
    """Name a session after what it opened with.

    A list of timestamps tells the reader nothing about which thread to reopen;
    a list of questions tells them everything. Cut on a word boundary — a title
    severed mid-word reads as corruption rather than as truncation.
    """
    cleaned = " ".join(question.split())
    if not cleaned:
        return "New conversation"
    if len(cleaned) <= TITLE_CHARS:
        return cleaned

    cut = cleaned[:TITLE_CHARS]
    space = cut.rfind(" ")
    return f"{(cut[:space] if space > TITLE_CHARS // 2 else cut).rstrip()}…"


#: Deterministic order within a turn.
#:
#: Both messages of an exchange are inserted in one transaction and take the same
#: `created_at` default, so ordering by time alone left them in whatever order the
#: database happened to return — which put answers above their questions. The
#: question always comes first at a given instant.
_TURN_ORDER = (ChatMessage.created_at, case((ChatMessage.role == "user", 0), else_=1))


def _message_out(message: ChatMessage) -> ChatMessageOut:
    return ChatMessageOut.model_validate(
        {
            "id": message.id,
            "role": message.role,
            "content": message.content,
            "citations": message.citations or [],
            "claims": message.claims or [],
            "refused": message.refused,
            "created_at": message.created_at,
        }
    )


async def _load_session(db: DbDep, session_id: uuid.UUID, scope) -> ChatSession:
    """Fetch a session, refusing anything outside the caller's workspace.

    404 rather than 403 for another workspace's session: whether an id exists is
    itself information, and one workspace has no business learning it about
    another.
    """
    session = await db.get(ChatSession, session_id)
    if session is None or session.workspace_id != scope.workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="conversation not found"
        )
    return session


@router.get("/sessions", response_model=list[ChatSessionOut])
async def list_sessions(
    db: DbDep, scope: ScopeDep, limit: int = Query(50, ge=1, le=200)
) -> list[ChatSessionOut]:
    """Conversations in this workspace, most recently used first."""
    counts = (
        select(ChatMessage.session_id, func.count().label("n"))
        .group_by(ChatMessage.session_id)
        .subquery()
    )
    rows = (
        await db.execute(
            select(ChatSession, func.coalesce(counts.c.n, 0))
            .outerjoin(counts, counts.c.session_id == ChatSession.id)
            .where(ChatSession.workspace_id == scope.workspace_id)
            .order_by(ChatSession.updated_at.desc())
            .limit(limit)
        )
    ).all()

    return [
        ChatSessionOut.model_validate(
            {
                "id": s.id,
                "title": s.title,
                "created_at": s.created_at,
                "updated_at": s.updated_at,
                "message_count": n,
            }
        )
        for s, n in rows
    ]


@router.post("/sessions", response_model=ChatSessionDetailOut, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: CreateSessionRequest, db: DbDep, scope: MemberScope
) -> ChatSessionDetailOut:
    session = ChatSession(
        workspace_id=scope.workspace_id,
        user_id=scope.user_id,
        title=payload.title or "New conversation",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return ChatSessionDetailOut.model_validate(
        {
            "id": session.id,
            "title": session.title,
            "created_at": session.created_at,
            "updated_at": session.updated_at,
            "message_count": 0,
            "messages": [],
        }
    )


@router.get("/sessions/{session_id}", response_model=ChatSessionDetailOut)
async def get_session(
    session_id: uuid.UUID, db: DbDep, scope: ScopeDep
) -> ChatSessionDetailOut:
    session = await _load_session(db, session_id, scope)
    messages = (
        await db.scalars(
            select(ChatMessage)
            .where(ChatMessage.session_id == session.id)
            .order_by(*_TURN_ORDER)
        )
    ).all()

    return ChatSessionDetailOut.model_validate(
        {
            "id": session.id,
            "title": session.title,
            "created_at": session.created_at,
            "updated_at": session.updated_at,
            "message_count": len(messages),
            "messages": [_message_out(m) for m in messages],
        }
    )


@router.post("/sessions/{session_id}/turns", response_model=ChatSessionDetailOut)
async def append_turn(
    session_id: uuid.UUID, payload: AppendTurnRequest, db: DbDep, scope: MemberScope
) -> ChatSessionDetailOut:
    """Record a question and the answer it produced."""
    session = await _load_session(db, session_id, scope)

    db.add(ChatMessage(session_id=session.id, role="user", content=payload.question))
    db.add(
        ChatMessage(
            session_id=session.id,
            role="assistant",
            content=payload.answer,
            citations=[c.model_dump(by_alias=True) for c in payload.citations],
            claims=[c.model_dump(by_alias=True) for c in payload.claims],
            refused=payload.refused,
        )
    )

    # A session named by its opening question stays recognisable in the list; one
    # renamed by every turn would drift away from what the reader remembers.
    if session.title == "New conversation":
        session.title = derive_title(payload.question)
    session.updated_at = dt.datetime.now(dt.UTC)

    await db.commit()
    return await get_session(session_id, db, scope)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: uuid.UUID, db: DbDep, scope: MemberScope) -> None:
    session = await _load_session(db, session_id, scope)
    # Messages go with it via ON DELETE CASCADE.
    await db.execute(delete(ChatSession).where(ChatSession.id == session.id))
    await db.commit()
