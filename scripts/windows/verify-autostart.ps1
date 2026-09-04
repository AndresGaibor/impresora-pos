param([Parameter(Mandatory=$true)][string]$AgentPath)
$value = (Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'ImpresoraPosAgent' -ErrorAction Stop).ImpresoraPosAgent
if ($value -match 'electron|chrome|chromium') { throw 'Autostart must not launch Electron/Chromium' }
if ($value -notmatch [regex]::Escape((Resolve-Path $AgentPath))) { throw 'Autostart target is not the installed agent' }
if ($value -match ' --') { throw 'Autostart contains unexpected arguments' }
