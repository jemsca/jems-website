# jems-website - publish one local file into a SharePoint site's Site Assets
# library, via PnP certificate auth.
#
# Generalized from ONHB's own Publish-HowTo.ps1 (2026-09-xx) - same mechanism,
# parametrized instead of hardcoded to one site/app/file, so any configured
# #website SharePoint instance can publish any named asset (How-To.md today;
# a widget's .js or a generated config.json once #69's other subtasks land),
# not just ONHB's How To document. Mirrors jems-hub/connectors/sharepoint-
# lists/Add-ListItemAttachment.ps1's own cert-auth shape (same
# Connect-PnPOnline call, same PFX_PASSWORD convention).
#
# Usage:
#   pwsh -NoProfile -File "Publish-SiteAsset.ps1" `
#     -SiteUrl "https://contoso.sharepoint.com/sites/X" -ClientId "<app-id>" `
#     -TenantId "<tenant-id>" -CertPath "C:\...\cert.pfx" `
#     -Source "C:\...\How To.md" -TargetFolder "SiteAssets/Docs" -TargetName "How-To.md"
#
# Needs PFX_PASSWORD set in the environment (non-interactive use - called as
# a subprocess with no console to prompt at); prompts if not set.

[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$SiteUrl,
    [Parameter(Mandatory)][string]$ClientId,
    [Parameter(Mandatory)][string]$TenantId,
    [Parameter(Mandatory)][string]$CertPath,
    [Parameter(Mandatory)][string]$Source,
    [Parameter(Mandatory)][string]$TargetFolder,
    [Parameter(Mandatory)][string]$TargetName
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Source)) { throw "Source not found: $Source" }
if (-not (Test-Path $CertPath)) { throw "Certificate not found: $CertPath" }

$certPassword = $null
if ($env:PFX_PASSWORD) {
    $certPassword = ConvertTo-SecureString $env:PFX_PASSWORD -AsPlainText -Force
} else {
    $certPassword = Read-Host -Prompt "Enter the $CertPath certificate password" -AsSecureString
}

Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Tenant $TenantId `
    -CertificatePath $CertPath -CertificatePassword $certPassword

# Ensure the target folder tree exists (SiteAssets always exists; a subfolder may not).
Resolve-PnPFolder -SiteRelativePath $TargetFolder | Out-Null

# Upload (overwrites), publishing under the given name.
$file = Add-PnPFile -Path $Source -Folder $TargetFolder -NewFileName $TargetName

Write-Host "Published: $($file.ServerRelativeUrl)"

Disconnect-PnPOnline
