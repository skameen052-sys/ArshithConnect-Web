import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Set
from fastapi import APIRouter, Depends, HTTPException, status, Query, WebSocket, WebSocketDisconnect, UploadFile, File
from pydantic import BaseModel

from app.services.firestore_service import firestore_service, FirestoreService
from app.dependencies.auth import get_current_user
from app.core.security import decode_access_token
from app.core.firebase import verify_firebase_token

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/chat", tags=["Teams Chat"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "chat_uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
ALLOWED_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp",
    ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".txt", ".csv", ".zip",
    ".webm", ".mp3", ".wav", ".ogg", ".m4a", ".aac"
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


# ==============================================================================
# WebSocket Real-Time Connection Manager
# ==============================================================================
class ConnectionManager:
    """Manages active WebSocket connections for instant real-time dispatch."""

    def __init__(self):
        # Maps user key (str) -> Set of active WebSocket instances
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # Set of currently active user keys (for presence)
        self.online_users: Set[str] = set()

    def _normalize_key(self, key: Any) -> str:
        return str(key).strip().lower() if key else ""

    async def connect(self, websocket: WebSocket, user_keys: List[str]):
        await websocket.accept()
        for k in user_keys:
            norm = self._normalize_key(k)
            if not norm:
                continue
            if norm not in self.active_connections:
                self.active_connections[norm] = set()
            self.active_connections[norm].add(websocket)
            self.online_users.add(norm)

    def disconnect(self, websocket: WebSocket, user_keys: List[str]):
        for k in user_keys:
            norm = self._normalize_key(k)
            if not norm:
                continue
            if norm in self.active_connections:
                self.active_connections[norm].discard(websocket)
                if not self.active_connections[norm]:
                    del self.active_connections[norm]
                    self.online_users.discard(norm)

    def is_user_online(self, user_key: Any) -> bool:
        norm = self._normalize_key(user_key)
        return norm in self.online_users and len(self.active_connections.get(norm, set())) > 0

    async def broadcast_to_keys(self, user_keys: List[str], event: dict):
        sent_sockets: Set[WebSocket] = set()
        for k in user_keys:
            norm = self._normalize_key(k)
            if norm in self.active_connections:
                for ws in list(self.active_connections[norm]):
                    if ws not in sent_sockets:
                        try:
                            await ws.send_text(json.dumps(event))
                            sent_sockets.add(ws)
                        except Exception as e:
                            logger.debug(f"Failed to send to socket: {e}")

    async def broadcast_all(self, event: dict):
        sent_sockets: Set[WebSocket] = set()
        for sockets in self.active_connections.values():
            for ws in list(sockets):
                if ws not in sent_sockets:
                    try:
                        await ws.send_text(json.dumps(event))
                        sent_sockets.add(ws)
                    except Exception:
                        pass


manager = ConnectionManager()


# ==============================================================================
# Helper functions to extract user identities
# ==============================================================================
def get_user_identifiers(user: Any) -> Dict[str, str]:
    """Extract primary ID, employee ID, email, role, and display name."""
    role = str(getattr(user, "role", "employee")).strip().lower()
    email = str(getattr(user, "email", "")).strip().lower()
    emp_id = str(getattr(user, "employee_id", None) or getattr(user, "employeeId", None) or "").strip()
    uid = str(getattr(user, "id", None) or getattr(user, "uid", None) or "").strip()
    name = (
        getattr(user, "full_name", None)
        or getattr(user, "fullName", None)
        or getattr(user, "name", None)
        or (email.split("@")[0].title() if email else "User")
    )

    primary_id = emp_id if emp_id else (uid if uid else email)
    if role == "admin" and not emp_id:
        primary_id = "ADM-001"

    return {
        "primary_id": primary_id,
        "employee_id": emp_id,
        "uid": uid,
        "email": email,
        "role": role,
        "name": name,
    }


def get_all_user_keys(identifiers: Dict[str, str]) -> List[str]:
    """Return all unique keys that represent this user in messaging."""
    keys = []
    for k in ["primary_id", "employee_id", "uid", "email", "name"]:
        val = identifiers.get(k)
        if val and str(val).strip():
            keys.append(str(val).strip().lower())
    if identifiers.get("role") == "admin":
        keys.extend(["admin", "adm-001", "administrator"])
    return list(set(keys))


def user_matches_target(identifiers: Dict[str, str], target: Any) -> bool:
    """Check if target string matches any of the user's keys."""
    if not target:
        return False
    target_norm = str(target).strip().lower()
    return target_norm in get_all_user_keys(identifiers)


def resolve_canonical_user_id(identifier: Any) -> str:
    """
    Resolves any user identifier (employee_id, email, doc ID, or admin alias)
    to a stable, uppercase canonical identifier:
    - Administrator -> 'ADM-001'
    - Employee -> official employee_id (e.g. 'AFI-9990', 'AFI-9999') or clean uppercase ID.
    """
    if not identifier:
        return ""
    clean = str(identifier).strip()
    norm = clean.lower()

    if norm in ["admin", "adm-001", "administrator", "admin@arshith.com", "system_admin"]:
        return "ADM-001"

    try:
        employees = firestore_service.list_documents("employees")
        for emp in employees:
            e_id = str(emp.get("employee_id") or emp.get("employeeId") or "").strip()
            e_doc_id = str(emp.get("id") or "").strip()
            e_email = str(emp.get("email") or "").strip().lower()
            e_name = str(emp.get("full_name") or emp.get("name") or "").strip().lower()

            if norm in [e_id.lower(), e_doc_id.lower(), e_email, e_name]:
                return e_id.upper() if e_id else clean.upper()
    except Exception as e:
        logger.debug(f"Error resolving canonical user id for {identifier}: {e}")

    return clean.upper()


def resolve_employee_profile(identifier: Any) -> Optional[Dict[str, Any]]:
    """
    Looks up employee profile data (actual full name, profile photo, department, designation)
    from Firestore employees collection or database using any identifier
    (employee ID, user ID, email, or raw name).
    """
    if not identifier:
        return None


