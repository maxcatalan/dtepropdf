# DTE Workspace

Herramienta web hecha con React + Vite para:

- cargar XML DTE del SII
- explorar detalle, agregados y totales
- generar una vista PDF estilo factura chilena
- descargar datos en CSV o Excel

## Levantar el proyecto

```bash
npm install
npm run dev
```

Luego abre la URL que muestre Vite en la terminal.

## Comandos utiles

- `npm run dev`
  Inicia la app en modo desarrollo.

- `npm run build`
  Genera la version lista para publicar.

- `npm run lint`
  Revisa problemas basicos de codigo, por ejemplo variables sin usar o errores simples.

- `npm run test`
  Ejecuta pruebas automaticas. Sirve para comprobar que funciones criticas sigan funcionando despues de cambios.

- `npm run test:watch`
  Deja las pruebas escuchando cambios mientras se desarrolla.

## Que significan "scripts" y "tests"

- `scripts`
  Son atajos guardados en `package.json`. En vez de memorizar comandos largos, se usa algo simple como `npm run build`.

- `tests`
  Son revisiones automaticas del codigo. En este proyecto hoy cubren partes criticas del parser XML, para detectar rapido si una modificacion rompe la lectura de documentos.

## Estado actual

- La app procesa archivos localmente en el navegador.
- La vista PDF ya navega de forma lazy entre documentos para no renderizar todo el lote a la vez.
- La exportacion masiva de PDF muestra progreso durante la conversion.

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
