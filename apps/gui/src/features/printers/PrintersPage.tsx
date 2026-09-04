import { useState } from 'react';
import type { ImpresoraPosApi, PrinterProfile } from '../../app/agent-api';
import { PrinterWizard } from './PrinterWizard';
import { CalibrationWizard } from './CalibrationWizard';

export function PrintersPage({ api, onSaved }: { api: ImpresoraPosApi; onSaved?: () => void }) {
  const [profile, setProfile] = useState<PrinterProfile | null>(null);
  return <div className="page-stack"><PrinterWizard api={api} onSaved={saved => { setProfile(saved); onSaved?.(); }} />{profile && <CalibrationWizard api={api} profile={profile} onSaved={setProfile} />}</div>;
}