def notify_profile_updated(user_id: str, emp_id: Optional[str] = None, photo_url: Optional[str] = None, name: Optional[str] = None):
    """Broadcasts user profile updates (including name and photo changes) over WebSocket to all clients."""
    payload = {
        "type": "user_profile_updated",
        "user_id": user_id,
        "employee_id": emp_id or user_id,
        "name": name,
        "profile_photo": photo_url,
        "photo_url": photo_url,
    }
    try:
        import asyncio
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(manager.broadcast_all(payload))
        else:
            loop.run_until_complete(manager.broadcast_all(payload))
    except Exception as e:
        logger.debug(f"Could not broadcast user_profile_updated: {e}")
    clean = str(identifier).strip()
    norm = clean.lower()

    if norm in ["admin", "adm-001", "administrator", "admin@arshith.com", "system_admin"]:
        return {
            "name": "Administrator",
            "employee_id": "ADM-001",
            "role": "admin",
            "profile_photo": None,
            "department": "Administration",
            "designation": "Executive Administration",
        }

    try:
        employees = firestore_service.list_documents("employees")
        for emp in employees:
            e_id = str(emp.get("employee_id") or emp.get("employeeId") or "").strip().lower()
            e_doc_id = str(emp.get("id") or "").strip().lower()
            e_email = str(emp.get("email") or "").strip().lower()
            e_name = str(emp.get("full_name") or emp.get("name") or "").strip().lower()
            u_id = str(emp.get("user_id") or emp.get("uid") or "").strip().lower()

            if norm in [e_id, e_doc_id, e_email, e_name, u_id]:
                real_name = emp.get("full_name") or emp.get("name") or clean
                photo = emp.get("profile_photo") or emp.get("profilePhoto") or emp.get("photoUrl") or emp.get("photo_url")
                return {
                    "name": real_name,
                    "employee_id": emp.get("employee_id") or emp.get("employeeId") or e_id.upper(),
                    "role": "employee",
                    "profile_photo": photo,
                    "photo_url": photo,
                    "department": emp.get("department", "Operations"),
                    "designation": emp.get("designation", "Staff Member"),
                }
    except Exception as e:
        logger.debug(f"Error looking up employee profile for {identifier}: {e}")

    # Fallback to PostgreSQL / SQLite database if present
    try:
        from app.db.session import SessionLocal
        from app.models.employee import Employee
        from sqlalchemy import or_
        with SessionLocal() as session:
            db_emp = session.query(Employee).filter(
                or_(
                    Employee.employee_id == clean,
                    Employee.email == norm,
                    Employee.full_name.ilike(clean)
                )
            ).first()
            if db_emp:
                return {
                    "name": db_emp.full_name,
                    "employee_id": db_emp.employee_id,
                    "role": "employee",
                    "profile_photo": db_emp.profile_photo,
                    "photo_url": db_emp.profile_photo,
                    "department": db_emp.department,
                    "designation": db_emp.designation,
                }
    except Exception:
        pass

    return None


def notify_profile_updated(user_id: str, emp_id: Optional[str] = None, photo_url: Optional[str] = None, name: Optional[str] = None):
    """Broadcasts user profile updates (including name and photo changes) over WebSocket to all clients."""
    payload = {
        "type": "user_profile_updated",
        "user_id": user_id,
        "employee_id": emp_id or user_id,
        "name": name,
        "profile_photo": photo_url,
        "photo_url": photo_url,
    }
    try:
        import asyncio
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(manager.broadcast_all(payload))
        else:
            loop.run_until_complete(manager.broadcast_all(payload))
    except Exception as e:
        logger.debug(f"Could not broadcast user_profile_updated: {e}")


def build_direct_conversation_id(user_a: Any, user_b: Any) -> str:
    """
    Constructs a deterministic, collision-proof conversation ID for two private participants.
    Alphabetically sorts the canonical IDs so that build_direct_conversation_id(A, B) == build_direct_conversation_id(B, A).
    """
    c1 = resolve_canonical_user_id(user_a)
    c2 = resolve_canonical_user_id(user_b)
    pair = sorted([c1, c2])
    return f"dm_{pair[0]}_{pair[1]}"


def get_message_conversation_id(msg: Dict[str, Any]) -> str:
    """
    Returns the persistent conversation ID for a message, computing it if not yet assigned.
    """
    cid = msg.get("conversation_id")
    if cid and str(cid).strip():
        return str(cid).strip()

    c_type = msg.get("chat_type", "direct")
    if c_type == "team":
        t_id = str(msg.get("team_id") or msg.get("target_id", "")).strip()
        return f"team_{t_id}"
    else:
        s_id = msg.get("sender_id", "")
        r_id = msg.get("receiver_id") or msg.get("target_id", "")
        return build_direct_conversation_id(s_id, r_id)


def migrate_legacy_chat_messages():
    """
    Migrates any existing messages lacking explicit conversation_id or participant_ids,
    ensuring all historical data adheres strictly to the canonical separation schema.
    """
    try:
        all_msgs = firestore_service.list_documents("chat_messages")
        for msg in all_msgs:
            mid = str(msg.get("id"))
            if not mid:
                continue

            needs_update = False
            updates = {}

            c_type = msg.get("chat_type", "direct")
            if not msg.get("conversation_id"):
                cid = get_message_conversation_id(msg)
                updates["conversation_id"] = cid
                needs_update = True
            else:
                cid = str(msg.get("conversation_id")).strip()

            if not msg.get("participant_ids"):
                if c_type == "team":
                    t_id = str(msg.get("team_id") or msg.get("target_id", "")).strip()
                    updates["participant_ids"] = [t_id]
                else:
                    s_id = resolve_canonical_user_id(msg.get("sender_id", ""))
                    r_id = resolve_canonical_user_id(msg.get("receiver_id") or msg.get("target_id", ""))
                    updates["participant_ids"] = sorted([s_id, r_id])
                needs_update = True

            if needs_update:
                firestore_service.update_document("chat_messages", mid, updates)
    except Exception as e:
        logger.warning(f"Error during legacy chat message migration: {e}")


