#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";

const DEFAULTS = {
  backupUrl: "https://www1.sii.cl/cgi-bin/Portal001/auth.cgi",
  downloadsDir: "./downloads/sii",
  profileDir: "./.playwright/sii-profile",
  origin: "recibidos",
  headless: false,
  timeoutMs: 30000,
  downloadTimeoutMs: 90000,
  settleMs: 1500,
  maxSelection: 20,
  maxPages: 999,
  keepOpen: false,
  dryRun: false,
};

const HELP_TEXT = `
Uso:
  npm run sii:backup -- --origen recibidos --desde 2026-04-01 --hasta 2026-04-30

Opciones principales:
  --origen <emitidos|recibidos>   Origen del documento. Default: recibidos
  --tipo <texto>                  Texto visible del tipo de documento
  --desde <AAAA-MM-DD>            Fecha desde
  --hasta <AAAA-MM-DD>            Fecha hasta
  --folio-desde <n>               Folio desde
  --folio-hasta <n>               Folio hasta
  --rut <rut>                     RUT a filtrar
  --razon <texto>                 Razon social a filtrar
  --max-selection <n>             Maximo de documentos por descarga. Default: 20
  --max-pages <n>                 Limita la cantidad de paginas/lotes
  --downloads-dir <ruta>          Carpeta de descargas. Default: ./downloads/sii
  --profile-dir <ruta>            Perfil persistente de Playwright
  --headless                      Ejecuta sin interfaz
  --dry-run                       Llena filtros pero no descarga
  --keep-open                     Deja el navegador abierto al terminar
  --help                          Muestra esta ayuda

Variables opcionales de ajuste fino:
  SII_BACKUP_READY_TEXT           Texto que confirma que ya estas en la pantalla de respaldo
  SII_RESULTS_CHECKBOX_SELECTOR   Selector CSS para checkboxes de resultados
  SII_DOWNLOAD_BUTTON_SELECTOR    Selector CSS para el boton/link de descarga
  SII_NEXT_BUTTON_SELECTOR        Selector CSS para el boton/link de siguiente pagina

Notas:
  1. El script abre un navegador persistente para que puedas iniciar sesion manualmente
     con clave tributaria o certificado digital y reutilizar cookies entre corridas.
  2. Si es tu primera vez con Playwright, instala Chromium con:
     npm run sii:backup:install-browser
`;

function parseArgs(argv) {
  const parsed = {
    origin: DEFAULTS.origin,
    headless: DEFAULTS.headless,
    keepOpen: DEFAULTS.keepOpen,
    dryRun: DEFAULTS.dryRun,
    timeoutMs: DEFAULTS.timeoutMs,
    downloadTimeoutMs: DEFAULTS.downloadTimeoutMs,
    settleMs: DEFAULTS.settleMs,
    maxSelection: DEFAULTS.maxSelection,
    maxPages: DEFAULTS.maxPages,
    downloadsDir: DEFAULTS.downloadsDir,
    profileDir: DEFAULTS.profileDir,
    backupUrl: DEFAULTS.backupUrl,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = current.slice(2).split("=", 2);
    const key = rawKey.trim();
    const nextValue = inlineValue ?? argv[index + 1];
    const hasNextValue = inlineValue !== undefined || (nextValue && !nextValue.startsWith("--"));

    switch (key) {
      case "help":
        parsed.help = true;
        break;
      case "headless":
        parsed.headless = true;
        break;
      case "keep-open":
        parsed.keepOpen = true;
        break;
      case "dry-run":
        parsed.dryRun = true;
        break;
      case "origen":
      case "origin":
        parsed.origin = consumeValue(key, nextValue, hasNextValue);
        if (inlineValue === undefined) index += 1;
        break;
      case "tipo":
        parsed.type = consumeValue(key, nextValue, hasNextValue);
        if (inlineValue === undefined) index += 1;
        break;
      case "desde":
        parsed.from = consumeValue(key, nextValue, hasNextValue);
        if (inlineValue === undefined) index += 1;
        break;
      case "hasta":
        parsed.to = consumeValue(key, nextValue, hasNextValue);
        if (inlineValue === undefined) index += 1;
        break;
      case "folio-desde":
        parsed.folioFrom = consumeValue(key, nextValue, hasNextValue);
        if (inlineValue === undefined) index += 1;
        break;
      case "folio-hasta":
        parsed.folioTo = consumeValue(key, nextValue, hasNextValue);
        if (inlineValue === undefined) index += 1;
        break;
      case "rut":
        parsed.rut = consumeValue(key, nextValue, hasNextValue);
        if (inlineValue === undefined) index += 1;
        break;
      case "razon":
        parsed.razon = consumeValue(key, nextValue, hasNextValue);
        if (inlineValue === undefined) index += 1;
        break;
      case "max-selection":
        parsed.maxSelection = Number(consumeValue(key, nextValue, hasNextValue));
        if (inlineValue === undefined) index += 1;
        break;
      case "max-pages":
        parsed.maxPages = Number(consumeValue(key, nextValue, hasNextValue));
        if (inlineValue === undefined) index += 1;
        break;
      case "downloads-dir":
        parsed.downloadsDir = consumeValue(key, nextValue, hasNextValue);
        if (inlineValue === undefined) index += 1;
        break;
      case "profile-dir":
        parsed.profileDir = consumeValue(key, nextValue, hasNextValue);
        if (inlineValue === undefined) index += 1;
        break;
      case "timeout-ms":
        parsed.timeoutMs = Number(consumeValue(key, nextValue, hasNextValue));
        if (inlineValue === undefined) index += 1;
        break;
      case "download-timeout-ms":
        parsed.downloadTimeoutMs = Number(consumeValue(key, nextValue, hasNextValue));
        if (inlineValue === undefined) index += 1;
        break;
      case "backup-url":
        parsed.backupUrl = consumeValue(key, nextValue, hasNextValue);
        if (inlineValue === undefined) index += 1;
        break;
      default:
        throw new Error(`Opcion no reconocida: --${key}`);
    }
  }

  if (!["emitidos", "recibidos"].includes(String(parsed.origin).toLowerCase())) {
    throw new Error(`--origen debe ser emitidos o recibidos. Recibi: ${parsed.origin}`);
  }

  if (!Number.isFinite(parsed.maxSelection) || parsed.maxSelection <= 0) {
    throw new Error("--max-selection debe ser un numero mayor que 0");
  }

  if (!Number.isFinite(parsed.maxPages) || parsed.maxPages <= 0) {
    throw new Error("--max-pages debe ser un numero mayor que 0");
  }

  return parsed;
}

