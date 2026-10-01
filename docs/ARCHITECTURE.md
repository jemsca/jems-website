# jems-website architecture

`jems-website` owns configured website operations. ONHB's implementation
contains browser widgets, a local Markdown publication pipeline, and a
WordPress page provider used by #register's registration-stage workflow.

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
scripts. The page and publish actions write to SharePoint. Their current site,
authentication, and page defaults are ONHB-specific; client configuration has
not replaced those assumptions yet.

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
