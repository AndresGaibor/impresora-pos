# Impresora POS Electron GUI + Template Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir una GUI Electron bajo demanda que configure el agente Bun sin quedarse residente: onboarding, detección/prueba de impresoras, perfiles, calibración, editor declarativo de plantillas, preview y diagnóstico.

**Architecture:** Electron contiene un proceso main mínimo y un renderer React. El main posee la credencial administrativa y funciona como bridge estrecho hacia el agente; el renderer nunca ve tokens ni accede directamente a hardware. Al cerrar la última ventana, `app.quit()` termina Electron por completo.

**Tech Stack:** Electron 44.1.1, React, Vite, TypeScript, Bun workspaces/scripts, Zod/contracts compartidos, Playwright Electron para E2E, CSS simple sin framework visual obligatorio.

**Spec:** `docs/superpowers/specs/2026-09-03-impresora-pos-design.md`

## Global Constraints

- Requiere que el Plan 1 esté completamente verde.
- Electron es sólo interfaz; no imprime, no abre sockets de impresora y no importa addons nativos de spooler.
- Cerrar la última ventana debe dejar 0 procesos Electron/Chromium.
- No existe tray Electron.
- El admin token sólo vive en Electron main y nunca cruza `contextBridge`.
- La GUI usa exclusivamente la API administrativa del agente.
- La interfaz final no requiere terminal ni comandos.
- El editor es por bloques; no permite HTML/JS libre ni expresiones ejecutables.
- Preview y ESC/POS comparten `LayoutModel` del paquete renderer.

---## File Structure Locked by This Plan

- `apps/desktop/electron/main.ts` — Electron lifecycle/composition only.
- `apps/desktop/electron/agent-client.ts` — authenticated admin HTTP client.
- `apps/desktop/electron/agent-launcher.ts` — starts installed Bun agent when health is unavailable.
- `apps/desktop/electron/preload.ts` — typed safe bridge only.
- `apps/desktop/src/app/*` — routing and application shell.
- `apps/desktop/src/features/setup/*` — first-run wizard.
- `apps/desktop/src/features/printers/*` — discovery, profiles and calibration.
- `apps/desktop/src/features/templates/*` — block editor and preview.
- `apps/desktop/src/features/diagnostics/*` — sanitized support workflow.
- `apps/desktop/src/features/dashboard/*` — current status/history summary.
- `apps/desktop/e2e/*` — Electron process/UI tests.

### Task 1: Bootstrap Electron + React without resident behavior

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/vite.config.ts`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/electron/main.ts`
- Create: `apps/desktop/electron/preload.ts`
- Create: `apps/desktop/src/main.tsx`
- Create: `apps/desktop/src/app/App.tsx`
- Test: `apps/desktop/e2e/lifecycle.spec.ts`

**Interfaces:**
- Main exposes only the preload bridge declared later; no Node integration in renderer.
- Produces root scripts `dev:desktop`, `build:desktop`, `test:e2e:desktop`.

- [ ] **Step 1: Write lifecycle E2E first**

Launch Electron with Playwright, wait for the first window, close it, then poll OS process list and assert the launched Electron PID exits. On Windows also assert no descendant process whose executable name contains `electron`, `chrome` or `chromium` remains for this app.

- [ ] **Step 2: Confirm RED**

Run: `bun run test:e2e:desktop -- lifecycle.spec.ts`
Expected: FAIL because desktop app does not exist.

- [ ] **Step 3: Implement secure minimal BrowserWindow**

Use `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` where compatible with preload needs. Reject arbitrary navigation/new-window requests. On `window-all-closed`, always call `app.quit()` including macOS; do not install tray or background window.

- [ ] **Step 4: Build and verify lifecycle**

