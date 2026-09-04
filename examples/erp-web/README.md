# Integración ERP web

Este ejemplo construye un `PrintJob` declarativo y habla con `http://127.0.0.1:18181` mediante `@impresora-pos/web-client`. No genera ESC/POS ni usa `Ctrl+P`.

El ERP debe servirse desde HTTPS. La primera vinculación se inicia desde la GUI y el navegador puede solicitar permiso de Local Network Access para acceder al agente local. Si el agente no está disponible, instala o inicia Impresora POS; si falta pairing, vincula este ERP; si el API es incompatible, actualiza ambos componentes.
