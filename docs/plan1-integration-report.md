# Plan 1 HTTP Integration Report

Estado: verificación final completada; sin regresiones inmediatas reproducibles.

- La generación de códigos de pairing exige credencial administrativa y un `Origin` aprobado; el código queda ligado al `Origin` de la cabecera de la solicitud, no a la URL.
- Los cuerpos JSON administrativos de perfiles, templates, probe y test-print se limitan a 1 MiB por bytes y devuelven `{ code, message, requestId }` en errores.
- La ruta pública de perfiles es exactamente `GET /v1/printer-profiles`; `/v1/profiles` no es alias.
- El agente conserva `127.0.0.1:18181` como configuración predeterminada. El puerto efímero sólo se permite con `allowEphemeralPort: true` en composición explícita de pruebas.
- El renderer conserva las columnas configuradas por el perfil, incluso `columns=24`: usa `ReceiptPrinterEncoder` en modo `embedded` y antepone `ESC @` explícitamente, sin remapear la anchura ni perder barcode, QR, cut o drawer.
- La selección de transporte conserva las variantes `system` y `network` en discovery, probe y ejecución de trabajos.
- El pairing reserva el código de un solo uso antes de generar y persistir el token; la persistencia guarda únicamente el hash y el `Origin` aprobado.
- El cliente del transporte `system` conserva el helper C# fuente en `native/windows-print-helper/PrinterHelper.cs` y su proyecto `PrinterHelper.csproj`.

Validación ejecutada el 2026-09-04:

- `bun test apps/agent/test`: primera ejecución concurrente: 124 pasadas, 1 fallo por timeout de 5 s en `startup composition > fails with typed PORT_IN_USE`; ejecución final aislada: PASS, 125 pasadas, 0 fallos, 374 expectativas.
- `bun test packages/contracts packages/templates packages/renderer packages/printer-core`: PASS, 55 pasadas, 0 fallos, 174 expectativas.
- `bunx tsc -p tsconfig.json --noEmit`: PASS, sin errores.
- `bunx tsc -p apps/gui/tsconfig.json --noEmit`: PASS, sin `skipLibCheck`; el proyecto cubre renderer/Electron y excluye E2E Bun y `vite.config.ts` para mantener separados sus tipos.
- `bun test apps/gui/e2e/lifecycle.spec.ts`: PASS, 2 pasadas, 15 expectativas.
- `bun run --cwd apps/gui build`: PASS, renderer Vite y bundles Electron generados.
- `git diff --check`: PASS, sin salida.
