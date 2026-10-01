# jems HTML Widget (SPFx)

A generic SharePoint web part that loads one Site Assets `.js` file into the
page and hosts it in a configurable container `<div>`. Generalized from
ONHB's own "paste your HTML/JS here" web part (`/dev/onhb/widgets/spfx/`,
reference-only) - see `dropin/JemsHtmlWidgetWebPart.ts`'s own header comment
for what changed and why (jems-tasks board item #69).

Build and deploy this **once per tenant**. After that, adding a widget to a
page is two property-pane fields - no pasted markup, no version number to
hand-edit when the widget's `.js` changes.

## This folder is source only, not a buildable project

`dropin/` holds the two files that actually matter - the web part's
TypeScript and its manifest - not a full SPFx project (`package.json`,
`gulpfile.js`, `tsconfig.json`, `config/`, etc.). That scaffold is
regenerated fresh each time inside the devcontainer below and thrown away
after building; only the real source lives in git. This mirrors ONHB's own
original approach (same "build once, no Codespace, no rebuild, ever" shape).

## One-time build and deploy

1. Open this folder (`widgets/spfx/`) in a dev container (VS Code: "Reopen in
   Container", or GitHub Codespaces) - `.devcontainer/devcontainer.json`
   installs Node 22, `gulp-cli`, and `yo @microsoft/generator-sharepoint`.
2. Scaffold a new SPFx web part project in a scratch folder (NOT this one):
   ```
   yo @microsoft/sharepoint
   ```
   Answer: solution name `jems-html-widget`; "SharePoint Online only";
   place files in the current folder; **N** to "allow tenant admin the choice
   of extending": no; component type **WebPart**; web part name
   `JemsHtmlWidget`; framework **No JavaScript framework**.
3. Copy `dropin/JemsHtmlWidgetWebPart.ts` and
   `dropin/JemsHtmlWidgetWebPart.manifest.json` over the generated
   `src/webparts/jemsHtmlWidget/JemsHtmlWidgetWebPart.ts` and its own
   `.manifest.json`, replacing the generated placeholders.
4. Build and package:
   ```
   gulp bundle --ship
   gulp package-solution --ship
   ```
   This produces `sharepoint/solution/jems-html-widget.sppkg`.
5. Upload that `.sppkg` to the tenant's App Catalog and deploy it (checking
   "Make this solution available to all sites in the organization" if that
   matches how the tenant's other SPFx solutions are deployed).

## Using it on a page

Add a "jems HTML Widget" web part, open its property pane, and set:

- **Script path** - site-relative, e.g. `SiteAssets/Scripts/onhb-bands-widget.js`
- **Container id** - the host element id the configured script expects
  (each widget's own file names its own id in its header comment, e.g.
  `onhb-bands-host` for `onhb-bands-widget.js`)

Publishing a new version of the widget's `.js` (overwrite the Site Assets
file - `jems-website`'s `providers/sharepoint/sharepoint_assets.py` can do
this through `#hub`'s `website.publish_site_asset`) is the only step needed
afterward; the web part reads the file's own `TimeLastModified` from
SharePoint and busts the browser cache automatically.
