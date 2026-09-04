param([Parameter(Mandatory=$true)][string]$AgentPath)
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if (-not (Test-Path $AgentPath)) { throw "Agent not found: $AgentPath" }
New-Item -Path $key -Force | Out-Null
New-ItemProperty -Path $key -Name 'ImpresoraPosAgent' -Value ('"' + (Resolve-Path $AgentPath) + '"') -PropertyType String -Force | Out-Null
