const DOCUMENT_TYPE_LABELS = {
  '33': 'FACTURA ELECTRONICA',
  '34': 'FACTURA EXENTA ELECTRONICA',
  '39': 'BOLETA ELECTRONICA',
  '41': 'BOLETA EXENTA ELECTRONICA',
  '43': 'LIQUIDACION FACTURA ELECTRONICA',
  '46': 'FACTURA DE COMPRA ELECTRONICA',
  '52': 'GUIA DE DESPACHO ELECTRONICA',
  '56': 'NOTA DE DEBITO ELECTRONICA',
  '61': 'NOTA DE CREDITO ELECTRONICA',
  '110': 'FACTURA DE EXPORTACION ELECTRONICA',
};

const PAYMENT_METHOD_LABELS = {
  '1': 'Contado',
  '2': 'Credito',
  '3': 'Sin costo',
};

const UNITS = [
  'cero',
  'uno',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
];

const TEN_TO_TWENTY_NINE = {
  10: 'diez',
  11: 'once',
  12: 'doce',
  13: 'trece',
  14: 'catorce',
  15: 'quince',
  16: 'dieciseis',
  17: 'diecisiete',
  18: 'dieciocho',
  19: 'diecinueve',
  20: 'veinte',
  21: 'veintiuno',
  22: 'veintidos',
  23: 'veintitres',
  24: 'veinticuatro',
  25: 'veinticinco',
  26: 'veintiseis',
  27: 'veintisiete',
  28: 'veintiocho',
  29: 'veintinueve',
};

const TENS = {
  3: 'treinta',
  4: 'cuarenta',
  5: 'cincuenta',
  6: 'sesenta',
  7: 'setenta',
  8: 'ochenta',
  9: 'noventa',
};

const HUNDREDS = {
  1: 'ciento',
  2: 'doscientos',
  3: 'trescientos',
  4: 'cuatrocientos',
  5: 'quinientos',
  6: 'seiscientos',
  7: 'setecientos',
  8: 'ochocientos',
  9: 'novecientos',
};

export function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;

  const normalized = String(value).trim().replace(/\s+/g, '').replace(/,/g, '.');
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatNumber(value, { maximumFractionDigits = 0 } = {}) {
  return new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDocumentAmount(value, { maximumFractionDigits = 0 } = {}) {
  return formatNumber(toNumber(value), { maximumFractionDigits });
}

export function formatCurrencyLabel(value, options) {
  return `$${formatDocumentAmount(value, options)}`;
}

export function formatQuantity(value) {
  const amount = toNumber(value);
  const hasDecimals = Math.abs(amount % 1) > 0.000001;
  return formatNumber(amount, { maximumFractionDigits: hasDecimals ? 3 : 0 });
}

export function formatLongDate(dateString) {
  if (!dateString) return 'Sin informacion';

  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;

  return new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function getDocumentTypeLabel(typeCode) {
  return DOCUMENT_TYPE_LABELS[typeCode] || 'DOCUMENTO TRIBUTARIO ELECTRONICO';
}

export function getPaymentMethodLabel(code) {
  if (!code) return 'Sin informacion';
  return PAYMENT_METHOD_LABELS[code] || `Codigo ${code}`;
}

function convertTens(number) {
  if (number < 10) return UNITS[number];
  if (number <= 29) return TEN_TO_TWENTY_NINE[number];

  const tens = Math.floor(number / 10);
  const remainder = number % 10;

  if (remainder === 0) return TENS[tens];
  return `${TENS[tens]} y ${UNITS[remainder]}`;
}

function convertHundreds(number) {
  if (number < 100) return convertTens(number);
  if (number === 100) return 'cien';

  const hundreds = Math.floor(number / 100);
  const remainder = number % 100;
  const prefix = HUNDREDS[hundreds];

  if (remainder === 0) return prefix;
  return `${prefix} ${convertTens(remainder)}`;
}

function convertThousands(number) {
  if (number < 1000) return convertHundreds(number);

  const thousands = Math.floor(number / 1000);
  const remainder = number % 1000;
  const prefix = thousands === 1 ? 'mil' : `${convertHundreds(thousands)} mil`;

  if (remainder === 0) return prefix;
  return `${prefix} ${convertHundreds(remainder)}`;
}

export function amountToWords(value) {
  const amount = Math.round(toNumber(value));

  if (amount === 0) return 'CERO';
  if (amount < 0) return `MENOS ${amountToWords(Math.abs(amount))}`;

  let words = '';

  if (amount >= 1000000) {
    const millions = Math.floor(amount / 1000000);
    const remainder = amount % 1000000;
    const millionText = millions === 1 ? 'un millon' : `${convertThousands(millions)} millones`;
    words = remainder === 0 ? millionText : `${millionText} ${convertThousands(remainder)}`;
  } else {
    words = convertThousands(amount);
  }

  return words
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function getInvoiceFileName(invoice) {
  const base = [
    invoice.document.typeCode || 'dte',
    invoice.document.number || invoice.id,
    slugify(invoice.receiver.name || invoice.receiver.rut || 'documento'),
  ].filter(Boolean).join('-');

  return `${base}.pdf`;
}

export function getBatchFileName(invoices) {
  if (!invoices.length) return 'xml-dte.pdf';
  const first = invoices[0];
  const source = first.sourceName?.replace(/\.[^.]+$/, '') || 'documentos-dte';
  return `${slugify(source)}-${invoices.length}-documentos.pdf`;
}