Run: `bun run build:desktop && bun run test:e2e:desktop -- lifecycle.spec.ts`
Expected: PASS and Electron exits after closing the last window.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop package.json bun.lock
git commit -m "feat: bootstrap on-demand electron configurator"
```

### Task 2: Electron main agent client and safe preload bridge

**Files:**
- Create: `apps/desktop/electron/agent-client.ts`
- Create: `apps/desktop/electron/credential.ts`
- Modify: `apps/desktop/electron/preload.ts`
- Create: `apps/desktop/src/app/agent-api.ts`
- Test: `apps/desktop/electron/agent-client.test.ts`
- Test: `apps/desktop/e2e/security.spec.ts`

**Interfaces:**
- Renderer receives `window.impresoraPos` with named methods, never generic `fetch`, filesystem or shell access.
- Main reads admin credential file and attaches bearer token to admin calls.

- [ ] **Step 1: Write bridge exposure tests**

```ts
expect(Object.keys(window.impresoraPos).sort()).toEqual([
  'createPairingCode','discoverPrinters','exportDiagnostics','getDashboard',
  'getProfiles','getTemplates','probePrinter','saveProfile','saveTemplate','submitTestPrint'
].sort());
expect((window as any).process).toBeUndefined();
expect(JSON.stringify(window.impresoraPos)).not.toContain('Bearer');
```

- [ ] **Step 2: Confirm RED**

Run unit agent-client test and `security.spec.ts`; expected FAIL until client/bridge exist.

- [ ] **Step 3: Implement typed IPC handlers**

Preload sends named IPC requests. Main handlers validate request/response with shared Zod DTOs before calling the agent. Do not expose token, arbitrary URL, path or HTTP method parameters to renderer code.

- [ ] **Step 4: Verify renderer cannot retrieve secret**

E2E must inspect preload API, devtools-disabled production settings and renderer globals; token string used by fake agent must never appear in DOM, localStorage, sessionStorage or IPC response bodies.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron apps/desktop/src/app apps/desktop/e2e/security.spec.ts
git commit -m "feat: bridge electron ui to bun agent safely"
```

### Task 3: Start/recover agent when GUI opens

**Files:**
- Create: `apps/desktop/electron/agent-launcher.ts`
- Modify: `apps/desktop/electron/main.ts`
- Test: `apps/desktop/electron/agent-launcher.test.ts`

**Interfaces:**
- Produces `ensureAgentRunning(): Promise<AgentAvailability>`.
- It first probes `127.0.0.1:18181`; only if unavailable does it launch the installed Bun executable.

- [ ] **Step 1: Write launcher state tests**

Cases: healthy agent -> zero spawn calls; unavailable agent -> spawn once then health succeeds; executable missing -> actionable `AGENT_NOT_INSTALLED`; port occupied by wrong process -> `PORT_IN_USE` diagnostic, not repeated spawning.

- [ ] **Step 2: Confirm RED**

Run: `bun test apps/desktop/electron/agent-launcher.test.ts`
Expected: FAIL because launcher is missing.

- [ ] **Step 3: Implement bounded launch sequence**

Resolve the installed agent path from application resources/config, spawn detached with no console window on Windows, then make bounded health retries. The GUI must not become the agent parent that keeps Electron alive; launched agent lifecycle is independent.

- [ ] **Step 4: Verify close behavior with agent running**

