# DTE Workspace

Aplicacion web construida con React + Vite para trabajar con documentos tributarios y flujos OCR.

Hoy el proyecto cubre cuatro frentes principales:

- cargar XML DTE del SII
- explorar detalle, agregados y totales
- generar una vista PDF estilo factura chilena
- extraer datos desde imagenes/PDF con Gemini, plantillas y API externa

## Mapa rapido del proyecto

- `src/App.jsx`
  Shell principal de la app, navegacion entre modulos y vistas.
- `src/modules/xml-to-pdf`
  Parser visual de XML, preview tipo factura y exportacion PDF.
- `src/modules/ocr`
  OCR simple, OCR personalizado, plantillas, reglas de auto-deteccion y panel de integracion API.
- `api`
  Endpoints serverless usados por Vercel y por el servidor local de desarrollo.
- `api/_lib`
  Helpers compartidos de Supabase, auth por API key, multipart y llamadas a Gemini.
- `supabase`
  Migraciones SQL necesarias para tablas, funciones y columnas del proyecto.
- `server.js`
  Shim local para probar `/api/*` fuera de Vercel.

## Modulos funcionales

### 1. XML DTE

- El usuario sube uno o varios XML.
- El parser lee metadata, detalle y totales.
- La app permite revisar:
  - detalle por documento
  - tablas agregadas por factura, proveedor, producto o linea
  - vista PDF estilo factura
  - descarga CSV o Excel

### 2. OCR simple

- Extrae encabezado y tabla principal de una factura usando Gemini.
- Consume creditos OCR.
- Pensado para una carga rapida sin plantillas.

### 3. OCR personalizado

- Permite definir campos propios.
- Puede incluir o no la tabla principal.
- Soporta guardar plantillas en Supabase.
- Soporta reglas de auto-deteccion para decidir que plantilla aplica a un documento.
- Soporta `post_prompt` para refinar el resultado estructurado despues de la extraccion base.

### 4. API externa

- Endpoint principal: `POST /api/extract`
- Auth mediante API keys con prefijo `sk_live_...`
- Soporta:
  - multipart con archivo directo
  - JSON con `fileData` en base64
  - modo `quick`
  - modo `manual` con `configId`
  - modo `auto` usando preferencia guardada + triggers

## Como se procesan los archivos

- El modulo XML DTE trabaja localmente en el navegador.
- Los modulos OCR y la API envian el archivo al backend para consultar Gemini.
- La app no guarda el documento como archivo persistente propio, pero si registra uso y configuraciones en Supabase.

## Levantar el proyecto

```bash
npm install
npm run dev
```

Luego abre la URL que muestre Vite en la terminal.

Si tambien quieres probar los endpoints locales:

```bash
npm run server
```

Eso levanta `server.js` en `http://localhost:3001` y Vite le hace proxy a `/api`.

## Variables de entorno

Copia `.env.example` a `.env.local` y completa:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `SUPABASE_SERVICE_ROLE_KEY`

Notas:

- Las variables `VITE_*` llegan al frontend.
- `GEMINI_API_KEY` y `SUPABASE_SERVICE_ROLE_KEY` son solo de servidor.
- `server.js` carga `.env.local` manualmente para desarrollo local.

## Comandos utiles

- `npm run dev`
  Inicia la app en modo desarrollo.

- `npm run server`
  Inicia el servidor local que imita las funciones `/api/*`.

- `npm run build`
  Genera la version lista para publicar.

- `npm run lint`
  Revisa problemas basicos de codigo, por ejemplo variables sin usar o errores simples.

- `npm run test`
  Ejecuta pruebas automaticas. Sirve para comprobar que funciones criticas sigan funcionando despues de cambios.

- `npm run test:watch`
  Deja las pruebas escuchando cambios mientras se desarrolla.

- `npm run sii:backup`
  Abre el automatizador del portal del SII para descargar respaldos en lote.

- `npm run sii:backup:install-browser`
  Instala Chromium para que el automatizador funcione en Playwright.

## Que significan "scripts" y "tests"

- `scripts`
  Son atajos guardados en `package.json`. En vez de memorizar comandos largos, se usa algo simple como `npm run build`.

- `tests`
  Son revisiones automaticas del codigo. En este proyecto hoy cubren partes criticas del parser XML, para detectar rapido si una modificacion rompe la lectura de documentos.

