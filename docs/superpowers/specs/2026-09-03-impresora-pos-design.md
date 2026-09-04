# Impresora POS — Diseño arquitectónico

Fecha: 2026-09-03
Estado: aprobado

## 1. Objetivo

Construir una aplicación local instalable para PCs de caja que permita a un ERP web imprimir tickets térmicos de forma silenciosa y confiable, sin depender de Ctrl+P ni del diálogo de impresión del navegador.

El producto debe resolver cuatro problemas: comunicación segura con el ERP, renderizado ESC/POS, detección/configuración de impresoras y personalización visual sencilla de plantillas.

La aplicación no debe convertirse en un segundo ERP. No calcula precios, impuestos, descuentos, cambio, inventario ni reglas del SRI. Recibe datos ya decididos por el ERP y únicamente los representa e imprime.

## 2. Restricción principal de recursos

Bun es el runtime del agente residente. Electron se usa exclusivamente para la interfaz gráfica bajo demanda.

Cuando la GUI está cerrada debe haber 0 procesos Electron/Chromium. El único proceso residente es `impresora-pos-agent`, compilado como ejecutable autónomo de Bun.

Cerrar la última ventana de configuración debe terminar Electron completamente; no se mantendrá un tray implementado con Electron.

El agente no hará escaneo de red ni polling frecuente de impresoras en reposo. Detección, calibración y diagnóstico serán operaciones bajo demanda.
## 3. Procesos y empaquetado

El instalador contiene dos ejecutables independientes:

- `impresora-pos-agent`: Bun compilado; arranca con la sesión del usuario, escucha sólo en loopback y realiza toda la impresión.
- `impresora-pos-ui`: Electron + React; se abre desde el menú Inicio o a petición autenticada del ERP y se cierra completamente al terminar.

El agente debe seguir funcionando aunque la GUI nunca se abra. La GUI debe poder conectarse al agente, leer configuración, modificarla mediante APIs internas y ejecutar pruebas.

La primera plataforma de producción será Windows 10/11 x64. La arquitectura debe mantener adaptadores que permitan macOS y Linux después sin cambiar contratos ni renderizadores.

El agente se instalará a nivel de usuario y arrancará al iniciar sesión, evitando privilegios administrativos salvo que un driver concreto los requiera.

Electron-builder podrá empaquetar el binario Bun como recurso externo del instalador. El binario Bun no depende del proceso Electron para arrancar ni permanecer activo.

## 4. Arquitectura lógica

```text
ERP web -> API localhost -> cola -> plantilla -> layout -> ESC/POS -> transporte -> impresora
                         \-> metadatos de estado/idempotencia

GUI Electron -> API administrativa localhost -> configuración / plantillas / diagnóstico
```

Toda comunicación entre GUI y agente pasa por contratos versionados; la GUI no importa internals del agente.
## 5. Contrato con el ERP

El ERP envía un `PrintJob` versionado y declarativo. No envía JavaScript, HTML arbitrario ni bytes ESC/POS.

Campos mínimos del sobre:

```ts
type PrintJob = {
  schemaVersion: 1;
  jobId: string;
  type: 'invoice' | 'receipt' | 'cash-close' | 'test';
  templateId?: string;
  printerProfileId?: string;
  data: unknown;
  actions?: { cut?: boolean; openDrawer?: boolean };
  reprintOf?: string;
};
```

Cada `type` tiene un schema Zod propio para `data`. El ERP conserva toda decisión de negocio y entrega importes ya calculados.

`jobId` es idempotente. Repetir el mismo job devuelve su estado previo y no vuelve a imprimir. Una reimpresión real usa un job nuevo y `reprintOf`.

El agente no acepta un endpoint de impresión RAW desde el navegador. Esto evita convertir localhost en una puerta para ejecutar comandos de impresora arbitrarios.

El ERP puede consultar las plantillas y perfiles disponibles, pero un trabajo normal sólo referencia sus IDs.
## 6. API localhost y seguridad

El agente escucha únicamente en `127.0.0.1`, nunca en `0.0.0.0`.

