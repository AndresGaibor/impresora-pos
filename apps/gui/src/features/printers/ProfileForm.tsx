import type { PrinterProfile } from '../../app/agent-api';

export interface ProfileFormValues {
  name: string;
  paperWidthMm: 58 | 80;
  columns: number;
  codepageMapping: 'epson' | 'standard' | 'custom';
  cut: boolean;
  drawer: boolean;
}

interface ProfileFormProps {
  value: ProfileFormValues;
  onChange: (value: ProfileFormValues) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

export function ProfileForm({ value, onChange, onSubmit, disabled = false }: ProfileFormProps) {
  const update = (patch: Partial<ProfileFormValues>) => onChange({ ...value, ...patch });
  return <form className="panel page-stack" onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    <div><p className="eyebrow">Perfil de impresión</p><h2>Confirma las características</h2></div>
    <label>Nombre<input value={value.name} onChange={event => update({ name: event.target.value })} required /></label>
    <label>Ancho del papel<select value={value.paperWidthMm} onChange={event => { const paperWidthMm = Number(event.target.value) as 58 | 80; update({ paperWidthMm, columns: paperWidthMm === 80 ? 48 : 32 }); }}><option value="80">80 mm</option><option value="58">58 mm</option></select></label>
    <label>Columnas<input type="number" min="1" max="64" value={Number.isFinite(value.columns) ? value.columns : ''} onChange={event => { const columns = Number(event.target.value); update({ columns: Number.isFinite(columns) ? columns : 0 }); }} /></label>
    <label>Mapeo de código<select value={value.codepageMapping} onChange={event => update({ codepageMapping: event.target.value as ProfileFormValues['codepageMapping'] })}><option value="epson">Epson</option><option value="standard">Estándar</option><option value="custom">Personalizado</option></select></label>
    <label><input type="checkbox" checked={value.cut} onChange={event => update({ cut: event.target.checked })} /> Corte automático</label>
    <label><input type="checkbox" checked={value.drawer} onChange={event => update({ drawer: event.target.checked })} /> Apertura de cajón</label>
    <button className="button button-primary" type="submit" disabled={disabled || !value.name.trim()}>Guardar perfil</button>
  </form>;
}

export type { PrinterProfile };