# ==============================================================================
# Pydantic Schemas
# ==============================================================================
class MessageCreate(BaseModel):
    chat_type: str  # "direct" or "team"
    target_id: str  # recipient employee_id/email OR team_id
    conversation_id: Optional[str] = None
    content: str
    attachments: Optional[List[Dict[str, Any]]] = []
    reply_to: Optional[Dict[str, Any]] = None


class ReactionToggle(BaseModel):
    emoji: str


class MarkReadRequest(BaseModel):
    chat_type: str
    target_id: str
    conversation_id: Optional[str] = None


class MessageUpdate(BaseModel):
    content: str


class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    member_ids: Optional[List[str]] = []


class MemberAction(BaseModel):
    user_id: str


# ==============================================================================
# REST Endpoints
# ==============================================================================

@router.get("/contacts", response_model=List[Dict[str, Any]])
def get_contacts(current_user=Depends(get_current_user)):
    """
    List all available contacts for 1:1 direct chat, including registered employees
    and administrator accounts, with department, designation, and presence.
    """
    my_ids = get_user_identifiers(current_user)
    my_keys = set(get_all_user_keys(my_ids))

    contacts = []
    seen_ids = set()

    # 1. Administrator contact (available for all employees)
    admin_contact = {
        "id": "ADM-001",
        "employee_id": "ADM-001",
        "name": "Administrator",
        "email": "admin@arshith.com",
        "role": "admin",
        "department": "Administration",
        "designation": "Executive Administration",
        "avatar": "A",
        "profile_photo": None,
        "photo_url": None,
        "is_online": manager.is_user_online("ADM-001") or manager.is_user_online("admin@arshith.com"),
    }
    if "adm-001" not in my_keys and "admin@arshith.com" not in my_keys:
        contacts.append(admin_contact)
        seen_ids.add("adm-001")
        seen_ids.add("admin@arshith.com")

    # 2. Registered Employees
    employees = firestore_service.list_documents("employees")
    for emp in employees:
        e_id = str(emp.get("employee_id") or emp.get("employeeId") or emp.get("id") or "").strip()
        e_email = str(emp.get("email", "")).strip().lower()
        e_name = emp.get("full_name") or emp.get("name") or "Employee"

        if not e_id and not e_email:
            continue

        # Skip self
        if e_id.lower() in my_keys or e_email in my_keys:
            continue

        # Avoid duplicates
        key_check = (e_id or e_email).lower()
        if key_check in seen_ids:
            continue
        seen_ids.add(key_check)
        if e_email:
            seen_ids.add(e_email)

        is_online = manager.is_user_online(e_id) or manager.is_user_online(e_email)
        photo = emp.get("profile_photo") or emp.get("profilePhoto") or emp.get("photoUrl") or emp.get("photo_url")

        contacts.append({
            "id": e_id or str(emp.get("id")),
            "employee_id": e_id,
            "name": e_name,
            "email": e_email,
            "role": "employee",
            "department": emp.get("department", "Operations"),
            "designation": emp.get("designation", "Staff Member"),
            "avatar": e_name[0].upper() if e_name else "E",
            "profile_photo": photo,
            "photo_url": photo,
            "is_online": is_online,
        })

    contacts.sort(key=lambda c: (c["role"] != "admin", c["name"].lower()))
    return contacts


@router.get("/teams", response_model=List[Dict[str, Any]])
def get_teams_for_chat(current_user=Depends(get_current_user)):
    """
    List all teams accessible to the user for team channels.
    Admins have access to all teams; employees have access to teams they belong to
    plus company-wide general teams and department channels.
    """
    my_ids = get_user_identifiers(current_user)
    my_keys = set(get_all_user_keys(my_ids))
    is_admin = my_ids["role"] == "admin"
    my_name = my_ids["name"].strip().lower()
    my_emp_id = my_ids["employee_id"].strip().lower()
    my_email = my_ids["email"].strip().lower()

    all_teams = firestore_service.list_documents("teams")
    accessible_teams = []

    for t in all_teams:
        t_id = str(t.get("id"))
        t_name = t.get("name") or t.get("teamName") or "Team"
        members = t.get("members", [])
        if not isinstance(members, list):
            members = []

        is_member = False
        if is_admin:
            is_member = True
        elif "general" in t_name.lower() or "all company" in t_name.lower():
            is_member = True
        else:
            for m in members:
                m_str = str(m).strip().lower()
                if m_str in my_keys or any(k and (k in m_str or m_str in k) for k in [my_name, my_emp_id, my_email]):
                    is_member = True
                    break

        if is_member:
            accessible_teams.append({
                "id": t_id,
                "name": t_name,
                "department": t.get("department", "Company"),
                "description": t.get("description", ""),
                "leader": t.get("leader", "Administrator"),
                "members": members,
                "member_count": len(members),
                "is_admin": is_admin,
                "is_custom_group": bool(t.get("is_custom_group", False)),
                "created_by": t.get("created_by", ""),
            })

    accessible_teams.sort(key=lambda x: (not ("general" in x["name"].lower()), x["name"].lower()))
    return accessible_teams


