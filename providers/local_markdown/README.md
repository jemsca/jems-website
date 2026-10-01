# Local Markdown publication provider

This directory contains ONHB's SharePoint publication wrappers for a
live-markdown-rendering widget page. **Not the live mechanism** - see
`jems-website/docs/ARCHITECTURE.md`'s "Local Markdown actions" section.
Kept as unused/reference code, in case it informs future SPFx widget work
(jems-tasks board item #69) - not relied on, not deleted.

`ensure_howto_page` (`Ensure-HowToPage.ps1`) creates/updates a SharePoint
page hosting a widget that fetches and renders Markdown live.
`publish_howto_markdown` (`Publish-HowTo.ps1`) uploads Markdown source to a
Site Assets folder for that widget to fetch. Both write to SharePoint and
use ONHB-specific site/page defaults.

## The real How To document pipeline

The actual, live How To document path is Markdown -> Word document ->
SharePoint Documents/Tech - a plain file conversion + upload, not a website
operation. It moved out of this repo entirely (2026-10-01, board item #69's
follow-up):

- The conversion engine (`parse.js`/`convert_howto.py`, formerly here) is
  now `jems-files/conversion/markdown_docx/` (`markdown_to_docx.py`,
  generalized - no document-specific business rule hardcoded), exposed as
  `files.convert_markdown_to_docx` through `#hub`.
- The source document (`How To.md`) is client content, not jems-website or
  jems-register code - it now lives at `C:\clients\onhb\docs\How To.md`.
- `jems-register`'s `flows/publish_how_to.py` owns the workflow: which doc,
  which template, where it's published, and ONHB's own "Prepare T4A forms"
  numbered-section rule (passed as a parameter to the generic conversion
  capability, not hardcoded in it).

See `jems-files/docs/HISTORY.md` and `jems-register/docs/HISTORY.md` for the
full migration.
