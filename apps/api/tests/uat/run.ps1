param([string]$BaseUrl = 'http://127.0.0.1:3000')
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$sessionName = 'l1-uat-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$cli = if ($IsLinux -or $IsMacOS) { 'npx' } else { 'npx.cmd' }
Get-Command $cli -ErrorAction Stop | Out-Null
Push-Location $repoRoot
try {
    $outputDir = Join-Path $repoRoot 'output/playwright/uat'
    New-Item -ItemType Directory -Force $outputDir | Out-Null
    $ready = Invoke-RestMethod ($BaseUrl.TrimEnd('/') + '/api/v1/ready')
    if (-not $ready.persistence_ready) { throw 'Database is not ready' }
    & $cli --yes --package @playwright/cli playwright-cli "-s=$sessionName" open $BaseUrl
    if ($LASTEXITCODE -ne 0) { throw 'Browser startup failed' }
    foreach ($caseName in @('swim','ring','boat','bridge','mobile')) {
        & $cli --yes --package @playwright/cli playwright-cli "-s=$sessionName" snapshot | Out-Null
        $result = & $cli --yes --package @playwright/cli playwright-cli "-s=$sessionName" run-code --filename "apps/api/tests/uat/$caseName.js" 2>&1
        $exitCode = $LASTEXITCODE
        $result | Set-Content -Encoding utf8 (Join-Path $outputDir "$caseName.log")
        $text = $result -join "`n"
        if ($exitCode -ne 0 -or $text -match '### Error' -or $text -notmatch '"status":\s*"PASS"') {
            throw "UAT failed: $caseName. See output/playwright/uat/$caseName.log"
        }
        Write-Host "PASS $caseName"
    }
    Write-Host 'All five browser scenarios passed. API assertions and human UAT sign-off are separate.'
} finally {
    & $cli --yes --package @playwright/cli playwright-cli "-s=$sessionName" close | Out-Null
    Pop-Location
}