API mínima del ERP:

- `GET /v1/health`
- `GET /v1/capabilities`
- `POST /v1/pair`
- `POST /v1/print`
- `GET /v1/jobs/:jobId`
- `GET /v1/templates`
- `GET /v1/printer-profiles`

API administrativa para la GUI, con credenciales locales separadas:

- CRUD de perfiles de impresora
- CRUD de plantillas locales
- importar/exportar plantillas
- detección de impresoras
- prueba, calibración y diagnóstico
- abrir la GUI bajo petición autenticada

El emparejamiento genera un token aleatorio ligado al `Origin` aprobado. El agente almacena sólo un hash del token, aplica rate limiting y valida `Origin`, tamaño del body y schemas.

El acceso desde una web pública a localhost debe contemplar el permiso Local Network Access de navegadores Chromium actuales. La UX del ERP debe explicar ese permiso la primera vez.

No se guardan datos personales en logs. Los logs contienen `jobId`, perfil, duración, estado y código de error.
## 7. Motor de plantillas

Habrá tres capas: `TemplateDefinition` declarativa, un `LayoutModel` intermedio y dos renderers: preview y ESC/POS.

La plantilla soporta bloques pequeños y conocidos:

- texto y campos
- logo/imagen
- separador y espacio
- tabla de productos
- bloque de totales
- código de barras Code 128
- QR
- corte

No se permite código ejecutable dentro de una plantilla. Como máximo habrá condiciones seguras del tipo `showWhenPresent` y repetición de colecciones conocidas como `items`.

Las plantillas incorporadas son inmutables. Una plantilla puede ser:

- `builtin`: incluida con la aplicación
- `managed`: enviada/configurada por un ERP autorizado
- `local`: creada o personalizada desde la GUI

Una plantilla `managed` no se sobreescribe silenciosamente con cambios locales. La GUI ofrece `Duplicar para personalizar`, creando una plantilla `local` independiente.

El trabajo de impresión referencia `templateId`; si se omite, el perfil usa la plantilla predeterminada de su tipo.

La primera plantilla fiscal será `ecuador-invoice-80-v1`, además de una versión 58 mm y una plantilla de recibo simple.
## 8. Editor y previsualización

La GUI ofrece edición por bloques, no un editor gráfico libre. El usuario reordena bloques con drag & drop y modifica propiedades simples: alineación, negrita, tamaño, visibilidad, etiqueta y espaciado.

El preview y ESC/POS deben partir del mismo `LayoutModel` para reducir diferencias entre lo visto y lo impreso.

Los perfiles trabajan con dimensiones reales de la impresora: ancho de papel, columnas efectivas, lenguaje y codepage. No se asume que todas las impresoras 80 mm tienen exactamente el mismo número de columnas.

Las plantillas fiscales incorporan guardrails. La GUI valida que sigan presentes los bloques configurados como obligatorios para ese tipo de comprobante y muestra el resultado antes de guardar.

Estos guardrails son una protección de configuración, no una afirmación jurídica automática de cumplimiento tributario.

La GUI debe incluir:

- Dashboard de estado
- Asistente de primera configuración
- Impresoras y perfiles
- Editor de plantillas con preview
- Diagnóstico
- Historial técnico mínimo de trabajos

No habrá consola ni comandos requeridos para el usuario final.

## 9. Motor ESC/POS

`@point-of-sale/receipt-printer-encoder` será el encoder principal. Recibe el `LayoutModel` ya resuelto y produce `Uint8Array`.

El renderer centraliza codepages, ancho, barcode, QR, corte y apertura de cajón. Los transportes nunca construyen el ticket.
## 10. Transporte y detección de impresoras

Todo acceso al hardware usa una interfaz reemplazable:

```ts
interface PrinterTransport {
  discover(): Promise<PrinterDevice[]>;
  probe(device: PrinterDevice): Promise<ProbeResult>;
  print(device: PrinterDevice, bytes: Uint8Array): Promise<SendResult>;
}
```

Adaptadores iniciales:

