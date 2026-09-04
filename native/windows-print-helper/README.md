# Windows Print Helper

Native helper for enumerating Windows printers and submitting RAW print jobs via the Windows spooler API.

## Protocol

**One JSON request on stdin → one JSON response on stdout.** stderr is used for debug logging only (never as response channel).

### Requests

```json
{ "cmd": "list" }
{ "cmd": "probe", "devicePath": "EPSON TM-T20III" }
{ "cmd": "print", "devicePath": "EPSON TM-T20III", "data": "<base64>" }
```

### Responses

```json
{ "ok": true, "printers": [{ "name": "...", "isDefault": true, "devicePath": "..." }] }
{ "ok": true, "reachable": true, "firmwareVersion": null, "serialNumber": null }
{ "ok": true, "success": true, "spoolerId": "spool-..." }
{ "ok": false, "error": "...", "code": "PRINTER_NOT_FOUND" | "SPOOLER_REJECTED" | "HELPER_ERROR" | "HELPER_INVALID_DATA" }
```

## Build

Requires .NET SDK 8.0 on Windows.

```powershell
cd native/windows-print-helper
dotnet build -c Release -o out
```

Output: `out/helper.exe` (matches the path expected by `system-helper-client.ts`).

The project uses deterministic build settings (`<Deterministic>true</Deterministic>`).

## Constraints

- Does NOT import templates, renderer, contracts, or SQLite
- One operation per invocation (spawns, prints response, exits)
- Uses P/Invoke to Windows Spooler API: OpenPrinter/StartDocPrinter/StartPagePrinter/WritePrinter/EndPagePrinter/EndDocPrinter/ClosePrinter with datatype "RAW"
- Hidden window semantics via `windowsHide: true` in Bun spawn

## Build on Windows (verification only - compiled binary not committed)

This helper has NOT been compiled or tested on Windows in this repository. Build verification is pending.
