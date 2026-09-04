!macro customInstall
  ExecWait '"$INSTDIR\resources\agent\impresora-pos-agent.exe" --register-autostart'
!macroend
!macro customUnInstall
  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\scripts\unregister-autostart.ps1"'
!macroend
