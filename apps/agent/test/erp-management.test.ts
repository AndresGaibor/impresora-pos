import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { migrate } from '../src/db/migrations';
import { PairingMetadataRepository } from '../src/db/repositories/pairings';
import { createManagedTemplatesRouter } from '../src/http/routes/managed-templates';
import { createOpenUiRouter } from '../src/http/routes/open-ui';

function setup() { const db = new Database(':memory:'); migrate(db); const pairings = new PairingMetadataRepository(db); pairings.approve({ token: 'token-a', origin: 'https://a.example' }); return { db, pairings }; }
const template = { id: 'invoice-a', name: 'Recibo', source: 'local', paperWidth: 80, blocks: [{ type: 'text', content: 'Venta' }] };
function request(url: string, origin: string, body: unknown, token = 'token-a') { return new Request(url, { method: 'PUT', headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }

test('managed template is owned by the paired exact Origin', async () => { const { db, pairings } = setup(); const router = createManagedTemplatesRouter(db, ['https://a.example', 'https://b.example'], pairings); expect((await router.handle(request('http://local/v1/managed-templates', 'https://a.example', template))).status).toBe(200); expect((await router.handle(request('http://local/v1/managed-templates', 'https://b.example', { ...template, name: 'Otro' }))).status).toBe(403); });
test('open-ui rejects wrong Origin before invoking launcher', async () => { const { db, pairings } = setup(); let launches = 0; const router = createOpenUiRouter(db, ['https://a.example', 'https://b.example'], pairings, { launch: () => { launches += 1; } }); const response = await router.handle(new Request('http://local/v1/open-ui', { method: 'POST', headers: { Origin: 'https://b.example', Authorization: 'Bearer token-a' }, body: '{}' })); expect(response.status).toBe(403); expect(launches).toBe(0); });
