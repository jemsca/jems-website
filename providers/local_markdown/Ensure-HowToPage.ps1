# ONHB - Create (or cleanly recreate) the "How To" SharePoint page with the
# How To render widget, entirely via PnP - no browser editing, so it can't hit
# the "Can't edit this page / other people are working on this page" co-authoring
# lock. A server-side delete also clears a wedged page.
#
# Run when you first set the page up, or after editing Widgets/HowTo.html (the
# widget code). Everyday CONTENT edits don't need this - the widget fetches the
# Markdown live, so for those just run Publish-HowTo.ps1.
#
#   pwsh -ExecutionPolicy Bypass -File ".\Ensure-HowToPage.ps1"
#
# Auth: app-only certificate (ONHB-PnP.pfx), password from $env:PFX_PASSWORD.

[CmdletBinding()]
param(
    [string]$PageName   = "HowTo",                 # -> HowTo.aspx
    [string]$Title      = "How To",
    [string]$WidgetPath = (Join-Path $PSScriptRoot "..\Widgets\HowTo.html"),
    [string]$ComponentId = "e7f3a2b1-5c9d-4e8a-b6f2-1a2b3c4d5e6f",  # ONHB HTML Widget
    [switch]$KeepExisting                          # update in place instead of recreate
)

$ErrorActionPreference = "Stop"

$siteUrl  = "https://ottawanewhorizons.sharepoint.com/sites/Registration"
$clientId = "f90014ad-b249-403c-b944-a06360bd25ce"
$tenantId = "f8679046-d797-4a41-a46a-499b45f968bf"
$certPath = "$env:USERPROFILE\ONHB-PnP.pfx"

if (-not (Test-Path $WidgetPath)) { throw "Widget not found: $WidgetPath" }

$certPassword = $null
if ($env:PFX_PASSWORD) {
    $certPassword = ConvertTo-SecureString $env:PFX_PASSWORD -AsPlainText -Force
} else {
    $certPassword = Read-Host -Prompt "Enter the ONHB-PnP.pfx certificate password" -AsSecureString
}

Connect-PnPOnline -Url $siteUrl -ClientId $clientId -Tenant $tenantId `
    -CertificatePath $certPath -CertificatePassword $certPassword

# --- widget markup -> web part 'html' property (ConvertTo-Json handles escaping) ---
$html  = Get-Content -Raw -Path $WidgetPath
$props = @{ html = $html } | ConvertTo-Json -Depth 5

# --- clean slate: remove the page if it exists (server-side; bypasses the lock) ---
$existing = Get-PnPPage -Identity $PageName -ErrorAction SilentlyContinue
if ($existing -and -not $KeepExisting) {
    Write-Host "Removing existing $PageName.aspx (server-side, clears any lock)..."
    try { Remove-PnPPage -Identity $PageName -Force }
    catch { throw "Couldn't remove the existing page (it may be checked out to a user): $($_.Exception.Message)" }
    $existing = $null
}

if (-not $existing) {
    Write-Host "Creating $PageName.aspx..."
    Add-PnPPage -Name $PageName -LayoutType Article | Out-Null
} else {
    Write-Host "Updating existing $PageName.aspx (-KeepExisting): removing old widget instances..."
    foreach ($c in (Get-PnPPageComponent -Page $PageName | Where-Object {
                "$($_.WebPartId)" -match [regex]::Escape($ComponentId) })) {
        Remove-PnPPageComponent -Page $PageName -InstanceId $c.InstanceId -Force
    }
}

# --- confirm the web part is deployed to this site ---
$comp = Get-PnPAvailableClientSideComponents -Page $PageName | Where-Object {
    "$($_.Id)" -match [regex]::Escape($ComponentId) -or $_.Name -eq "ONHB HTML Widget"
} | Select-Object -First 1
if (-not $comp) {
    throw "The 'ONHB HTML Widget' web part ($ComponentId) isn't available on this site. " +
          "Deploy the SPFx solution (Widgets/spfx) first."
}

Write-Host "Adding the How To widget..."
Add-PnPPageWebPart -Page $PageName -Component "$($comp.Id)" -PropertiesJson $props | Out-Null

Set-PnPPage -Identity $PageName -Title $Title -CommentsEnabled:$false -Publish | Out-Null

$pageUrl = "$siteUrl/SitePages/$PageName.aspx"
Write-Host ""
Write-Host "Done. Page published: $pageUrl" -ForegroundColor Green
Write-Host "The widget reads /SiteAssets/Docs/How-To.md - run Docs\Publish-HowTo.ps1 if you haven't."
Write-Host "Deep-links work, e.g. $pageUrl#credentials-bitwarden"

Disconnect-PnPOnline