function consumeValue(key, value, hasValue) {
  if (!hasValue) {
    throw new Error(`Falta valor para --${key}`);
  }

  return value;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function logStep(message) {
  const timestamp = new Date().toLocaleTimeString("es-CL", { hour12: false });
  console.log(`[${timestamp}] ${message}`);
}

async function waitForEnter(message) {
  const rl = readline.createInterface({ input, output });
  try {
    await rl.question(`${message}\nPresiona Enter para continuar... `);
  } finally {
    rl.close();
  }
}

async function ensureDirectory(targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
}

async function fillFilters(page, options) {
  const originLabel = options.origin === "emitidos" ? "Emitidos" : "Recibidos";

  await setSelectInRow(page, ["Origen documento"], originLabel);

  if (options.type) {
    await setSelectInRow(page, ["Tipo documento"], options.type);
  }

  if (options.from) {
    await setInputInRow(page, ["Fecha desde hasta", "Fecha desde"], 0, options.from);
  }

  if (options.to) {
    await setInputInRow(page, ["Fecha desde hasta", "Fecha hasta"], 1, options.to);
  }

  if (options.folioFrom) {
    await setInputInRow(page, ["Folio desde hasta", "Folio desde"], 0, options.folioFrom);
  }

  if (options.folioTo) {
    await setInputInRow(page, ["Folio desde hasta", "Folio hasta"], 1, options.folioTo);
  }

  if (options.rut) {
    await setInputInRow(page, ["RUT"], 0, options.rut);
  }

  if (options.razon) {
    await setInputInRow(page, ["Razon social"], 0, options.razon);
  }
}

async function setSelectInRow(page, labels, optionText) {
  await page.evaluate(
    ({ labels, optionText }) => {
      const normalize = (value) =>
        String(value ?? "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();

      const labelCandidates = labels.map(normalize);
      const row = [...document.querySelectorAll("tr, div, section, fieldset")]
        .filter((candidate) => {
          const text = normalize(candidate.textContent);
          return labelCandidates.some((label) => text.includes(label)) && candidate.querySelector("select");
        })
        .sort((left, right) => normalize(left.textContent).length - normalize(right.textContent).length)[0];

      if (!row) {
        throw new Error(`No se encontro una fila/contenedor para ${labels.join(", ")}`);
      }

      const select = row.querySelector("select");
      if (!select) {
        throw new Error(`No se encontro select para ${labels.join(", ")}`);
      }

      const targetOption = [...select.options].find((candidate) => {
        const text = normalize(candidate.textContent || candidate.label || candidate.value);
        return text.includes(normalize(optionText));
      });

      if (!targetOption) {
        const available = [...select.options].map((candidate) => candidate.textContent?.trim()).join(", ");
        throw new Error(`No existe opcion "${optionText}" para ${labels.join(", ")}. Disponibles: ${available}`);
      }

      select.value = targetOption.value;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { labels, optionText },
  );
}

async function setInputInRow(page, labels, index, value) {
  await page.evaluate(
    ({ labels, index, value }) => {
      const normalize = (text) =>
        String(text ?? "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();

      const labelCandidates = labels.map(normalize);
      const row = [...document.querySelectorAll("tr, div, section, fieldset")]
        .filter((candidate) => {
          const text = normalize(candidate.textContent);
          const hasInputs = candidate.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])');
          return labelCandidates.some((label) => text.includes(label)) && hasInputs;
        })
        .sort((left, right) => normalize(left.textContent).length - normalize(right.textContent).length)[0];

      if (!row) {
        throw new Error(`No se encontro una fila/contenedor para ${labels.join(", ")}`);
      }

      const inputs = [...row.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])')];
      const targetInput = inputs[index];

      if (!targetInput) {
        throw new Error(`No se encontro input indice ${index} para ${labels.join(", ")}`);
      }

      targetInput.focus();
      targetInput.value = String(value);
      targetInput.dispatchEvent(new Event("input", { bubbles: true }));
      targetInput.dispatchEvent(new Event("change", { bubbles: true }));
      targetInput.blur();
    },
    { labels, index, value },
  );
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function waitForBackupPage(page, timeoutMs) {
  const readyText = process.env.SII_BACKUP_READY_TEXT;
  const patterns = [
    readyText ? new RegExp(escapeRegex(readyText), "i") : null,
    /Selecci[oó]n de respaldo/i,
    /Buscar documentos/i,
    /Respaldo de documentos emitidos\/recibidos/i,
  ].filter(Boolean);

  for (const pattern of patterns) {
    try {
      await page.getByText(pattern).first().waitFor({ timeout: timeoutMs });
      return;
    } catch {
      // Sigue intentando con otro patron.
    }
  }

  throw new Error("No pude confirmar que estas en la pantalla de respaldo del SII.");
}

async function clickSearch(page) {
  await clickByTextOrSelector(page, {
    selector: process.env.SII_SEARCH_BUTTON_SELECTOR,
    patterns: [/buscar documentos/i],
    description: "boton Buscar documentos",
  });
}

async function clickDownload(page) {
  await clickByTextOrSelector(page, {
    selector: process.env.SII_DOWNLOAD_BUTTON_SELECTOR,
    patterns: [/respald/i, /descarg/i, /bajar/i, /generar/i],
    description: "boton de descarga/respaldo",
  });
}

async function clickNext(page) {
  return clickByTextOrSelector(page, {
    selector: process.env.SII_NEXT_BUTTON_SELECTOR,
    patterns: [/siguiente/i, /^>$/i, /^>>$/i, /proxim/i],
    description: "boton de siguiente pagina",
    optional: true,
  });
}

async function clickByTextOrSelector(page, { selector, patterns, description, optional = false }) {
  if (selector) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      await locator.click();
      return true;
    }
  }

  const candidates = page.locator('button, input[type="button"], input[type="submit"], a');
  const count = await candidates.count();

  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    if (!(await candidate.isVisible().catch(() => false))) {
      continue;
    }

    const textContent = await candidate.evaluate((node) => {
      if (node instanceof HTMLInputElement) {
        return node.value || node.getAttribute("value") || "";
      }

      return node.textContent || "";
    });

    const normalized = normalizeText(textContent);
    const matches = patterns.some((pattern) => pattern.test(normalized));

    if (!matches) {
      continue;
    }

    await candidate.click();
    return true;
  }

  if (optional) {
    return false;
  }

  throw new Error(`No pude encontrar ${description}.`);
}

