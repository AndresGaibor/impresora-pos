import { useState } from 'react';
import type { ImpresoraPosApi, PrinterProfile } from '../../app/agent-api';

export type CalibrationObservation =
  | 'characters-incorrect'
  | 'cut-incorrect'
  | 'cut-confirmed';

export type JobVisualState = 'SENT' | 'FAILED' | 'UNKNOWN';
type TestResult = { jobId: string; state: JobVisualState };

interface CalibrationWizardProps {
  api: ImpresoraPosApi;
  profile: PrinterProfile;
  testResult?: TestResult;
  onSaved?: (profile: PrinterProfile) => void;
}

export function applyCalibrationObservation(profile: PrinterProfile, observation: CalibrationObservation): PrinterProfile {
  if (observation === 'cut-confirmed') return { ...profile, cut: false };
  return profile;
}

export function normalizeTestResult(result: { jobId: string; state: string }): TestResult {
  return { ...result, state: result.state === 'SENT' || result.state === 'FAILED' || result.state === 'UNKNOWN' ? result.state : 'UNKNOWN' };
}

export function buildTestMetadata(result: JobVisualState, at: string): Record<string, unknown> {
  return { lastTestResult: result, lastTestAt: at };
}

export function getCodepageMappings(): Array<{ value: PrinterProfile['codepageMapping']; label: string }> {
  return [
    { value: 'epson', label: 'Epson' },
    { value: 'standard', label: 'Estándar' },
    { value: 'custom', label: 'Personalizado' },
  ];
}

export function CalibrationWizard({ api, profile, testResult: initialTestResult, onSaved }: CalibrationWizardProps) {
  const [testResult, setTestResult] = useState<TestResult | undefined>(initialTestResult);
  const [message, setMessage] = useState<string | null>(null);
  const [mappingOptions, setMappingOptions] = useState(false);
  const [cutConfirmation, setCutConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async (nextProfile: PrinterProfile) => {
    const saved = await api.saveProfile(nextProfile);
    onSaved?.(saved);
  };

  const submitTestPrint = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.submitTestPrint(profile.id);
      const normalized = normalizeTestResult({ jobId: result.jobId, state: result.state });
      setTestResult(normalized);
      await save({ ...profile, testMetadata: { ...profile.testMetadata, ...buildTestMetadata(normalized.state, new Date().toISOString()) } });
    } catch {
      const lastTestAt = new Date().toISOString();
      setTestResult({ jobId: 'unknown', state: 'UNKNOWN' });
      try {
        await save({ ...profile, testMetadata: { ...profile.testMetadata, ...buildTestMetadata('UNKNOWN', lastTestAt) } });
      } catch {
        // Keep UNKNOWN visible even if persistence is unavailable.
      }
      setMessage('No se pudo enviar el diagnóstico. Estado: UNKNOWN.');
    } finally {
      setBusy(false);
    }
  };

  const chooseMapping = async (mapping: PrinterProfile['codepageMapping']) => {
    try {
      await save({ ...profile, codepageMapping: mapping });
      setMappingOptions(false);
      setMessage('Mapeo guardado.');
    } catch {
      setMessage('No se pudo guardar el mapeo.');
    }
  };

  const confirmCut = async () => {
    try {
      await save(applyCalibrationObservation(profile, 'cut-confirmed'));
      setCutConfirmation(false);
      setMessage('Corte automático desactivado.');
    } catch {
      setMessage('No se pudo guardar el cambio de corte.');
    }
  };

  return <section className="panel page-stack" aria-labelledby="calibration-title">
    <div><p className="eyebrow">Compatibilidad</p><h2 id="calibration-title">Calibra tu impresora</h2><p className="muted">Enviaremos una impresión normal con la plantilla de diagnóstico.</p></div>
    <button className="button button-primary" type="button" disabled={busy} onClick={() => void submitTestPrint()}>Imprimir diagnóstico</button>
    {testResult && <div className="notice" role="status"><strong>Estado del trabajo: {testResult.state}</strong><p>SENT indica que el agente envió el trabajo; SENT no confirma que salió papel.</p></div>}
    {testResult && <div className="page-stack">
      <p>¿Qué observaste en la impresión?</p>
      <button className="button button-quiet" type="button" onClick={() => setMappingOptions(true)}>Caracteres incorrectos</button>
      <button className="button button-quiet" type="button" onClick={() => setCutConfirmation(true)}>Corte incorrecto</button>
      {mappingOptions && <div role="group" aria-label="Mapeo de caracteres"><p>Elige un mapeo de código:</p>{getCodepageMappings().map(mapping => <button key={mapping.value} type="button" onClick={() => void chooseMapping(mapping.value)}>{mapping.label}</button>)}</div>}
      {cutConfirmation && <div role="alert"><p>¿Confirmas desactivar el corte automático?</p><button type="button" onClick={() => void confirmCut()}>Confirmar</button><button type="button" onClick={() => setCutConfirmation(false)}>Cancelar</button></div>}
    </div>}
    {message && <p className="notice notice-warning" role="status">{message}</p>}
  </section>;
}
