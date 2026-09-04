interface SetupPageProps { onOpenPrinters: () => void; }

export function SetupPage({ onOpenPrinters }: SetupPageProps) {
  return (
    <section className="setup-hero" aria-labelledby="setup-title">
      <p className="eyebrow">Primeros pasos</p>
      <h1 id="setup-title">Deja lista tu impresión</h1>
      <p className="setup-copy">Te guiaremos para elegir una impresora, confirmar el ancho del papel y guardar un perfil seguro. No necesitas comandos ni configurar credenciales.</p>
      <ol className="setup-steps"><li><span>01</span><div><strong>Elige la impresora</strong><p>Usaremos las impresoras disponibles en este equipo.</p></div></li><li><span>02</span><div><strong>Confirma el papel</strong><p>Selecciona 58 mm u 80 mm según tu impresora.</p></div></li><li><span>03</span><div><strong>Guarda el perfil</strong><p>El agente conservará sólo la configuración necesaria.</p></div></li></ol>
      <button className="button button-primary" type="button" onClick={onOpenPrinters}>Comenzar configuración</button>
      <p className="fine-print">La detección y las pruebas se ejecutan sólo cuando tú las solicitas.</p>
    </section>
  );
}
