"""JSON-stdio handler for hub-routed WordPress page operations."""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Optional

WORDPRESS_PROVIDER = Path(__file__).resolve().parent / "providers" / "wordpress"
sys.path.insert(0, str(WORDPRESS_PROVIDER))

from wordpress_pages import WordPressPages  # noqa: E402

TARGET_INSTANCE_ENV = "JEMS_REQUEST_TARGET_INSTANCE"
CLIENTS_ROOT = Path(os.environ.get("JEMS_CLIENTS_ROOT", "C:/clients"))
_IDENTIFIER_RE = re.compile(r"^[a-z][a-z0-9_-]*$")
_CAPABILITIES = {"website.get_page", "website.update_page"}
_ENVELOPE_KEYS = {"protocol", "request_id", "client", "caller", "capability", "input"}
_OPTIONAL_ENVELOPE_KEYS = {"idempotency_key", "route"}
_FIELD_LIMITS = {"content": 250_000, "title": 512, "slug": 200}


def _response(request_id: Optional[str], status: str, result: object = None,
              error: Optional[dict] = None) -> dict:
    response = {"protocol": "jems.response.v1", "request_id": request_id, "status": status}
    if status == "succeeded":
        response["result"] = result
    else:
        response["error"] = error
    return response


def _reject(request_id: Optional[str], code: str, message: str) -> dict:
    return _response(request_id, "rejected", error={
        "code": code, "message": message, "retryable": False,
    })


def _build_provider(client: str, instance_name: str) -> WordPressPages:
    jems_path = CLIENTS_ROOT / client / "jems.json"
    try:
        with open(jems_path, encoding="utf-8") as config_file:
            jems_config = json.load(config_file)
    except json.JSONDecodeError as error:
        raise ValueError("Client configuration contains invalid JSON.") from error
    if not isinstance(jems_config, dict):
        raise ValueError("Client configuration must be an object.")
    tools = jems_config.get("tools", {})
    website = tools.get("website", {}) if isinstance(tools, dict) else None
    instances = website.get("instances", {}) if isinstance(website, dict) else None
    instance = instances.get(instance_name) if isinstance(instances, dict) else None
    if not isinstance(instance, dict):
        raise LookupError(f"Configured website instance {instance_name!r} was not found.")

    config_name = instance.get("provider_config")
    if (
        not isinstance(config_name, str) or not config_name
        or Path(config_name).name != config_name or config_name in {".", ".."}
    ):
        raise ValueError("The website instance must name a client-local provider_config file.")
    try:
        with open(CLIENTS_ROOT / client / config_name, encoding="utf-8") as config_file:
            config = json.load(config_file)
    except json.JSONDecodeError as error:
        raise ValueError("Website provider configuration contains invalid JSON.") from error
    if not isinstance(config, dict) or config.get("provider") != "wordpress":
        raise ValueError("The configured website provider must be wordpress.")

    site = config.get("site")
    pages = config.get("pages")
    username_env = config.get("username_env")
    password_env = config.get("app_password_env")
    if not isinstance(site, str):
        raise ValueError("WordPress provider configuration requires a site URL.")
    if not isinstance(username_env, str) or not username_env or not isinstance(password_env, str) or not password_env:
        raise ValueError("WordPress provider configuration requires credential environment variable names.")
    user_agent = config.get("user_agent", "jems-website/1.0")
    if not isinstance(user_agent, str) or not user_agent.strip() or len(user_agent) > 256:
        raise ValueError("WordPress user_agent must be a bounded non-empty string.")
    username, app_password = os.environ.get(username_env), os.environ.get(password_env)
    if not username or not app_password:
        missing = username_env if not username else password_env
        raise LookupError(f"{missing} is not set for the configured WordPress instance.")
    return WordPressPages(
        site=site,
        pages=pages,
        username=username,
        app_password=app_password,
        user_agent=user_agent,
    )