E2E: start fake/real agent, launch Electron, close Electron, assert agent remains and Electron exits. Then stop agent explicitly from test teardown.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron apps/desktop/e2e
git commit -m "feat: recover local agent from configurator"
```

### Task 4: Dashboard and first-run routing

**Files:**
- Create: `apps/desktop/src/app/routes.tsx`
- Create: `apps/desktop/src/app/Shell.tsx`
- Create: `apps/desktop/src/features/dashboard/DashboardPage.tsx`
- Create: `apps/desktop/src/features/setup/SetupPage.tsx`
- Test: `apps/desktop/src/features/dashboard/DashboardPage.test.tsx`
- Test: `apps/desktop/e2e/first-run.spec.ts`

**Interfaces:**
- Dashboard consumes one typed `getDashboard()` aggregate from main/agent, avoiding many polling calls.
- First run routes to Setup only when no usable printer profile exists.

- [ ] **Step 1: Write dashboard rendering tests**

Given aggregate `{ agent:'online', profile:{ name:'XP-80C', paperWidthMm:80 }, lastJob:{ state:'SENT', at:'...' }, recentJobs:[{jobId:'A',state:'SENT'}] }`, assert the page renders `Agente conectado`, printer name, `80 mm` and a human-readable last send. Given no profile, assert Setup call-to-action appears.

- [ ] **Step 2: Confirm RED**

Run component test and `first-run.spec.ts`; expected FAIL.

- [ ] **Step 3: Implement shell with no background polling loop**

Load dashboard including the most recent 20 technical job metadata rows on page entry and on explicit refresh or meaningful completed action. Do not add sub-30-second hardware polling. Navigation: Dashboard, Configuración, Impresoras, Plantillas, Diagnóstico, Acerca de.

- [ ] **Step 4: Verify and commit**

Run: `bun test apps/desktop/src/features/dashboard && bun run test:e2e:desktop -- first-run.spec.ts`
Expected: PASS.

```bash
git add apps/desktop/src
git commit -m "feat: add print agent dashboard and setup entry"
```

### Task 5: Guided printer discovery and profile creation

**Files:**
- Create: `apps/desktop/src/features/printers/PrintersPage.tsx`
- Create: `apps/desktop/src/features/printers/PrinterWizard.tsx`
- Create: `apps/desktop/src/features/printers/ProfileForm.tsx`
- Test: `apps/desktop/src/features/printers/PrinterWizard.test.tsx`
- Test: `apps/desktop/e2e/printer-setup.spec.ts`

**Interfaces:**
- Wizard calls `discoverPrinters('system')` only on user entry/refresh.
- Network profile uses explicit host + port default shown as 9100 and `probePrinter()` on button click.
- Saved profile includes paper 58/80, columns, codepage mapping, cut/drawer capability and default templates.

- [ ] **Step 1: Write system/network wizard tests**

Mock discovery with `XP-80C` and `EPSON TM-T20III`; selecting one then saving must call `saveProfile()` with exact normalized device. Network mode must reject invalid IP/hostname or port outside 1..65535 and must not save before explicit probe result is shown.

- [ ] **Step 2: Confirm RED**

Run printer component + E2E tests; expected FAIL.

- [ ] **Step 3: Implement guided screens**

Flow: connection type -> detect/enter device -> paper width -> columns -> codepage -> capabilities -> probe -> save. Use safe defaults: 80 mm/48 columns for a new 80 mm profile and 58 mm/32 columns for a new 58 mm profile, but always allow adjustment because physical printers vary.

- [ ] **Step 4: Verify discovery is on demand**

E2E fake agent records calls. Leave Printers page open for 60 seconds; assert no repeated discovery/probe calls occur without user input.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/printers apps/desktop/e2e/printer-setup.spec.ts
git commit -m "feat: guide printer detection and configuration"
```

### Task 6: Compatibility test and calibration workflow

**Files:**
- Create: `apps/desktop/src/features/printers/CalibrationWizard.tsx`
- Create: `packages/templates/src/builtins/printer-diagnostic-v1.ts`
- Test: `apps/desktop/src/features/printers/CalibrationWizard.test.tsx`
- Test: `apps/desktop/e2e/calibration.spec.ts`

**Interfaces:**
- `submitTestPrint()` creates a normal internal PrintJob using `printer-diagnostic-v1`.
- Calibration captures user observations and converts them into profile changes; it never sends raw commands.

- [ ] **Step 1: Write calibration behavior tests**

Assert diagnostic template includes visible samples for 48/32-column ruler, `á é í ó ú ñ Ñ`, bold, double size, Code 128, QR and optional cut. When user answers `characters incorrect`, wizard offers concrete codepage mappings; when `cut incorrect`, it saves `cut: false` only after confirmation.

- [ ] **Step 2: Confirm RED**

Run calibration tests; expected FAIL.

- [ ] **Step 3: Implement test-print feedback loop**

After each print show actual job status (`SENT`, `FAILED`, `UNKNOWN`) before asking visual questions. Never label `SENT` as physically printed. Save `lastTestResult` and `lastTestAt` via the profile API.

- [ ] **Step 4: Verify and commit**

Run unit + `calibration.spec.ts`; expected PASS.

```bash
git add apps/desktop/src/features/printers packages/templates apps/desktop/e2e/calibration.spec.ts
git commit -m "feat: calibrate thermal printers interactively"
```

### Task 7: Template library and duplicate-to-customize behavior

