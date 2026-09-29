param(
    [string]$BaseUrl = 'http://127.0.0.1:3100',
    [string]$TestDatabaseUrl = $env:TEST_DATABASE_URL
)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$runId = 'uat3-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,6)
$outputDir = Join-Path $repoRoot "output/playwright/uat3/$runId"
$python = Join-Path $repoRoot 'apps/api/.venv/Scripts/python.exe'
if (-not (Test-Path $python)) { $python = Join-Path $repoRoot 'apps/api/.venv/bin/python' }
$cli = if ($IsLinux -or $IsMacOS) { 'npx' } else { 'npx.cmd' }
$summary = [ordered]@{
    run_id=$runId; status='RUNNING'; base_url=$BaseUrl
    database_mode=$(if ($TestDatabaseUrl) {'isolated PostgreSQL'} else {'temporary SQLite'})
    concurrency=$(if ($TestDatabaseUrl) {'NOT_RUN'} else {'SKIPPED: requires PostgreSQL'})
    migration_test='temporary SQLite, original L1/L2 preservation'
    api='NOT_RUN'; browser='NOT_RUN'; real_device_uat='NOT_PERFORMED'; production_deployment='NOT_PERFORMED'
}
$oldTestUrl = $env:TEST_DATABASE_URL
$oldMigrationUrl = $env:L3_MIGRATION_TEST_DATABASE_URL
$opened = $false
New-Item -ItemType Directory -Force $outputDir | Out-Null

function Invoke-Logged([string]$Executable, [string[]]$Arguments, [string]$LogPath) {
    # Windows PowerShell 5.1 wraps native stderr as ErrorRecord; preserve exit-code handling.
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $lines = @(& $Executable @Arguments 2>&1 | ForEach-Object { "$_" })
        $exitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    $lines | Set-Content -Encoding utf8 $LogPath
    if ($exitCode -ne 0) { throw "Command failed (exit $exitCode). See $LogPath" }
    return ($lines -join "`n")
}

Push-Location $repoRoot
try {
    if (-not (Test-Path $python)) { throw 'API virtualenv missing. Follow README backend setup.' }
    if ($TestDatabaseUrl -and $TestDatabaseUrl -notmatch '^postgresql(?:\+[^:]+)?://') { throw 'TestDatabaseUrl must use PostgreSQL and a dedicated database ending in _test.' }
    Get-Command $cli -ErrorAction Stop | Out-Null
    $ready = Invoke-RestMethod ($BaseUrl.TrimEnd('/') + '/api/v1/ready')
    if (-not $ready.persistence_ready -or $ready.schema_version -ne '0003_l3') { throw 'L3 migration 0003_l3 is not ready. Update local services using README.' }
    if ($TestDatabaseUrl) { $env:TEST_DATABASE_URL=$TestDatabaseUrl } else { Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue }
    # Never reuse an inherited migration URL: the preservation check needs a fresh empty DB.
    Remove-Item Env:L3_MIGRATION_TEST_DATABASE_URL -ErrorAction SilentlyContinue
    Push-Location (Join-Path $repoRoot 'apps/api')
    try {
        $summary.api='RUNNING'
        $apiText = Invoke-Logged $python @('-m','pytest','tests/test_l3_api.py','tests/test_l3_migration.py','-q',"--junitxml=$outputDir/api-results.xml") (Join-Path $outputDir 'api.log')
        Write-Host $apiText
        [xml]$junit = Get-Content -Raw (Join-Path $outputDir 'api-results.xml')
        $suites = @($junit.testsuites.testsuite)
        $summary.api_counts = [ordered]@{
            tests=($suites | Measure-Object -Property tests -Sum).Sum
            failures=($suites | Measure-Object -Property failures -Sum).Sum
            errors=($suites | Measure-Object -Property errors -Sum).Sum
            skipped=($suites | Measure-Object -Property skipped -Sum).Sum
        }
        if ($TestDatabaseUrl -and $summary.api_counts.skipped -ne 0) { throw 'PostgreSQL mode unexpectedly skipped tests; concurrency is not verified.' }
        $summary.api='PASS'
        if ($TestDatabaseUrl) { $summary.concurrency='PASS' }
    } finally { Pop-Location }
    $null = Invoke-Logged $cli @('--yes','--package','@playwright/cli','playwright-cli',"-s=$runId",'open',($BaseUrl.TrimEnd('/')+'/l3?uatRun='+$runId)) (Join-Path $outputDir 'browser-open.log')
    $opened=$true
    $summary.browser='RUNNING'
    $null = Invoke-Logged $cli @('--yes','--package','@playwright/cli','playwright-cli',"-s=$runId",'snapshot') (Join-Path $outputDir 'browser-initial.log')
    $browserText = Invoke-Logged $cli @('--yes','--package','@playwright/cli','playwright-cli',"-s=$runId",'run-code','--filename','apps/api/tests/uat3/l3-acceptance.js') (Join-Path $outputDir 'browser.log')
    if ($browserText -match '### Error') { throw 'Browser acceptance failed. See browser.log.' }
    $match = [regex]::Match($browserText,'(?s)### Result\s*\r?\n(.*?)(?=\r?\n### |\z)')
    if (-not $match.Success) { throw 'Browser did not return structured results.' }
    # PS 5.1 emits a JSON array as one pipeline object; do not wrap that pipeline in @().
    $cases = $match.Groups[1].Value.Trim() | ConvertFrom-Json
    if (@($cases).Count -ne 2 -or @($cases | Where-Object { $_.status -ne 'PASS' }).Count -or @($cases | Where-Object { $_.mobile }).Count -ne 1) { throw 'Desktop and touch cases must both pass.' }
    $summary.browser='PASS'
    # Normalize PS 5.1 adapted arrays so report.json has a plain cases array, not value/Count.
    $summary.cases=@($cases | ForEach-Object { [ordered]@{
        mobile=[bool]$_.mobile; status=[string]$_.status; session_id=[string]$_.session_id
        version=[int]$_.version; receipts=[int]$_.receipts
        cases=@($_.cases | ForEach-Object { [string]$_ })
    } })
    $summary.status='PASS'
    Write-Host "PASS UAT3. Report: $outputDir"
    Write-Host "Concurrency: $($summary.concurrency). Browser is desktop/touch simulation, not real-device sign-off."
} catch {
    if ($summary.api -eq 'RUNNING') { $summary.api='FAIL' }
    if ($summary.browser -eq 'RUNNING') { $summary.browser='FAIL' }
    $summary.status='FAIL';$summary.error=$_.Exception.Message
    Write-Host "FAIL UAT3: $($summary.error) Logs: $outputDir"
} finally {
    if ($opened) {
        try { $null = Invoke-Logged $cli @('--yes','--package','@playwright/cli','playwright-cli',"-s=$runId",'close') (Join-Path $outputDir 'browser-close.log') }
        catch { $summary.cleanup_error=$_.Exception.Message }
    }
    $summary | ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 (Join-Path $outputDir 'report.json')
    if ($null -eq $oldTestUrl) { Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue } else { $env:TEST_DATABASE_URL=$oldTestUrl }
    if ($null -eq $oldMigrationUrl) { Remove-Item Env:L3_MIGRATION_TEST_DATABASE_URL -ErrorAction SilentlyContinue } else { $env:L3_MIGRATION_TEST_DATABASE_URL=$oldMigrationUrl }
    Pop-Location
}
if ($summary.status -ne 'PASS') { exit 1 }
exit 0
