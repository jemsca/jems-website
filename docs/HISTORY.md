# jems-website history

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
