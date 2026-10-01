# jems-website history

## 2026-10-01 (corrected same day) — How To's real publish path is #files, not Site Assets

Janet corrected the premise behind the entry below: `Ensure-HowToPage.ps1`/
`Publish-HowTo.ps1`/`HowTo.html` (live-markdown-render widget, publishing to
Site Assets) were never the real production mechanism for How To - that code
is unused/reference material, kept as-is for now (it may inform the
generalized SPFx widget work in #69's other subtasks). The REAL, live path,
confirmed against the actual site: `docs/How To.md` -> Word doc (via the
existing `convert_howto.py`/`parse.js` pipeline in `providers/local_markdown/`)
-> uploaded to the Registration SharePoint site's **Documents/Tech** folder -
a plain file upload, not a Site Assets publish for a widget to render.

That upload target is the SAME Documents drive `#files`' existing
`registration` onedrive instance already points at - no SharePoint-specific
code needed in this repo for it at all. Removed the `onhb_sharepoint`
website instance, the `website.publish_site_asset` client route, and
`website-sharepoint.json` (none had a real consumer). `website.publish_site_asset`
and `providers/sharepoint/sharepoint_assets.py` stay in this repo as general,
tested Site Assets-publish infrastructure - genuinely reusable once #69's SPFx
subtask needs to publish a widget's `.js`/`config.json` there - just not wired
to any client instance until that real need exists. See `jems-register/docs/
HISTORY.md` and `jems-files/docs/HISTORY.md` for the actual How To migration
(`flows/publish_how_to.py`, `files.download_file`).

## 2026-10-01 — route the How To SharePoint publish step through #hub (board item #69) [superseded above]

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

**Superseded same day** - see the entry above: `publish_how_to.py` now goes
through `#files` instead, and the `onhb_sharepoint` client wiring described
here was removed. The `providers/sharepoint/` CODE this entry added is kept
(see above), just not client-wired this way.

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