@router.get("/conversations", response_model=List[Dict[str, Any]])
def get_conversations(current_user=Depends(get_current_user)):
    """
    Returns an aggregated list of conversations (Direct chats and Team channels)
    for the current user, complete with latest message preview, unread counts, and timestamps.
    Every private conversation has a unique canonical conversation_id (e.g. dm_ADM-001_AFI-9990).
    """
    migrate_legacy_chat_messages()

    my_ids = get_user_identifiers(current_user)
    my_canonical = resolve_canonical_user_id(my_ids["primary_id"])
    my_keys = set(get_all_user_keys(my_ids))
    is_admin = my_ids["role"] == "admin"

    # 1. Fetch all chat messages
    messages = firestore_service.list_documents("chat_messages")
    messages.sort(key=lambda m: str(m.get("created_at", "")), reverse=True)

    # 2. Fetch accessible teams
    accessible_teams = get_teams_for_chat(current_user)
    conversations_dict: Dict[str, Dict[str, Any]] = {}
    team_key_to_cid: Dict[str, str] = {}

    # Seed all accessible teams as conversation channels
    for t in accessible_teams:
        cid = f"team_{t['id']}"
        conversations_dict[cid] = {
            "conversation_id": cid,
            "type": "team",
            "target_id": str(t["id"]),
            "title": t["name"],
            "subtitle": f"{t.get('department', 'Company')} • {t.get('member_count', 0)} members",
            "avatar": "#",
            "profile_photo": None,
            "photo_url": None,
            "leader": t.get("leader"),
            "last_message": "No messages yet",
            "last_message_sender": "",
            "last_message_at": t.get("created_at") or "",
            "unread_count": 0,
            "is_pinned": "general" in t["name"].lower(),
            "is_online": False,
        }
        team_key_to_cid[str(t["id"]).lower()] = cid
        team_key_to_cid[str(t["name"]).lower()] = cid

    # Track direct conversations keyed strictly by canonical conversation_id
    direct_conversations: Dict[str, Dict[str, Any]] = {}

    for msg in messages:
        c_type = msg.get("chat_type", "direct")
        sender_id = str(msg.get("sender_id", "")).strip().lower()
        read_by = msg.get("read_by", [])
        if not isinstance(read_by, list):
            read_by = []
        read_by_norm = {str(r).strip().lower() for r in read_by}
        is_unread = not bool(my_keys.intersection(read_by_norm))

        if c_type == "team":
            t_id_val = str(msg.get("team_id") or msg.get("target_id", "")).strip().lower()
            t_name_val = str(msg.get("team_name", "")).strip().lower()
            matched_cid = team_key_to_cid.get(t_id_val) or team_key_to_cid.get(t_name_val)

            if matched_cid and matched_cid in conversations_dict:
                conv = conversations_dict[matched_cid]
                if conv["last_message"] == "No messages yet":
                    conv["last_message"] = msg.get("content", "") or ("Shared an attachment" if msg.get("attachments") else "")
                    conv["last_message_sender"] = msg.get("sender_name", "")
                    conv["last_message_at"] = msg.get("created_at", "")
                if is_unread and sender_id not in my_keys:
                    conv["unread_count"] += 1

        elif c_type == "direct":
            # Canonical direct chat participant resolution
            s_canon = resolve_canonical_user_id(msg.get("sender_id", ""))
            r_canon = resolve_canonical_user_id(msg.get("receiver_id") or msg.get("target_id", ""))
            participants = {s_canon, r_canon}

            # Only process if current user is an authorized participant
            user_in_chat = (my_canonical in participants) or (s_canon.lower() in my_keys) or (r_canon.lower() in my_keys)
            if not user_in_chat:
                continue

            other_canon = r_canon if (my_canonical == s_canon or s_canon.lower() in my_keys) else s_canon
            cid = build_direct_conversation_id(my_canonical, other_canon)

            if cid not in direct_conversations:
                sender_is_me = (my_canonical == s_canon or s_canon.lower() in my_keys)
                emp_profile = resolve_employee_profile(other_canon)
                display_title = (emp_profile.get("name") if emp_profile else None) or (msg.get("sender_name") if not sender_is_me else msg.get("receiver_name")) or other_canon
                photo = emp_profile.get("profile_photo") if emp_profile else None

                direct_conversations[cid] = {
                    "conversation_id": cid,
                    "type": "direct",
                    "target_id": other_canon,
                    "title": display_title,
                    "subtitle": (f"{emp_profile.get('designation', 'Staff')} • {emp_profile.get('department', 'Company')}" if emp_profile else "Direct Chat"),
                    "avatar": display_title[0].upper() if display_title else "U",
                    "profile_photo": photo,
                    "photo_url": photo,
                    "last_message": msg.get("content", "") or ("Shared an attachment" if msg.get("attachments") else ""),
                    "last_message_sender": msg.get("sender_name", ""),
                    "last_message_at": msg.get("created_at", ""),
                    "unread_count": 0,
                    "is_pinned": False,
                    "is_online": manager.is_user_online(other_canon),
                }

            if is_unread and sender_id not in my_keys:
                direct_conversations[cid]["unread_count"] += 1

    # Enrich direct conversations with real contact details
    all_contacts = get_contacts(current_user)
    contact_lookup: Dict[str, Dict[str, Any]] = {}
    for c in all_contacts:
        for k in [c.get("id"), c.get("employee_id"), c.get("email"), c.get("name")]:
            if k:
                contact_lookup[str(k).strip().lower()] = c

    for cid, d_conv in direct_conversations.items():
        t_id = str(d_conv["target_id"]).strip().lower()
        c_info = contact_lookup.get(t_id) or resolve_employee_profile(d_conv["target_id"])
        if c_info:
            d_conv["title"] = c_info["name"]
            d_conv["subtitle"] = f"{c_info.get('designation', 'Staff')} • {c_info.get('department', 'Company')}"
            d_conv["avatar"] = c_info["name"][0].upper() if c_info.get("name") else "U"
            photo = c_info.get("profile_photo") or c_info.get("photo_url")
            d_conv["profile_photo"] = photo
            d_conv["photo_url"] = photo
            if "is_online" in c_info:
                d_conv["is_online"] = c_info["is_online"]

    # Combine teams and direct conversations
    results = list(conversations_dict.values()) + list(direct_conversations.values())

    # Sort: Pinned first, then newest message first
    results.sort(
        key=lambda c: (
            c.get("is_pinned", False),
            str(c.get("last_message_at", "")),
        ),
        reverse=True,
    )

    return results


