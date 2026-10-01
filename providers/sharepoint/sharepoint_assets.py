"""SharePoint Site Assets publishing, via PnP certificate auth.

Generalized from ONHB's own Publish-HowTo.ps1 (now Publish-SiteAsset.ps1 in
this directory, parametrized) - the raw site URL/tenant/client id/cert path
literals move to client configuration instead of being hardcoded in the
script, same split jems-hub/connectors/sharepoint-lists already uses for its
own attach_item_file(). This is the #hub-routed answer to jems-tasks board
item #69: the How To document's SharePoint publish step was never wired
through #register/#hub at all, just run by hand.

Only the Site Assets upload is handled here. Creating/updating the SharePoint
page that hosts a widget (Ensure-HowToPage.ps1's job) is left for #69's SPFx
subtask - that script's own web-part property shape is about to change
(script-src + auto cache-busting instead of pasted HTML), so generalizing it
now would need redoing once that lands.
"""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from typing import Dict

_PUBLISH_SCRIPT = Path(__file__).parent / "Publish-SiteAsset.ps1"


class SharePointAssets:
    """Publish one configured named asset's content to Site Assets."""

    def __init__(self, *, site: str, tenant_id: str, client_id: str, cert_path: str,
                 assets: Dict[str, Dict[str, str]]) -> None:
        """`assets`: logical asset key -> {"folder": "SiteAssets/Docs", "filename": "How-To.md"},
        from the instance's own provider config (e.g. website-sharepoint.json)."""
        if not site or not tenant_id or not client_id or not cert_path:
            raise ValueError("SharePoint site, tenant_id, client_id, and cert_path are required.")
        if not isinstance(assets, dict) or not assets:
            raise ValueError("At least one named Site Assets target must be configured.")
        for key, target in assets.items():
            if (
                not isinstance(target, dict)
                or not isinstance(target.get("folder"), str) or not target["folder"]
                or not isinstance(target.get("filename"), str) or not target["filename"]
            ):
                raise ValueError(f"Site Assets target {key!r} must name a folder and filename.")
        self.site = site
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.cert_path = cert_path
        self.assets = {key: dict(target) for key, target in assets.items()}

    def publish_asset(self, asset_key: str, content: bytes) -> dict:
        if asset_key not in self.assets:
            raise ValueError("The requested Site Assets target is not configured.")
        target = self.assets[asset_key]
        with tempfile.TemporaryDirectory() as tmp_dir:
            source_path = Path(tmp_dir) / target["filename"]
            source_path.write_bytes(content)
            result = subprocess.run(
                [
                    "pwsh", "-NoProfile", "-File", str(_PUBLISH_SCRIPT),
                    "-SiteUrl", self.site, "-ClientId", self.client_id,
                    "-TenantId", self.tenant_id, "-CertPath", self.cert_path,
                    "-Source", str(source_path),
                    "-TargetFolder", target["folder"], "-TargetName", target["filename"],
                ],
                capture_output=True, text=True, timeout=120,
            )
        if result.returncode != 0:
            raise RuntimeError(f"Publish-SiteAsset.ps1 failed ({asset_key}): {result.stderr}")
        return {
            "asset_key": asset_key,
            "path": f"{target['folder'].strip('/')}/{target['filename']}",
        }
