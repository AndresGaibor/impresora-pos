# Checklist de release

- [ ] `bun install --frozen-lockfile` y `bun run check` pasan.
- [ ] Agent compilado y GUI construida desde la misma versión.
- [ ] Instalación per-user y autostart apunta sólo a Bun agent.
- [ ] Pairing, ERP PrintJob, idempotencia y recuperación `UNKNOWN` verificados.
- [ ] Export de diagnósticos sin tokens ni datos de clientes.
- [ ] CI Windows, instalación limpia, recursos y cero Electron tras cerrar GUI.
- [ ] Manifiesto firmado, hash verificado y update bloqueado durante jobs activos.
- [ ] Evidencia física USB/system y TCP 9100 adjunta por modelo.
