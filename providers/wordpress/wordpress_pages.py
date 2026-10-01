"""WordPress page operations used by jems-website."""

from __future__ import annotations

import re
import time
from typing import Any, Dict, Iterable
from urllib.parse import urlparse

import requests
from requests.auth import HTTPBasicAuth


_PAGE_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
_FIELD_LIMITS = {"content": 250_000, "title": 512, "slug": 200}
_RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class WordPressPages:
    """Access configured WordPress pages with bounded fields and safe writes."""

    def __init__(
        self,
        *,
        site: str,
        pages: Dict[str, int],
        username: str,
        app_password: str,
        user_agent: str = "jems-website/1.0",
        timeout: tuple[int, int] = (10, 30),
        get_retries: int = 2,
        retry_backoff: int = 3,
    ) -> None:
        parsed = urlparse(site)
        if (
            parsed.scheme != "https" or not parsed.netloc or parsed.path not in ("", "/")
            or parsed.username or parsed.password or parsed.query or parsed.fragment
        ):
            raise ValueError("WordPress site must be an HTTPS origin.")
        if not isinstance(pages, dict) or not pages:
            raise ValueError("At least one named WordPress page must be configured.")
        for key, page_id in pages.items():
            if (
                not isinstance(key, str) or not _PAGE_KEY_RE.fullmatch(key)
                or not isinstance(page_id, int) or isinstance(page_id, bool) or page_id < 1
            ):
                raise ValueError("WordPress pages must map valid page keys to positive page IDs.")
        if not username or not app_password:
            raise ValueError("WordPress username and application password are required.")
        self.site = site.rstrip("/")
        self.pages = dict(pages)
        self.auth = HTTPBasicAuth(username, app_password)
        self.user_agent = user_agent
        self.timeout = timeout
        self.get_retries = get_retries
        self.retry_backoff = retry_backoff
        self.session = requests.Session()

    def _page_id(self, page_key: str) -> int:
        if not isinstance(page_key, str) or page_key not in self.pages:
            raise ValueError("The requested WordPress page is not configured.")
        return self.pages[page_key]

    def _request(self, method: str, page_id: int, *, params=None, json_body=None) -> dict:
        url = f"{self.site}/wp-json/wp/v2/pages/{page_id}"
        headers = {"User-Agent": self.user_agent}
        attempts = self.get_retries + 1 if method == "GET" else 1
        last_error = "unknown error"
        for attempt in range(attempts):
            try:
                response = self.session.request(
                    method, url, auth=self.auth, headers=headers, params=params,
                    json=json_body, timeout=self.timeout,
                )
                if not response.ok and method == "GET" and response.status_code in _RETRYABLE_STATUS:
                    last_error = f"HTTP {response.status_code}"
                elif not response.ok:
                    raise RuntimeError(f"WordPress returned HTTP {response.status_code}.")
                else:
                    payload = response.json()
                    if not isinstance(payload, dict):
                        raise ValueError("WordPress returned an invalid page response.")
                    return payload
            except (requests.ConnectionError, requests.Timeout) as error:
                last_error = type(error).__name__
            except requests.RequestException as error:
                status = getattr(getattr(error, "response", None), "status_code", None)
                detail = f"HTTP {status}" if status is not None else type(error).__name__
                raise RuntimeError(f"WordPress {method} page request failed: {detail}.") from error
            if attempt + 1 < attempts:
                time.sleep(self.retry_backoff * (2 ** attempt))
        # Never retry a write: a lost response can leave its outcome unknown.
        raise RuntimeError(f"WordPress {method} page request failed: {last_error}.")

    def get_page(self, page_key: str) -> dict:
        page_id = self._page_id(page_key)
        payload = self._request("GET", page_id, params={"context": "edit"})
        content = payload.get("content")
        title = payload.get("title")
        if not isinstance(content, dict) or not isinstance(content.get("raw"), str):
            raise ValueError("WordPress did not return editable raw page content.")
        if not isinstance(title, dict) or not isinstance(title.get("raw"), str):
            raise ValueError("WordPress did not return an editable raw page title.")
        slug = payload.get("slug")
        if not isinstance(slug, str):
            raise ValueError("WordPress returned an invalid page slug.")
        return {
            "page_key": page_key,
            "page_id": page_id,
            "content": content["raw"],
            "title": title["raw"],
            "slug": slug,
            "edit_url": f"{self.site}/wp-admin/post.php?post={page_id}&action=edit&classic-editor=",
        }

    def update_page(self, page_key: str, fields: dict, *, commit: bool) -> dict:
        page_id = self._page_id(page_key)
        if not isinstance(fields, dict) or not fields or set(fields) - _FIELD_LIMITS.keys():
            raise ValueError("Page updates accept content, title, and/or slug fields only.")
        for name, value in fields.items():
            if not isinstance(value, str) or len(value) > _FIELD_LIMITS[name]:
                raise ValueError(f"WordPress page field {name!r} must be a bounded string.")
        if not isinstance(commit, bool):
            raise ValueError("commit must be a boolean.")

        current = self.get_page(page_key)
        changed = {name: value for name, value in fields.items() if current[name] != value}
        if commit and changed:
            # A single, non-retried partial update preserves all untouched fields.
            self._request("POST", page_id, json_body=changed)
        return {"page_key": page_key, "changed_fields": sorted(changed), "committed": commit}
