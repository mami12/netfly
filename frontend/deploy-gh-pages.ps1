# Deploy i frontend-it ne GitHub Pages (dega gh-pages e netfly-frontend)
#
# Perdorimi:  powershell -ExecutionPolicy Bypass -File frontend\deploy-gh-pages.ps1
#             powershell -ExecutionPolicy Bypass -File frontend\deploy-gh-pages.ps1 -ApiUrl https://netfly-backend.onrender.com
#
# Cfare ben: (opsionale) shkruan frontend/.env me URL-ne e backend-it, pastaj build-on dist/
#            dhe e ngarkon ne degen gh-pages -> faqja perditesohet me URL-ne e re.
param(
  [string]$ApiUrl
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$src      = Join-Path $repoRoot 'frontend\dist'
$dst      = Join-Path $env:TEMP 'netfly-ghpages'
$remote   = 'https://github.com/mami12/netfly-frontend'
$envFile  = Join-Path $repoRoot 'frontend\.env'

Write-Host '=== 0) URL-ja e backend-it ===' -ForegroundColor Cyan
if ($ApiUrl) {
  $api = $ApiUrl.Trim().TrimEnd('/')
  if ($api -notmatch '^https?://') { $api = "https://$api" }
  $ws = $api -replace '^http', 'ws'
  @("VITE_API_URL=$api", "VITE_WS_URL=$ws") | Set-Content $envFile -Encoding UTF8
  Write-Host "U perditesua frontend\.env -> $api" -ForegroundColor Green
} elseif (Test-Path $envFile) {
  Write-Host 'Po perdoret frontend\.env ekzistues:'
  Get-Content $envFile | ForEach-Object { Write-Host "   $_" }
} else {
  throw 'frontend\.env mungon — kalo: -ApiUrl https://<backend>.onrender.com'
}

Write-Host '=== 1) Build ===' -ForegroundColor Cyan
Set-Location (Join-Path $repoRoot 'frontend')
npx vite build
if ($LASTEXITCODE -ne 0) { throw 'Build deshtoi' }

Write-Host '=== 2) Klono degen gh-pages ===' -ForegroundColor Cyan
if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
git clone --branch gh-pages --depth 1 $remote $dst

Write-Host '=== 3) Zevendeso permbajtjen ===' -ForegroundColor Cyan
Get-ChildItem $dst -Force | Where-Object { $_.Name -ne '.git' } | Remove-Item -Recurse -Force
Copy-Item "$src\*" $dst -Recurse -Force

# Skedare qe i duhen GitHub Pages
New-Item (Join-Path $dst '.nojekyll') -ItemType File -Force | Out-Null
@'
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Netfly Sport</title>
    <meta http-equiv="refresh" content="0;URL='/'">
  </head>
  <body>
  </body>
</html>
'@ | Set-Content (Join-Path $dst '404.html') -Encoding UTF8

Get-ChildItem $dst -Force | Where-Object { $_.Name -ne '.git' } | Select-Object Name, Length | Format-Table -AutoSize

Write-Host '=== 4) Ngarko ===' -ForegroundColor Cyan
Set-Location $dst
git add -A
git commit -m 'Deploy frontend: kuota live, pezullime, grupim sipas ligave, etiketa shqip'

# Push direkt me URL (disa here 'origin' nuk konfigurohet nga klonimi i shpejte)
git push $remote "HEAD:gh-pages" --force

Write-Host '=== KRYE ===' -ForegroundColor Green
git --no-pager log --oneline -1
