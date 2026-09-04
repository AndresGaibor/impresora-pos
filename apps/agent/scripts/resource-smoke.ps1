param(
  [string]$Executable = "$PSScriptRoot\..\..\..\dist\windows\impresora-pos-agent.exe",
  [int]$Port = 18765,
  [int]$Minutes = 5
)

$ErrorActionPreference = 'Stop'
$process = Start-Process -FilePath $Executable -ArgumentList "--port=$Port" -PassThru
try {
  $deadline = (Get-Date).AddSeconds(30)
  do {
    Start-Sleep -Milliseconds 250
    try { $health = Invoke-WebRequest "http://127.0.0.1:$Port/v1/health" -UseBasicParsing } catch { $health = $null }
  } while (-not $health -and (Get-Date) -lt $deadline)
  if (-not $health) { throw 'Agent health did not become ready' }

  $samples = @()
  $end = (Get-Date).AddMinutes($Minutes)
  while ((Get-Date) -lt $end) {
    $p = Get-Process -Id $process.Id
    $samples += [pscustomobject]@{ Cpu = $p.CPU; RssMb = $p.WorkingSet64 / 1MB }
    Start-Sleep -Seconds 5
  }
  $rss = ($samples | Measure-Object RssMb -Average).Average
  $cpu = (($samples | Measure-Object Cpu -Maximum).Maximum - ($samples | Measure-Object Cpu -Minimum).Minimum) / ($Minutes * 60) / [Environment]::ProcessorCount * 100
  $all = @(Get-CimInstance Win32_Process)
  $tree = [System.Collections.Generic.HashSet[int]]::new()
  $tree.Add($process.Id) | Out-Null
  do {
    $added = $false
    foreach ($candidate in $all) {
      if ($tree.Contains([int]$candidate.ParentProcessId) -and $tree.Add([int]$candidate.ProcessId)) { $added = $true }
    }
  } while ($added)
  $agentRoot = [IO.Path]::GetFullPath((Split-Path $Executable))
  $suspicious = $all | Where-Object {
    $_.Name -match '^(electron|chromium)(\.exe)?$' -and
    ($tree.Contains([int]$_.ProcessId) -or $_.ExecutablePath -like "$agentRoot*" -or $_.CommandLine -like "*$agentRoot*")
  }
  "Average RSS MB: $rss (target <= 40 MB, ceiling <= 60 MB)"
  "Sampled CPU percent: $cpu (ceiling <= 0.2%)"
  if ($cpu -gt 0.2 -or $rss -gt 60 -or $suspicious) { throw 'Resource smoke criteria failed' }
} finally {
  if (!$process.HasExited) { Stop-Process -Id $process.Id -Force }
}
