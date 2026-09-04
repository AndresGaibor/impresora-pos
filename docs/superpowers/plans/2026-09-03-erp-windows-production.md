# Impresora POS ERP Integration + Windows Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar el agente con ERPs web y entregar un instalador Windows per-user, autostart del agente Bun, actualización firmada, pruebas de recursos y una matriz verificable de compatibilidad de impresoras.

**Architecture:** El ERP consume un cliente web pequeño que habla con `127.0.0.1:18181`; no contiene ESC/POS. El instalador empaqueta agente Bun y GUI Electron como una sola versión, registra únicamente el agente en autostart y usa manifiestos firmados para updates. Producción se bloquea si recursos, seguridad, instalación limpia o impresión real no pasan.

**Tech Stack:** Bun browser package, fetch/AbortController, Electron Builder 26.15.3 + NSIS, PowerShell verification, GitHub Actions Windows runner, Web Crypto Ed25519/SHA-256, existing Bun agent and Electron GUI.

**Spec:** `docs/superpowers/specs/2026-09-03-impresora-pos-design.md`

## Global Constraints

- Requiere Plan 1 y Plan 2 completamente verdes.
- El ERP sólo envía PrintJob declarativo + IDs; no genera ni manda ESC/POS.
- Endpoint fijo: `http://127.0.0.1:18181`; conflicto de puerto es error visible.
- Autostart ejecuta `impresora-pos-agent.exe`, nunca Electron.
- Instalación MVP es per-user; no instala servicio Windows.
- Actualización nunca se aplica con jobs `QUEUED` o `SENDING`.
- Comprobación de update: al inicio y como máximo una vez cada 24h.
- Agente + GUI comparten una única versión del producto y se reemplazan juntos.
- Release Windows exige binarios firmados cuando exista certificado de producción configurado; CI de release falla si la firma requerida no está disponible.

---## File Structure Locked by This Plan

- `packages/web-client/src/*` — browser-only discovery/pairing/print/status client.
- `examples/erp-web/*` — reference integration and Local Network Access UX.
- `apps/agent/src/update/*` — signed manifest check/download/apply coordination.
- `apps/desktop/src/features/about/*` — version/update UI only.
- `build/windows/*` — NSIS/electron-builder hooks and install resources.
- `scripts/windows/*` — install/autostart/resource/process verification.
- `.github/workflows/windows-ci.yml` — Windows build/test gate.
- `.github/workflows/release.yml` — signed release artifacts and update manifest.
- `docs/hardware/compatibility.md` — evidence-based hardware matrix.

### Task 1: Browser ERP client package

**Files:**
- Create: `packages/web-client/package.json`
- Create: `packages/web-client/src/client.ts`
- Create: `packages/web-client/src/errors.ts`
- Create: `packages/web-client/src/storage.ts`
- Create: `packages/web-client/src/index.ts`
- Test: `packages/web-client/test/client.test.ts`

**Interfaces:**
- Produces `new ImpresoraPosClient({ origin, baseUrl?, tokenStore? })`.
- Methods: `health()`, `capabilities()`, `pair(code)`, `print(job)`, `getJob(jobId)`, `templates()`, `printerProfiles()`.
- Default base URL is exactly `http://127.0.0.1:18181`.

- [ ] **Step 1: Write failing fetch-contract tests**

Mock fetch and assert `print(job)` sends strict JSON, exact browser `Origin` is naturally provided by browser context, bearer token is attached after pairing, and a duplicate job response is returned without client-side retry-generated job IDs.

- [ ] **Step 2: Confirm RED**

Run: `bun test packages/web-client/test/client.test.ts`
Expected: FAIL because browser client is absent.

- [ ] **Step 3: Implement browser-only client**

Use `fetch` + `AbortController`; no Node imports. Token storage is injectable. Provide a default `localStorage` adapter only when explicitly selected by ERP integration; document that an ERP may choose its own secure application state. Do not log PrintJob bodies.

Classify connection errors into `AGENT_UNAVAILABLE`, `PAIRING_REQUIRED`, `LOCAL_NETWORK_PERMISSION_REQUIRED`, `API_INCOMPATIBLE`, `PRINT_REJECTED`; preserve server stable error code.

- [ ] **Step 4: Add compatibility preflight**

`health()` compares `apiVersion` and `templateSchemaVersion` against package-supported values before `print()`. Incompatibility fails before sending a job.

- [ ] **Step 5: Verify and commit**

Run: `bun test packages/web-client && bun run typecheck`
Expected: PASS.

