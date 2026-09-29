# jems-website

This is the initial website destination surface for ONHB widgets and local Markdown publication. It is not yet a standalone initialized Git repository; the files here are the first parity port requested from the ONHB repository.

`widgets\` contains the existing ONHB browser widgets. The `providers\local_markdown\` files form the Markdown-to-Word publication pipeline used by `register\docs\How To.md`; they remain source-compatible until the website tool has its own configuration and deployment boundary.

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
