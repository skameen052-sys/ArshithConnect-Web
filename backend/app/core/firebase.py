import os
import json
import logging
import urllib.request
import urllib.error
from typing import Optional, Any
try:
    import firebase_admin
    from firebase_admin import credentials, firestore, storage, auth
    HAS_FIREBASE_ADMIN = True
except ImportError:
    firebase_admin = None
    credentials = None
    firestore = None
    storage = None
    auth = None
    HAS_FIREBASE_ADMIN = False

from app.core.config import settings

logger = logging.getLogger("uvicorn.error")

_firebase_app: Optional[Any] = None
_firestore_client: Optional[Any] = None
_storage_bucket: Optional[Any] = None
_init_attempted: bool = False
_is_live: bool = False


def init_firebase() -> bool:
    """
    Initialize Firebase Admin SDK using service account credentials.
    Supports named databases via settings.FIREBASE_DATABASE_NAME.
    """
    global _firebase_app, _firestore_client, _storage_bucket, _init_attempted, _is_live

    if _init_attempted:
        return _is_live

    _init_attempted = True

    if not HAS_FIREBASE_ADMIN:
        logger.info("[Firebase] Running in local store mode (firebase_admin module not installed).")
        _is_live = False
        return False

    cred = None
    cred_source = "None"

    # 1. Check for raw JSON string in environment
    if settings.FIREBASE_CREDENTIALS_JSON:
        try:
            cert_dict = json.loads(settings.FIREBASE_CREDENTIALS_JSON)
            cred = credentials.Certificate(cert_dict)
            cred_source = "FIREBASE_CREDENTIALS_JSON env variable"
        except Exception as e:
            logger.warning(f"Failed to parse FIREBASE_CREDENTIALS_JSON: {e}")

    # 2. Check for GOOGLE_APPLICATION_CREDENTIALS file path
    if not cred and settings.GOOGLE_APPLICATION_CREDENTIALS and os.path.exists(settings.GOOGLE_APPLICATION_CREDENTIALS):
        try:
            cred = credentials.Certificate(settings.GOOGLE_APPLICATION_CREDENTIALS)
            cred_source = f"GOOGLE_APPLICATION_CREDENTIALS ({settings.GOOGLE_APPLICATION_CREDENTIALS})"
        except Exception as e:
            logger.warning(f"Failed to load credentials from GOOGLE_APPLICATION_CREDENTIALS: {e}")

    # 3. Check for FIREBASE_CREDENTIALS_PATH relative to backend or current working directory
    if not cred and settings.FIREBASE_CREDENTIALS_PATH:
        candidate_paths = [
            settings.FIREBASE_CREDENTIALS_PATH,
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), settings.FIREBASE_CREDENTIALS_PATH),
            os.path.join(os.getcwd(), settings.FIREBASE_CREDENTIALS_PATH),
        ]
        for p in candidate_paths:
            if os.path.exists(p):
                try:
                    cred = credentials.Certificate(p)
                    cred_source = f"Service account file ({p})"
                    break
                except Exception as e:
                    logger.warning(f"Failed to load certificate from {p}: {e}")

    app_options = {}
    if settings.FIREBASE_STORAGE_BUCKET:
        app_options["storageBucket"] = settings.FIREBASE_STORAGE_BUCKET
    if settings.FIREBASE_PROJECT_ID:
        app_options["projectId"] = settings.FIREBASE_PROJECT_ID

    if cred:
        try:
            if len(firebase_admin._apps) == 0:
                _firebase_app = firebase_admin.initialize_app(cred, app_options)
            else:
                _firebase_app = firebase_admin.get_app()

            db_name = settings.FIREBASE_DATABASE_NAME.strip() if settings.FIREBASE_DATABASE_NAME else "(default)"
            if db_name and db_name != "(default)":
                _firestore_client = firestore.client(database=db_name)
            else:
                _firestore_client = firestore.client()

            _is_live = True
            logger.info(f"Firebase Admin connected live from {cred_source} (Database: '{db_name}').")
        except Exception as e:
            logger.error(f"Error connecting to Cloud Firestore: {e}")
            _is_live = False
    else:
        logger.info(
            f"[Firebase] Running in local store mode (serviceAccountKey.json not detected).\n"
            f"Database name configured: '{settings.FIREBASE_DATABASE_NAME}' in backend/.env.\n"
            f"To connect live Cloud Firestore: place serviceAccountKey.json in the backend directory."
        )
        _is_live = False

    return _is_live


def is_firebase_live() -> bool:
    """Return whether Firebase Admin has an active verified connection."""
    global _is_live, _init_attempted
    if not _init_attempted:
        init_firebase()
    return _is_live


def get_firestore_client() -> Any:
    """
    Get Firestore client instance if connected to live Firebase.
    Returns None if in local mode.
    """
    global _firestore_client, _is_live, _init_attempted
    if not _init_attempted:
        init_firebase()

    if _is_live:
        return _firestore_client
    return None


def get_storage_bucket() -> Any:
    """Get Cloud Storage bucket if connected."""
    global _storage_bucket, _is_live, _init_attempted
    if not _init_attempted:
        init_firebase()

    if _is_live:
        if _storage_bucket is None:
            try:
                _storage_bucket = storage.bucket(name=settings.FIREBASE_STORAGE_BUCKET)
            except Exception as e:
                logger.error(f"Error obtaining Cloud Storage bucket: {e}")
        return _storage_bucket
    return None


def verify_firebase_token(id_token: str) -> Optional[dict]:
    """Verify Firebase Authentication ID token."""
    if not is_firebase_live():
        return None
    try:
        return auth.verify_id_token(id_token)
    except Exception as e:
        logger.warning(f"Firebase token verification failed: {e}")
        return None


def verify_credentials_with_firebase(email: str, password: str) -> Optional[dict]:
    """
    Authenticate email and password directly against Firebase Authentication REST API.
    Returns dict with {uid, email, idToken} on success, None on failure.
    """
    api_key = getattr(settings, "FIREBASE_WEB_API_KEY", "")
    if not api_key:
        return None
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={api_key}"
    payload = json.dumps({
        "email": email.strip(),
        "password": password,
        "returnSecureToken": True,
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {
                "uid": data.get("localId"),
                "email": data.get("email"),
                "idToken": data.get("idToken"),
            }
    except Exception as e:
        logger.debug(f"Firebase password authentication check returned: {e}")
        return None


def update_admin_password_in_firebase(uid: str, new_password: str) -> bool:
    """Update user password in Firebase Authentication using Admin SDK."""
    if not is_firebase_live():
        return False
    try:
        auth.update_user(uid, password=new_password)
        return True
    except Exception as e:
        logger.error(f"Failed to update password in Firebase Auth: {e}")
        return False
