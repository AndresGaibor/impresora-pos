param([int]$AgentPid)
$agent = Get-Process -Id $AgentPid -ErrorAction Stop
$children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $AgentPid }
$bad = $children | Where-Object { $_.Name -match 'electron|chrome|chromium' }
if ($bad) { throw 'Impresora POS owns an Electron/Chromium process' }
[pscustomobject]@{ agentPid = $AgentPid; electronChildren = @($bad).Count } | ConvertTo-Json
