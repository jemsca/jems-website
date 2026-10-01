"""Offline tests for the configured #website request boundary."""

import unittest
from unittest.mock import MagicMock, patch

import request_handler


def envelope(input_data, capability="website.get_page", caller="register", client="onhb"):
    return {
        "protocol": "jems.request.v1", "request_id": "request-1",
        "client": client, "caller": caller, "capability": capability,
        "input": input_data,
    }


class TestPublishSiteAsset(unittest.TestCase):
    def _input(self, **overrides):
        data = {"asset_key": "how_to_markdown", "content_base64": "IyBIb3cgVG8="}
        data.update(overrides)
        return data

    def test_publishes_through_the_configured_provider(self):
        provider = MagicMock()
        provider.publish_asset.return_value = {
            "asset_key": "how_to_markdown", "path": "SiteAssets/Docs/How-To.md",
        }
        with patch.object(request_handler, "_build_provider", return_value=provider):
            response = request_handler.handle_request(
                envelope(self._input(), capability="website.publish_site_asset"), "onhb_sharepoint",
            )
        provider.publish_asset.assert_called_once_with("how_to_markdown", b"# How To")
        self.assertEqual(response["result"]["path"], "SiteAssets/Docs/How-To.md")

    def test_rejects_an_invalid_asset_key(self):
        with patch.object(request_handler, "_build_provider"):
            response = request_handler.handle_request(
                envelope(self._input(asset_key="Not Valid"), capability="website.publish_site_asset"),
                "onhb_sharepoint",
            )
        self.assertEqual(response["error"]["code"], "OPERATION_REJECTED")

    def test_rejects_invalid_base64(self):
        with patch.object(request_handler, "_build_provider"):
            response = request_handler.handle_request(
                envelope(self._input(content_base64="not-base64!!"), capability="website.publish_site_asset"),
                "onhb_sharepoint",
            )
        self.assertEqual(response["error"]["code"], "OPERATION_REJECTED")

    def test_rejects_unexpected_fields(self):
        with patch.object(request_handler, "_build_provider"):
            response = request_handler.handle_request(
                envelope(self._input(extra=1), capability="website.publish_site_asset"), "onhb_sharepoint",
            )
        self.assertEqual(response["error"]["code"], "OPERATION_REJECTED")


class TestGetPage(unittest.TestCase):
    def test_reads_through_the_configured_provider(self):
        provider = MagicMock()
        provider.get_page.return_value = {"page_key": "registration_home", "content": "x"}
        with patch.object(request_handler, "_build_provider", return_value=provider) as build:
            response = request_handler.handle_request(
                envelope({"page_key": "registration_home"}), "onhb",
            )
        build.assert_called_once_with("onhb", "onhb")
        provider.get_page.assert_called_once_with("registration_home")
        self.assertEqual(response["status"], "succeeded")
        self.assertEqual(response["result"]["page"]["content"], "x")

    def test_rejects_unexpected_fields(self):
        with patch.object(request_handler, "_build_provider"):
            response = request_handler.handle_request(
                envelope({"page_key": "registration_home", "extra": 1}), "onhb",
            )
        self.assertEqual(response["error"]["code"], "OPERATION_REJECTED")


class TestUpdatePage(unittest.TestCase):
    def _input(self, **overrides):
        data = {"page_key": "registration_home", "fields": {"title": "New"}, "commit": False}
        data.update(overrides)
        return data

    def test_updates_through_the_configured_provider(self):
        provider = MagicMock()
        provider.update_page.return_value = {
            "page_key": "registration_home", "changed_fields": ["title"], "committed": False,
        }
        with patch.object(request_handler, "_build_provider", return_value=provider):
            response = request_handler.handle_request(
                envelope(self._input(), capability="website.update_page"), "onhb",
            )
        provider.update_page.assert_called_once_with(
            "registration_home", {"title": "New"}, commit=False,
        )
        self.assertEqual(response["result"]["committed"], False)

    def test_rejects_an_invalid_page_key(self):
        with patch.object(request_handler, "_build_provider"):
            response = request_handler.handle_request(
                envelope(self._input(page_key="Not Valid"), capability="website.update_page"), "onhb",
            )
        self.assertEqual(response["error"]["code"], "OPERATION_REJECTED")

    def test_rejects_a_field_outside_the_bounded_set(self):
        with patch.object(request_handler, "_build_provider"):
            response = request_handler.handle_request(
                envelope(self._input(fields={"post_id": "9"}), capability="website.update_page"), "onhb",
            )
        self.assertEqual(response["error"]["code"], "OPERATION_REJECTED")

    def test_rejects_a_non_boolean_commit(self):
        with patch.object(request_handler, "_build_provider"):
            response = request_handler.handle_request(
                envelope(self._input(commit="yes"), capability="website.update_page"), "onhb",
            )
        self.assertEqual(response["error"]["code"], "OPERATION_REJECTED")

    def test_rejects_an_oversized_field(self):
        with patch.object(request_handler, "_build_provider"):
            response = request_handler.handle_request(
                envelope(self._input(fields={"slug": "x" * 201}), capability="website.update_page"), "onhb",
            )
        self.assertEqual(response["error"]["code"], "OPERATION_REJECTED")


