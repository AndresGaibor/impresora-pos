# Windows RAW Spooler Spike

## Status: PENDING Windows evidence

This environment could not execute the `@lastapp/node-printer` native binding — the win32-x64
addon binary is not present in this host. The spike is implemented; Windows 10/11 x64
evidence is required to advance the gate.

---

## CLI arguments

Parser accepts the following forms (all verified via `parse.test.ts`):

```bash
# List printers (JSON array)
bun run src/probe.ts --list

# Send RAW to named printer (JSON result)
bun run src/probe.ts --send --printer "POS-58" --data "HELLO"

# Probe mode (RAW implicit)
bun run src/probe.ts probe --printer "POS-58" --data "HELLO"

# --probe form
bun run src/probe.ts --probe --printer "POS-58" --data "HELLO"

# Short flags (-p / -d)
bun run src/probe.ts --send -p "POS-58" -d "TEST"
```

The same forms are expected to work with `./probe.exe` after Windows compilation, but
that has not been verified — see "Windows commands" section below.

**Arguments:**

| Flag | Aliases | Description |
|------|---------|-------------|
| `--list` | | Enumerate printers, output JSON array |
| `--send` | `send` | Send RAW data to printer |
| `probe` | `--probe` | Probe mode (RAW implicit) |
| `--printer` | `-p` | Target printer name (required for send/probe) |
| `--data` | `-d` | Raw bytes string to send |

---

## File structure

```
spikes/windows-spooler/
├── package.json
├── src/
│   ├── parse.ts          — pure arg parser (no native deps)
│   ├── probe-native.ts    — thin wrappers (listPrinters, sendRaw)
│   ├── probe.ts          — re-exports + CLI entry (main)
│   └── cli.ts            — (unused, probe.ts is entry)
├── test/
│   ├── contract.test.ts  — type contract (brief)
│   └── parse.test.ts     — CLI arg parsing (8 passing)
└── README.md
```

---

## Linux test results

```
$ bun test
8 pass — 9 expect() calls — 43ms

$ bun run src/probe.ts --list
error: native printer API requires win32; use cross-OS helper boundary
(exit 1 — clean platform guard; native code never reached)

$ bun run src/probe.ts --send -p "POS" -d "TEST"
error: native printer API requires win32; use cross-OS helper boundary
(exit 1)

$ bun run src/probe.ts probe -p "POS" -d "TEST"
error: native printer API requires win32; use cross-OS helper boundary
(exit 1)
```

`contract.test.ts` passes on Linux because `probe-native.ts` uses lazy `require()`
inside `listPrinters()` and `sendRaw()` function bodies — the native binding is not
evaluated at module-import time. The platform guard in `probe.ts` exits cleanly before
any native call is reached.

---

## Windows commands

```bash
bun test
bun run src/probe.ts --list
bun build src/probe.ts --compile --target=bun-windows-x64 --outfile probe.exe
./probe.exe --list
bun run src/probe.ts --send --printer "POS-58" --data "TEST"
./probe.exe --send --printer "POS-58" --data "TEST"
```

**Evidence required:**
- `bun test` exits 0
- `bun run src/probe.ts --list` outputs printer JSON
- `probe.exe --list` outputs printer JSON
- RAW send returns `{ accepted: true, jobId: "..." }` in both modes

---

## Decision rule

Accept `@lastapp/node-printer` only if enumeration + RAW send work in both Bun source
AND compiled executable without Node/Electron resident.

Otherwise: isolate Windows helper with stdin/stdout JSON commands `list`, `probe`, `print`;
helper owns no templates or business logic.
