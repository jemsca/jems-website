# Local Markdown publication provider

This directory contains ONHB's Markdown-to-Word converter and its bundled parser assets. It is the initial implementation of the website-side `local_markdown` provider requested for publishing the registration How To document to SharePoint.

The source document now lives at `C:\jems\register\docs\How To.md`. The converter remains deliberately filesystem/template driven and still requires the existing Word document template and SharePoint-synced output path.

`Ensure-HowToPage.ps1` and `Publish-HowTo.ps1` are retained here as the remaining SharePoint publication wrappers. They still contain ONHB-specific site/page assumptions and are source material until website client configuration replaces those literals.

## Actions

- `convert_howto_docx` — parse Markdown and create a Word document using an existing `.docx` template.
- `ensure_howto_page` — create or update the ONHB SharePoint How To page and its widget.
- `publish_howto_markdown` — upload the Markdown source to the configured Site Assets folder (the current script defaults to ONHB's Registration site).

The latter two actions write to SharePoint. They are implemented by the
PowerShell scripts in this directory and require the existing PnP certificate
authentication setup. Their current ONHB site IDs and page defaults are not
general client configuration yet.