async function countSelectableCheckboxes(page, selector) {
  return page.evaluate((selectorToUse) => {
    const nodes = [...document.querySelectorAll(selectorToUse)];
    return nodes.filter((node) => {
      if (!(node instanceof HTMLInputElement) || node.type !== "checkbox") {
        return false;
      }

      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return (
        !node.disabled &&
        node.dataset.codexProcessed !== "1" &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    }).length;
  }, selector);
}

async function selectNextBatch(page, selector, maxSelection) {
  return page.evaluate(
    ({ selectorToUse, maxSelection }) => {
      const nodes = [...document.querySelectorAll(selectorToUse)];
      let selected = 0;

      for (const node of nodes) {
        if (
          !(node instanceof HTMLInputElement) ||
          node.type !== "checkbox" ||
          node.disabled ||
          node.checked ||
          node.dataset.codexProcessed === "1"
        ) {
          continue;
        }

        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) {
          continue;
        }

        node.click();
        node.dataset.codexProcessed = "1";
        selected += 1;

        if (selected >= maxSelection) {
          break;
        }
      }

      return selected;
    },
    { selectorToUse: selector, maxSelection },
  );
}

async function clearAllSelectedCheckboxes(page, selector) {
  return page.evaluate((selectorToUse) => {
    const nodes = [...document.querySelectorAll(selectorToUse)];
    for (const node of nodes) {
      if (node instanceof HTMLInputElement && node.type === "checkbox" && node.checked && !node.disabled) {
        node.click();
      }
    }
  }, selector);
}

