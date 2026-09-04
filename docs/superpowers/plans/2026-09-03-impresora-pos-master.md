# Impresora POS Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ejecutar la construcción de Impresora POS desde repo vacío hasta un agente Bun instalable y production-ready con GUI Electron bajo demanda e integración segura con ERP web.

**Architecture:** La implementación está dividida en tres planes porque agente/hardware, GUI/editor y producción/ERP son subsistemas con gates independientes. Nunca se salta un exit gate: cada fase entrega software usable y reduce riesgo antes de introducir la siguiente.

**Tech Stack:** Bun + TypeScript, SQLite, ESC/POS encoder, Electron + React, NSIS/electron-builder, Windows CI, localhost HTTP.

**Spec:** `docs/superpowers/specs/2026-09-03-impresora-pos-design.md`

## Global Constraints

- El proceso residente es Bun; Electron sólo existe mientras la GUI está abierta.
- GUI cerrada significa 0 procesos Electron/Chromium de Impresora POS.
- No duplicar reglas de negocio/SRI del ERP.
- PrintJob declarativo; sin raw ESC/POS/HTML/JS desde ERP.
- Windows 10/11 x64 es el primer target de producción.
- TDD, commits pequeños y verificación fresca antes de cada gate.

---

## Execution Order

1. `docs/superpowers/plans/2026-09-03-agent-bun-printing.md`
2. `docs/superpowers/plans/2026-09-03-electron-gui-templates.md`
3. `docs/superpowers/plans/2026-09-03-erp-windows-production.md`

No ejecutar tareas del plan 2 hasta pasar el exit gate del plan 1. No ejecutar packaging/release del plan 3 hasta pasar el exit gate del plan 2.## Milestone A: Headless printing works without Electron

- [ ] Complete Plan 1 Tasks 1-4: workspace, contracts, SQLite and printer-core.
- [ ] Complete mandatory Windows spooler spike and commit evidence.
- [ ] Complete templates + shared layout + ESC/POS renderer.
- [ ] Complete TCP/system transports, queue and idempotency.
- [ ] Complete public/admin localhost APIs and logging security.
- [ ] Build standalone Windows Bun executable and pass resource gate.

**Acceptance:** From a machine without Electron running, a declarative PrintJob reaches fake TCP and an available real system printer; duplicate job IDs never send twice.

## Milestone B: Nontechnical configuration works

- [ ] Complete Plan 2 lifecycle/security foundation.
- [ ] Complete agent recovery, dashboard and first-run setup.
- [ ] Complete printer wizard and guided calibration.
- [ ] Complete template source rules and block editor/preview.
- [ ] Complete diagnostics and ERP pairing helper.
- [ ] Pass full Electron E2E and process-cleanup gate.

**Acceptance:** A user can configure and test a printer through GUI only; closing the window kills all Electron/Chromium processes while the Bun agent remains healthy.

## Milestone C: Installable ERP product works on Windows

- [ ] Complete Plan 3 browser client and reference ERP flow.
- [ ] Complete NSIS installer and Bun-only login autostart.
- [ ] Complete signed update verification/application flow.
- [ ] Complete Windows CI, clean-install and resource regression gates.
- [ ] Execute real hardware protocol and compatibility matrix.
- [ ] Pass final `check:release` and production checklist.

**Acceptance:** Clean Windows install -> configure -> pair ERP -> checkout print -> close GUI -> reboot/login -> print again without terminal, Ctrl+P or Electron resident.

## Implementation Discipline

For every task: read the task plus the approved spec, write the named failing test first, run it and observe the expected failure, implement only enough for that task, rerun the focused test, run the task-level broader gate, then commit with the specified message. Do not batch unrelated tasks into one commit.

When hardware is unavailable, use the specified fake/injected boundary for software progress, but never mark a real-hardware exit criterion passed until physical evidence exists.