class TestCallerRestriction(unittest.TestCase):
    def test_only_register_may_call(self):
        response = request_handler.handle_request(
            envelope({"page_key": "registration_home"}, caller="go"), "onhb",
        )
        self.assertEqual(response["error"]["code"], "INVALID_CALLER")


class TestEnvelope(unittest.TestCase):
    def test_unknown_capability_rejected(self):
        response = request_handler.handle_request(
            envelope({}, capability="website.not_a_real_capability"), "onhb",
        )
        self.assertEqual(response["error"]["code"], "UNKNOWN_CAPABILITY")

    def test_missing_target_instance_rejected(self):
        response = request_handler.handle_request(envelope({"page_key": "registration_home"}))
        self.assertEqual(response["error"]["code"], "INVALID_TARGET")

    def test_unsupported_protocol_rejected(self):
        request = envelope({"page_key": "registration_home"})
        request["protocol"] = "jems.request.v2"
        response = request_handler.handle_request(request, "onhb")
        self.assertEqual(response["error"]["code"], "UNSUPPORTED_PROTOCOL")


class TestBuildProvider(unittest.TestCase):
    def test_rejects_an_unconfigured_instance(self):
        jems_config = {"tools": {"website": {"instances": {}}}}
        with patch("request_handler.open", create=True), \
                patch("request_handler.json.load", return_value=jems_config):
            with self.assertRaises(LookupError):
                request_handler._build_provider("onhb", "missing")

    def test_rejects_a_provider_config_outside_the_client_directory(self):
        jems_config = {
            "tools": {"website": {"instances": {"onhb": {"provider_config": "../secrets.json"}}}},
        }
        with patch("request_handler.open", create=True), \
                patch("request_handler.json.load", return_value=jems_config):
            with self.assertRaises(ValueError):
                request_handler._build_provider("onhb", "onhb")

    def test_rejects_a_non_wordpress_provider(self):
        jems_config = {
            "tools": {"website": {"instances": {"onhb": {"provider_config": "website.json"}}}},
        }
        website_config = {"provider": "something-else"}
        with patch("request_handler.open", create=True), \
                patch("request_handler.json.load", side_effect=[jems_config, website_config]):
            with self.assertRaises(ValueError):
                request_handler._build_provider("onhb", "onhb")

    def test_builds_a_sharepoint_provider_from_configuration(self):
        jems_config = {
            "tools": {"website": {"instances": {
                "onhb_sharepoint": {"provider_config": "website-sharepoint.json"},
            }}},
        }
        sharepoint_config = {
            "provider": "sharepoint",
            "site": "https://contoso.sharepoint.com/sites/Registration",
            "tenant_id": "tenant-1", "client_id": "client-1", "cert_path": "C:/certs/cert.pfx",
            "assets": {"how_to_markdown": {"folder": "SiteAssets/Docs", "filename": "How-To.md"}},
        }
        with patch("request_handler.open", create=True), \
                patch("request_handler.json.load", side_effect=[jems_config, sharepoint_config]):
            provider = request_handler._build_provider("onhb", "onhb_sharepoint")
        self.assertEqual(provider.site, sharepoint_config["site"])
        self.assertEqual(provider.assets, sharepoint_config["assets"])

    def test_rejects_a_sharepoint_provider_missing_a_cert_path(self):
        jems_config = {
            "tools": {"website": {"instances": {
                "onhb_sharepoint": {"provider_config": "website-sharepoint.json"},
            }}},
        }
        sharepoint_config = {
            "provider": "sharepoint",
            "site": "https://contoso.sharepoint.com/sites/Registration",
            "tenant_id": "tenant-1", "client_id": "client-1",
            "assets": {"how_to_markdown": {"folder": "SiteAssets/Docs", "filename": "How-To.md"}},
        }
        with patch("request_handler.open", create=True), \
                patch("request_handler.json.load", side_effect=[jems_config, sharepoint_config]):
            with self.assertRaises(ValueError):
                request_handler._build_provider("onhb", "onhb_sharepoint")

    def test_rejects_missing_credential_env_vars(self):
        jems_config = {
            "tools": {"website": {"instances": {"onhb": {"provider_config": "website.json"}}}},
        }
        website_config = {
            "provider": "wordpress", "site": "https://bands.example.org",
            "pages": {"registration_home": 12},
            "username_env": "WP_USER_TEST_MISSING", "app_password_env": "WP_APP_PASSWORD_TEST_MISSING",
        }
        with patch("request_handler.open", create=True), \
                patch("request_handler.json.load", side_effect=[jems_config, website_config]), \
                patch.dict("os.environ", {}, clear=False):
            import os
            os.environ.pop("WP_USER_TEST_MISSING", None)
            os.environ.pop("WP_APP_PASSWORD_TEST_MISSING", None)
            with self.assertRaises(LookupError):
                request_handler._build_provider("onhb", "onhb")


if __name__ == "__main__":
    unittest.main()