## Estado actual

- El modulo XML DTE procesa los archivos localmente en el navegador.
- Los modulos OCR y la API envian el archivo al backend para consultar Gemini; no se guarda como documento persistente en la app.
- La vista PDF ya navega de forma lazy entre documentos para no renderizar todo el lote a la vez.
- La exportacion masiva de PDF muestra progreso durante la conversion.

## Base de datos y migraciones

Para que el proyecto funcione completo, la base de Supabase debe tener las migraciones de `supabase/`.

Orden recomendado:

1. [migration.sql](/Users/maxicatalan/Claude-Developments/Testing/Test-3/supabase/migration.sql)
2. [configs-migration.sql](/Users/maxicatalan/Claude-Developments/Testing/Test-3/supabase/configs-migration.sql)
3. [post-prompt-migration.sql](/Users/maxicatalan/Claude-Developments/Testing/Test-3/supabase/post-prompt-migration.sql)
4. [api-keys-migration.sql](/Users/maxicatalan/Claude-Developments/Testing/Test-3/supabase/api-keys-migration.sql)
5. [api-mode-migration.sql](/Users/maxicatalan/Claude-Developments/Testing/Test-3/supabase/api-mode-migration.sql)
6. [refund-credit-migration.sql](/Users/maxicatalan/Claude-Developments/Testing/Test-3/supabase/refund-credit-migration.sql)

La ultima es importante para el estado actual del backend: el refund de creditos ya espera una funcion `refund_credit(...)` atomica.

## Endpoints importantes

- `POST /api/gemini-ocr`
  OCR simple autenticado por sesion de Supabase.
- `POST /api/custom-ocr`
  OCR personalizado autenticado por sesion.
- `POST /api/detect-config`
  Deteccion de plantilla usando triggers y Gemini.
- `GET/PATCH /api/user-settings`
  Preferencia `api_mode` para integracion externa.
- `POST /api/api-keys`
  Crea una API key.
- `DELETE /api/api-keys?id=...`
  Revoca una API key.
- `POST /api/extract`
  Endpoint principal para integracion externa autenticada por API key.
- `GET /api/credits`
  Devuelve creditos del usuario autenticado.

## Validacion actual del proyecto

En la ultima puesta a punto local quedaron pasando:

- `npm run lint`
- `npm run test`
- `npm run build`

Cobertura actual relevante:

- parser XML
- exportaciones OCR
- auth por API key
- endpoint `api/extract`

Todavia no hay una suite e2e completa de login + OCR + API + creditos.

## Riesgos y deuda conocida

- El build sigue mostrando advertencias por chunks pesados, especialmente librerias PDF/barcode.
- La carga inicial mejoro con lazy loading de modulos, pero aun hay margen para separar dependencias pesadas mas agresivamente.
- No hay observabilidad de produccion integrada todavia.
- No hay flujo de recuperacion de contraseña ni UX extendida de cuenta en el frontend.

## Documento de contexto extendido

Para sesiones futuras, decisiones recientes, arquitectura y checklist de release, revisa:

- [docs/project-context.md](/Users/maxicatalan/Claude-Developments/Testing/Test-3/docs/project-context.md)

## Respaldo masivo SII

Si necesitas bajar DTE desde la pantalla de respaldo del SII sin hacerlo de a 20 manualmente, revisa la guia [docs/sii-respaldo-masivo.md](/Users/maxicatalan/Claude-Developments/Testing/Test-3/docs/sii-respaldo-masivo.md).

## Publicacion basica

### Vercel

La forma mas simple de publicarla es:

1. subir este proyecto a GitHub
2. importarlo en Vercel
3. dejar que Vercel ejecute `npm install` y `npm run build`

El archivo [vercel.json](/Users/maxicatalan/Claude-Developments/Testing/Test-3/vercel.json) deja lista la app como SPA para que no falle si en el futuro agregas rutas del frontend.

### Validacion automatica

El archivo [.github/workflows/ci.yml](/Users/maxicatalan/Claude-Developments/Testing/Test-3/.github/workflows/ci.yml) hace que GitHub revise automaticamente:

- `npm run lint`
- `npm run test`
- `npm run build`

Cada vez que subes cambios o abres un pull request.