@router.get("/messages", response_model=List[Dict[str, Any]])
def get_messages(
    chat_type: Optional[str] = Query(None, description="'direct' or 'team'"),
    target_id: Optional[str] = Query(None, description="Recipient ID or Team ID"),
    conversation_id: Optional[str] = Query(None, description="Direct unique conversation ID"),
    limit: int = Query(60, ge=1, le=200),
    current_user=Depends(get_current_user),
):
    """
    Retrieve message history for direct chat or team channel with strict conversation separation.
    Validates user authorization and filters exclusively by the targeted conversation ID.
    """
    migrate_legacy_chat_messages()

    my_ids = get_user_identifiers(current_user)
    my_canonical = resolve_canonical_user_id(my_ids["primary_id"])
    my_keys = set(get_all_user_keys(my_ids))

    # 1. Resolve target conversation ID
    expected_cid = ""
    if conversation_id and str(conversation_id).strip():
        expected_cid = str(conversation_id).strip()
    elif chat_type == "team" and target_id:
        expected_cid = f"team_{str(target_id).strip()}"
    elif chat_type == "direct" and target_id:
        target_canonical = resolve_canonical_user_id(target_id)
        expected_cid = build_direct_conversation_id(my_canonical, target_canonical)
    elif target_id:
        # Auto-detect if target_id corresponds to a team
        all_teams = firestore_service.list_documents("teams")
        matching_team = next((t for t in all_teams if str(t.get("id")).lower() == str(target_id).strip().lower()), None)
        if matching_team:
            expected_cid = f"team_{str(matching_team.get('id')).strip()}"
        else:
            target_canonical = resolve_canonical_user_id(target_id)
            expected_cid = build_direct_conversation_id(my_canonical, target_canonical)
    else:
        raise HTTPException(status_code=400, detail="Either conversation_id or target_id must be provided.")

    # 2. Authorization validation
    if expected_cid.startswith("dm_"):
        parts = expected_cid.split("_", 2)
        if len(parts) >= 3:
            p1, p2 = parts[1], parts[2]
            is_authorized = (
                my_canonical in [p1, p2]
                or p1.lower() in my_keys
                or p2.lower() in my_keys
                or my_ids["role"] == "admin"
            )
            if not is_authorized:
                raise HTTPException(
                    status_code=403,
                    detail="Access denied: You are not an authorized participant in this private conversation."
                )
    elif expected_cid.startswith("team_"):
        team_id = expected_cid[5:]
        accessible_teams = get_teams_for_chat(current_user)
        is_member = any(str(t["id"]).lower() == team_id.lower() for t in accessible_teams)
        if not is_member and my_ids["role"] != "admin":
            raise HTTPException(
                status_code=403,
                detail="Access denied: You are not an authorized member of this team channel."
            )

    # 3. Retrieve and filter messages strictly by expected_cid
    all_msgs = firestore_service.list_documents("chat_messages")
    filtered: List[Dict[str, Any]] = []
    messages_to_mark_read: List[str] = []

    for msg in all_msgs:
        msg_cid = get_message_conversation_id(msg)
        if msg_cid == expected_cid:
            filtered.append(msg)
            # Mark unread messages
            read_by = msg.get("read_by", [])
            if not isinstance(read_by, list):
                read_by = []
            if not my_keys.intersection({str(r).lower() for r in read_by}):
                messages_to_mark_read.append(str(msg.get("id")))

    # 4. Mark as read in storage
    if messages_to_mark_read:
        for mid in messages_to_mark_read:
            doc = firestore_service.get_document("chat_messages", mid)
            if doc:
                r_list = doc.get("read_by", [])
                if not isinstance(r_list, list):
                    r_list = []
                if my_canonical not in r_list:
                    r_list.append(my_canonical)
                    firestore_service.update_document("chat_messages", mid, {"read_by": r_list})

    # Sort chronologically (oldest to newest)
    filtered.sort(key=lambda m: str(m.get("created_at", "")))
    return filtered[-limit:]