**Files:**
- Create: `apps/desktop/src/features/templates/TemplatesPage.tsx`
- Create: `apps/desktop/src/features/templates/TemplateCard.tsx`
- Test: `apps/desktop/src/features/templates/TemplatesPage.test.tsx`

**Interfaces:**
- Displays `builtin`, `managed`, `local` source explicitly.
- Builtin cannot edit/delete; managed exposes `Duplicar para personalizar`; local exposes edit/export/delete.

- [ ] **Step 1: Write source-permission tests**

Render one template of each source. Assert edit/delete buttons are absent for builtin, direct edit absent for managed, and duplicate action calls `saveTemplate()` with a new local ID/source.

- [ ] **Step 2: Confirm RED**

Run: `bun test apps/desktop/src/features/templates/TemplatesPage.test.tsx`
Expected: FAIL until template library exists.

- [ ] **Step 3: Implement template list/import/export UI**

Import reads a user-selected JSON file through a main-process dialog/bridge, sends its parsed text to the agent for schema validation, and displays agent errors. Export asks the agent for sanitized TemplateDefinition and writes it through main; renderer never receives arbitrary filesystem paths.

- [ ] **Step 4: Verify and commit**

Run template page tests and typecheck; expected PASS.

```bash
git add apps/desktop/src/features/templates apps/desktop/electron
git commit -m "feat: manage local print templates"
```

### Task 8: Block editor with shared preview model

**Files:**
- Create: `apps/desktop/src/features/templates/TemplateEditorPage.tsx`
- Create: `apps/desktop/src/features/templates/BlockList.tsx`
- Create: `apps/desktop/src/features/templates/BlockInspector.tsx`
- Create: `apps/desktop/src/features/templates/ReceiptPreview.tsx`
- Create: `apps/desktop/src/features/templates/editor-state.ts`
- Test: `apps/desktop/src/features/templates/editor-state.test.ts`
- Test: `apps/desktop/e2e/template-editor.spec.ts`

**Interfaces:**
- Editor state manipulates `TemplateDefinition`, never ESC/POS.
- Preview receives `PreviewDocument` generated from shared renderer/layout code using a fixture data set + selected profile.
- Supported edits v1: reorder, add approved block, remove non-required block, alignment, bold, size, label, spacing, visibility.

- [ ] **Step 1: Write reducer/state tests**

Test moving block index 4 -> 2 preserves IDs; editing alignment changes only that block; deleting a required fiscal-role block causes guardrail result `valid:false`; adding a block type outside schema is impossible through typed action union.

- [ ] **Step 2: Confirm RED**

Run editor-state test; expected FAIL.

- [ ] **Step 3: Implement editor and preview without free-form canvas**

Use drag/drop only to reorder vertical blocks. Inspector controls use constrained selects/toggles/numeric spacing. `ReceiptPreview` renders rows/cells from `PreviewDocument` in a fixed-paper viewport representing configured columns; it does not independently reinterpret template fields.

- [ ] **Step 4: Enforce fiscal guardrails before save**

Save button remains disabled while required semantic roles are missing. Show exactly which roles are missing. Copy must state that this is a configuration guardrail, not an automatic legal compliance certification.

- [ ] **Step 5: E2E editor workflow**

Duplicate `ecuador-invoice-80-v1`, move logo below issuer name, change footer label, preview it, save, reopen and assert changes persist. Attempt removing access key and assert save is blocked.

- [ ] **Step 6: Verify and commit**

Run editor unit + E2E tests; expected PASS.

```bash
git add apps/desktop/src/features/templates apps/desktop/e2e/template-editor.spec.ts
git commit -m "feat: edit receipt templates with live preview"
```

### Task 9: Diagnostics and sanitized support export

**Files:**
- Create: `apps/desktop/src/features/diagnostics/DiagnosticsPage.tsx`
- Create: `apps/desktop/src/features/diagnostics/DiagnosticSteps.tsx`
- Test: `apps/desktop/src/features/diagnostics/DiagnosticsPage.test.tsx`
- Test: `apps/desktop/e2e/diagnostics.spec.ts`

