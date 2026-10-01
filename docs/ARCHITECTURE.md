# jems-website architecture

`jems-website` owns configured website operations. ONHB's implementation
contains browser widgets, a local Markdown publication pipeline, and a
WordPress page provider used by #register's registration-stage workflow.
The How To document itself (Markdown -> Word -> SharePoint Documents/Tech)
is NOT a website-domain operation - it's a plain file conversion + upload,
owned by #register (`flows/publish_how_to.py`) and #files (see those repos'
own docs), not this repo.

## Browser widget actions

Each loaded widget registers its supported view actions in
`window.jemsWebsiteCapabilities` (generalized off the `onhb*` prefix
2026-10-01 - see "Per-instance widget configuration" below for why):

- `onhbHowTo` loads and renders published Markdown, filters the table of
  contents, and reloads the document. **Not the live mechanism** - see "Local
  Markdown actions" below. Still ONHB-named/not generalized, since it's
  unused/reference code, not the live path.
- `bandsSummary` lists sessions, shows a selected session's band summary, and
  refreshes that summary.
- `notes` lists sessions, shows member and band notes for a session, and
  refreshes those notes.
- `treasurerSummary` shows outstanding payments and refunds.

The widgets read SharePoint data through the signed-in browser session. They do
not create or update list items. `bandsSummary`/`notes`/`treasurerSummary` are
real, live web parts on the Registration site's actual HOME page (confirmed
2026-10-01) - not a separate page each.

## Per-instance widget configuration

Board item #69's last subtask (2026-10-01): `onhb-bands-widget.js`,
`onhb-notes-widget.js`, and `onhb-treasurer-widget.js` each had their
SharePoint list/field/view names hardcoded in a `CONFIG` object - real
ONHB-specific names (`"Sessions"`, `"BandLookup"`, lookup-field display-name
variants), not something any other `#register` instance's own list naming
would share. Each widget now fetches `config.json` from its OWN Site Assets
folder (same directory as the widget's own `.js` - derived from
`document.currentScript.src`, not a hardcoded path) instead of hardcoding
`CONFIG`; `onhb-bands-config.json`/`onhb-notes-config.json`/
`onhb-treasurer-config.json` (`widgets/`) carry ONHB's own real values to be
published as `config.json` alongside each widget's own `.js`. A different
`#register` instance publishes its own `config.json` with its own list/field
names - no code change to the widget itself. Also replaced each widget's
`getElementById("onhb-<x>-host")` with `document.currentScript.parentElement`
- the SPFx web part (below) creates and owns that container now, so no widget
needs to agree on a specific element id with its own page's web part
configuration at all. See `widgets/README.md` for the full convention.

## SPFx web part

`widgets/spfx/` (2026-10-01, board item #69) generalizes ONHB's own "paste
your HTML/JS here" SPFx web part (`/dev/onhb/widgets/spfx/`, reference-only -
AI.md's "never run" rule). `dropin/JemsHtmlWidgetWebPart.ts` replaces the
pasted-markup property with two plain fields - **Script path** (Site-Assets-
relative) and **Container id** (the host `<div>` id a configured widget's
`.js` expects, for one that still looks itself up by a fixed id - the three
generalized widgets above no longer need this, since they use their own
`<script>` tag's `parentElement` instead) - and reads the script file's own
`TimeLastModified` via
SharePoint's REST API (`GetFileByServerRelativeUrl(...)?$select=
TimeLastModified`) to build the cache-busting query string automatically. The
manual "re-upload the .js, then hand-edit `?v=` in the pasted snippet" step
(onhb-bands-widget.js/onhb-notes-widget.js/onhb-treasurer-widget.js's own
header comments) no longer exists - publishing a new widget `.js` (e.g.
through `website.publish_site_asset`, above) is the only step needed.

This folder is source only, not a buildable npm project in this repo - see
`widgets/spfx/README.md` for the one-time devcontainer build/deploy process,
same "build once, no Codespace, no rebuild, ever" shape ONHB's own version
used. No SPFx toolchain exists in this environment to compile/lint the
TypeScript against real `@microsoft/sp-*` type declarations; it was
hand-reviewed against the existing, previously-working `BandsSummaryWebPart.ts`
as a known-good reference, not test-run.

## Local Markdown actions - two separate pipelines, only one is live

`providers/local_markdown/` carries code for TWO different designs built at
different times - confirmed 2026-10-01 (Janet) that only the second is the
real, live mechanism:

1. **Unused/reference**: `ensure_howto_page`/`publish_howto_markdown`
   (`Ensure-HowToPage.ps1`/`Publish-HowTo.ps1`/`widgets/HowTo.html`) - a
   live-markdown-rendering SharePoint page + widget, publishing raw Markdown
   to Site Assets. Never the production path; kept as-is, unrouted, in case
   it informs the generalized SPFx widget work (board item #69's other
   subtasks) - not deleted, not relied on.
2. **The real path**: `convert_howto_docx` (`parse.js` + `convert_howto.py`)
   converts `docs/How To.md` to a `.docx`, reusing the CURRENT live
   `How To.docx` as its style/numbering template. `#register`'s
   `flows/publish_how_to.py` downloads that template and uploads the
   regenerated document through `#files`' existing `registration` onedrive
   instance (Documents/Tech) - see that repo's own docs. This repo's role is
   only the conversion scripts themselves; no SharePoint-specific code here
   at all for this path.

## SharePoint Site Assets (general infrastructure, not yet client-wired)

`providers/sharepoint/sharepoint_assets.py` (`SharePointAssets`, 2026-10-01)
publishes one configured named asset's bytes into a SharePoint site's Site
Assets library, via `Publish-SiteAsset.ps1` - PnP certificate auth,
generalized from ONHB's own `Publish-HowTo.ps1`. `request_handler.py`
exposes `website.publish_site_asset`, dispatching `_build_provider` on the
configured `provider` type (`wordpress` or `sharepoint`). Built for the How
To publish step, but that turned out to be the wrong target (see above) - no
client currently configures a `sharepoint` website instance. Kept as tested,
reusable infrastructure for publishing a widget's `.js`/`config.json` to Site
Assets (see "SPFx web part" below), once a client instance actually needs it.

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