function resolveCheckboxSelector() {
  return process.env.SII_RESULTS_CHECKBOX_SELECTOR || 'input[type="checkbox"]';
}

async function buildFileName(download, pageNumber, batchNumber) {
  try {
    const suggested = await download.suggestedFilename();
    return suggested || `sii-respaldo-p${pageNumber}-l${batchNumber}.zip`;
  } catch {
    return `sii-respaldo-p${pageNumber}-l${batchNumber}.zip`;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(HELP_TEXT.trim());
    return;
  }

  const downloadsDir = path.resolve(process.cwd(), options.downloadsDir);
  const profileDir = path.resolve(process.cwd(), options.profileDir);

  await ensureDirectory(downloadsDir);
  await ensureDirectory(profileDir);

  logStep(`Perfil persistente: ${profileDir}`);
  logStep(`Descargas: ${downloadsDir}`);

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: options.headless,
    acceptDownloads: true,
    downloadsPath: downloadsDir,
    viewport: null,
  });

  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(options.timeoutMs);

  try {
    logStep("Abriendo el portal del SII...");
    await page.goto(options.backupUrl, { waitUntil: "domcontentloaded" });

    await waitForEnter(
      "Inicia sesion manualmente en el navegador y navega hasta la pantalla 'Respaldo de documentos emitidos/recibidos'.",
    );

    logStep("Verificando que la pantalla de respaldo este lista...");
    await waitForBackupPage(page, options.timeoutMs);

    logStep("Aplicando filtros...");
    await fillFilters(page, options);

    if (options.dryRun) {
      logStep("Dry run activado: deje los filtros cargados y no continue con la descarga.");
      return;
    }

    logStep("Buscando documentos...");
    await clickSearch(page);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(options.settleMs);

    const checkboxSelector = resolveCheckboxSelector();
    let totalDownloads = 0;

    for (let pageNumber = 1; pageNumber <= options.maxPages; pageNumber += 1) {
      const availableCheckboxes = await countSelectableCheckboxes(page, checkboxSelector);

      if (availableCheckboxes === 0) {
        if (pageNumber === 1) {
          throw new Error(
            "No encontre checkboxes seleccionables en los resultados. Si el portal cambio, ajusta SII_RESULTS_CHECKBOX_SELECTOR.",
          );
        }

        logStep("No encontre mas documentos seleccionables en esta pagina.");
      } else {
        logStep(`Pagina/lote ${pageNumber}: ${availableCheckboxes} documentos seleccionables detectados.`);
      }

      let batchNumber = 1;
      const maxBatchesThisPage = Math.max(1, Math.ceil(availableCheckboxes / options.maxSelection));

      while (batchNumber <= maxBatchesThisPage) {
        const selected = await selectNextBatch(page, checkboxSelector, options.maxSelection);

        if (selected === 0) {
          break;
        }

        logStep(`Descargando lote ${pageNumber}.${batchNumber} con ${selected} documentos...`);

        const downloadPromise = page.waitForEvent("download", { timeout: options.downloadTimeoutMs });
        await clickDownload(page);
        const download = await downloadPromise;
        const fileName = await buildFileName(download, pageNumber, batchNumber);
        const targetPath = path.join(downloadsDir, fileName);

        await download.saveAs(targetPath);
        totalDownloads += 1;
        logStep(`Archivo guardado en ${targetPath}`);

        await page.waitForTimeout(options.settleMs);
        await clearAllSelectedCheckboxes(page, checkboxSelector);
        batchNumber += 1;
      }

      const moved = await clickNext(page);
      if (!moved) {
        logStep(`Proceso terminado. Se descargaron ${totalDownloads} archivo(s).`);
        return;
      }

      logStep("Avanzando a la siguiente pagina...");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(options.settleMs);
    }

    logStep(`Se alcanzo el limite de paginas configurado (${options.maxPages}).`);
  } finally {
    if (options.keepOpen) {
      logStep("El navegador quedara abierto por --keep-open.");
      return;
    }

    await context.close();
  }
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exitCode = 1;
});
