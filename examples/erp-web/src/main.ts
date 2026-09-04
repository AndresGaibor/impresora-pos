import { ImpresoraPosClient } from '@impresora-pos/web-client';
import { invoiceJob } from './print-flow';

const status = document.querySelector('#status');
const client = new ImpresoraPosClient({ origin: window.location.origin });
document.querySelector('#print')?.addEventListener('click', async () => { if (status) status.textContent = 'Enviando trabajo declarativo...'; try { await client.print(invoiceJob); if (status) status.textContent = 'Trabajo enviado al agente local.'; } catch (error) { if (status) status.textContent = error instanceof Error ? error.message : 'No se pudo imprimir.'; } });