- `SystemPrinterTransport`: impresoras registradas en Windows y envío RAW al spooler.
- `NetworkPrinterTransport`: socket TCP directo, normalmente puerto 9100.

Serial/WebUSB no forman parte del MVP del agente instalado; podrán añadirse sin cambiar contratos.

Antes de fijar una dependencia nativa para `SystemPrinterTransport` habrá un spike obligatorio en Bun. Se probará primero `@lastapp/node-printer` bajo Bun y bajo `bun build --compile`.

Si ese addon no resulta estable en Bun, el adapter se implementará con un helper nativo/OS aislado. El resto del sistema no dependerá de esa elección.

Bun soporta addons N-API y ejecutables compilados, pero la compatibilidad del paquete concreto debe demostrarse con pruebas reales, no asumirse.

La detección de impresoras instaladas ocurre al abrir Setup/Printers o al pulsar actualizar; no se consulta continuamente en segundo plano.
## 11. Perfil de impresora y calibración

Cada impresora usable tiene un `PrinterProfile` persistido:

- id y nombre amigable
- transporte y dispositivo
- lenguaje (`esc-pos` inicialmente)
- ancho 58/80 mm
- columnas efectivas
- mapeo de codepage
- corte disponible
- cajón disponible
- plantilla predeterminada por tipo
- resultado y fecha de última prueba

El wizard imprime una hoja de compatibilidad con ancho, tildes, ñ, negrita, tamaños, Code 128, QR y corte.

La GUI pregunta qué partes se imprimieron correctamente y ajusta el perfil. Los fallos de caracteres deben poder probar distintos mappings sin comandos manuales.

Para impresoras LAN se permite introducir IP y puerto y ejecutar `Probar conexión`. El escaneo automático de toda la red no es requisito del MVP.

El estado distingue entre `configured`, `reachable`, `spooler-ready`, `hardware-status-known` y `hardware-status-unknown`; no se promete saber si salió papel cuando el transporte no puede confirmarlo.

## 12. Cola, estados e idempotencia

Cada impresora tiene una cola serial en memoria: sólo un trabajo se envía al dispositivo a la vez.

Estados mínimos: `QUEUED`, `SENDING`, `SENT`, `FAILED`, `UNKNOWN`.

`SENT` significa que el transporte aceptó/envió los bytes, no que exista confirmación física de papel impreso.
La idempotencia se persiste antes del envío. Si el agente muere durante `SENDING`, al reiniciar el trabajo queda `UNKNOWN`; no se reimprime automáticamente porque no puede saberse si el dispositivo alcanzó a imprimir.

Una reimpresión siempre es explícita mediante un nuevo `jobId` y `reprintOf`.

Los payloads completos viven en memoria mientras el trabajo está activo. Tras terminar se descartan; el almacenamiento durable conserva sólo metadatos necesarios para idempotencia y diagnóstico.

## 13. Persistencia

Se usará SQLite mediante Bun para configuración durable y ligera.

Persistencia mínima:

- versión de schema
- perfiles de impresora
- plantillas y revisiones
- origins emparejados y hashes de tokens
- metadatos de jobs/idempotencia
- preferencias del agente

No se persiste por defecto el contenido completo de facturas, clientes ni detalles de productos.

Los writes de configuración deben ser transaccionales. Las migraciones son versionadas y probadas.

Los metadatos antiguos de jobs se purgan con una política conservadora configurable; la limpieza se ejecuta de forma infrecuente y no mediante polling continuo.

## 14. Ejecución residente y recursos

El agente usa servidor HTTP de Bun, timers mínimos y listeners sólo necesarios. No carga React, Chromium ni Electron.

No se mantienen procesos hijos cuando están ociosos. Un helper de impresión, si termina siendo necesario, se invoca por trabajo o se mantiene sólo si las mediciones demuestran una ventaja clara.
Criterios de aceptación de recursos en la máquina de referencia Windows 11 x64:

