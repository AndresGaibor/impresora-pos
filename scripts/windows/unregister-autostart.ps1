$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
Remove-ItemProperty -Path $key -Name 'ImpresoraPosAgent' -ErrorAction SilentlyContinue
