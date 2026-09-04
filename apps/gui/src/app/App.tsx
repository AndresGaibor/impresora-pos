import type { ImpresoraPosApi } from './agent-api';
import { Shell } from './Shell';
import './styles.css';

export function App({ api = window.impresoraPos }: { api?: ImpresoraPosApi }) {
  return <Shell api={api} />;
}
