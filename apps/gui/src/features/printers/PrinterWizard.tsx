import { useEffect, useState } from 'react';
import type { ImpresoraPosApi, PrinterDevice, PrinterProfile, ProbeResult } from '../../app/agent-api';
import { ProfileForm, type ProfileFormValues } from './ProfileForm';

const defaults = (name: string): ProfileFormValues => ({ name, paperWidthMm: 80, columns: 48, codepageMapping: 'epson', cut: false, drawer: false });

export function validateNetworkDevice(host: string, port: number): string | null {
  const value = host.trim();
  const isIpv4 = value.split('.').length === 4 && value.split('.').every(part => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
  const labels = value.split('.');
  const looksLikeIpv4 = labels.length === 4 && labels.every(label => /^\d+$/.test(label));
  const isHostname = !looksLikeIpv4 && value.length <= 253 && labels.every(label => label.length >= 1 && label.length <= 63 && /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label));
  if (!value || (!isIpv4 && !isHostname)) return 'Escribe una IP o hostname válido.';
  if (!Number.isInteger(port) || port < 1 || port > 65535) return 'El puerto debe estar entre 1 y 65535.';
  return null;
}

export function validateProfileValues(values: ProfileFormValues): string | null {
  if (!values.name.trim()) return 'El nombre del perfil es obligatorio.';
  if (!Number.isInteger(values.columns) || values.columns < 1 || values.columns > 64) return 'Las columnas deben estar entre 1 y 64.';
  return null;
}

export function clearTransportSelection(_transport: 'system' | 'network', _selected: PrinterDevice | null, _probe: ProbeResult | null): { selected: null; probe: null } {
  return { selected: null, probe: null };
}

export function buildProfile(device: PrinterDevice, values: ProfileFormValues): PrinterProfile {
  const name = values.name.trim();
  const validationError = validateProfileValues(values);
  if (validationError) throw new Error(validationError);
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!id) throw new Error('El nombre no produce un id válido.');
  const profile = {
    id, name,
    language: 'esc-pos' as const, paperWidthMm: values.paperWidthMm,
    columns: values.columns, codepageMapping: values.codepageMapping, cut: values.cut, drawer: values.drawer,
    defaultTemplates: { receipt: `simple-receipt-${values.paperWidthMm}`, invoice: `invoice-${values.paperWidthMm}` },
  };
  return device.kind === 'network'
    ? { ...profile, transport: 'network', device }
    : { ...profile, transport: 'system', device };
}

interface PrinterWizardProps { api: ImpresoraPosApi; initialDevices?: PrinterDevice[]; onSaved?: (profile: PrinterProfile) => void; }

export function PrinterWizard({ api, initialDevices = [], onSaved }: PrinterWizardProps) {
  const [transport, setTransport] = useState<'system' | 'network'>('system');
  const [devices, setDevices] = useState(initialDevices);
  const [selected, setSelected] = useState<PrinterDevice | null>(initialDevices[0] ?? null);
  const [host, setHost] = useState('');
  const [port, setPort] = useState(9100);
  const [form, setForm] = useState<ProfileFormValues>(defaults(initialDevices[0]?.kind === 'system' ? initialDevices[0].deviceName ?? '' : ''));
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const discover = async () => {
    setMessage(null);
    try { const found = await api.discoverPrinters('system'); setDevices(found); setSelected(found[0] ?? null); }
    catch { setMessage('No se pudieron detectar impresoras. Inténtalo de nuevo.'); }
  };
  useEffect(() => { if (initialDevices.length === 0) void discover(); }, []);
  const switchTransport = (next: 'system' | 'network') => { const cleared = clearTransportSelection(next, selected, probe); setTransport(next); setSelected(cleared.selected); setProbe(cleared.probe); setMessage(null); };
  const probeNetwork = async () => {
    const error = validateNetworkDevice(host, port); if (error) { setMessage(error); return; }
    const device: PrinterDevice = { kind: 'network', host: host.trim(), port };
    try { const result = await api.probePrinter(device, 'network'); setSelected(device); setProbe(result); setMessage(result.reachable ? 'Impresora disponible.' : 'La impresora no respondió.'); }
    catch { setProbe(null); setMessage('No se pudo probar la impresora. Inténtalo de nuevo.'); }
  };
  const save = async () => {
    if (!selected || (transport === 'network' && (!probe || !probe.reachable))) return;
    const values = { ...form, name: form.name.trim() || selectedName };
    const validationError = validateProfileValues(values);
    if (validationError) { setMessage(validationError); return; }
    try { const profile = await api.saveProfile(buildProfile(selected, values)); onSaved?.(profile); setMessage('Perfil guardado.'); }
    catch { setMessage('No se pudo guardar el perfil. Inténtalo de nuevo.'); }
  };
  const selectedName = selected?.kind === 'system' ? selected.deviceName ?? '' : host;
  const deviceLabel = (device: PrinterDevice) => device.kind === 'system'
    ? device.deviceName ?? device.devicePath ?? 'Impresora del sistema'
    : `${device.host}:${device.port}`;
  return <section className="page-stack" aria-labelledby="printers-title">
    <div className="page-heading"><div><p className="eyebrow">Configuración guiada</p><h1 id="printers-title">Añade una impresora</h1><p className="muted">Conexión, papel y capacidades en unos pasos.</p></div></div>
    <div className="panel"><div role="group" aria-label="Tipo de conexión"><button className="button button-quiet" type="button" onClick={() => switchTransport('system')}>Este equipo</button> <button className="button button-quiet" type="button" onClick={() => switchTransport('network')}>Red</button></div>
      {transport === 'system' ? <div className="page-stack"><h2>Detecta tu impresora</h2><button className="button button-quiet" type="button" onClick={() => void discover()}>Actualizar detección</button><div role="radiogroup" aria-label="Impresoras detectadas">{devices.map(device => <label key={`${device.kind}-${deviceLabel(device)}`}><input type="radio" name="printer" checked={selected === device} onChange={() => { setSelected(device); setForm(defaults(device.kind === 'system' ? device.deviceName ?? '' : device.host)); }} /> {deviceLabel(device)}</label>)}</div></div> : <div className="page-stack"><h2>Conecta por red</h2><label>IP o hostname<input value={host} onChange={event => { setHost(event.target.value); setProbe(null); }} placeholder="192.168.1.20" /></label><label>Puerto<input type="number" min="1" max="65535" value={port} onChange={event => { setPort(Number(event.target.value)); setProbe(null); }} /></label><button className="button button-quiet" type="button" onClick={() => void probeNetwork()}>Probar conexión</button></div>}
    </div>
    {selected && <ProfileForm value={{ ...form, name: form.name || selectedName }} onChange={setForm} onSubmit={() => void save()} disabled={transport === 'network' && (!probe || !probe.reachable)} />}
    {message && <p className="notice notice-warning" role="status">{message}</p>}
  </section>;
}
