# Local Markdown publication provider

This directory contains ONHB's Markdown-to-Word converter and its bundled
parser assets. It is the initial implementation of the website-side
`local_markdown` provider requested for publishing the registration How To
document to SharePoint.

The source document now lives at
`C:\jems\register\docs\How To.md`. The converter remains deliberately
filesystem/template driven and still requires the existing Word document
template and SharePoint-synced output path.

`Ensure-HowToPage.ps1` and `Publish-HowTo.ps1` are retained here as the
remaining SharePoint publication wrappers. They still contain ONHB-specific
site/page assumptions and are source material until website client
configuration replaces those literals.
