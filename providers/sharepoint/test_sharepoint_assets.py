"""Offline tests for SharePointAssets, the Site Assets publishing provider."""

import subprocess
import unittest
from unittest.mock import MagicMock, patch

from sharepoint_assets import SharePointAssets


def _kwargs(**overrides):
    kwargs = dict(
        site="https://contoso.sharepoint.com/sites/Registration",
        tenant_id="tenant-1", client_id="client-1", cert_path="C:/certs/cert.pfx",
        assets={"how_to_markdown": {"folder": "SiteAssets/Docs", "filename": "How-To.md"}},
    )
    kwargs.update(overrides)
    return kwargs


class TestConstruction(unittest.TestCase):
    def test_rejects_a_missing_site(self):
        with self.assertRaises(ValueError):
            SharePointAssets(**_kwargs(site=""))

    def test_rejects_a_missing_cert_path(self):
        with self.assertRaises(ValueError):
            SharePointAssets(**_kwargs(cert_path=""))

    def test_rejects_an_empty_asset_map(self):
        with self.assertRaises(ValueError):
            SharePointAssets(**_kwargs(assets={}))

    def test_rejects_an_asset_missing_a_folder(self):
        with self.assertRaises(ValueError):
            SharePointAssets(**_kwargs(assets={"a": {"filename": "a.md"}}))

    def test_rejects_an_asset_missing_a_filename(self):
        with self.assertRaises(ValueError):
            SharePointAssets(**_kwargs(assets={"a": {"folder": "SiteAssets"}}))


class TestPublishAsset(unittest.TestCase):
    def _provider(self):
        return SharePointAssets(**_kwargs())

    def test_rejects_an_unconfigured_asset_key(self):
        provider = self._provider()
        with self.assertRaises(ValueError):
            provider.publish_asset("not_configured", b"content")

    def test_publishes_through_the_configured_script(self):
        provider = self._provider()
        completed = MagicMock(returncode=0, stderr="")
        with patch("sharepoint_assets.subprocess.run", return_value=completed) as run:
            result = provider.publish_asset("how_to_markdown", b"# How To")
        self.assertEqual(result, {"asset_key": "how_to_markdown", "path": "SiteAssets/Docs/How-To.md"})
        args = run.call_args.args[0]
        self.assertEqual(args[0], "pwsh")
        self.assertIn("-SiteUrl", args)
        self.assertIn(provider.site, args)
        self.assertIn("-TenantId", args)
        self.assertIn(provider.tenant_id, args)
        self.assertIn("-TargetFolder", args)
        self.assertIn("SiteAssets/Docs", args)
        self.assertIn("-TargetName", args)
        self.assertIn("How-To.md", args)

    def test_writes_the_content_to_the_temp_source_file_before_calling(self):
        provider = self._provider()
        seen = {}

        def _capture(args, **kwargs):
            source_index = args.index("-Source") + 1
            with open(args[source_index], "rb") as handle:
                seen["content"] = handle.read()
            return MagicMock(returncode=0, stderr="")

        with patch("sharepoint_assets.subprocess.run", side_effect=_capture):
            provider.publish_asset("how_to_markdown", b"# How To body")
        self.assertEqual(seen["content"], b"# How To body")

    def test_raises_on_a_nonzero_exit(self):
        provider = self._provider()
        completed = MagicMock(returncode=1, stderr="Connect-PnPOnline failed")
        with patch("sharepoint_assets.subprocess.run", return_value=completed):
            with self.assertRaises(RuntimeError):
                provider.publish_asset("how_to_markdown", b"content")


if __name__ == "__main__":
    unittest.main()
