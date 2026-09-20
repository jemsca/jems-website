# ONHB - Regenerate How To.docx from How To.md.
#
# Two-step pipeline (no pandoc / no internet needed):
#   1) node parse.js       - marked lexes the Markdown into a JSON token tree
#   2) python convert_howto.py - builds Word XML from the tokens, reusing an
#      existing .docx as the style/numbering template, and repackages
#
# Requires: Node.js and Python 3 on PATH. marked is bundled (marked.min.js);
# nothing is installed from npm/pip.
#
#   pwsh -File .\Convert-HowTo.ps1
#
# By default it reads the repo's How To.md and writes the Tech folder's
# How To.docx, using that same docx as the style template.

[CmdletBinding()]
param(
    [string]$Source   = (Resolve-Path (Join-Path $PSScriptRoot "How To.md")).Path,
    [string]$Output   = "C:\Users\janet\Ottawa New Horizons Band\Registration - Documents\Tech\How To.docx",
    [string]$Template          # existing .docx for styles/numbering; default = $Output
)

$ErrorActionPreference = "Stop"
if (-not $Template) { $Template = $Output }

foreach ($exe in "node", "python") {
    if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) { throw "$exe not found on PATH." }
}
if (-not (Test-Path $Source))   { throw "Source not found: $Source" }
if (-not (Test-Path $Template)) { throw "Template .docx not found: $Template (needed for styles/numbering)." }

function Test-FileLocked {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $false }
    try {
        $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        $stream.Close()
        return $false
    } catch {
        return $true
    }
}

function Wait-ForUnlocked {
    param([string[]]$Paths)
    $locked = $Paths | Select-Object -Unique | Where-Object { Test-FileLocked $_ }
    while ($locked) {
        Write-Host "File(s) in use, probably open in Word:" -ForegroundColor Yellow
        $locked | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
        Read-Host "Close it, then press Enter to retry (Ctrl+C to cancel)" | Out-Null
        $locked = $Paths | Select-Object -Unique | Where-Object { Test-FileLocked $_ }
    }
}

$tokens = Join-Path ([System.IO.Path]::GetTempPath()) "howto-tokens.json"

Write-Host "Parsing $Source ..." -ForegroundColor Cyan
& node (Join-Path $PSScriptRoot "parse.js") $Source $tokens
if ($LASTEXITCODE -ne 0) { throw "parse.js failed." }

Wait-ForUnlocked -Paths @($Template, $Output)

Write-Host "Building $Output ..." -ForegroundColor Cyan
& python (Join-Path $PSScriptRoot "convert_howto.py") $tokens $Template $Output
if ($LASTEXITCODE -ne 0) { throw "convert_howto.py failed." }

Remove-Item $tokens -ErrorAction SilentlyContinue
Write-Host "Done: $Output" -ForegroundColor Green