- GUI cerrada: 0 procesos Electron/Chromium pertenecientes a Impresora POS.
- agente idle: CPU promedio objetivo <= 0.2% durante 5 minutos sin trabajos.
- agente idle: RSS objetivo <= 40 MB; 60 MB es techo de regresión a investigar.
- ninguna consulta de impresora o red con frecuencia menor a 30 s; por defecto no hay polling periódico de hardware.
- abrir/cerrar la GUI no debe dejar procesos huérfanos.

Estos números se validarán con mediciones reales; si una dependencia impide cumplirlos, se sustituye antes de producción.

## 15. GUI Electron

Electron sólo presenta la interfaz. Toda operación privilegiada se solicita al agente por API administrativa local.

Al cerrar la última ventana se ejecuta `app.quit()` también en macOS; no se conserva comportamiento de app residente ni icono de tray.

Formas de abrir la GUI:

- acceso directo / menú Inicio
- botón `Configurar impresora` en el ERP, que solicita al agente abrirla
- comando de diagnóstico para soporte, no necesario para usuarios normales

Pantallas: Dashboard, Setup, Printers, Templates, Diagnostics y About/Update.

La GUI muestra información útil y accionable: qué impresora está seleccionada, qué prueba falló, cómo corregirla y cuándo fue la última impresión enviada correctamente.

La GUI no puede imprimir saltándose el agente; incluso `Imprimir prueba` crea un trabajo interno mediante la misma capa de impresión.
## 16. Instalación y actualización

El instalador entrega agente Bun + GUI Electron + assets + plantillas incorporadas.

En Windows el agente se registra para arrancar al iniciar sesión del usuario. No se instala como servicio de sistema en el MVP.

La instalación debe poder verificar que el puerto local está libre, crear la base de datos inicial y abrir el wizard la primera vez.

La actualización no puede depender de mantener Electron residente. La fase de producción definirá un mecanismo firmado donde el agente pueda detectar una versión nueva y lanzar el instalador/updater sólo cuando corresponda.

La GUI puede mostrar y disparar la actualización manual, pero la impresión normal debe seguir funcionando si la GUI nunca se abre.

Los binarios y artefactos de actualización deben verificarse antes de ejecutar reemplazos.

## 17. Estructura inicial del repositorio

```text
impresora-pos/
  apps/
    agent/          # Bun residente: API, cola, hardware, persistencia
    desktop/        # Electron + React, sólo GUI
  packages/
    contracts/      # PrintJob, API DTOs, schemas
    templates/      # schema y validación de TemplateDefinition
    renderer/       # LayoutModel + ESC/POS + preview model
    printer-core/   # interfaces de transport/profile sin OS concreto
  docs/
    superpowers/specs/
  tests/
```

Se evitarán paquetes adicionales hasta que una frontera realmente los necesite. Bun workspaces administrará el monorepo.
## 18. Estrategia de pruebas

El desarrollo será TDD en las piezas de dominio y contratos.

Pruebas unitarias obligatorias:

- schemas de `PrintJob`
- idempotencia y reimpresión explícita
- resolución de plantillas
- validación de campos obligatorios
- LayoutModel para 58/80 mm
- caracteres y codepage
- generación de comandos ESC/POS
- perfiles y migraciones
- política de logs/redacción

Pruebas de integración:

- API loopback + Origin/token
- SQLite + recuperación tras reinicio
- cola serial y fallos de transporte
- TCP 9100 contra un servidor fake que capture bytes
- system printer adapter contra spooler de prueba/fixture cuando sea posible

E2E Electron:

- primera configuración
- detectar/seleccionar impresora mock
- editar y previsualizar plantilla
- imprimir prueba
- cerrar ventana y verificar que Electron termina

La CI de producción debe incluir Windows; Linux puede cubrir gran parte de los tests puros.
## 19. Diagnóstico y soporte

La GUI ofrece un flujo guiado que produzca evidencia sin exponer datos del cliente:

1. comprobar agente
2. listar impresoras
3. comprobar perfil
4. probar conexión/transporte
5. imprimir patrón de compatibilidad
6. validar ancho y caracteres
7. validar corte y cajón
8. exportar diagnóstico sanitizado

