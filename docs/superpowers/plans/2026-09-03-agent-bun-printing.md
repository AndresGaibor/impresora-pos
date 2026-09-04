# Impresora POS Agent Bun + Printing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir un agente Bun residente, sin Electron, capaz de validar PrintJobs, persistir idempotencia, renderizar ESC/POS y enviar trabajos a impresoras del sistema o TCP 9100 mediante una API localhost segura.

**Architecture:** El agente es un ejecutable Bun autónomo y el único proceso residente. Los contratos, plantillas, renderer y printer-core viven en paquetes puros; hardware y HTTP se implementan en `apps/agent`. El renderer produce bytes y los transportes sólo los envían.

**Tech Stack:** Bun workspaces, TypeScript strict, Zod, `bun:sqlite`, `@point-of-sale/receipt-printer-encoder`, Vitest/Bun test, `node:net`, Bun HTTP server.

**Spec:** `docs/superpowers/specs/2026-09-03-impresora-pos-design.md`

## Global Constraints

- Bun es el runtime residente; este plan no introduce Electron.
- El agente escucha sólo en `127.0.0.1:18181`.
- El ERP nunca puede enviar JavaScript, HTML arbitrario ni ESC/POS raw.
- `jobId` es idempotente; una reimpresión exige un job nuevo y `reprintOf`.
- No persistir payloads completos de facturas ni datos personales en logs.
- No hacer polling periódico de hardware en reposo.
- Windows 10/11 x64 es la primera plataforma de producción.
- El agente compilado debe poder arrancar y funcionar sin tener Bun instalado.
- Objetivo idle: <=40 MB RSS; 60 MB es techo de regresión a investigar.
- Prioridad: confiabilidad > compatibilidad > simplicidad operativa > personalización.

---## File Structure Locked by This Plan

- `package.json` — Bun workspace root and cross-package scripts.
- `tsconfig.json` — strict shared compiler defaults.
- `packages/contracts/src/*` — API DTOs, PrintJob schemas and version constants.
- `packages/templates/src/*` — declarative template schema, builtins and guardrails.
- `packages/renderer/src/*` — TemplateDefinition -> LayoutModel -> preview/ESC-POS.
- `packages/printer-core/src/*` — device/profile/transport interfaces and error taxonomy.
- `apps/agent/src/db/*` — SQLite schema, migrations and repositories.
- `apps/agent/src/jobs/*` — queue, idempotencia and job service.
- `apps/agent/src/transports/*` — TCP and system-spooler adapters.
- `apps/agent/src/http/*` — localhost routing, pairing, auth and rate limits.
- `apps/agent/src/logging/*` — structured redacted logging.
- `apps/agent/src/index.ts` — composition root only.
- `apps/agent/tests/*` — integration tests around real composition boundaries.

### Task 1: Bootstrap Bun workspace and enforce boundaries

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`
- Create: `packages/contracts/package.json`, `packages/templates/package.json`
- Create: `packages/renderer/package.json`, `packages/printer-core/package.json`
- Create: `apps/agent/package.json`, `apps/agent/src/index.ts`
- Test: `tests/architecture/workspace.test.ts`

**Interfaces:**
- Produces workspace package names `@impresora-pos/contracts`, `@impresora-pos/templates`, `@impresora-pos/renderer`, `@impresora-pos/printer-core`, `@impresora-pos/agent`.

- [ ] **Step 1: Write the failing architecture test**

```ts
import { expect, test } from 'bun:test';
import root from '../../package.json';

