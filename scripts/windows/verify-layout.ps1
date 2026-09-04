param([Parameter(Mandatory=$true)][string]$InstallRoot)
$agent = Join-Path $InstallRoot 'resources\agent\impresora-pos-agent.exe'
if (-not (Test-Path $agent)) { throw "Missing installed agent: $agent" }
if (-not (Test-Path (Join-Path $InstallRoot 'resources'))) { throw 'Missing resources directory' }
Write-Output 'layout-ok'