El diagnóstico exportado incluye versiones, plataforma, transport, perfil sin secretos, códigos de error y métricas; nunca payloads completos de facturas ni tokens.

Los errores deben ser accionables: `PRINTER_NOT_FOUND`, `NETWORK_TIMEOUT`, `SPOOLER_REJECTED`, `INVALID_TEMPLATE`, `UNSUPPORTED_CODEPAGE`, etc.

## 20. Alcance explícitamente fuera del MVP

- facturación o comunicación con SRI
- cálculo de impuestos o totales
- inventario, caja o clientes
- editor HTML/JS libre
- ejecución de ESC/POS raw enviado por el ERP
- escaneo agresivo automático de toda la LAN
- WebUSB/WebSerial como transporte principal
- tray residente con Electron
- almacenamiento histórico de facturas
- múltiples agentes coordinándose entre PCs

Estas capacidades sólo se añaden si existe un caso real posterior.
## 21. Secuencia arquitectónica de entrega

La implementación detallada se escribirá en un plan separado tras aprobar esta especificación. La secuencia de alto nivel será:

1. foundation Bun + contratos + persistencia
2. spike de spooler RAW en Bun compilado
3. renderer + encoder + fixtures 58/80 mm
4. transportes system/network + cola/idempotencia
5. API localhost + pairing y seguridad
6. GUI Electron bajo demanda + onboarding/diagnóstico
7. editor declarativo de plantillas + preview
8. integración de referencia con ERP web
9. instalador Windows + autostart + pruebas de recursos
10. endurecimiento, actualización y matriz de hardware

El spike del spooler ocurre temprano para eliminar el mayor riesgo técnico sin contaminar el diseño con una dependencia concreta.

## 22. Definición de terminado

El producto está listo para producción cuando una PC Windows limpia puede:

- instalarse sin configurar comandos manualmente
- mantener sólo el agente Bun cuando la GUI está cerrada
- detectar/configurar una térmica del sistema o una impresora TCP 9100
- completar una prueba guiada de ancho, caracteres, barcode, QR y corte
- personalizar una plantilla mediante bloques y verla antes de imprimir
- recibir un `PrintJob` desde el ERP web autenticado
- imprimir silenciosamente y de forma idempotente
- sobrevivir reinicios sin reimpresiones automáticas ambiguas
- diagnosticar fallos sin guardar datos personales del ticket
- cumplir los objetivos de CPU/RAM definidos en esta especificación

La prioridad de diseño es: confiabilidad > compatibilidad > simplicidad operativa > personalización > funcionalidades adicionales.
## 23. Decisiones operativas cerradas

El endpoint público local usa por defecto `http://127.0.0.1:18181`. El puerto es estable para que el ERP pueda encontrar el agente; si está ocupado, Setup muestra el conflicto y no elige otro silenciosamente.

La GUI usa un token administrativo separado generado durante la instalación y protegido en el perfil del usuario. El token nunca se expone al renderer de Electron; el proceso principal actúa como puente hacia la API administrativa.

Si la GUI se abre y el agente no responde, el proceso principal intenta iniciar el binario Bun instalado y vuelve a comprobar salud antes de mostrar diagnóstico.

El agente se registra en el autostart del usuario. No se necesita que Electron arranque con Windows.

Las comprobaciones de actualización del agente se limitan a inicio y, como máximo, una vez cada 24 horas. Un manifiesto firmado contiene versión, URL y SHA-256; el agente valida firma y hash antes de ejecutar un instalador.

Nunca se aplica una actualización mientras haya un trabajo `QUEUED` o `SENDING`. La actualización se difiere hasta quedar idle.

El instalador es el dueño de reemplazar ambos binarios como una sola versión del producto para evitar incompatibilidades entre agente y GUI.

El contrato API expone `agentVersion`, `apiVersion` y `templateSchemaVersion`; la GUI y el ERP pueden detectar incompatibilidades antes de imprimir.

No existe tray en el MVP ni en el diseño base. Si en el futuro se necesita un indicador residente, deberá implementarse sin mantener Electron/Chromium vivo.