```bash
git add packages/web-client
git commit -m "feat: add browser client for local print agent"
```

### Task 2: Reference ERP flow and Local Network Access UX

**Files:**
- Create: `examples/erp-web/index.html`
- Create: `examples/erp-web/src/main.ts`
- Create: `examples/erp-web/src/print-flow.ts`
- Create: `examples/erp-web/README.md`
- Test: `examples/erp-web/test/print-flow.test.ts`

**Interfaces:**
- Reference flow never generates ESC/POS; it constructs a PrintJob from already-final ERP data.
- UI distinguishes agent missing vs pairing needed vs Chromium Local Network Access permission.

- [ ] **Step 1: Write state-machine tests**

Given health fetch network error, show `Instalar o iniciar Impresora POS`. Given HTTP auth error, show `Vincular este ERP`. Given browser-local-network denial signature, show a concise permission explanation and retry button. Given incompatible API version, block printing and show required/current versions.

- [ ] **Step 2: Confirm RED and implement reference flow**

Run test, confirm failure, implement deterministic state mapping, rerun until PASS.

- [ ] **Step 3: Add reference PrintJob example**

Use an Ecuador invoice fixture with already-calculated strings, `templateId: 'ecuador-invoice-80-v1'`, stable ERP-generated `jobId`, and no fiscal computation in the example.

- [ ] **Step 4: Document browser requirements**

README must state HTTPS ERP origin, Chromium Local Network Access permission behavior, pairing ceremony, and that user should not use Ctrl+P for POS printing.

- [ ] **Step 5: Commit**

```bash
git add examples/erp-web
git commit -m "docs: add reference erp printing integration"
```

### Task 3: Product version coupling and installer layout

**Files:**
- Create: `electron-builder.yml`
- Create: `build/windows/installer.nsh`
- Create: `scripts/windows/verify-layout.ps1`
- Modify: root `package.json`
- Test: `tests/packaging/version-coupling.test.ts`

**Interfaces:**
- One root product version feeds agent health, GUI About and installer filename.
- Installer contains `impresora-pos-agent.exe`, GUI resources/exe, builtin assets and schema migrations.
- Electron GUI is not configured for login startup.

- [ ] **Step 1: Write version/layout test**

Assert root version equals the version exported by contracts/agent and desktop About build metadata. Assert packaging config copies the standalone Bun agent into a deterministic installed relative path and never marks Electron as `runAtLogin`.

- [ ] **Step 2: Confirm RED**

Run: `bun test tests/packaging/version-coupling.test.ts`
Expected: FAIL until packaging metadata exists.

- [ ] **Step 3: Configure electron-builder NSIS per-user install**

Set NSIS `perMachine: false`, one product version, deterministic artifact naming and extra resources for the Bun executable. Installer UI may open the GUI wizard after install; it must not launch Electron on subsequent logins.

- [ ] **Step 4: Add install-layout verification**

`verify-layout.ps1` checks installed agent path, GUI executable, data directory accessibility, owner-only ACL on the administrative credential file, and absence of a login-start entry pointing at Electron.

- [ ] **Step 5: Build unsigned development installer and verify**

Run: `bun run build:agent && bun run build:desktop && bun run package:windows:dev`
Expected: NSIS installer produced and layout script PASS on Windows test environment.

- [ ] **Step 6: Commit**

```bash
git add electron-builder.yml build/windows scripts/windows package.json tests/packaging
git commit -m "build: package agent and gui for windows"
```

### Task 4: Per-user agent autostart without Electron

**Files:**
- Create: `scripts/windows/register-autostart.ps1`
- Create: `scripts/windows/unregister-autostart.ps1`
- Extend: `build/windows/installer.nsh`
- Create: `scripts/windows/verify-autostart.ps1`

**Interfaces:**
- Uses `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` entry `ImpresoraPosAgent` pointing directly to installed `impresora-pos-agent.exe`.
- Uninstall removes only that owned registry value.

- [ ] **Step 1: Write verification script before installer hook**

`verify-autostart.ps1` must fail if registry target contains `electron`, desktop GUI executable name, missing agent path or extra unquoted arguments. It launches a fresh logon-equivalent process and waits for `/v1/health`.

- [ ] **Step 2: Wire install/uninstall hooks**

Register after files are installed and before first wizard launch. Remove on uninstall. Reinstall/update rewrites the same owned value idempotently.

- [ ] **Step 3: Verify on Windows**

Install, close GUI, terminate agent, invoke the registered command as a normal user, verify agent health and 0 Electron processes. Uninstall and assert registry value is gone.

- [ ] **Step 4: Commit**