**Interfaces:**
- Diagnostic sequence: agent -> printers -> profile -> transport -> compatibility print -> width/chars -> cut/drawer -> export.
- Export is generated by agent/main and excludes ticket payloads, pairing/admin tokens and customer data.

- [ ] **Step 1: Write failing diagnostic state tests**

Given `NETWORK_TIMEOUT`, render actionable text naming host/port and suggesting connection checks without exposing secrets. Given `SPOOLER_REJECTED`, point user to installed printer/driver status. Ensure export preview does not contain fixture PII/token strings.

- [ ] **Step 2: Confirm RED**

Run diagnostic component/E2E tests; expected FAIL.

- [ ] **Step 3: Implement guided diagnostic state machine**

Each step has `pending | pass | fail | unknown`; unknown hardware confirmation is displayed honestly. Export includes app/agent versions, OS, profile non-secret fields, stable error codes, durations and test timestamps only.

- [ ] **Step 4: Verify and commit**

Run diagnostics tests; expected PASS and sensitive fixture scan empty.

```bash
git add apps/desktop/src/features/diagnostics apps/desktop/e2e/diagnostics.spec.ts
git commit -m "feat: guide sanitized printer diagnostics"
```

### Task 10: ERP pairing helper UI

**Files:**
- Create: `apps/desktop/src/features/setup/PairingPanel.tsx`
- Test: `apps/desktop/src/features/setup/PairingPanel.test.tsx`

**Interfaces:**
- User explicitly clicks `Vincular ERP`, which calls `createPairingCode()`.
- UI displays one-time code, approved Origin field and 5-minute expiry; no ERP bearer token is ever displayed.

- [ ] **Step 1: Write pairing UI tests**

Assert no pairing code exists before click. After click, render code + expiry. On expiry, disable copy/use and require generating a new code. Validate Origin as `https://` production origin except explicit local development mode.

- [ ] **Step 2: Confirm RED and implement**

Run test, confirm failure, implement minimal panel, rerun until PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/features/setup
git commit -m "feat: guide secure erp pairing"
```

### Task 11: Full GUI E2E and zero-Electron residue gate

**Files:**
- Create: `apps/desktop/e2e/full-flow.spec.ts`
- Create: `apps/desktop/e2e/process-cleanup.spec.ts`
- Modify: root `package.json`

**Interfaces:**
- Root `check:desktop` runs desktop unit, typecheck, build and Electron E2E.
- E2E uses a real Bun test agent with fake printer transports; no mocked renderer-only shortcut.

- [ ] **Step 1: Write end-to-end happy path**

Flow: clean profile -> GUI starts agent -> Setup -> discover fake system printer -> create 80 mm profile -> run compatibility test -> save -> duplicate invoice template -> edit footer -> preview -> save -> return Dashboard -> close GUI.

Assert fake transport received bytes through JobService and durable job state is `SENT`.

- [ ] **Step 2: Write failure flows**

Cover agent missing, port conflict, network timeout, spooler rejection, invalid imported template and interrupted/UNKNOWN test job. Each must lead to actionable UI and no renderer crash.

- [ ] **Step 3: Verify Electron cleanup explicitly**

After each E2E app closure, wait for the launched main PID to exit and enumerate descendants/processes. Fail if this app leaves Electron/Chromium processes. Verify agent PID remains alive independently until test teardown.

- [ ] **Step 4: Run complete desktop gate**

Run: `bun run check:desktop`
Expected: all desktop unit/E2E tests PASS, production renderer build succeeds, lifecycle/security tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop package.json bun.lock
git commit -m "test: verify complete printer configuration flow"
```

## Plan 2 Exit Gate

Do not begin production packaging/ERP integration until:

- A nontechnical user can configure a fake/real printer without terminal commands.
- Test print travels GUI -> agent -> JobService -> renderer -> transport.
- Builtin/managed/local template permissions are enforced.
- Fiscal guardrails block saving an invoice template missing required semantic roles.
- Preview uses the shared LayoutModel.
- Pairing requires explicit user action and expires.
- Diagnostics export passes a sensitive-string scan.
- Closing the GUI leaves the Bun agent alive and exactly 0 Electron/Chromium processes for Impresora POS.
