"""Offline tests for WordPressPages, the WordPress page provider."""

import unittest
from unittest.mock import MagicMock, patch

from providers.wordpress.wordpress_pages import WordPressPages


def _response(payload, ok=True, status_code=200):
    response = MagicMock()
    response.ok = ok
    response.status_code = status_code
    response.json.return_value = payload
    return response


def _page_payload(content="raw content", title="raw title", slug="home"):
    return {
        "content": {"raw": content},
        "title": {"raw": title},
        "slug": slug,
    }


class TestConstruction(unittest.TestCase):
    def _kwargs(self, **overrides):
        kwargs = dict(
            site="https://bands.example.org",
            pages={"registration_home": 12},
            username="wp-user",
            app_password="wp-pass",
        )
        kwargs.update(overrides)
        return kwargs

    def test_rejects_a_non_https_site(self):
        with self.assertRaises(ValueError):
            WordPressPages(**self._kwargs(site="http://bands.example.org"))

    def test_rejects_a_site_with_a_path(self):
        with self.assertRaises(ValueError):
            WordPressPages(**self._kwargs(site="https://bands.example.org/sub"))

    def test_rejects_a_site_carrying_embedded_credentials(self):
        with self.assertRaises(ValueError):
            WordPressPages(**self._kwargs(site="https://user:pass@bands.example.org"))

    def test_rejects_an_empty_page_map(self):
        with self.assertRaises(ValueError):
            WordPressPages(**self._kwargs(pages={}))

    def test_rejects_a_non_positive_page_id(self):
        with self.assertRaises(ValueError):
            WordPressPages(**self._kwargs(pages={"home": 0}))

    def test_rejects_a_boolean_page_id(self):
        with self.assertRaises(ValueError):
            WordPressPages(**self._kwargs(pages={"home": True}))

    def test_rejects_an_invalid_page_key(self):
        with self.assertRaises(ValueError):
            WordPressPages(**self._kwargs(pages={"Home Page": 1}))

    def test_rejects_missing_credentials(self):
        with self.assertRaises(ValueError):
            WordPressPages(**self._kwargs(username=""))


class TestGetPage(unittest.TestCase):
    def _provider(self):
        return WordPressPages(
            site="https://bands.example.org", pages={"registration_home": 12},
            username="wp-user", app_password="wp-pass",
        )

    def test_returns_editable_fields_for_a_configured_page(self):
        provider = self._provider()
        with patch.object(provider.session, "request", return_value=_response(_page_payload())) as request:
            page = provider.get_page("registration_home")
        self.assertEqual(page, {
            "page_key": "registration_home",
            "page_id": 12,
            "content": "raw content",
            "title": "raw title",
            "slug": "home",
            "edit_url": "https://bands.example.org/wp-admin/post.php?post=12&action=edit&classic-editor=",
        })
        request.assert_called_once_with(
            "GET", "https://bands.example.org/wp-json/wp/v2/pages/12",
            auth=provider.auth, headers={"User-Agent": provider.user_agent},
            params={"context": "edit"}, json=None, timeout=provider.timeout,
        )

    def test_rejects_an_unconfigured_page_key(self):
        provider = self._provider()
        with self.assertRaises(ValueError):
            provider.get_page("not_configured")

    def test_rejects_a_response_missing_raw_content(self):
        provider = self._provider()
        payload = _page_payload()
        del payload["content"]["raw"]
        with patch.object(provider.session, "request", return_value=_response(payload)):
            with self.assertRaises(ValueError):
                provider.get_page("registration_home")

    def test_retries_a_retryable_get_failure_then_succeeds(self):
        provider = self._provider()
        responses = [_response({}, ok=False, status_code=503), _response(_page_payload())]
        with patch.object(provider.session, "request", side_effect=responses) as request, \
                patch("providers.wordpress.wordpress_pages.time.sleep"):
            page = provider.get_page("registration_home")
        self.assertEqual(page["content"], "raw content")
        self.assertEqual(request.call_count, 2)

    def test_raises_after_exhausting_get_retries(self):
        provider = self._provider()
        responses = [_response({}, ok=False, status_code=503)] * (provider.get_retries + 1)
        with patch.object(provider.session, "request", side_effect=responses), \
                patch("providers.wordpress.wordpress_pages.time.sleep"):
            with self.assertRaises(RuntimeError):
                provider.get_page("registration_home")

    def test_a_non_retryable_status_raises_immediately(self):
        provider = self._provider()
        with patch.object(provider.session, "request", return_value=_response({}, ok=False, status_code=404)) as request:
            with self.assertRaises(RuntimeError):
                provider.get_page("registration_home")
        request.assert_called_once()


class TestUpdatePage(unittest.TestCase):
    def _provider(self):
        return WordPressPages(
            site="https://bands.example.org", pages={"registration_home": 12},
            username="wp-user", app_password="wp-pass",
        )

    def test_dry_run_reports_changed_fields_without_writing(self):
        provider = self._provider()
        with patch.object(provider.session, "request", return_value=_response(_page_payload())) as request:
            result = provider.update_page(
                "registration_home", {"title": "new title"}, commit=False,
            )
        self.assertEqual(result, {
            "page_key": "registration_home", "changed_fields": ["title"], "committed": False,
        })
        request.assert_called_once()  # only the GET for comparison, no POST

    def test_commit_writes_only_the_changed_fields(self):
        provider = self._provider()
        get_response = _response(_page_payload(title="old title"))
        post_response = _response(_page_payload(title="new title"))
        with patch.object(provider.session, "request", side_effect=[get_response, post_response]) as request:
            result = provider.update_page(
                "registration_home",
                {"title": "new title", "content": "raw content"},
                commit=True,
            )
        self.assertEqual(result["changed_fields"], ["title"])
        self.assertTrue(result["committed"])
        self.assertEqual(request.call_count, 2)
        post_call = request.call_args_list[1]
        self.assertEqual(post_call.args[0], "POST")
        self.assertEqual(post_call.kwargs.get("json"), {"title": "new title"})

    def test_commit_with_no_actual_changes_never_posts(self):
        provider = self._provider()
        with patch.object(provider.session, "request", return_value=_response(_page_payload(title="same"))) as request:
            result = provider.update_page("registration_home", {"title": "same"}, commit=True)
        self.assertEqual(result["changed_fields"], [])
        request.assert_called_once()

    def test_rejects_a_field_outside_the_bounded_set(self):
        provider = self._provider()
        with self.assertRaises(ValueError):
            provider.update_page("registration_home", {"post_id": "9"}, commit=False)

    def test_rejects_an_oversized_field(self):
        provider = self._provider()
        with self.assertRaises(ValueError):
            provider.update_page("registration_home", {"slug": "x" * 201}, commit=False)

    def test_never_retries_a_post(self):
        provider = self._provider()
        get_response = _response(_page_payload(title="old title"))
        post_failure = _response({}, ok=False, status_code=503)
        with patch.object(provider.session, "request", side_effect=[get_response, post_failure]) as request, \
                patch("providers.wordpress.wordpress_pages.time.sleep") as sleep:
            with self.assertRaises(RuntimeError):
                provider.update_page("registration_home", {"title": "new title"}, commit=True)
        self.assertEqual(request.call_count, 2)
        sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
