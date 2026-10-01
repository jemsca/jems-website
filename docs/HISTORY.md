# jems-website history

## 2026-10-01 — add tests for the WordPress page provider and #hub handler

`request_handler.py`/`wordpress_pages.py` had no test coverage despite being a
live-write capability (flagged on jems-tasks board item #28). Added
`test_wordpress_pages.py` (construction validation, bounded get/update
behaviour, retry-on-GET vs never-retry-on-POST) and `test_request_handler.py`
(envelope validation, caller restriction to #register, field/commit
validation, `_build_provider`'s client-config resolution and its path-
traversal/credential guards) — all offline, no live WordPress calls.

## 2026-09-30 — support guarded WordPress page updates

Added a configured WordPress page provider and #hub handler for bounded reads
and updates to named pages. ONHB #register can update registration page content,
title, and slug through `website.get_page`/`website.update_page`; stage rules
remain in #register, and the existing dry-run/`--commit` behavior remains in
place. The client maps only the bands-site home and test/late page IDs. No live
page update was run while adding this integration.

## Action vocabulary — jems-tasks, onhb/jems, task #31 (2026-09-29)

- Added runtime capability declarations for the ONHB How To, Bands, Notes, and Treasurer widgets.
- Documented each widget's read/view actions and the local Markdown conversion, page setup, and publishing actions.
- Recorded that browser widgets are read-only and that page setup and publishing write to SharePoint using ONHB-specific defaults.