def _run(capability: str, data: dict, provider: WordPressPages) -> dict:
    if capability == "website.get_page":
        if set(data) != {"page_key"}:
            raise ValueError("Page reads require one configured page key.")
        page = provider.get_page(data["page_key"])
        return {"page": page}
    if capability == "website.update_page":
        if set(data) != {"page_key", "fields", "commit"}:
            raise ValueError("Page updates require a page key, bounded fields, and commit boolean.")
        page_key, fields, commit = data["page_key"], data["fields"], data["commit"]
        if not isinstance(page_key, str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", page_key):
            raise ValueError("A valid configured page key is required.")
        if not isinstance(fields, dict) or not fields or set(fields) - _FIELD_LIMITS.keys():
            raise ValueError("Page updates accept content, title, and/or slug fields only.")
        if any(not isinstance(value, str) or len(value) > _FIELD_LIMITS[name]
               for name, value in fields.items()):
            raise ValueError("Each page field must be a bounded string.")
        if not isinstance(commit, bool):
            raise ValueError("commit must be a boolean.")
        return provider.update_page(page_key, fields, commit=commit)
    raise ValueError("The requested capability is not supported.")


def handle_request(request: object, target_instance: Optional[str] = None) -> dict:
    """Validate one forwarded request and invoke a configured website operation."""
    request_id = request.get("request_id") if isinstance(request, dict) else None
    if not isinstance(request_id, str) or not request_id or len(request_id) > 128:
        request_id = None
    if (
        not isinstance(request, dict)
        or set(request) - _ENVELOPE_KEYS - _OPTIONAL_ENVELOPE_KEYS
        or not _ENVELOPE_KEYS.issubset(request)
    ):
        return _reject(request_id, "INVALID_ENVELOPE", "Request envelope has missing or unsupported fields.")
    if request["protocol"] != "jems.request.v1":
        return _reject(request_id, "UNSUPPORTED_PROTOCOL", "Request protocol is not supported.")
    if not isinstance(request_id, str):
        return _reject(None, "INVALID_ENVELOPE", "Request request_id must be a non-empty string.")
    if "idempotency_key" in request and (
        not isinstance(request["idempotency_key"], str)
        or not request["idempotency_key"] or len(request["idempotency_key"]) > 256
    ):
        return _reject(request_id, "INVALID_ENVELOPE", "idempotency_key must be a non-empty string.")
    if "route" in request and (
        not isinstance(request["route"], str) or not _IDENTIFIER_RE.fullmatch(request["route"])
    ):
        return _reject(request_id, "INVALID_ENVELOPE", "route must be a valid logical route alias.")
    if (
        not isinstance(request["client"], str)
        or not _IDENTIFIER_RE.fullmatch(request["client"])
        or request["caller"] != "register"
    ):
        return _reject(request_id, "INVALID_CALLER", "Only #register may call website capabilities.")
    if not isinstance(request["capability"], str) or request["capability"] not in _CAPABILITIES:
        return _reject(request_id, "UNKNOWN_CAPABILITY", "This handler does not expose the requested capability.")
    if not isinstance(request["input"], dict):
        return _reject(request_id, "INVALID_INPUT", "Request input must be an object.")
    instance = target_instance or os.environ.get(TARGET_INSTANCE_ENV)
    if not isinstance(instance, str) or not _IDENTIFIER_RE.fullmatch(instance):
        return _reject(request_id, "INVALID_TARGET", "The hub did not provide a valid target instance.")

    try:
        provider = _build_provider(request["client"], instance)
        result = _run(request["capability"], request["input"], provider)
        json.dumps(result, allow_nan=False)
    except (LookupError, PermissionError, ValueError) as error:
        return _reject(request_id, "OPERATION_REJECTED", str(error))
    except (TypeError, OverflowError):
        return _reject(request_id, "INVALID_RESULT", "Website operation returned invalid JSON data.")
    except Exception as error:
        print(f"website request failed: {type(error).__name__}", file=sys.stderr)
        return _response(request_id, "failed", error={
            "code": "OPERATION_FAILED", "message": "The website operation failed.", "retryable": False,
        })
    return _response(request_id, "succeeded", result=result)


def main() -> int:
    try:
        request = json.load(sys.stdin)
    except json.JSONDecodeError:
        response = _reject(None, "INVALID_JSON", "Request is not valid JSON.")
    else:
        response = handle_request(request)
    sys.stdout.write(json.dumps(response, ensure_ascii=True, separators=(",", ":")) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
