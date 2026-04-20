# Contexto del proyecto

## Resumen ejecutivo

Este repositorio es una app de trabajo para DTE y OCR con tres capas principales:

- frontend React/Vite
- backend serverless compatible con Vercel
- Supabase como auth, almacenamiento relacional y control de creditos

El objetivo actual del producto es cubrir dos necesidades:

1. trabajar XML DTE del SII de forma visual y exportable
2. extraer datos desde documentos no estructurados usando Gemini, con opcion de integracion externa

## Stack tecnico

- React 19
- Vite 8
- Vitest
- ESLint 9 flat config
- Supabase JS v2
- Gemini via `fetch` directo a `generativelanguage.googleapis.com`
- jsPDF + html2canvas para exportacion PDF
- bwip-js para PDF417
- xlsx para exportaciones Excel
- Playwright para el script de respaldo SII

## Arquitectura resumida

### Frontend

- `src/main.jsx`
  Monta `AuthProvider` y `App`.
- `src/context/AuthContext.jsx`
  Gestiona sesion Supabase y creditos del usuario.
- `src/App.jsx`
  Orquesta navegacion entre:
  - XML DTE
  - OCR Facturas
  - OCR Personalizado

Se aplico lazy loading a los modulos grandes:

- `./modules/xml-to-pdf`
- `./modules/ocr/OcrModule`
- `./modules/ocr/CustomOcrModule`

### Backend

Los endpoints viven en `api/` para ser compatibles con Vercel.

Helpers importantes:

- `api/_lib/supabaseAdmin.js`
  Cliente admin, auth por bearer token Supabase y refund de creditos.
- `api/_lib/apiKeyAuth.js`
  Valida API keys externas.
- `api/_lib/gemini.js`
  Prompts, llamadas al modelo y transformaciones.
- `api/_lib/parseMultipart.js`
  Parser multipart para el endpoint de integracion.

### Supabase

Entidades principales:

- `user_credits`
- `usage_log`
- `extraction_configs`
- `api_keys`

Funciones SQL importantes:

- `use_credit(...)`
- `refund_credit(...)`
- trigger `handle_new_user()`

## Flujos criticos

### XML DTE

1. El usuario sube XML.
2. `parseSIISetDTE` arma la vista exploratoria.
3. `parseDteFiles` alimenta el flujo de PDF.
4. Desde `App.jsx` se exporta CSV/XLSX o se navega la vista PDF.

### OCR simple

1. El usuario sube una imagen o PDF.
2. El frontend convierte/comprime el archivo.
3. `POST /api/gemini-ocr`
4. El backend consume un credito OCR.
5. Llama a Gemini.
6. Registra `usage_log`.
7. Si falla despues de consumir, intenta refund.

### OCR personalizado

1. El usuario define campos o elige plantilla.
2. Puede activar tabla, triggers y `post_prompt`.
3. `POST /api/custom-ocr`
4. El backend consume un credito OCR.
5. Ejecuta extraccion generica o dirigida.
6. Opcionalmente aplica `post_prompt`.

### API externa

1. Sistema externo llama `POST /api/extract`.
2. Se autentica con API key `sk_live_...`.
3. Se consume credito OCR.
4. Se resuelve modo efectivo:
   - `quick`
   - `manual`
   - `auto`
5. Si corresponde, busca plantilla o detecta template.
6. Extrae y devuelve `{ headers, rows, meta }`.

## Estado operativo al cierre de esta sesion

Se corrigieron los bloqueadores de release que estaban presentes:

- `lint` verde
- `test` verde
- `build` verde

Ajustes aplicados en esta etapa:

- fix de `api/extract` para manejo correcto de multipart + `mode`
- actualizacion de tests para reflejar el comportamiento real del endpoint
- limpieza de `eslint` para ignorar `.playwright` y `.claude`
- eliminacion de `console.log` de debugging en backend
- lazy loading de modulos pesados en `App.jsx`
- migracion para refund atomico de creditos
- correccion de documentacion sobre procesamiento OCR/backend

## Riesgos vigentes

- El build sigue emitiendo warning por chunks grandes.
- No hay monitoreo centralizado ni captura de errores de produccion.
- La UX de auth es basica.
- No existe una suite e2e completa de negocio.

## Recomendaciones para la proxima sesion

Si el objetivo es endurecer el lanzamiento, el orden sugerido es:

1. separar aun mas dependencias pesadas del flujo PDF
2. agregar smoke tests o e2e minimos
3. agregar una pagina o seccion de ayuda operativa para usuarios finales
4. revisar politicas de privacidad/comunicacion sobre procesamiento OCR
5. evaluar observabilidad basica en produccion

## Archivos clave para entender rapido el proyecto

- [src/App.jsx](/Users/maxicatalan/Claude-Developments/Testing/Test-3/src/App.jsx)
- [src/context/AuthContext.jsx](/Users/maxicatalan/Claude-Developments/Testing/Test-3/src/context/AuthContext.jsx)
- [api/extract.js](/Users/maxicatalan/Claude-Developments/Testing/Test-3/api/extract.js)
- [api/custom-ocr.js](/Users/maxicatalan/Claude-Developments/Testing/Test-3/api/custom-ocr.js)
- [api/gemini-ocr.js](/Users/maxicatalan/Claude-Developments/Testing/Test-3/api/gemini-ocr.js)
- [api/_lib/gemini.js](/Users/maxicatalan/Claude-Developments/Testing/Test-3/api/_lib/gemini.js)
- [src/modules/ocr/CustomOcrModule.jsx](/Users/maxicatalan/Claude-Developments/Testing/Test-3/src/modules/ocr/CustomOcrModule.jsx)
- [src/modules/xml-to-pdf/XmlToPdfConverter.jsx](/Users/maxicatalan/Claude-Developments/Testing/Test-3/src/modules/xml-to-pdf/XmlToPdfConverter.jsx)
- [supabase/migration.sql](/Users/maxicatalan/Claude-Developments/Testing/Test-3/supabase/migration.sql)
- [supabase/refund-credit-migration.sql](/Users/maxicatalan/Claude-Developments/Testing/Test-3/supabase/refund-credit-migration.sql)
