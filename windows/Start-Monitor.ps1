$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Read-PrivateValue([string] $Prompt) {
    $Secret = Read-Host $Prompt -AsSecureString
    $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer) }
}
if (!(Test-Path '.venv\Scripts\python.exe')) {
    py -3 -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.12 or newer first.' }
}
$Python = '.venv\Scripts\python.exe'
& $Python -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
& $Python -m playwright install chromium
if ($LASTEXITCODE -ne 0) { throw 'Browser installation failed.' }
$env:TER_THRESHOLD = '126'
$env:TER_INTERVAL_SECONDS = '15'
$env:TWILIO_ACCOUNT_SID = Read-Host 'Twilio Account SID'
$env:TWILIO_AUTH_TOKEN = Read-PrivateValue 'Twilio Auth Token (hidden)'
$env:TWILIO_WHATSAPP_FROM = Read-Host 'Twilio sender (whatsapp:+internationalnumber)'
$env:TWILIO_WHATSAPP_TO = Read-Host 'Your recipient (whatsapp:+internationalnumber)'
$env:TWILIO_CONTENT_SID = Read-Host 'Approved Content SID (blank only for allowed sandbox/service-window testing)'
$env:DASHBOARD_URL = Read-Host 'Vercel URL, e.g. https://your-project.vercel.app (blank to skip)'
if ($env:DASHBOARD_URL) { $env:MONITOR_API_TOKEN = Read-PrivateValue 'Dashboard MONITOR_API_TOKEN (hidden)' }
Write-Host 'TER credentials are entered only in the TER browser, never in this script.'
if ((Read-Host 'Open the browser to log in or renew the session? [Y/n]') -ne 'n') {
    & $Python monitor.py --login
    if ($LASTEXITCODE -ne 0) { throw 'Login browser failed.' }
}
$env:TER_PRICE_SELECTOR = Read-Host 'Unique CSS selector for the TER/BTN BUY price (see DEPLOY.md)'
& $Python monitor.py --once --dry-run --visible
if ($LASTEXITCODE -ne 0) { throw 'Live price validation failed. Check the selector and login session.' }
if ((Read-Host 'Does that amount match the live BTN BUY price? [y/N]') -ne 'y') {
    throw 'Price selection must be verified before sending alerts.'
}
Write-Host 'Starting. Keep this window open and your computer awake. Press Ctrl+C to stop.'
try { & $Python monitor.py --visible }
finally { Remove-Item Env:TWILIO_AUTH_TOKEN -ErrorAction SilentlyContinue; Remove-Item Env:MONITOR_API_TOKEN -ErrorAction SilentlyContinue }
