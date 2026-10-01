# jems-website

This repository owns website operations for configured clients. ONHB's current implementation includes its browser widgets (generalized per `#register` instance via a sibling `config.json` - see `widgets/README.md`), a generalized SPFx web part to host them (`widgets/spfx/`), a local Markdown publication pipeline (mostly unused/reference - see `docs/ARCHITECTURE.md`), guarded WordPress page access used by #register's registration-stage workflow, and a SharePoint Site Assets publisher (general infrastructure, not currently wired to any client - see `docs/ARCHITECTURE.md`).

`widgets\` contains the browser widgets and the generalized SPFx web part that hosts them. The `providers\local_markdown\` files now hold only the unused/reference live-markdown-widget pipeline (`ensure_howto_page`/`publish_howto_markdown`) - the real Markdown-to-Word conversion engine moved to `jems-files` entirely (see `docs/ARCHITECTURE.md`). `providers\wordpress\` owns bounded WordPress page reads and writes, and `providers\sharepoint\` owns bounded SharePoint Site Assets publishing; both are reached through `request_handler.py` and the #hub capability broker.

## Actions (jems-tasks, onhb/jems, task #31, generalized under #69)

The widgets publish their supported read/view actions in
`window.jemsWebsiteCapabilities` when loaded:

- `onhbHowTo`: load and render published Markdown, filter the table of contents, and reload the document. Unused/reference - see `docs/ARCHITECTURE.md`.
- `bandsSummary`: list sessions, show a session's band summary, and refresh that summary.
- `notes`: list sessions, show member and band notes for a session, and refresh the notes.
- `treasurerSummary`: show outstanding payments and refunds.

These widgets read SharePoint data (per their own configured instance's
`config.json`) using the signed-in browser session; they do not create or
update list items. The local Markdown provider's remaining actions
(`ensure_howto_page`/`publish_howto_markdown`) are unused/reference, not the
live How To path - that now runs through `#files`/`#register` entirely (see
`docs/ARCHITECTURE.md`).
