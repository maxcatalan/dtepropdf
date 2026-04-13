import {
  amountToWords,
  formatLongDate,
  getDocumentTypeLabel,
  getPaymentMethodLabel,
  slugify,
  toNumber,
} from '../utils/formatters';

function getNodeName(node) {
  return node?.localName || node?.tagName || '';
}

function findFirstDescendant(parent, tagName) {
  if (!parent) return null;

  if (getNodeName(parent) === tagName) return parent;

  return Array.from(parent.getElementsByTagName(tagName))[0] || null;
}

function findDescendants(parent, tagName) {
  if (!parent) return [];
  return Array.from(parent.getElementsByTagName(tagName));
}

function getText(parent, tagName) {
  const node = findFirstDescendant(parent, tagName);
  return node?.textContent?.trim() || '';
}

function compactXml(xml) {
  return xml
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseLineItem(detalle, index) {
  const itemName = normalizeText(getText(detalle, 'NmbItem'));
  const description = normalizeText(getText(detalle, 'DscItem'));
  const code = normalizeText(getText(findFirstDescendant(detalle, 'CdgItem'), 'VlrCodigo'));

  return {
    lineNumber: getText(detalle, 'NroLinDet') || String(index + 1),
    code,
    name: itemName || 'Item sin descripcion',
    description,
    quantity: toNumber(getText(detalle, 'QtyItem')) || 1,
    unit: normalizeText(getText(detalle, 'UnmdItem')) || 'UN',
    unitPrice: toNumber(getText(detalle, 'PrcItem')),
    total: toNumber(getText(detalle, 'MontoItem')),
  };
}

function extractTaxEntries(totales) {
  const taxes = findDescendants(totales, 'ImptoReten').map((entry, index) => {
    const typeCode = getText(entry, 'TipoImp') || `${index + 1}`;
    const rate = toNumber(getText(entry, 'TasaImp'));
    const amount = toNumber(getText(entry, 'MontoImp'));

    return {
      typeCode,
      rate,
      amount,
      label: rate > 0 ? `Tipo ${typeCode} (${rate}%)` : `Tipo ${typeCode}`,
    };
  });

  return taxes.filter((entry) => entry.amount > 0);
}

function extractGlobalAdjustments(documento) {
  const adjustments = findDescendants(documento, 'DscRcgGlobal').map((entry) => ({
    movementType: getText(entry, 'TpoMov'),
    label: normalizeText(getText(entry, 'GlosaDR')) || 'Ajuste',
    valueType: getText(entry, 'TpoValor'),
    amount: toNumber(getText(entry, 'ValorDR')),
  }));

  const monetaryAdjustments = adjustments.filter((entry) => entry.valueType === '$' && entry.amount > 0);

  return {
    discounts: monetaryAdjustments.filter((entry) => entry.movementType === 'D'),
    surcharges: monetaryAdjustments.filter((entry) => entry.movementType !== 'D'),
  };
}

function buildInvoice(documento, sourceName, sourceIndex) {
  const encabezado = findFirstDescendant(documento, 'Encabezado');
  const idDoc = findFirstDescendant(encabezado, 'IdDoc');
  const emisor = findFirstDescendant(encabezado, 'Emisor');
  const receptor = findFirstDescendant(encabezado, 'Receptor');
  const totales = findFirstDescendant(encabezado, 'Totales');
  const tedNode = findFirstDescendant(documento, 'TED');

  const items = findDescendants(documento, 'Detalle').map(parseLineItem);
  if (!items.length) return null;

  const tipoDte = getText(idDoc, 'TipoDTE');
  const folio = getText(idDoc, 'Folio') || `${sourceIndex + 1}`;
  const fechaEmision = getText(idDoc, 'FchEmis');
  const fechaVencimiento = getText(idDoc, 'FchVenc');
  const paymentCode = getText(idDoc, 'FmaPago');
  const taxEntries = extractTaxEntries(totales);
  const globalAdjustments = extractGlobalAdjustments(documento);
  const discountsTotal = globalAdjustments.discounts.reduce((sum, entry) => sum + entry.amount, 0);
  const surchargesTotal = globalAdjustments.surcharges.reduce((sum, entry) => sum + entry.amount, 0);

  const totals = {
    net: toNumber(getText(totales, 'MntNeto')),
    exempt: toNumber(getText(totales, 'MntExe')),
    vatRate: toNumber(getText(totales, 'TasaIVA')),
    vat: toNumber(getText(totales, 'IVA')),
    additionalTaxes: 0,
    withholdings: taxEntries.reduce((sum, entry) => sum + entry.amount, 0),
    discount: discountsTotal,
    surcharge: surchargesTotal,
    total: toNumber(getText(totales, 'MntTotal')),
  };

  const tedText = tedNode ? compactXml(new XMLSerializer().serializeToString(tedNode)) : '';
  const issueDateLong = formatLongDate(fechaEmision);

  return {
    id: `${slugify(sourceName)}-${tipoDte || 'dte'}-${folio}-${sourceIndex}`,
    sourceName,
    sourceIndex,
    document: {
      typeCode: tipoDte,
      typeLabel: getDocumentTypeLabel(tipoDte),
      number: folio,
      issueDate: fechaEmision,
      issueDateLong,
      dueDate: fechaVencimiento,
      dueDateLong: formatLongDate(fechaVencimiento),
      paymentMethodCode: paymentCode,
      paymentMethodLabel: getPaymentMethodLabel(paymentCode),
      amountInWords: amountToWords(totals.total),
    },
    issuer: {
      rut: getText(emisor, 'RUTEmisor'),
      name: normalizeText(getText(emisor, 'RznSoc')) || 'Emisor sin razon social',
      businessLine: normalizeText(getText(emisor, 'GiroEmis')),
      address: normalizeText(getText(emisor, 'DirOrigen')),
      commune: normalizeText(getText(emisor, 'CmnaOrigen')),
      city: normalizeText(getText(emisor, 'CiudadOrigen')),
    },
    receiver: {
      rut: getText(receptor, 'RUTRecep'),
      name: normalizeText(getText(receptor, 'RznSocRecep')) || 'Receptor sin razon social',
      businessLine: normalizeText(getText(receptor, 'GiroRecep')),
      address: normalizeText(getText(receptor, 'DirRecep')),
      commune: normalizeText(getText(receptor, 'CmnaRecep')),
      city: normalizeText(getText(receptor, 'CiudadRecep')),
    },
    items,
    totals,
    taxes: taxEntries,
    adjustments: globalAdjustments,
    stamp: {
      text: tedText,
      available: Boolean(tedText),
      legend: 'Timbre electronico S.I.I.',
      verificationUrl: 'http://www.sii.cl',
    },
  };
}

function getDocumentNodes(xmlDoc) {
  const dteNodes = Array.from(xmlDoc.getElementsByTagName('DTE'));
  if (dteNodes.length > 0) {
    return dteNodes
      .map((node) => findFirstDescendant(node, 'Documento'))
      .filter(Boolean);
  }

  const rootName = getNodeName(xmlDoc.documentElement);
  if (rootName === 'Documento') {
    return [xmlDoc.documentElement];
  }

  return Array.from(xmlDoc.getElementsByTagName('Documento'));
}

export async function parseDteFiles(files) {
  const invoices = [];

  for (const file of files) {
    const parsedInvoices = await parseDteFile(file);
    invoices.push(...parsedInvoices);
  }

  return invoices;
}

export async function parseDteFile(file) {
  const xmlText = await readFileWithEncoding(file);
  return parseDteXml(xmlText, file.name);
}

export function parseDteXml(xmlText, sourceName = 'documento.xml') {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  const parseError = xmlDoc.querySelector('parsererror');
  if (parseError) {
    throw new Error('El XML no es valido o no se pudo leer correctamente.');
  }

  const documents = getDocumentNodes(xmlDoc);
  if (!documents.length) {
    throw new Error('No se encontraron documentos DTE en el XML.');
  }

  const invoices = documents
    .map((documento, index) => buildInvoice(documento, sourceName, index))
    .filter(Boolean);

  if (!invoices.length) {
    throw new Error('El XML no contiene detalles de items listos para convertir.');
  }

  return invoices;
}

async function readFileWithEncoding(file) {
  const arrayBuffer = await file.arrayBuffer();
  const firstBytes = new Uint8Array(arrayBuffer.slice(0, 256));
  const header = new TextDecoder('ascii').decode(firstBytes);
  const encodingMatch = header.match(/encoding=["']([^"']+)["']/i);
  let encoding = encodingMatch ? encodingMatch[1].toUpperCase() : 'UTF-8';

  if (encoding === 'ISO-8859-1' || encoding === 'LATIN1' || encoding === 'LATIN-1') {
    encoding = 'ISO-8859-1';
  }

  try {
    return new TextDecoder(encoding).decode(arrayBuffer);
  } catch {
    return new TextDecoder('ISO-8859-1').decode(arrayBuffer);
  }
}