test('workspace exposes only approved top-level packages/apps', () => {
  expect(root.workspaces).toEqual(['apps/*', 'packages/*']);
});
```

- [ ] **Step 2: Run it and confirm RED**

Run: `bun test tests/architecture/workspace.test.ts`
Expected: FAIL because root workspace metadata does not exist yet.

- [ ] **Step 3: Create minimal workspace**

Root `package.json` must set `private: true`, `packageManager: "bun@1"`, workspaces `apps/*` and `packages/*`, and scripts `test`, `typecheck`, `check`, `build:agent`.

Root `tsconfig.json` must enable `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `moduleResolution: "Bundler"` and `noEmit`.

- [ ] **Step 4: Verify workspace**

Run: `bun install && bun test tests/architecture/workspace.test.ts && bun run typecheck`
Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock tsconfig.json .gitignore apps packages tests
git commit -m "chore: bootstrap bun print agent workspace"
```

### Task 2: Versioned PrintJob and API contracts

**Files:**
- Create: `packages/contracts/src/versions.ts`
- Create: `packages/contracts/src/print-job.ts`
- Create: `packages/contracts/src/api.ts`
- Create: `packages/contracts/src/index.ts`
- Test: `packages/contracts/test/print-job.test.ts`

**Interfaces:**
- Produces: `PrintJobSchema`, `PrintJob`, `InvoicePrintDataSchema`, `HealthResponseSchema`, `CapabilitiesResponseSchema`.
- Produces constants: `API_VERSION = 1`, `PRINT_JOB_SCHEMA_VERSION = 1`, `TEMPLATE_SCHEMA_VERSION = 1`.

- [ ] **Step 1: Write failing schema tests**

```ts
import { expect, test } from 'bun:test';
import { PrintJobSchema } from '../src/print-job';

const validJob = { schemaVersion: 1, jobId: 'job-001', type: 'receipt', data: { title: 'Prueba', lines: [] } };

test('accepts a declarative print job', () => {
  expect(PrintJobSchema.parse(validJob).jobId).toBe('job-001');
});

test('rejects unknown schema versions and raw payloads', () => {
  expect(() => PrintJobSchema.parse({ ...validJob, schemaVersion: 2 })).toThrow();
  expect(() => PrintJobSchema.parse({ ...validJob, rawEscPos: [27, 64] })).toThrow();
});
```

- [ ] **Step 2: Run contract tests and confirm RED**

Run: `bun test packages/contracts/test/print-job.test.ts`
Expected: FAIL because `PrintJobSchema` is not implemented.

- [ ] **Step 3: Implement strict discriminated schemas**

Use `z.object(...).strict()` for every public DTO. Define `InvoicePrintData`, `ReceiptPrintData`, `CashClosePrintData` and `TestPrintData`; `PrintJobSchema` must discriminate by `type` and reject additional top-level keys. Monetary values travel as strings already calculated by the ERP; the schema validates representation but never recalculates business totals.

```ts
export const PrintJobEnvelopeSchema = z.object({
  schemaVersion: z.literal(1), jobId: z.string().min(1).max(128),
  templateId: z.string().min(1).max(128).optional(),
  printerProfileId: z.string().min(1).max(128).optional(),
  actions: z.object({ cut: z.boolean().optional(), openDrawer: z.boolean().optional() }).strict().optional(),
  reprintOf: z.string().min(1).max(128).optional(),
}).strict();
```

- [ ] **Step 4: Add API version response contracts and verify**

`HealthResponse` must expose `status`, `agentVersion`, `apiVersion`, `templateSchemaVersion`; `CapabilitiesResponse` adds supported transports, languages and paper widths.

Run: `bun test packages/contracts && bun run typecheck`
Expected: all contract tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat: define versioned print job contracts"
```

### Task 3: SQLite schema, migrations and redacted repositories

**Files:**
- Create: `apps/agent/src/db/database.ts`
- Create: `apps/agent/src/db/migrations.ts`
- Create: `apps/agent/src/db/repositories/jobs.ts`
- Create: `apps/agent/src/db/repositories/pairings.ts`
- Create: `apps/agent/src/db/repositories/profiles.ts`
- Create: `apps/agent/src/db/repositories/templates.ts`
- Test: `apps/agent/test/db.test.ts`

**Interfaces:**
- Produces `openDatabase(path: string): Database` and `migrate(db): void`.
- Produces `JobMetadataRepository.reserve(job)`, `markSending`, `markSent`, `markFailed`, `markUnknown`, `find(jobId)`.
- Durable job rows contain metadata only: no customer, items, invoice body or token plaintext.

- [ ] **Step 1: Write failing migration/idempotency persistence tests**

```ts
const db = openDatabase(':memory:');
migrate(db);
const repo = new JobMetadataRepository(db);
repo.reserve({ jobId: 'A', type: 'invoice', profileId: 'p1' });
expect(repo.find('A')?.state).toBe('QUEUED');
expect(() => repo.reserve({ jobId: 'A', type: 'invoice', profileId: 'p1' })).toThrow(JobAlreadyExistsError);
```

Also query `PRAGMA table_info(print_jobs)` and assert there are no columns named `payload`, `customer`, `items`, `document` or `token`.

- [ ] **Step 2: Run DB test and confirm RED**

Run: `bun test apps/agent/test/db.test.ts`
Expected: FAIL because DB modules are absent.

- [ ] **Step 3: Implement versioned transactional migration**

Create tables `schema_migrations`, `print_jobs`, `pairings`, `printer_profiles`, `templates`, `preferences`. `print_jobs` stores `job_id`, `type`, `profile_id`, `state`, `reprint_of`, timestamps, duration and `error_code` only. Store pairing tokens as SHA-256 hashes plus approved origin.

Use one transaction per migration and reject a DB with schema version newer than the binary supports.

- [ ] **Step 4: Implement repositories and restart verification**

Test using a temporary file DB: reserve job, close connection, reopen, migrate again, assert the same metadata remains. Verify migration is idempotent and pairings return only hash/origin metadata.

Run: `bun test apps/agent/test/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/db apps/agent/test/db.test.ts
git commit -m "feat: persist print agent metadata in sqlite"
```

### Task 4: Printer-core contracts, profiles and error taxonomy

**Files:**
- Create: `packages/printer-core/src/types.ts`
- Create: `packages/printer-core/src/errors.ts`
- Create: `packages/printer-core/src/profile.ts`
- Create: `packages/printer-core/src/index.ts`
- Test: `packages/printer-core/test/profile.test.ts`

**Interfaces:**
- Produces `PrinterTransport`, `PrinterDevice`, `ProbeResult`, `SendResult`, `PrinterProfile`.
- `PrinterTransport` signature is fixed to the spec: `discover()`, `probe(device)`, `print(device, bytes)`.
- Produces stable error codes: `PRINTER_NOT_FOUND`, `NETWORK_TIMEOUT`, `SPOOLER_REJECTED`, `INVALID_TEMPLATE`, `UNSUPPORTED_CODEPAGE`, `PORT_IN_USE`, `UNAUTHORIZED_ORIGIN`.

- [ ] **Step 1: Write failing profile validation tests**

```ts
expect(PrinterProfileSchema.parse({
  id: 'cashier-1', name: 'Caja 1', transport: 'network',
  device: { host: '192.168.1.50', port: 9100 }, language: 'esc-pos',
  paperWidthMm: 80, columns: 48, codepageMapping: 'epson', cut: true, drawer: false,
  defaultTemplates: { invoice: 'ecuador-invoice-80-v1' },
}).columns).toBe(48);
expect(() => PrinterProfileSchema.parse({ paperWidthMm: 57 })).toThrow();
```

- [ ] **Step 2: Confirm RED**

Run: `bun test packages/printer-core/test/profile.test.ts`
Expected: FAIL because schemas/interfaces are missing.

- [ ] **Step 3: Implement minimal public types**

Use a discriminated `device` shape for `system` and `network`; accepted paper widths are exactly `58 | 80` in v1. Keep hardware state explicit: `configured`, `reachable`, `spooler-ready`, `hardware-status-known`, `hardware-status-unknown`.

- [ ] **Step 4: Verify and commit**

Run: `bun test packages/printer-core && bun run typecheck`
Expected: PASS.

```bash
git add packages/printer-core
git commit -m "feat: define printer transport and profile contracts"
```

### Task 5: Mandatory Windows RAW spooler spike under Bun

**Files:**
- Create: `spikes/windows-spooler/package.json`
- Create: `spikes/windows-spooler/src/probe.ts`
- Create: `spikes/windows-spooler/README.md`
- Test: `spikes/windows-spooler/test/contract.test.ts`

**Interfaces:**
- This task does not define production imports.
- It produces a recorded decision: `@lastapp/node-printer` accepted under Bun, or isolated helper strategy selected.
- Production Task 10 may start only after this gate has evidence on Windows 10/11 x64.

- [ ] **Step 1: Define the spike contract test**

```ts
import { expect, test } from 'bun:test';
import { listPrinters, sendRaw } from '../src/probe';

test('adapter exposes enumeration and raw send without Electron', async () => {
  expect(typeof listPrinters).toBe('function');
  expect(typeof sendRaw).toBe('function');
});
```

- [ ] **Step 2: Install only the candidate dependency inside the spike**

Run from `spikes/windows-spooler`: `bun add @lastapp/node-printer@0.8.0`
Do not add it to a production workspace package yet.

- [ ] **Step 3: Implement `listPrinters()` and `sendRaw()` thin wrappers**

`listPrinters()` maps native printer objects into `{ name, isDefault, status? }`. `sendRaw(name, bytes)` calls direct RAW printing and returns `{ accepted: true, jobId?: string }` or a typed failure; it never formats a ticket.

- [ ] **Step 4: Verify in three execution modes on Windows**

Run and record all outputs in `README.md`:

```bash
bun test
bun run src/probe.ts --list
bun build src/probe.ts --compile --target=bun-windows-x64 --outfile probe.exe
./probe.exe --list
```

Then select a safe test printer and execute one RAW diagnostic job from both `bun run` and `probe.exe`. Evidence must include process exit code, printer enumeration and whether RAW bytes were accepted.

- [ ] **Step 5: Apply the decision rule**

Accept `@lastapp/node-printer` only if enumeration and RAW send work in both Bun source and compiled executable without Electron/Node resident. Otherwise record the concrete failure and choose an isolated Windows helper boundary implementing stdin/stdout JSON commands `list`, `probe`, `print`; the helper must not own templates or business logic.

- [ ] **Step 6: Commit spike evidence**

```bash
git add spikes/windows-spooler
git commit -m "spike: verify windows raw printing under bun"
```

### Task 6: Declarative template schema and builtin fiscal guardrails

**Files:**
- Create: `packages/templates/src/schema.ts`
- Create: `packages/templates/src/guardrails.ts`
- Create: `packages/templates/src/builtins/ecuador-invoice-80-v1.ts`
- Create: `packages/templates/src/builtins/ecuador-invoice-58-v1.ts`
- Create: `packages/templates/src/builtins/simple-receipt-v1.ts`
- Create: `packages/templates/src/index.ts`
- Test: `packages/templates/test/templates.test.ts`

**Interfaces:**
- Produces `TemplateDefinitionSchema`, `TemplateDefinition`, `validateFiscalTemplate(template, type)` and `BUILTIN_TEMPLATES`.
- Allowed block kinds v1: `text`, `field`, `image`, `divider`, `space`, `items-table`, `totals`, `barcode`, `qr`, `cut`.
- Template sources are exactly `builtin | managed | local`; builtin objects are immutable.

- [ ] **Step 1: Write failing schema/guardrail tests**

```ts
test('rejects executable template content', () => {
  expect(() => TemplateDefinitionSchema.parse({ ...baseTemplate, blocks: [{ type: 'script', code: 'print()' }] })).toThrow();
});

test('invoice template requires fiscal blocks', () => {
  const result = validateFiscalTemplate(invoice80, 'invoice');
  expect(result.missing).toEqual([]);
});
```

Also remove the access-key block from a fixture and assert `missing` contains `accessKey`.

- [ ] **Step 2: Confirm RED**

Run: `bun test packages/templates/test/templates.test.ts`
Expected: FAIL because template modules are missing.

- [ ] **Step 3: Implement schema and safe conditions**

Only allow `showWhenPresent: string` for approved data paths and collection repetition inside the known `items-table`. No expression language, eval, arbitrary function names or HTML.

Builtin invoice templates must declare mandatory semantic roles: `issuerRuc`, `documentNumber`, `customer`, `items`, `totals`, `accessKey`, `environment`.

- [ ] **Step 4: Verify and commit**

Run: `bun test packages/templates && bun run typecheck`
Expected: PASS.

```bash
git add packages/templates
git commit -m "feat: add safe receipt template definitions"
```

### Task 7: Shared LayoutModel, preview model and ESC/POS renderer

**Files:**
- Create: `packages/renderer/src/layout.ts`
- Create: `packages/renderer/src/resolve-template.ts`
- Create: `packages/renderer/src/preview.ts`
- Create: `packages/renderer/src/escpos.ts`
- Create: `packages/renderer/src/index.ts`
- Test: `packages/renderer/test/layout.test.ts`
- Test: `packages/renderer/test/escpos.test.ts`

**Interfaces:**
- Produces `resolveLayout(template, data, profile): LayoutModel`.
- Produces `toPreviewModel(layout): PreviewDocument` containing rows/cells/styles but no HTML.
- Produces `encodeEscPos(layout, profile, actions?): Uint8Array`.
- Both preview and ESC/POS consume the exact same `LayoutModel`.

- [ ] **Step 1: Write failing deterministic layout tests**

```ts
const layout = resolveLayout(invoice80, invoiceFixture, profile80);
expect(layout.columns).toBe(48);
expect(layout.rows.some(r => r.semanticRole === 'accessKey')).toBe(true);
expect(layout.rows.find(r => r.semanticRole === 'total')?.text).toContain('18.50');
```

Add a 58 mm profile assertion showing 32 configured columns and wrapping a deliberately long product description without losing quantity/total cells.

- [ ] **Step 2: Confirm RED**

Run: `bun test packages/renderer/test/layout.test.ts`
Expected: FAIL because `resolveLayout` is missing.

- [ ] **Step 3: Implement minimal layout resolver**

Resolve safe field paths, visibility, widths and item rows into immutable layout records. Keep money strings untouched. Make wrapping deterministic from profile `columns`; do not measure browser pixels.

- [ ] **Step 4: Write failing ESC/POS tests before encoder implementation**

```ts
const bytes = encodeEscPos(layout, profile80, { cut: true });
expect(bytes).toBeInstanceOf(Uint8Array);
expect(bytes.length).toBeGreaterThan(20);
expect(Buffer.from(bytes).includes(Buffer.from('TOTAL'))).toBe(true);
```

Also test `áéíóúñÑ` through the configured Epson mapping, Code 128 from a 49-digit access key, QR output, cut enabled/disabled and drawer enabled/disabled.

- [ ] **Step 5: Implement encoder adapter**

From `packages/renderer`, add the pinned dependency `@point-of-sale/receipt-printer-encoder@3.0.3`. Wrap `@point-of-sale/receipt-printer-encoder` behind this package only. No other package may import the encoder directly. Configure language `esc-pos`, columns and codepage mapping from `PrinterProfile`.

- [ ] **Step 6: Verify preview/ESC-POS share layout and commit**

Run: `bun test packages/renderer && bun run typecheck`
Expected: all layout and byte-generation tests PASS.

```bash
git add packages/renderer
git commit -m "feat: render shared layouts to escpos"
```

### Task 8: NetworkPrinterTransport over TCP 9100

**Files:**
- Create: `apps/agent/src/transports/network.ts`
- Test: `apps/agent/test/network-transport.test.ts`

**Interfaces:**
- Implements `PrinterTransport` for `{ kind: 'network', host, port }`.
- `probe()` opens then closes a TCP connection with bounded timeout.
- `print()` resolves only after socket write/flush succeeds; result means bytes sent, not physical print confirmation.

- [ ] **Step 1: Write fake TCP server tests**

Start `Bun.listen()` on an ephemeral local port, capture received bytes, call transport `print()`, then assert byte-for-byte equality. Add tests for refused connection and timeout mapping to `NETWORK_TIMEOUT`/`PRINTER_NOT_FOUND`.

- [ ] **Step 2: Confirm RED**

Run: `bun test apps/agent/test/network-transport.test.ts`
Expected: FAIL because network transport is absent.

- [ ] **Step 3: Implement with `node:net` only**

Do not scan the LAN. `discover()` returns an empty list for network transport because network devices are manually configured in v1. Default port is supplied by profile creation as 9100, not guessed inside `print()`.

- [ ] **Step 4: Verify exact byte delivery and commit**

Run: `bun test apps/agent/test/network-transport.test.ts`
Expected: PASS including error mapping.

```bash
git add apps/agent/src/transports/network.ts apps/agent/test/network-transport.test.ts
git commit -m "feat: send receipts to network printers"
```

### Task 9: Serial per-printer queue and crash-safe idempotency

**Files:**
- Create: `apps/agent/src/jobs/queue.ts`
- Create: `apps/agent/src/jobs/job-service.ts`
- Create: `apps/agent/src/jobs/recovery.ts`
- Test: `apps/agent/test/job-service.test.ts`

**Interfaces:**
- Produces `JobService.submit(job): Promise<JobStatus>` and `getStatus(jobId)`.
- Per profile, only one transport call may execute concurrently.
- On startup `recoverInterruptedJobs()` maps durable `SENDING` to `UNKNOWN` and never auto-reprints it.

- [ ] **Step 1: Write failing duplicate/concurrency/recovery tests**

```ts
const first = service.submit(jobA);
const duplicate = service.submit(jobA);
await expect(duplicate).resolves.toMatchObject({ jobId: jobA.jobId });
expect(fakeTransport.callsFor(jobA.jobId)).toBe(1);

await Promise.all([service.submit(jobB), service.submit(jobC)]);
expect(fakeTransport.maxConcurrentForProfile('p1')).toBe(1);
```

Seed a `SENDING` row, run recovery, assert state becomes `UNKNOWN` and transport call count stays zero.

- [ ] **Step 2: Confirm RED**

Run: `bun test apps/agent/test/job-service.test.ts`
Expected: FAIL because queue/service do not exist.

- [ ] **Step 3: Implement reservation-before-send flow**

Order must be: validate -> resolve profile/template -> durable reserve `QUEUED` -> enqueue -> mark `SENDING` -> render in memory -> transport print -> mark `SENT`/`FAILED` -> drop payload references. A duplicate `jobId` returns durable prior status without entering the queue.

- [ ] **Step 4: Implement explicit reprint semantics**

A new job with `reprintOf` is accepted if its own `jobId` is new. Never mutate the original row to trigger reprinting.

- [ ] **Step 5: Verify and commit**

Run: `bun test apps/agent/test/job-service.test.ts`
Expected: PASS for duplicate, serial queue, failure and crash-recovery cases.

```bash
git add apps/agent/src/jobs apps/agent/test/job-service.test.ts
git commit -m "feat: queue print jobs idempotently"
```

### Task 10: SystemPrinterTransport selected by spike evidence

**Files:**
- Create: `apps/agent/src/transports/system.ts`
- Create only if spike rejects direct addon: `apps/agent/src/transports/system-helper-client.ts`
- Create only if spike rejects direct addon: `native/windows-print-helper/*`
- Test: `apps/agent/test/system-transport.test.ts`

**Interfaces:**
- Implements the same `PrinterTransport`; callers cannot tell whether Winspool access is direct or via helper.
- `discover()` returns installed printers mapped to stable `PrinterDevice` records.
- `print()` accepts only already-rendered `Uint8Array` and submits RAW bytes.

- [ ] **Step 1: Read and enforce the Task 5 decision**

If the spike proves `@lastapp/node-printer` under `bun build --compile`, add it only to `apps/agent`. If not, implement the documented helper protocol exactly: one JSON request on stdin, one JSON response on stdout, commands `list`, `probe`, `print`; print bytes are base64 solely across this private process boundary.

- [ ] **Step 2: Write adapter tests against an injected native boundary**

```ts
const native = fakeNativePrinterApi([{ name: 'EPSON TM-T20III', isDefault: true }]);
const transport = new SystemPrinterTransport(native);
expect((await transport.discover())[0]?.name).toBe('EPSON TM-T20III');
await transport.print(device, new Uint8Array([0x1b, 0x40]));
expect(native.lastRawJob?.bytes).toEqual(new Uint8Array([0x1b, 0x40]));
```

Also assert native rejection maps to `SPOOLER_REJECTED` and unknown printer maps to `PRINTER_NOT_FOUND`.

- [ ] **Step 3: Confirm RED**

Run: `bun test apps/agent/test/system-transport.test.ts`
Expected: FAIL because production adapter is absent.

- [ ] **Step 4: Implement the thinnest boundary selected by the spike**

The native layer may enumerate/probe/send only. It must not import contracts, templates, renderer or SQLite. If a helper is required, spawn it per operation with hidden-window semantics and require it to exit; no helper process remains idle. The Bun adapter owns error normalization.

- [ ] **Step 5: Run source + compiled Windows smoke**

Run: `bun test apps/agent/test/system-transport.test.ts && bun run apps/agent/src/dev/system-smoke.ts --list`
Then compile agent with the production dependency/helper and repeat list + one diagnostic RAW print on Windows.
Expected: same visible printer names and accepted diagnostic job in both modes.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/transports apps/agent/test/system-transport.test.ts native
git commit -m "feat: support installed system printers"
```

### Task 11: Redacted structured logging

**Files:**
- Create: `apps/agent/src/logging/logger.ts`
- Create: `apps/agent/src/logging/redact.ts`
- Test: `apps/agent/test/logging.test.ts`

**Interfaces:**
- Produces `logger.info(event, metadata)` / `logger.error(event, metadata)`.
- Allowed job metadata keys: `jobId`, `type`, `profileId`, `durationMs`, `state`, `errorCode`.
- Tokens, authorization headers, customer fields, items and invoice payloads must never serialize.

- [ ] **Step 1: Write failing leakage tests**

Pass nested metadata containing `token`, `authorization`, `customer`, `identification`, `items` and `data`; serialize log entry and assert none of their values appear. Assert approved technical fields remain.

- [ ] **Step 2: Confirm RED**

Run: `bun test apps/agent/test/logging.test.ts`
Expected: FAIL until the whitelist-based logger exists.

- [ ] **Step 3: Implement whitelist logging, not blacklist logging**

Build the durable log object from approved fields only; do not recursively copy unknown metadata and then redact it. Error stack persistence is disabled by default in production logs; store stable error code/message class.

- [ ] **Step 4: Verify and commit**

Run: `bun test apps/agent/test/logging.test.ts`
Expected: PASS with explicit sensitive fixtures absent from output.

```bash
git add apps/agent/src/logging apps/agent/test/logging.test.ts
git commit -m "feat: redact print agent diagnostics"
```

### Task 12: Loopback API, pairing, Origin auth and rate limits

**Files:**
- Create: `apps/agent/src/http/server.ts`
- Create: `apps/agent/src/http/router.ts`
- Create: `apps/agent/src/http/auth.ts`
- Create: `apps/agent/src/http/pairing.ts`
- Create: `apps/agent/src/http/rate-limit.ts`
- Create: `apps/agent/src/http/routes/health.ts`
- Create: `apps/agent/src/http/routes/print.ts`
- Create: `apps/agent/src/http/routes/catalog.ts`
- Test: `apps/agent/test/http-api.test.ts`

**Interfaces:**
- `startServer({ hostname: '127.0.0.1', port: 18181, ...deps })`.
- Public routes exactly: health, capabilities, pair, print, job status, templates, printer profiles.
- Pairing returns a random bearer token once; DB stores SHA-256(token) + exact approved Origin.

- [ ] **Step 1: Write failing bind/security tests**

Start on an ephemeral loopback port in tests. Assert `/v1/health` works without auth; `/v1/print` rejects missing Origin, wrong Origin, missing token, wrong token, oversized body and malformed strict schema.

- [ ] **Step 2: Define pairing ceremony in tests**

Pairing is not open registration. `POST /v1/pair` requires `{ pairingCode }`, where the administrative API creates a cryptographically random one-time code with a 5-minute in-memory TTL after explicit user action. Test: valid code + Origin returns token once; reuse, expiry or different Origin fails.

- [ ] **Step 3: Confirm RED**

Run: `bun test apps/agent/test/http-api.test.ts`
Expected: FAIL because HTTP/auth modules are absent.

- [ ] **Step 4: Implement Bun HTTP routes and bounded request reading**

Bind explicitly to loopback. Set a concrete JSON body limit of 1 MiB for v1. Return JSON error envelopes `{ code, message, requestId }`. CORS must echo only an approved exact Origin; never use `Access-Control-Allow-Origin: *` on authenticated routes.

- [ ] **Step 5: Implement pairing/token verification**

Generate 32 random bytes with Web Crypto, return base64url token, persist only SHA-256 hash. Compare hashes with timing-safe equality. Rate-limit pairing and failed auth per Origin/loopback client; successful printing is limited separately so rapid legitimate checkout does not trip auth-abuse limits.

- [ ] **Step 6: Wire `POST /v1/print` to JobService**

Parse with `PrintJobSchema`; do not log request body. Duplicate jobs return existing status with HTTP 200. New accepted jobs return 202 and job status. Schema/auth failures never reserve a job.

- [ ] **Step 7: Verify and commit**

Run: `bun test apps/agent/test/http-api.test.ts`
Expected: PASS for all auth, pairing, size, duplicate and route cases.

```bash
git add apps/agent/src/http apps/agent/test/http-api.test.ts
git commit -m "feat: expose secure loopback print api"
```

### Task 13: Administrative API for GUI without exposing admin token to renderer

**Files:**
- Create: `apps/agent/src/http/admin-auth.ts`
- Create: `apps/agent/src/http/routes/admin-profiles.ts`
- Create: `apps/agent/src/http/routes/admin-templates.ts`
- Create: `apps/agent/src/http/routes/admin-diagnostics.ts`
- Create: `apps/agent/src/services/template-service.ts`
- Create: `apps/agent/src/services/profile-service.ts`
- Test: `apps/agent/test/admin-api.test.ts`

**Interfaces:**
- Administrative bearer credential is separate from ERP pairing tokens.
- Provides profile CRUD, template local CRUD/import/export, printer discovery/probe, pairing-code creation, test-print creation and recent technical job metadata (`limit <= 100`, default 20).
- Builtin templates cannot be edited/deleted; managed templates can be duplicated into local templates but not silently mutated by local edits.

- [ ] **Step 1: Write failing admin authorization/immutability tests**

Assert admin routes reject ERP tokens. Assert builtin update/delete returns `TEMPLATE_READ_ONLY`. Assert duplicating a managed template creates a new `source: 'local'` ID while preserving the managed original byte-for-byte.

- [ ] **Step 2: Write failing discovery/test-print tests**

Inject fake transports. `GET /admin/printers/discover?transport=system` must call discovery only once per request; no background timer. `POST /admin/test-print` must create an internal `type: 'test'` PrintJob and pass through JobService rather than calling transport directly.

- [ ] **Step 3: Confirm RED**

Run: `bun test apps/agent/test/admin-api.test.ts`
Expected: FAIL because admin routes/services are absent.

- [ ] **Step 4: Implement services and admin routes**

Admin token is provisioned during first-run database initialization from 32 random bytes; persist only its hash in SQLite and write the plaintext once into an owner-readable credential file for the Electron main process. Never return it from an HTTP endpoint.Recent job responses expose only jobId/type/profile/state/timestamps/duration/errorCode/reprintOf, never payload data. Template import must parse `TemplateDefinitionSchema`, reject source `builtin`, preserve revisions, and run fiscal guardrails before saving an invoice template. Profile save must parse `PrinterProfileSchema` and never probe hardware implicitly.

- [ ] **Step 5: Verify and commit**

Run: `bun test apps/agent/test/admin-api.test.ts && bun run typecheck`
Expected: PASS.

```bash
git add apps/agent/src/http apps/agent/src/services apps/agent/test/admin-api.test.ts
git commit -m "feat: expose print agent administration api"
```

### Task 14: Composition root, standalone build and resource gate

**Files:**
- Modify: `apps/agent/src/index.ts`
- Create: `apps/agent/src/config/paths.ts`
- Create: `apps/agent/src/config/runtime.ts`
- Create: `apps/agent/scripts/resource-smoke.ps1`
- Create: `apps/agent/test/startup.test.ts`
- Modify: root `package.json`

**Interfaces:**
- `apps/agent/src/index.ts` only constructs DB, repositories, transports, services and HTTP server.
- `bun run build:agent` emits a standalone Windows x64 executable.
- Port conflict exits with typed `PORT_IN_USE`; it never silently chooses another port.

- [ ] **Step 1: Write startup composition tests**

Inject temporary data dir and ephemeral port. Assert startup migrates DB, recovers interrupted jobs, registers no polling interval and serves health. Bind the same port first and assert second startup fails with `PORT_IN_USE`.

- [ ] **Step 2: Confirm RED**

Run: `bun test apps/agent/test/startup.test.ts`
Expected: FAIL until composition root is implemented.

- [ ] **Step 3: Implement composition and production paths**

On Windows use per-user application data, create directories with owner-only intent, and keep database/logs/credential file separate. Set `jobMetadataRetentionDays` default to 30. Register cleanup of terminal job metadata older than that retention at startup only when last cleanup is >=24h; never purge `QUEUED`, `SENDING` or `UNKNOWN`, and no recurring cleanup timer is required.

- [ ] **Step 4: Add standalone build script**

Root script must invoke:

```bash
bun build apps/agent/src/index.ts --compile --target=bun-windows-x64 --windows-hide-console --outfile dist/windows/impresora-pos-agent.exe
```

The build must fail if the chosen system-printer native boundary is not packaged successfully.

- [ ] **Step 5: Run full agent verification**

Run: `bun run check && bun run build:agent`
Expected: unit/integration suite PASS, typecheck PASS, standalone executable produced.

On Windows execute the built `.exe`, query `/v1/health`, perform one fake/network test and one real system-printer diagnostic where hardware exists.

- [ ] **Step 6: Execute resource smoke on Windows**

`resource-smoke.ps1` launches only `impresora-pos-agent.exe`, waits for health, samples CPU/RSS for 5 minutes, and fails when average CPU >0.2% or RSS >60 MB. It records the measured RSS against the <=40 MB target and verifies no Electron/Chromium child exists.

- [ ] **Step 7: Verify no idle hardware polling**

With transport fakes instrumented, hold agent idle for >60 seconds and assert zero `discover()`/`probe()` calls after startup. No timer may run hardware checks at intervals below 30 seconds; default is none.

- [ ] **Step 8: Commit**

```bash
git add apps/agent package.json bun.lock
git commit -m "feat: ship standalone bun print agent"
```

## Plan 1 Exit Gate

Do not begin the Electron GUI plan until all of these are true:

- `bun run check` passes from repository root.
- Windows spooler decision has fresh recorded evidence.
- Standalone `impresora-pos-agent.exe` serves health without Bun/Node/Electron installed.
- TCP fake captures exact ESC/POS bytes.
- One installed Windows printer can be enumerated and receive a RAW diagnostic job on available hardware.
- Duplicate `jobId` cannot invoke a transport twice.
- Restart maps interrupted `SENDING` to `UNKNOWN` without automatic printing.
- Security tests cover Origin, token, body size and one-time pairing.
- Logs contain no fixture PII/tokens.
- Idle resource smoke stays below the 60 MB regression ceiling and leaves 0 Chromium processes.
