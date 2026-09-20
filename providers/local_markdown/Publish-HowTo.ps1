# ONHB - Publish the How To runbook to the SharePoint site.
#
# Uploads "How To.md" (the Markdown source in this repo) to the site's
# SiteAssets/Docs folder as "How-To.md". The "ONHB How To" page hosts the
# HowTo render widget (Widgets/HowTo.html), which fetches that file and renders
# it with a table of contents.
#
# Run whenever you've edited How To.md and want the site to reflect it:
#   pwsh -ExecutionPolicy Bypass -File ".\Publish-HowTo.ps1"
#
# Auth mirrors the rollover scripts: app-only certificate (ONHB-PnP.pfx),
# password from $env:PFX_PASSWORD (falls back to a prompt).

[CmdletBinding()]
param(
    # Local Markdown source (default: sibling How To.md in this repo).
    [string]$Source = (Join-Path $PSScriptRoot "How To.md"),
    # Server-relative folder under the site to publish into.
    [string]$TargetFolder = "SiteAssets/Docs",
    # Published file name (no spaces -> simpler widget URL).
    [string]$TargetName = "How-To.md"
)

$ErrorActionPreference = "Stop"

$siteUrl  = "https://ottawanewhorizons.sharepoint.com/sites/Registration"
$clientId = "f90014ad-b249-403c-b944-a06360bd25ce"
$tenantId = "f8679046-d797-4a41-a46a-499b45f968bf"
$certPath = "$env:USERPROFILE\ONHB-PnP.pfx"

if (-not (Test-Path $Source)) { throw "Source not found: $Source" }

$certPassword = $null
if ($env:PFX_PASSWORD) {
    $certPassword = ConvertTo-SecureString $env:PFX_PASSWORD -AsPlainText -Force
} else {
    $certPassword = Read-Host -Prompt "Enter the ONHB-PnP.pfx certificate password" -AsSecureString
}

Connect-PnPOnline -Url $siteUrl -ClientId $clientId -Tenant $tenantId `
    -CertificatePath $certPath -CertificatePassword $certPassword

# Ensure the target folder tree exists (SiteAssets always exists; Docs may not).
Resolve-PnPFolder -SiteRelativePath $TargetFolder | Out-Null

# Upload (overwrites), publishing under the space-free name.
$file = Add-PnPFile -Path $Source -Folder $TargetFolder -NewFileName $TargetName

$serverRel = "$($file.ServerRelativeUrl)"
Write-Host ""
Write-Host "Published: $serverRel" -ForegroundColor Green
Write-Host "Widget CONFIG.mdPath should be: $TargetFolder/$TargetName"
Write-Host "Page anchor deep-links work, e.g. <page>.aspx#credentials-bitwarden"

Disconnect-PnPOnline
