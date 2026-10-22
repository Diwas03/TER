$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (!(Test-Path '.venv\Scripts\python.exe')) {
    py -3 -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.12 or newer first.' }
}
$Python = '.venv\Scripts\python.exe'
& $Python -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
& $Python -m playwright install chromium
if ($LASTEXITCODE -ne 0) { throw 'Browser installation failed.' }
& $Python monitor.py --export-session
if ($LASTEXITCODE -ne 0) { throw 'Session export failed.' }
Write-Host 'Session saved privately to .runtime\cloud-session.json. Do not upload it to GitHub or send it in chat.'