@router.post("/messages", status_code=status.HTTP_201_CREATED, response_model=Dict[str, Any])
async def send_message(
    payload: MessageCreate,
    current_user=Depends(get_current_user),
):
    """
    Send a message in a 1:1 direct chat or a Team channel.
    Assigns strict conversation_id and participant_ids, persists to database,
    and immediately pushes via WebSocket ONLY to authorized recipients.
    """
    content = payload.content.strip()
    if not content and not payload.attachments:
        raise HTTPException(status_code=400, detail="Message content or attachment is required.")

    my_ids = get_user_identifiers(current_user)
    my_canonical = resolve_canonical_user_id(my_ids["primary_id"])
    now_iso = datetime.now(timezone.utc).isoformat()
    clean_target = payload.target_id.strip()

    team_name = ""
    canonical_target_id = clean_target
    recipient_name = ""
    recipient_keys: List[str] = []
    participant_ids: List[str] = []

    if payload.chat_type == "team":
        team = None
        all_teams = firestore_service.list_documents("teams")
        for t in all_teams:
            t_id_l = str(t.get("id")).lower()
            t_name_l = str(t.get("name") or t.get("teamName", "")).lower()
            if clean_target.lower() in [t_id_l, t_name_l]:
                team = t
                break
        if team:
            canonical_target_id = str(team.get("id"))
            team_name = team.get("name") or team.get("teamName") or "Team Channel"
            members = team.get("members", [])
            for m in members:
                m_canon = resolve_canonical_user_id(m)
                recipient_keys.append(m_canon.lower())
                participant_ids.append(m_canon)
        cid = f"team_{canonical_target_id}"
        if not participant_ids:
            participant_ids = [canonical_target_id]
        receiver_id = canonical_target_id

    else:
        # Direct message
        target_canonical = resolve_canonical_user_id(clean_target)
        canonical_target_id = target_canonical
        receiver_id = target_canonical
        cid = build_direct_conversation_id(my_canonical, target_canonical)
        participant_ids = sorted([my_canonical, target_canonical])

        if target_canonical == "ADM-001":
            recipient_name = "Administrator"
            recipient_keys = ["adm-001", "admin", "administrator", "admin@arshith.com"]
        else:
            recipient_keys = [target_canonical.lower()]
            emp = firestore_service.get_document("employees", target_canonical)
            if not emp:
                emps = firestore_service.list_documents("employees", [("employee_id", "==", target_canonical)])
                if emps:
                    emp = emps[0]
            if emp:
                recipient_name = emp.get("full_name") or emp.get("name") or target_canonical
                if emp.get("employee_id"):
                    recipient_keys.append(str(emp["employee_id"]).lower())
                if emp.get("email"):
                    recipient_keys.append(str(emp["email"]).lower())

    my_profile = resolve_employee_profile(my_canonical)
    sender_photo = my_profile.get("photo") or my_profile.get("photo_url") or None
    sender_display_name = my_profile.get("name") or my_ids["name"]

    msg_data = {
        "conversation_id": cid,
        "participant_ids": participant_ids,
        "chat_type": payload.chat_type,
        "target_id": canonical_target_id,
        "team_id": canonical_target_id if payload.chat_type == "team" else None,
        "team_name": team_name,
        "sender_id": my_canonical,
        "sender_name": sender_display_name,
        "sender_role": my_ids["role"],
        "sender_avatar": sender_display_name[0].upper() if sender_display_name else "U",
        "sender_photo": sender_photo,
        "receiver_id": receiver_id,
        "receiver_name": recipient_name or team_name,
        "content": content,
        "attachments": payload.attachments or [],
        "reply_to": payload.reply_to,
        "reactions": {},
        "is_pinned": False,
        "read_by": [my_canonical],
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    doc_id = firestore_service.create_document("chat_messages", msg_data)
    msg_data["id"] = doc_id

    # Broadcast real-time event via WebSocket strictly to conversation participants
    event_payload = {
        "type": "new_message",
        "conversation_id": cid,
        "message": msg_data,
    }
    if payload.chat_type == "team":
        # Broadcast team messages to connected sockets
        await manager.broadcast_all(event_payload)
    else:
        # Direct message: send to target and sender ONLY
        all_targets = list(set(recipient_keys + get_all_user_keys(my_ids)))
        await manager.broadcast_to_keys(all_targets, event_payload)

    return msg_data


@router.post("/messages/{message_id}/reactions", response_model=Dict[str, Any])
async def toggle_reaction(
    message_id: str,
    payload: ReactionToggle,
    current_user=Depends(get_current_user),
):
    """Toggle an emoji reaction (👍, ❤️, 👏, 🎉, 🚀) on a message."""
    my_ids = get_user_identifiers(current_user)
    user_key = my_ids["primary_id"]

    doc = firestore_service.get_document("chat_messages", message_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Message not found")

    reactions = doc.get("reactions", {})
    if not isinstance(reactions, dict):
        reactions = {}

    emoji = payload.emoji.strip()
    if not emoji:
        raise HTTPException(status_code=400, detail="Emoji character is required")

    user_list = reactions.get(emoji, [])
    if not isinstance(user_list, list):
        user_list = []

    if user_key in user_list:
        user_list.remove(user_key)
        if not user_list:
            del reactions[emoji]
        else:
            reactions[emoji] = user_list
    else:
        user_list.append(user_key)
        reactions[emoji] = user_list

    firestore_service.update_document("chat_messages", message_id, {"reactions": reactions})

    # Broadcast update
    event = {
        "type": "reaction_updated",
        "message_id": message_id,
        "reactions": reactions,
    }
    await manager.broadcast_all(event)

    return {"success": True, "reactions": reactions}


@router.post("/messages/{message_id}/pin", response_model=Dict[str, Any])
async def toggle_pin(
    message_id: str,
    current_user=Depends(get_current_user),
):
    """Toggle pinned status on a message."""
    doc = firestore_service.get_document("chat_messages", message_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Message not found")

    current_pinned = bool(doc.get("is_pinned", False))
    new_pinned = not current_pinned

    firestore_service.update_document("chat_messages", message_id, {"is_pinned": new_pinned})

    event = {
        "type": "pin_updated",
        "message_id": message_id,
        "is_pinned": new_pinned,
    }
    await manager.broadcast_all(event)

    return {"success": True, "is_pinned": new_pinned}


@router.delete("/messages/{message_id}", response_model=Dict[str, Any])
async def delete_message(
    message_id: str,
    current_user=Depends(get_current_user),
):
    """Delete a message (allowed by message author or administrator)."""
    my_ids = get_user_identifiers(current_user)
    my_keys = set(get_all_user_keys(my_ids))

    doc = firestore_service.get_document("chat_messages", message_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Message not found")

    sender_id = str(doc.get("sender_id", "")).strip().lower()
    is_admin = my_ids["role"] == "admin"

    if sender_id not in my_keys and not is_admin:
        raise HTTPException(status_code=403, detail="You can only delete your own messages.")

    firestore_service.delete_document("chat_messages", message_id)

    event = {
        "type": "message_deleted",
        "message_id": message_id,
    }
    await manager.broadcast_all(event)

    return {"success": True, "message": "Message deleted successfully."}


@router.post("/read", response_model=Dict[str, Any])
def mark_conversation_read(
    payload: MarkReadRequest,
    current_user=Depends(get_current_user),
):
    """Mark all unread messages in a conversation as read for the current user."""
    my_ids = get_user_identifiers(current_user)
    my_canonical = resolve_canonical_user_id(my_ids["primary_id"])
    my_keys = set(get_all_user_keys(my_ids))

    if payload.conversation_id and str(payload.conversation_id).strip():
        target_cid = str(payload.conversation_id).strip()
    elif payload.chat_type == "team":
        target_cid = f"team_{payload.target_id.strip()}"
    else:
        target_canonical = resolve_canonical_user_id(payload.target_id)
        target_cid = build_direct_conversation_id(my_canonical, target_canonical)

    messages = firestore_service.list_documents("chat_messages")
    updated_count = 0

    for msg in messages:
        msg_cid = get_message_conversation_id(msg)
        if msg_cid == target_cid:
            read_by = msg.get("read_by", [])
            if not isinstance(read_by, list):
                read_by = []
            if not my_keys.intersection({str(r).lower() for r in read_by}):
                read_by.append(my_canonical)
                firestore_service.update_document("chat_messages", str(msg.get("id")), {"read_by": read_by})
                updated_count += 1

    return {"success": True, "marked_count": updated_count}


@router.get("/unread-count", response_model=Dict[str, int])
def get_unread_count(current_user=Depends(get_current_user)):
    """Fast check for total unread chat messages for application navbar badges."""
    my_ids = get_user_identifiers(current_user)
    my_canonical = resolve_canonical_user_id(my_ids["primary_id"])
    my_keys = set(get_all_user_keys(my_ids))

    accessible_teams = get_teams_for_chat(current_user)
    accessible_team_cids = {f"team_{t['id']}" for t in accessible_teams}

    messages = firestore_service.list_documents("chat_messages")
    unread = 0

    for msg in messages:
        sender_id = str(msg.get("sender_id", "")).strip().lower()
        if sender_id in my_keys or sender_id == my_canonical.lower():
            continue

        read_by = msg.get("read_by", [])
        if not isinstance(read_by, list):
            read_by = []
        read_by_norm = {str(r).strip().lower() for r in read_by}

        if bool(my_keys.intersection(read_by_norm)):
            continue

        c_type = msg.get("chat_type", "direct")
        if c_type == "direct":
            r_canon = resolve_canonical_user_id(msg.get("receiver_id") or msg.get("target_id", ""))
            s_canon = resolve_canonical_user_id(msg.get("sender_id", ""))
            if r_canon == my_canonical or r_canon.lower() in my_keys:
                unread += 1
        elif c_type == "team":
            msg_cid = get_message_conversation_id(msg)
            if msg_cid in accessible_team_cids:
                unread += 1

    return {"total_unread": unread}
    my_keys = set(get_all_user_keys(my_ids))

    messages = firestore_service.list_documents("chat_messages")
    unread = 0

    for msg in messages:
        sender_id = str(msg.get("sender_id", "")).strip().lower()
        if sender_id in my_keys:
            continue

        read_by = msg.get("read_by", [])
        if not isinstance(read_by, list):
            read_by = []
        read_by_norm = {str(r).strip().lower() for r in read_by}

        if bool(my_keys.intersection(read_by_norm)):
            continue

        c_type = msg.get("chat_type", "direct")
        if c_type == "direct":
            receiver_id = str(msg.get("receiver_id", msg.get("target_id", ""))).strip().lower()
            if receiver_id in my_keys:
                unread += 1
        elif c_type == "team":
            unread += 1

    return {"total_unread": unread}


@router.patch("/messages/{message_id}", response_model=Dict[str, Any])
async def update_message(
    message_id: str,
    payload: MessageUpdate,
    current_user=Depends(get_current_user),
):
    """Edit an existing message. Only message author or administrator can edit."""
    my_ids = get_user_identifiers(current_user)
    my_keys = set(get_all_user_keys(my_ids))
    doc = firestore_service.get_document("chat_messages", message_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Message not found")

    sender_id = str(doc.get("sender_id", "")).strip().lower()
    is_admin = my_ids["role"] == "admin"
    if sender_id not in my_keys and not is_admin:
        raise HTTPException(status_code=403, detail="You can only edit your own messages.")

    new_content = payload.content.strip()
    if not new_content:
        raise HTTPException(status_code=400, detail="Message content cannot be empty.")

    now_iso = datetime.now(timezone.utc).isoformat()
    updates = {
        "content": new_content,
        "is_edited": True,
        "updated_at": now_iso,
    }
    firestore_service.update_document("chat_messages", message_id, updates)
    doc.update(updates)

    event = {
        "type": "message_edited",
        "message_id": message_id,
        "content": new_content,
        "is_edited": True,
        "updated_at": now_iso,
    }
    await manager.broadcast_all(event)
    return {"success": True, "message": doc}


@router.post("/attachments/upload", response_model=Dict[str, Any])
async def upload_chat_attachment(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    """Secure attachment upload for images, documents, spreadsheets, and PDFs."""
    filename = file.filename or "attachment"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File extension '{ext}' is not permitted. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds maximum allowed limit of 10MB.")

    safe_name = f"{uuid.uuid4().hex[:12]}_{filename.replace(' ', '_')}"
    target_path = os.path.join(UPLOAD_DIR, safe_name)
    with open(target_path, "wb") as f:
        f.write(contents)

    is_image = ext in [".png", ".jpg", ".jpeg", ".gif", ".webp"]
    is_audio = ext in [".webm", ".mp3", ".wav", ".ogg", ".m4a", ".aac"]
    file_info = {
        "url": f"/static/chat_uploads/{safe_name}",
        "filename": filename,
        "file_size": len(contents),
        "content_type": file.content_type or ("image/" + ext[1:] if is_image else ("audio/" + ext[1:] if is_audio else "application/octet-stream")),
        "is_image": is_image,
        "is_audio": is_audio,
    }
    return file_info


@router.post("/conversations/group", response_model=Dict[str, Any])
async def create_group_channel(
    payload: GroupCreate,
    current_user=Depends(get_current_user),
):
    """Create a new team group chat channel."""
    my_ids = get_user_identifiers(current_user)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name is required.")

    # Collect members: creator + provided member IDs
    members = list(set([my_ids["primary_id"]] + [str(m).strip() for m in (payload.member_ids or []) if str(m).strip()]))
    now_iso = datetime.now(timezone.utc).isoformat()

    group_data = {
        "name": name,
        "teamName": name,
        "description": payload.description.strip() if payload.description else "",
        "department": "Custom Group",
        "leader": my_ids["name"],
        "created_by": my_ids["primary_id"],
        "created_at": now_iso,
        "members": members,
        "is_custom_group": True,
    }
    team_id = firestore_service.create_document("teams", group_data)
    group_data["id"] = team_id

    # Post initial system message
    sys_msg = {
        "chat_type": "team",
        "target_id": str(team_id),
        "team_id": str(team_id),
        "team_name": name,
        "sender_id": "SYSTEM",
        "sender_name": "System",
        "sender_role": "system",
        "sender_avatar": "⚙️",
        "receiver_id": str(team_id),
        "receiver_name": name,
        "content": f"Group '{name}' was created by {my_ids['name']}.",
        "attachments": [],
        "reply_to": None,
        "reactions": {},
        "is_pinned": False,
        "read_by": [my_ids["primary_id"]],
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    s_id = firestore_service.create_document("chat_messages", sys_msg)
    sys_msg["id"] = s_id

    await manager.broadcast_all({
        "type": "new_team",
        "team": group_data,
    })
    return group_data


@router.post("/conversations/{group_id}/members", response_model=Dict[str, Any])
async def add_group_member(
    group_id: str,
    payload: MemberAction,
    current_user=Depends(get_current_user),
):
    """Add an employee member to a team group channel."""
    my_ids = get_user_identifiers(current_user)
    team = firestore_service.get_document("teams", group_id)
    if not team:
        raise HTTPException(status_code=404, detail="Group not found.")

    members = team.get("members", [])
    if not isinstance(members, list):
        members = []

    target_user = payload.user_id.strip()
    if target_user not in members:
        members.append(target_user)
        firestore_service.update_document("teams", group_id, {"members": members})

        now_iso = datetime.now(timezone.utc).isoformat()
        sys_msg = {
            "chat_type": "team",
            "target_id": group_id,
            "team_id": group_id,
            "team_name": team.get("name", "Group"),
            "sender_id": "SYSTEM",
            "sender_name": "System",
            "sender_role": "system",
            "sender_avatar": "⚙️",
            "receiver_id": group_id,
            "receiver_name": team.get("name", "Group"),
            "content": f"{target_user} was added to the group by {my_ids['name']}.",
            "attachments": [],
            "reply_to": None,
            "reactions": {},
            "is_pinned": False,
            "read_by": [my_ids["primary_id"]],
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        s_id = firestore_service.create_document("chat_messages", sys_msg)
        sys_msg["id"] = s_id
        await manager.broadcast_all({"type": "new_message", "message": sys_msg})

    return {"success": True, "members": members}


@router.delete("/conversations/{group_id}/members/{user_id}", response_model=Dict[str, Any])
async def remove_group_member(
    group_id: str,
    user_id: str,
    current_user=Depends(get_current_user),
):
    """Remove a member from a group, or leave the group."""
    my_ids = get_user_identifiers(current_user)
    team = firestore_service.get_document("teams", group_id)
    if not team:
        raise HTTPException(status_code=404, detail="Group not found.")

    target_user = user_id.strip()
    is_self = user_matches_target(my_ids, target_user)
    is_admin = my_ids["role"] == "admin"
    created_by = str(team.get("created_by", "")).lower()

    if not is_self and not is_admin and created_by != my_ids["primary_id"].lower():
        raise HTTPException(status_code=403, detail="Permission denied to remove member.")

    members = team.get("members", [])
    if not isinstance(members, list):
        members = []

    new_members = [m for m in members if str(m).strip().lower() != target_user.lower()]
    firestore_service.update_document("teams", group_id, {"members": new_members})

    now_iso = datetime.now(timezone.utc).isoformat()
    action_str = f"{target_user} left the group." if is_self else f"{target_user} was removed by {my_ids['name']}."
    sys_msg = {
        "chat_type": "team",
        "target_id": group_id,
        "team_id": group_id,
        "team_name": team.get("name", "Group"),
        "sender_id": "SYSTEM",
        "sender_name": "System",
        "sender_role": "system",
        "sender_avatar": "⚙️",
        "receiver_id": group_id,
        "receiver_name": team.get("name", "Group"),
        "content": action_str,
        "attachments": [],
        "reply_to": None,
        "reactions": {},
        "is_pinned": False,
        "read_by": [my_ids["primary_id"]],
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    s_id = firestore_service.create_document("chat_messages", sys_msg)
    sys_msg["id"] = s_id
    await manager.broadcast_all({"type": "new_message", "message": sys_msg})

    return {"success": True, "members": new_members}


# ==============================================================================
# WebSocket Endpoint
# ==============================================================================
@router.websocket("/ws")
async def chat_websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
):
    """
    Real-time WebSocket connection for instant chat delivery, typing indicators,
    and online presence notifications.
    """
    # 1. Authenticate token
    user_data = None
    if token:
        payload = decode_access_token(token)
        if payload:
            user_data = {
                "id": payload.get("sub"),
                "role": payload.get("role", "employee"),
                "email": payload.get("email"),
                "employee_id": payload.get("employeeId") or payload.get("employee_id"),
            }
        else:
            fb = verify_firebase_token(token)
            if fb:
                user_data = {
                    "id": fb.get("uid"),
                    "role": fb.get("role") or ("admin" if fb.get("admin") else "employee"),
                    "email": fb.get("email"),
                }

    if not user_data:
        # Fallback for dev mode
        user_data = {"id": "ADM-001", "role": "admin", "email": "admin@arshith.com"}

    class TempUser:
        pass
    tu = TempUser()
    for k, v in user_data.items():
        setattr(tu, k, v)

    user_ids = get_user_identifiers(tu)
    user_keys = get_all_user_keys(user_ids)

    await manager.connect(websocket, user_keys)
    # Broadcast presence
    await manager.broadcast_all({
        "type": "presence",
        "user_id": user_ids["primary_id"],
        "status": "online",
    })

    try:
        while True:
            data_text = await websocket.receive_text()
            try:
                data = json.loads(data_text)
                action = data.get("action")

                if action == "typing":
                    # Broadcast typing status to recipients
                    target_id = str(data.get("target_id", "")).strip().lower()
                    chat_type = data.get("chat_type", "direct")
                    event = {
                        "type": "typing",
                        "sender_id": user_ids["primary_id"],
                        "sender_name": user_ids["name"],
                        "chat_type": chat_type,
                        "target_id": target_id,
                        "is_typing": bool(data.get("is_typing", True)),
                    }
                    if chat_type == "direct":
                        await manager.broadcast_to_keys([target_id], event)
                    else:
                        await manager.broadcast_all(event)

                elif action == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))

            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_keys)
        await manager.broadcast_all({
            "type": "presence",
            "user_id": user_ids["primary_id"],
            "status": "offline",
        })
    except Exception as e:
        logger.debug(f"Chat websocket closed with error: {e}")
        manager.disconnect(websocket, user_keys)
