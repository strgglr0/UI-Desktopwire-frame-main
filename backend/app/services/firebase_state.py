from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional


def _is_truthy(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class FirebaseStateStore:
    enabled: bool
    client: Any = None
    collection: str = "clinic_admin"
    document: str = "app_state"

    @classmethod
    def from_env(cls) -> "FirebaseStateStore":
        enabled = _is_truthy(os.environ.get("FIREBASE_ENABLED", "false"))
        collection = os.environ.get("FIREBASE_COLLECTION", "clinic_admin").strip() or "clinic_admin"
        document = os.environ.get("FIREBASE_DOCUMENT", "app_state").strip() or "app_state"

        if not enabled:
            return cls(enabled=False, collection=collection, document=document)

        cred_path = (os.environ.get("FIREBASE_CREDENTIALS_PATH") or "").strip()
        cred_json = (os.environ.get("FIREBASE_CREDENTIALS_JSON") or "").strip()

        if not cred_path and not cred_json:
            print("[firebase] FIREBASE_ENABLED is true but no credentials provided; using SQLite app_state fallback")
            return cls(enabled=False, collection=collection, document=document)

        try:
            import firebase_admin
            from firebase_admin import credentials, firestore
        except Exception as exc:  # pragma: no cover - depends on environment setup
            print(f"[firebase] firebase-admin unavailable ({exc}); using SQLite app_state fallback")
            return cls(enabled=False, collection=collection, document=document)

        try:
            if not firebase_admin._apps:
                if cred_json:
                    cred_data = json.loads(cred_json)
                    cred = credentials.Certificate(cred_data)
                else:
                    cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred)

            client = firestore.client()
            print("[firebase] Firestore state store enabled")
            return cls(enabled=True, client=client, collection=collection, document=document)
        except Exception as exc:  # pragma: no cover - depends on environment setup
            print(f"[firebase] initialization failed ({exc}); using SQLite app_state fallback")
            return cls(enabled=False, collection=collection, document=document)

    def load_state(self) -> Optional[Dict[str, Any]]:
        if not self.enabled or self.client is None:
            return None

        doc_ref = self.client.collection(self.collection).document(self.document)
        snapshot = doc_ref.get()
        if not snapshot.exists:
            return None

        payload = snapshot.to_dict() or {}
        state = payload.get("state")
        if isinstance(state, dict):
            return state
        return None

    def save_state(self, state: Dict[str, Any]) -> None:
        if not self.enabled or self.client is None:
            return
        doc_ref = self.client.collection(self.collection).document(self.document)
        doc_ref.set(
            {
                "state": state,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            merge=True,
        )
