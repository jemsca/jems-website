# jems-website architecture

`jems-website` owns configured website operations. ONHB's implementation
contains browser widgets, a local Markdown publication pipeline, a WordPress
page provider used by #register's registration-stage workflow, and a
SharePoint Site Assets publisher used by #register's How To publish step.

## Browser widget actions

Each loaded widget registers its supported view actions in
`window.jemsWebsiteCapabilities`:

- `onhbHowTo` loads and renders published Markdown, filters the table of
  contents, and reloads the document.
- `onhbBands` lists sessions, shows a selected session's band summary, and
  refreshes that summary.
- `onhbNotes` lists sessions, shows member and band notes for a session, and
  refreshes those notes.
- `onhbTreasurer` shows outstanding payments and refunds.

The widgets read SharePoint data through the signed-in browser session. They do
not create or update list items.

## Local Markdown actions

`providers/local_markdown/` implements `convert_howto_docx`,
`ensure_howto_page`, and `publish_howto_markdown` through its PowerShell
scripts. `ensure_howto_page` (creating/updating the How To SharePoint page and
its widget web part) remains unrouted and ONHB-specific - its web part
property shape is about to change (see "SharePoint Site Assets" below's own
note on the pending SPFx work, jems-tasks board item #69), so generalizing it
now would need redoing once that lands.

## SharePoint Site Assets

`providers/sharepoint/sharepoint_assets.py` (`SharePointAssets`, 2026-10-01,
board item #69) publishes one configured named asset's bytes into a
SharePoint site's Site Assets library, via `Publish-SiteAsset.ps1` - PnP
certificate auth, generalized from ONHB's own `Publish-HowTo.ps1` (now
retained in `providers/local_markdown/` as the un-generalized original). Asset
keys and their Site Assets folder/filename live in the instance's own provider
config (e.g. `website-sharepoint.json`'s `assets` map) - a caller names a
configured key, never a raw path. `request_handler.py` exposes
`website.publish_site_asset` to #register through #hub; #register's
`flows/publish_how_to.py` uses it to publish `docs/How To.md` under the
`how_to_markdown` key, replacing the formerly-manual `pwsh Publish-HowTo.ps1`
step. Creating/updating the SharePoint PAGE that hosts a widget
(`ensure_howto_page`, above) is a separate, not-yet-generalized step.

## WordPress pages

`providers/wordpress/wordpress_pages.py` reads and updates only WordPress pages
named in the client's `website.json` provider configuration. It returns raw
editable content, title, and slug; updates are limited to those three fields.
The provider uses the configured WordPress Application Password, sends a
self-identifying User-Agent, applies bounded retries to reads, and never retries
a write whose outcome may be unknown.

`request_handler.py` exposes `website.get_page` and `website.update_page` to
#register through #hub. The client allowlist maps logical page keys to the
configured home page and test/late-registration page; callers cannot choose a
post ID, post type, credential, or WordPress field outside the bounded set.
Updates require an explicit `commit` boolean and return a preview when false.
ONHB's stage selection, HTML generation, and dry-run/`--commit` workflow remain
in #register. That workflow also continues to own Gravity Forms changes through
#forms and band/table changes through their existing owners.
