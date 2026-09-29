# jems-website architecture

`jems-website` currently contains ONHB browser widgets and a local Markdown
publication pipeline. It is not yet a configurable, standalone website client.

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