```bash
git add build/windows scripts/windows
git commit -m "build: start bun print agent at user login"
```

### Task 5: Signed update manifest verification in the Bun agent

**Files:**
- Create: `apps/agent/src/update/schema.ts`
- Create: `apps/agent/src/update/verify.ts`
- Create: `apps/agent/src/update/checker.ts`
- Create: `apps/agent/src/update/state.ts`
- Create: `apps/agent/test/update.test.ts`
- Create: `tests/fixtures/update/test-public-key.txt`
- Create: `tests/fixtures/update/manifests/*`

**Interfaces:**
- Manifest fields: `version`, `url`, `sha256`, `publishedAt`, `signature`.
- Verification is Ed25519 over canonical unsigned manifest JSON; artifact must also match SHA-256.
- Production public key is compiled/configured in agent; test fixtures use a separate test key pair.

- [ ] **Step 1: Write failing crypto/policy tests**

Tests must accept valid signed manifest and reject changed version/url/hash, invalid signature, downgrade/equal version and artifact hash mismatch. Assert update check is skipped when `lastCheckAt` is less than 24h ago except explicit admin manual check.

- [ ] **Step 2: Confirm RED**

Run: `bun test apps/agent/test/update.test.ts`
Expected: FAIL because update modules are absent.

- [ ] **Step 3: Implement canonical verification and state**

Parse strict schema, canonicalize only unsigned fields in fixed key order, verify Ed25519 before trusting URL, download to a temp file, stream SHA-256, then persist only update metadata/path. Never execute an unverified file.

- [ ] **Step 4: Enforce idle application policy**

Wire one update check into agent startup; `lastCheckAt` prevents another automatic check before 24h and no faster timer is created. `canApplyUpdate()` returns false while any durable/in-memory job is `QUEUED` or `SENDING`. `UNKNOWN`, `SENT`, `FAILED` do not block once no active queue item exists. Application is an explicit administrative action in v1; background checking alone never terminates the running process.

- [ ] **Step 5: Verify and commit**

Run: `bun test apps/agent/test/update.test.ts`
Expected: PASS for crypto, cadence and busy-agent policies.

```bash
git add apps/agent/src/update apps/agent/test/update.test.ts tests/fixtures/update
git commit -m "feat: verify signed print agent updates"
```

### Task 6: Update UI and safe installer launch

**Files:**
- Create: `apps/desktop/src/features/about/AboutPage.tsx`
- Extend: `apps/desktop/electron/agent-client.ts`
- Create: `apps/agent/src/http/routes/admin-update.ts`
- Test: `apps/desktop/src/features/about/AboutPage.test.tsx`
- Test: `apps/agent/test/admin-update.test.ts`

**Interfaces:**
- Admin API exposes update state/check/apply; apply succeeds only for verified staged installer and idle queue.
- GUI displays current version and available version, but never performs download/hash/signature logic itself.

- [ ] **Step 1: Write update UI/API tests**

Assert busy agent returns `UPDATE_DEFERRED_BUSY`; invalid/unverified state cannot apply; available verified update renders version + action. If no update, UI renders current version only.

- [ ] **Step 2: Confirm RED and implement endpoints/UI**

Run both tests, confirm failure, implement narrow endpoints and About page, rerun until PASS.

- [ ] **Step 3: Implement safe installer spawn**

