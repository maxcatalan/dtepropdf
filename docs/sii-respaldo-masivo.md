# Respaldo masivo de DTE del SII

## Resumen

El SII publica web services oficiales para autenticacion, envio y consulta de estado de DTE, pero en la documentacion oficial no aparece un web service para listar y descargar masivamente los documentos de la pantalla **"Respaldo de documentos emitidos/recibidos"**.

Por eso, para bajar historicos desde esa pantalla sin hacerlo de a 20 manualmente, la alternativa practica es automatizar el portal del SII.

Este proyecto deja un script con Playwright para eso.

## Web services oficiales del SII relacionados

- Autenticacion automatica con certificado digital:
  `https://www.sii.cl/factura_electronica/factura_mercado/autenticacion.pdf`
- Consulta avanzada estado de DTE:
  `https://www.sii.cl/factura_electronica/factura_mercado/OIFE2006_QueryEstDteAv_MDE.pdf`
- Consulta estado de DTE:
  `https://www.sii.cl/factura_electronica/factura_mercado/estado_dte.pdf`
- Consulta estado de envio:
  `https://www.sii.cl/factura_electronica/factura_mercado/estado_envio.pdf`
- Solicitud de reenvio de correo de validacion DTE:
  `https://www.sii.cl/factura_electronica/factura_mercado/OIFE2005_wsDTECorreo_MDE.pdf`
- Instructivo tecnico oficial:
  `https://www.sii.cl/ayudas/ayudas_por_servicios/2004-instructivo-2007.html`
- Portal de factura del SII, que enlaza la opcion de respaldo:
  `https://www1.sii.cl/factura_sii/factura_sii.htm`

## Script incluido

Archivo:

- [scripts/sii-backup-playwright.mjs](/Users/maxicatalan/Claude-Developments/Testing/Test-3/scripts/sii-backup-playwright.mjs)

Hace esto:

1. Abre un navegador persistente.
2. Te deja iniciar sesion manualmente en el SII.
3. Espera que llegues a la pantalla de respaldo.
4. Llena filtros comunes.
5. Busca documentos.
6. Selecciona lotes de hasta 20 documentos.
7. Descarga todos los lotes que pueda y avanza de pagina cuando exista esa opcion.

## Instalacion

```bash
npm install
npm run sii:backup:install-browser
```

## Ejemplos

Descargar recibidos por fecha:

```bash
npm run sii:backup -- --origen recibidos --desde 2026-04-01 --hasta 2026-04-30
```

Descargar emitidos filtrando RUT:

```bash
npm run sii:backup -- --origen emitidos --rut 76123456-7 --desde 2026-01-01 --hasta 2026-01-31
```

Solo dejar filtros listos sin descargar:

```bash
npm run sii:backup -- --origen recibidos --desde 2026-04-01 --hasta 2026-04-30 --dry-run
```

## Variables de ajuste fino

Si el portal cambia el HTML o los botones, puedes ajustar estas variables sin tocar el codigo:

- `SII_BACKUP_READY_TEXT`
- `SII_RESULTS_CHECKBOX_SELECTOR`
- `SII_DOWNLOAD_BUTTON_SELECTOR`
- `SII_NEXT_BUTTON_SELECTOR`

Ejemplo:

```bash
SII_DOWNLOAD_BUTTON_SELECTOR='input[value*="Respaldar"]' \
SII_NEXT_BUTTON_SELECTOR='input[value*="Siguiente"]' \
npm run sii:backup -- --origen recibidos --desde 2026-04-01 --hasta 2026-04-30
```

## Consideraciones

- Usa este flujo solo con una cuenta autorizada del contribuyente.
- Si usas certificado digital, el login suele requerir interaccion manual.
- El perfil persistente queda en `./.playwright/sii-profile`, asi que no deberias iniciar sesion desde cero en cada corrida.
- Las descargas quedan en `./downloads/sii`.
- Si en tu operacion realmente necesitas una API de negocio para integracion estable, lo correcto es guardar los XML DTE en el sistema emisor/receptor y usar los web services del SII para autenticacion, envio y consulta de estado, no como repositorio historico.
