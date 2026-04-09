// XML Parser for SII Chile DTE (Documento Tributario Electrónico) format
// Handles ISO-8859-1 encoding common in Chilean electronic documents

/**
 * Parse a SII Chile SetDTE XML file that may contain multiple DTE invoices.
 * Returns one entry per DTE (invoice), each with its items and metadata.
 * @param {File} file - The XML file to parse
 * @returns {Promise<Array<{items: Array, metadata: Object, name: string}>>}
 */
export async function parseSIISetDTE(file) {
  const text = await readFileWithEncoding(file);
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, 'text/xml');

  const parseError = xmlDoc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid XML file: ' + parseError.textContent);
  }

  // Find all DTE elements (works for SetDTE wrapper or bare DTE files)
  const dteElements = xmlDoc.getElementsByTagName('DTE');

  if (dteElements.length === 0) {
    throw new Error('No DTE elements found in XML');
  }

  const invoices = [];

  for (const dte of dteElements) {
    const documento = dte.getElementsByTagName('Documento')[0];
    if (!documento) continue;

    const detalles = documento.getElementsByTagName('Detalle');
    if (detalles.length === 0) continue;

    const items = [];
    for (const detalle of detalles) {
      const item = extractItemFromDetalleRich(detalle);
      if (item) items.push(item);
    }
    if (items.length === 0) continue;

    const metadata = extractDocumentMetadata(documento);
    const folio = metadata.folio || '?';
    const vendor = metadata.razonSocialEmisor || 'Unknown';
    const date = metadata.fechaEmision || '';
    const name = `${vendor} — Folio ${folio}${date ? ' (' + date + ')' : ''}`;

    invoices.push({ items, metadata, name });
  }

  if (invoices.length === 0) {
    throw new Error('No valid invoices (with Detalle items) found in XML');
  }

  return invoices;
}

/**
 * Extract richer item data from a Detalle element (includes code, unit, totals)
 */
function extractItemFromDetalleRich(detalle) {
  const row = {};

  for (const child of detalle.children) {
    if (child.children.length === 0) {
      // Leaf node — use tag name as column key
      const val = child.textContent.trim();
      if (val) row[child.tagName] = val;
    } else {
      // Nested element (e.g. CdgItem) — flatten with parent prefix
      for (const grandchild of child.children) {
        const val = grandchild.textContent.trim();
        if (val) row[`${child.tagName}_${grandchild.tagName}`] = val;
      }
    }
  }

  // Must have at least an item name to be a valid row
  return Object.keys(row).length > 0 ? row : null;
}

/**
 * Extract invoice metadata from a Documento element
 */
function extractDocumentMetadata(documento) {
  const idDoc    = documento.getElementsByTagName('IdDoc')[0];
  const emisor   = documento.getElementsByTagName('Emisor')[0];
  const receptor = documento.getElementsByTagName('Receptor')[0];
  const totales  = documento.getElementsByTagName('Totales')[0];

  // Additional taxes — can be multiple (e.g. type 27=ILA, 271=sobretasa)
  const imptoRetenEls = totales ? Array.from(totales.getElementsByTagName('ImptoReten')) : [];
  const imptoRetenEntries = {};
  imptoRetenEls.forEach((el, i) => {
    const tipo  = getElementText(el, 'TipoImp');
    const tasa  = getElementText(el, 'TasaImp');
    const monto = getElementText(el, 'MontoImp');
    // Normalize rate to avoid duplicates: "18.0%", "18.00%", "18%" → "18%"
    const tasaNorm = tasa ? String(parseFloat(tasa)) : null;
    const labelParts = [`Tipo ${tipo || (i + 1)}`, tasaNorm && `Tasa ${tasaNorm}%`].filter(Boolean);
    const label = `imptoReten (${labelParts.join(' | ')})`;
    if (monto) imptoRetenEntries[label] = monto;
  });

  return {
    tipoDTE:             idDoc ? getElementText(idDoc, 'TipoDTE') : '',
    folio:               idDoc ? getElementText(idDoc, 'Folio')   : '',
    fechaEmision:        idDoc ? getElementText(idDoc, 'FchEmis') : '',
    rutEmisor:           emisor ? getElementText(emisor, 'RUTEmisor') : '',
    razonSocialEmisor:   emisor ? getElementText(emisor, 'RznSoc')   : '',
    rutReceptor:         receptor ? getElementText(receptor, 'RUTRecep')    : '',
    razonSocialReceptor: receptor ? getElementText(receptor, 'RznSocRecep') : '',
    // Totals
    montoNeto:   totales ? getElementText(totales, 'MntNeto')  : '',
    montoExento: totales ? getElementText(totales, 'MntExe')   : '',
    tasaIVA:     totales ? getElementText(totales, 'TasaIVA')  : '',
    iva:         totales ? getElementText(totales, 'IVA')       : '',
    ivaTerc:     totales ? getElementText(totales, 'IVATerc')  : '',
    montoTotal:  totales ? getElementText(totales, 'MntTotal') : '',
    ...imptoRetenEntries,
  };
}

/**
 * Get text content of a child element
 */
function getElementText(parent, tagName) {
  const element = parent.getElementsByTagName(tagName)[0];
  return element ? element.textContent.trim() : '';
}

/**
 * Read file with proper encoding detection
 * SII Chile files typically use ISO-8859-1 encoding
 */
async function readFileWithEncoding(file) {
  const arrayBuffer = await file.arrayBuffer();

  // Try to detect encoding from XML declaration
  const firstBytes = new Uint8Array(arrayBuffer.slice(0, 200));
  const header = new TextDecoder('ascii').decode(firstBytes);

  let encoding = 'UTF-8'; // Default

  // Check for encoding declaration in XML header
  const encodingMatch = header.match(/encoding=["']([^"']+)["']/i);
  if (encodingMatch) {
    encoding = encodingMatch[1].toUpperCase();
  }

  // Map common SII encodings
  if (encoding === 'ISO-8859-1' || encoding === 'LATIN1' || encoding === 'LATIN-1') {
    encoding = 'ISO-8859-1';
  }

  // Decode with detected encoding
  try {
    const decoder = new TextDecoder(encoding);
    return decoder.decode(arrayBuffer);
  } catch (e) {
    // Fallback to ISO-8859-1 for Chilean documents
    console.warn('Encoding detection failed, using ISO-8859-1:', e);
    const decoder = new TextDecoder('ISO-8859-1');
    return decoder.decode(arrayBuffer);
  }
}
