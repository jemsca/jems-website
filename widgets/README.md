# ONHB browser widgets

Each `.js` here is one widget's rendering/data logic, hosted in a site's Site
Assets library and loaded by the generalized `jems HTML Widget` SPFx web part
(`../widgets/spfx/`). A widget never pastes markup into the web part anymore -
the web part creates a host `<div>` and loads the script into it; the widget
finds that `<div>` as its own `<script>` tag's `parentElement`.

## Per-instance configuration (`config.json`)

Each widget's list/field/view names come from a sibling `config.json`,
fetched from the SAME Site Assets folder the widget's own `.js` is published
in (`<widget>.js`'s own URL, directory only, + `config.json`). This is what
lets one copy of each widget's code work for any `#register` instance's own
SharePoint list naming - only the config differs per deployment.

`onhb-bands-config.json`, `onhb-notes-config.json`, and
`onhb-treasurer-config.json` are ONHB's own real values - rename to
`config.json` when publishing to Site Assets (or publish it under that exact
name via `website.publish_site_asset` through `#hub` - see
`jems-website/providers/sharepoint/sharepoint_assets.py`). A different
`#register` instance publishes its OWN `config.json` with its own list/field
names next to the same widget `.js` - no code change needed.

## Capabilities

Each widget declares its supported view actions in
`window.jemsWebsiteCapabilities` when loaded: `bandsSummary`,
`notes`, `treasurerSummary` (generalized off the `onhb*` prefix 2026-10-01,
jems-tasks board item #69, once config stopped being ONHB-only). All three
are read-only - they list/view SharePoint data through the signed-in
browser session and never create or update list items.

## `HowTo.html`

Not part of the generalization above - a separate, unused/reference
rendering pipeline (see `jems-website/docs/ARCHITECTURE.md`'s "Local Markdown
actions" section for why it's kept but not live).
