param(
    [string]$BaseUrl = 'http://127.0.0.1:3100',
    [ValidateSet('l2-01','l2-01-mobile','l2-door','l2-02','l2-03','l2-04','l2-storage','l2-server')]
    [string[]]$Cases = @('l2-01','l2-01-mobile','l2-door','l2-02','l2-03','l2-04','l2-storage')
)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$sessionName = 'l2-uat-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$cli = if ($IsLinux -or $IsMacOS) { 'npx' } else { 'npx.cmd' }
Get-Command $cli -ErrorAction Stop | Out-Null
Push-Location $repoRoot
try {
    $outputDir = Join-Path $repoRoot "output/playwright/uat/$sessionName"
    New-Item -ItemType Directory -Force $outputDir | Out-Null
    $entry = if ($Cases -contains 'l2-server') { '/l2' } else { '/l2?preview=1' }
    & $cli --yes --package @playwright/cli playwright-cli "-s=$sessionName" open ($BaseUrl.TrimEnd('/') + $entry)
    if ($LASTEXITCODE -ne 0) { throw 'Browser startup failed' }
    foreach ($caseName in $Cases) {
        & $cli --yes --package @playwright/cli playwright-cli "-s=$sessionName" snapshot | Out-Null
        $result = & $cli --yes --package @playwright/cli playwright-cli "-s=$sessionName" run-code --filename "apps/api/tests/uat/$caseName.js" 2>&1
        $exitCode = $LASTEXITCODE
        $result | Set-Content -Encoding utf8 (Join-Path $outputDir "$caseName.log")
        $text = $result -join "`n"
        if ($exitCode -ne 0 -or $text -match '### Error' -or $text -notmatch '"status":\s*"PASS"') {
            throw "L2 regression failed: $caseName. See $outputDir"
        }
        Write-Host "PASS $caseName"
    }
    Write-Host "All $($Cases.Count) selected L2 browser scripts passed. l2-server uses real local API persistence; other cases use isolated preview. Not real-device UAT. Logs: $outputDir"
} finally {
    & $cli --yes --package @playwright/cli playwright-cli "-s=$sessionName" close | Out-Null
    Pop-Location
}
