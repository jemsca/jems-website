# jems-website history

## 2026-10-01 — route the How To SharePoint publish step through #hub (board item #69)

Verifying #28 surfaced that WordPress bands-page updates ARE wired through
#register, but the SharePoint side (the How To document's Site Assets
publish) was not - `Ensure-HowToPage.ps1`/`Publish-HowTo.ps1` remained raw,
hardcoded PnP PowerShell, and the SPFx web part was never ported
(`widgets/spfx/` was empty). Filed jems-tasks #69 with three subtasks; this is
the first.

Added `providers/sharepoint/sharepoint_assets.py` (`SharePointAssets`) and
`Publish-SiteAsset.ps1`, generalized from `Publish-HowTo.ps1` the same way
`providers/wordpress/wordpress_pages.py` generalized the WordPress side -
site URL/tenant/client id/cert path move to client configuration
(`website-sharepoint.json`), asset targets (Site Assets folder + filename)
are keyed by a logical `asset_key` a caller names, never a raw path.
`request_handler.py`'s `_build_provider` now dispatches on the configured
`provider` type (`wordpress` or `sharepoint`); added `website.publish_site_asset`
to the manifest and the client allowlist (caller: #register, target instance:
`onhb_sharepoint`). #register's `flows/publish_how_to.py` (new) publishes
`docs/How To.md` through it, dry-run by default, replacing the formerly
hand-run `pwsh Publish-HowTo.ps1` step.

Deferred to #69's remaining subtasks: `ensure_howto_page` (the SharePoint
page + widget web part itself) and the generalized SPFx web part/widget
config - that web part's property shape is changing (script-src + automatic
ETag-based cache-busting instead of pasted HTML), so generalizing the page-
ensure step now would need redoing once that lands. No live SharePoint write
was run while adding this integration.

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
