# jems-website

This repository owns website operations for configured clients. ONHB's current implementation includes its browser widgets, a local Markdown publication pipeline, and guarded WordPress page access used by #register's registration-stage workflow.

`widgets\` contains the existing ONHB browser widgets. The `providers\local_markdown\` files form the Markdown-to-Word publication pipeline used by `register\docs\How To.md`. `providers\wordpress\` owns bounded WordPress page reads and writes; it is reached through `request_handler.py` and the #hub capability broker.

## Actions (jems-tasks, onhb/jems, task #31)

The widgets publish their supported read/view actions in
`window.jemsWebsiteCapabilities` when loaded:

- `onhbHowTo`: load and render published Markdown, filter the table of contents, and reload the document.
- `onhbBands`: list sessions, show a session's band summary, and refresh that summary.
- `onhbNotes`: list sessions, show member and band notes for a session, and refresh the notes.
- `onhbTreasurer`: show outstanding payments and refunds.

These widgets read ONHB SharePoint data using the signed-in browser session; they
do not create or update list items. The local Markdown provider also implements
`convert_howto_docx`, `ensure_howto_page`, and `publish_howto_markdown`; the page
and publish actions write to SharePoint and currently use ONHB-specific defaults.
