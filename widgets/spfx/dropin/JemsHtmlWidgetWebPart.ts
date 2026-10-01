// jems - generic Site Assets script-loading web part.
// ---------------------------------------------------------------------------
// Generalized from ONHB's own BandsSummaryWebPart.ts (the "paste your HTML/JS
// here" web part) - jems-tasks board item #69. That version stored each
// widget's entire markup/JS inline in the web part's own property (pasted by
// hand), and a widget CHANGE meant: edit the .js, re-upload it to Site
// Assets, then hand-edit the pasted snippet's `?v=` query string to bust the
// browser cache - a human step that was easy to forget (confirmed real
// pattern across onhb-bands-widget.js/onhb-notes-widget.js/onhb-treasurer-
// widget.js's own header comments).
//
// This version takes a Site-Assets-relative SCRIPT PATH as a property
// instead of pasted markup. On render, it asks SharePoint's own REST API for
// that file's current TimeLastModified and uses it as the cache-busting
// query string automatically - publishing a new widget .js (overwriting the
// Site Assets file) is enough on its own; nothing on any page needs manual
// editing afterward. Build and deploy this web part ONCE (see widgets/spfx/
// README.md); every widget instance after that is just two property-pane
// fields (Script path, Container id), no pasted HTML, no version number.

import { Version, DisplayMode } from '@microsoft/sp-core-library';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { IPropertyPaneConfiguration, PropertyPaneTextField } from '@microsoft/sp-property-pane';
import { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';

export interface IJemsHtmlWidgetProps {
  scriptPath: string;   // site-relative, e.g. "SiteAssets/Scripts/onhb-bands-widget.js"
  containerId: string;  // the host <div> id the configured script expects, e.g. "onhb-bands-host"
}

const PLACEHOLDER: string =
  '<div style="padding:12px;border:1px dashed #bbb;border-radius:6px;color:#666;' +
  'font:13px \'Segoe UI\',Arial,sans-serif">jems HTML Widget - open the property pane ' +
  '(pencil) and set <b>Script path</b> and <b>Container id</b>.</div>';

export default class JemsHtmlWidgetWebPart extends BaseClientSideWebPart<IJemsHtmlWidgetProps> {

  public render(): void {
    const scriptPath: string = (this.properties.scriptPath || '').trim();
    const containerId: string = (this.properties.containerId || '').trim();
    if (!scriptPath || !containerId) {
      this.domElement.innerHTML = (this.displayMode === DisplayMode.Edit) ? PLACEHOLDER : '';
      return;
    }

    this.domElement.innerHTML = `<div id="${this.escapeAttr(containerId)}"></div>`;

    this.resolveCacheBustedUrl(scriptPath)
      .then((url: string) => this.loadScript(url))
      .catch((error: unknown) => {
        // Falls back to loading the script WITHOUT a cache-busting query string
        // rather than failing to load it at all - a stale cached copy still
        // renders something; no copy renders nothing.
        console.error('jems HTML Widget: could not read script metadata, loading without cache-busting.', error);
        this.loadScript(this.absoluteUrl(scriptPath));
      });
  }

  // SharePoint's own REST API already knows this file's last-modified time -
  // no version number for a human to track anywhere. GetFileByServerRelativeUrl
  // needs a path from the SITE COLLECTION root, not the web's own relative URL,
  // when the two differ (sub-site) - serverRelativeUrl covers both cases.
  private resolveCacheBustedUrl(scriptPath: string): Promise<string> {
    const serverRelativePath: string = this.toServerRelativeUrl(scriptPath);
    const restUrl: string =
      `${this.context.pageContext.web.absoluteUrl}/_api/web/GetFileByServerRelativeUrl('` +
      `${encodeURIComponent(serverRelativePath)}')?$select=TimeLastModified`;

    return this.context.spHttpClient
      .get(restUrl, SPHttpClient.configurations.v1, {
        headers: { Accept: 'application/json;odata=nometadata' },
      })
      .then((response: SPHttpClientResponse) => {
        if (!response.ok) {
          throw new Error(`GetFileByServerRelativeUrl returned ${response.status}`);
        }
        return response.json();
      })
      .then((body: { TimeLastModified?: string }) => {
        const version: string = body.TimeLastModified || String(Date.now());
        return `${this.absoluteUrl(scriptPath)}?v=${encodeURIComponent(version)}`;
      });
  }

  private loadScript(url: string): void {
    const container: HTMLElement | null = this.domElement.querySelector('div');
    const script: HTMLScriptElement = document.createElement('script');
    script.src = url;
    (container || this.domElement).appendChild(script);
  }

  private toServerRelativeUrl(scriptPath: string): string {
    const trimmed: string = scriptPath.replace(/^\/+/, '');
    const webServerRelative: string = this.context.pageContext.web.serverRelativeUrl.replace(/\/+$/, '');
    return `${webServerRelative}/${trimmed}`;
  }

  private absoluteUrl(scriptPath: string): string {
    const trimmed: string = scriptPath.replace(/^\/+/, '');
    const webAbsolute: string = this.context.pageContext.web.absoluteUrl.replace(/\/+$/, '');
    return `${webAbsolute}/${trimmed}`;
  }

  private escapeAttr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [{
        header: { description: 'Load a Site Assets .js file into this page, auto-refreshed on every publish - no version number to track.' },
        groups: [{
          groupName: 'Widget',
          groupFields: [
            PropertyPaneTextField('scriptPath', {
              label: 'Script path (site-relative)',
              description: 'e.g. SiteAssets/Scripts/onhb-bands-widget.js',
            }),
            PropertyPaneTextField('containerId', {
              label: 'Container id',
              description: 'The host element id this script expects, e.g. onhb-bands-host',
            }),
          ],
        }],
      }],
    };
  }
}