Agent re-verifies staged file hash immediately before spawn, launches installer detached, and only then performs orderly server shutdown if installer launch succeeded. If spawn fails, agent stays running and records technical error.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/http/routes/admin-update.ts apps/agent/test/admin-update.test.ts apps/desktop/src/features/about apps/desktop/electron
git commit -m "feat: apply verified updates from configurator"
```

### Task 7: Release manifest generation and signing pipeline

**Files:**
- Create: `scripts/release/create-update-manifest.ts`
- Create: `scripts/release/sign-update-manifest.ts`
- Create: `.github/workflows/release.yml`
- Test: `scripts/release/release-scripts.test.ts`

**Interfaces:**
- CI input private signing key is supplied only as a repository/environment secret; it is never committed.
- Output manifest matches the agent schema exactly and references the signed installer artifact SHA-256.

- [ ] **Step 1: Write deterministic manifest/signature tests with test key**

Given fixed artifact bytes/version/URL/date, assert exact unsigned canonical JSON, SHA-256 and a signature verifiable by the test public key. Mutating URL after signing must fail verification.

- [ ] **Step 2: Confirm RED and implement release scripts**

Run test, confirm failure, implement scripts using Web Crypto/Node-compatible crypto available under Bun, rerun until PASS.

- [ ] **Step 3: Configure Windows release workflow**

Workflow order: checkout -> Bun install frozen -> full check -> build agent -> build GUI -> package NSIS -> code-sign Windows artifacts when production certificate secrets are present/required -> compute SHA-256 -> create signed update manifest -> verify manifest using public key -> publish artifacts together.

Release workflow must fail rather than publish an unsigned production artifact when release signing is configured as required.

- [ ] **Step 4: Commit**

```bash
git add scripts/release .github/workflows/release.yml
git commit -m "ci: sign windows release update manifests"
```

### Task 8: Windows CI and clean-install E2E

**Files:**
- Create: `.github/workflows/windows-ci.yml`
- Create: `scripts/windows/install-e2e.ps1`
- Create: `scripts/windows/uninstall-e2e.ps1`
- Create: `scripts/windows/process-audit.ps1`

**Interfaces:**
- Windows CI is mandatory for pull requests that touch agent/native/packaging code.
- Clean-install E2E runs installer as normal user context, not as a system service.

- [ ] **Step 1: Implement clean-install script assertions**

Script installs dev installer, verifies files/autostart, launches agent, checks health/version, launches GUI once, closes it, verifies agent remains, runs process audit, then uninstalls and verifies owned autostart/files are removed. Preserve user data only according to explicit uninstall choice; test both clean and preserve paths if installer exposes both.

- [ ] **Step 2: Add CI workflow**

Run pure tests, desktop E2E, compiled-agent smoke and installer E2E on `windows-latest`. Hardware-specific real printing remains a manual/release lab gate, while network transport uses local fake TCP in CI.

- [ ] **Step 3: Verify workflow locally where possible and commit**

```bash
git add .github/workflows/windows-ci.yml scripts/windows
git commit -m "ci: verify windows install and process lifecycle"
```

### Task 9: Production resource regression gate

**Files:**
- Extend: `apps/agent/scripts/resource-smoke.ps1`
- Extend: `scripts/windows/process-audit.ps1`
- Create: `docs/performance/windows-reference.md`

**Interfaces:**
- Gate runs installed production-shaped agent, not `bun run` development process.
- Fails above 60 MB RSS or 0.2% average CPU over 5 idle minutes; records <=40 MB as target status.
- Fails if Impresora POS owns any Electron/Chromium process after GUI close.

- [ ] **Step 1: Make process ownership audit deterministic**

Track installer paths/PIDs rather than matching every system Chrome process. Audit agent process tree, GUI launch tree and executable paths. Record sample interval, average/max RSS and CPU in machine-readable JSON plus Markdown summary.

- [ ] **Step 2: Add idle/no-polling assertion**

Run with agent debug metrics that count `discover`/`probe`; after 5 idle minutes counts must remain unchanged. Update check may run at startup only and must not repeat during the sample.

- [ ] **Step 3: Establish reference baseline on Windows 11 x64**

Record CPU/RSS, startup time, health latency and GUI open/close residue. If RSS is 40..60 MB document it as above-target investigation; >60 MB blocks production.

- [ ] **Step 4: Commit measured evidence**

```bash
git add apps/agent/scripts/resource-smoke.ps1 scripts/windows/process-audit.ps1 docs/performance/windows-reference.md
git commit -m "test: gate resident print agent resources"
```

### Task 10: Hardware compatibility matrix and release acceptance

**Files:**
- Create: `docs/hardware/test-protocol.md`
- Create: `docs/hardware/compatibility.md`
- Create: `scripts/windows/hardware-diagnostic.ps1`

**Interfaces:**
- Compatibility claims are evidence-based per model/transport; no blanket `100% compatible` claim.
- Required tests: discovery, RAW/TCP send, 58/80 columns as applicable, accents/ñ, bold/size, Code128, QR, cut, drawer when available, repeated jobs and reconnect/restart.

- [ ] **Step 1: Define repeatable hardware protocol**

For each printer record manufacturer/model, connection, driver version, firmware if visible, profile values, test date, Windows version and pass/fail per capability. Do not record customer invoice content.

- [ ] **Step 2: Execute minimum release hardware set**

Before calling v1 production-ready, test at least: one generic ESC/POS 80 mm USB/system-spooler printer and one TCP 9100 printer. If 58 mm is advertised as production-supported, add one real 58 mm device before release; otherwise mark 58 mm renderer tested but hardware-unverified.

- [ ] **Step 3: Test failure/recovery cases physically**

Power printer off during send, remove paper when status is detectable, restart agent between jobs, repeat same `jobId`, then perform explicit `reprintOf`. Confirm duplicate never prints twice and ambiguous interrupted job is not automatically resent.

- [ ] **Step 4: Record only verified capability claims and commit**

```bash
git add docs/hardware scripts/windows/hardware-diagnostic.ps1
git commit -m "docs: certify tested thermal printer compatibility"
```

### Task 11: ERP-managed templates and remote configurator launch

**Files:**
- Modify: `packages/web-client/src/client.ts`
- Create: `apps/agent/src/http/routes/managed-templates.ts`
- Create: `apps/agent/src/http/routes/open-ui.ts`
- Create: `apps/agent/src/services/ui-launcher.ts`
- Modify: `apps/desktop/electron/main.ts`
- Test: `apps/agent/test/erp-management.test.ts`
- Test: `apps/desktop/e2e/single-instance.spec.ts`

**Interfaces:**
- Web client adds `upsertManagedTemplate(template)`, `deleteManagedTemplate(id)` and `openConfigurator()`.
- A managed template is owned by the paired exact Origin; another Origin cannot update/delete it.
- `POST /v1/open-ui` requires a valid paired ERP token and launches the installed GUI, never Electron internals in the agent.

- [ ] **Step 1: Write ownership and launch authorization tests**

Pair Origin A and B. A creates managed template `invoice-store-a`; B update/delete must return `FORBIDDEN_TEMPLATE_OWNER`. A may update it after fiscal/schema validation. Unauthenticated/wrong-Origin `/v1/open-ui` must fail before spawning anything.

- [ ] **Step 2: Add DB migration for managed owner**

Persist `owner_origin` only for `source: managed`; builtin/local keep it null. Migration is transactional and preserves existing template revisions.

- [ ] **Step 3: Implement managed-template routes and browser methods**

The agent overwrites incoming `source` to `managed` and owner to authenticated Origin; ERP cannot create builtin/local through this route. Every save runs TemplateDefinition schema and fiscal guardrails.

- [ ] **Step 4: Implement authenticated GUI launch**

`UiLauncher` resolves the installed desktop executable and spawns it detached with hidden console semantics. Electron main uses `app.requestSingleInstanceLock()` so repeated ERP clicks focus the existing GUI rather than creating duplicate configurators. Support `--diagnostics` to open Diagnostics directly for support use.

- [ ] **Step 5: Verify and commit**

Run agent management tests + desktop single-instance E2E; expected PASS.

```bash
git add packages/web-client apps/agent apps/desktop
git commit -m "feat: let paired erps manage templates and open setup"
```

### Task 12: Final production gate

**Files:**
- Create: `docs/release/production-checklist.md`
- Modify: root `package.json` with `check:release`.

**Interfaces:**
- `check:release` is the single pre-release software gate; hardware checklist remains separately signed off with evidence.

- [ ] **Step 1: Encode software gate**

`check:release` runs frozen install verification, all unit/integration tests, typecheck, agent compile, desktop build/E2E, Windows installer E2E where invoked in Windows CI, security leakage tests and release-script tests. Any skipped mandatory test is a failure in release CI.

- [ ] **Step 2: Write checklist mapped to spec Definition of Done**

Checklist explicitly covers: install without commands, Bun-only idle, system/TCP printer, guided compatibility print, template editor/preview, authenticated ERP PrintJob, idempotent print, restart ambiguity, sanitized diagnostics, CPU/RAM target, signed update artifacts and no Electron residue.

- [ ] **Step 3: Run fresh complete verification**

Run on Linux/WSL for pure suite: `bun install --frozen-lockfile && bun run check`.
Run on Windows reference machine/CI: `bun run check:release`, installer E2E and resource smoke.
Expected: zero failures; hardware protocol evidence attached for advertised transports.

- [ ] **Step 4: Commit release gate**

```bash
git add docs/release package.json
git commit -m "chore: define impresora pos production gate"
```

## Plan 3 Exit Gate

Production-ready may be stated only when:

- ERP reference integration prints through localhost with pairing and LNA UX.
- Installed Windows login starts only the Bun agent.
- Closing GUI leaves 0 Electron/Chromium processes belonging to Impresora POS.
- Agent idle resource gate passes and hardware discovery does not poll in background.
- Installer/update artifacts are version-coupled and cryptographically verified.
- Update application is blocked while active jobs exist.
- Clean install/uninstall E2E passes as normal user.
- Real USB/system and TCP hardware evidence matches advertised support.
- `check:release` and the production checklist have fresh evidence from the release candidate.
