param(
    [string]$BaseUrl = 'http://127.0.0.1:3100',
    [string]$TestDatabaseUrl = $env:TEST_DATABASE_URL
)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$runId = 'uat2-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,6)
$outputDir = Join-Path $repoRoot "output/playwright/uat2/$runId"
$python = Join-Path $repoRoot 'apps/api/.venv/Scripts/python.exe'
if (-not (Test-Path $python)) { $python = Join-Path $repoRoot 'apps/api/.venv/bin/python' }
$cli = if ($IsLinux -or $IsMacOS) { 'npx' } else { 'npx.cmd' }
$summary = [ordered]@{ run_id=$runId; status='RUNNING'; base_url=$BaseUrl; database_mode=$(if ($TestDatabaseUrl) {'PostgreSQL test database'} else {'temporary SQLite; concurrency tests skipped'}); api='NOT_RUN'; browser='NOT_RUN'; real_device_uat='NOT_PERFORMED' }
$oldTestUrl = $env:TEST_DATABASE_URL
$opened = $false
New-Item -ItemType Directory -Force $outputDir | Out-Null
Push-Location $repoRoot
try {
    if (-not (Test-Path $python)) { throw 'API virtualenv missing. Follow README backend setup before running UAT2.' }
    if ($TestDatabaseUrl -and $TestDatabaseUrl -notmatch '^postgresql(?:\+[^:]+)?://') { throw 'TestDatabaseUrl must be a dedicated PostgreSQL test database URL.' }
    Get-Command $cli -ErrorAction Stop | Out-Null
    $ready = Invoke-RestMethod ($BaseUrl.TrimEnd('/') + '/api/v1/ready')
    if (-not $ready.persistence_ready -or $ready.schema_version -notin @('0002_l2', '0003_l3', '0004_l4', '0005_scoring')) { throw 'L2 database migration is not ready.' }
    if ($TestDatabaseUrl) { $env:TEST_DATABASE_URL=$TestDatabaseUrl } else { Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue }
    Push-Location (Join-Path $repoRoot 'apps/api')
    try {
        $apiOutput = & $python -m pytest tests/test_l2_api.py -q "--junitxml=$outputDir/api-results.xml" 2>&1
        $apiExit = $LASTEXITCODE
        $apiOutput | Set-Content -Encoding utf8 (Join-Path $outputDir 'api.log')
        $apiOutput | ForEach-Object { Write-Host $_ }
        if ($apiExit -ne 0) { throw 'L2 API checks failed. See api.log.' }
        $summary.api='PASS'
    } finally { Pop-Location }
    & $cli --yes --package @playwright/cli playwright-cli "-s=$runId" open ($BaseUrl.TrimEnd('/')+'/l2')
    if ($LASTEXITCODE -ne 0) { throw 'Browser startup failed.' }
    $opened=$true
    & $cli --yes --package @playwright/cli playwright-cli "-s=$runId" snapshot | Out-Null
    $result = & $cli --yes --package @playwright/cli playwright-cli "-s=$runId" run-code --filename apps/api/tests/uat2/l2-acceptance.js 2>&1
    $browserExit = $LASTEXITCODE
    $result | Set-Content -Encoding utf8 (Join-Path $outputDir 'browser.log')
    $text = $result -join "`n"
    if ($browserExit -ne 0 -or $text -match '### Error') { throw 'L2 browser checks failed. See browser.log.' }
    $match = [regex]::Match($text,'(?s)### Result\s*\r?\n(.*?)(?=\r?\n### |\z)')
    if (-not $match.Success) { throw 'Browser did not return structured results.' }
    $cases = $match.Groups[1].Value.Trim() | ConvertFrom-Json
    if (@($cases).Count -ne 2 -or @($cases | Where-Object { $_.status -ne 'PASS' }).Count) { throw 'Desktop and touch results must both pass.' }
    $summary.browser='PASS'
    $summary.cases=@($cases | ForEach-Object { [ordered]@{mobile=$_.mobile;status=$_.status;session_id=$_.session_id;l1_version=$_.l1_version;l2_version=$_.l2_version;cases=@($_.cases | ForEach-Object { [string]$_ })} })
    $summary.status='PASS'
    Write-Host "PASS UAT2. Logs and report: $outputDir"
    Write-Host "Database mode: $($summary.database_mode). Browser tests use real local API; no real-device sign-off."
} catch {
    $summary.status='FAIL';$summary.error=$_.Exception.Message
    Write-Host "FAIL UAT2: $($_.Exception.Message) Logs: $outputDir"
} finally {
    $summary | ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 (Join-Path $outputDir 'report.json')
    if ($opened) { & $cli --yes --package @playwright/cli playwright-cli "-s=$runId" close | Out-Null }
    if ($null -eq $oldTestUrl) { Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue } else { $env:TEST_DATABASE_URL=$oldTestUrl }
    Pop-Location
}
if ($summary.status -ne 'PASS') { exit 1 }
