import { Suspense, lazy, useState } from 'react';
import { parseSIISetDTE } from './services/dteParser';
import AggregatesPanel from './components/AggregatesPanel';
import { parseDteFiles } from './modules/xml-to-pdf/services/parseDteXml';
import AuthPage from './pages/AuthPage';
import { useAuth } from './context/AuthContext';
import './App.css';

const XmlToPdfConverter = lazy(() => import('./modules/xml-to-pdf'));
const OcrModule = lazy(() => import('./modules/ocr/OcrModule'));
const CustomOcrModule = lazy(() => import('./modules/ocr/CustomOcrModule'));

// Known SII Detalle fields in preferred display order
const ITEM_COLUMN_ORDER = [
  'NroLinDet',
  'CdgItem_TpoCodigo',
  'CdgItem_VlrCodigo',
  'IndExe',
  'NmbItem',
  'DscItem',
  'QtyRef',
  'UnmdRef',
  'PrcRef',
  'QtyItem',
  'UnmdItem',
  'PrcItem',
  'DescuentoPct',
  'DescuentoMonto',
  'RecargoPct',
  'RecargoMonto',
  'CodImpAdic',
  'MontoItem',
];

const ITEM_COLUMN_LABELS = {
  NroLinDet:        'Nro.',
  CdgItem_TpoCodigo:'Tipo Cód.',
  CdgItem_VlrCodigo:'Código',
  IndExe:           'Ind. Exe.',
  NmbItem:          'Nombre',
  DscItem:          'Descripción',
  QtyRef:           'Cant. Ref.',
  UnmdRef:          'Und. Ref.',
  PrcRef:           'Precio Ref.',
  QtyItem:          'Cantidad',
  UnmdItem:         'Unidad',
  PrcItem:          'Precio Unit.',
  DescuentoPct:     '% Desc.',
  DescuentoMonto:   'Desc. $',
  RecargoPct:       '% Recargo',
  RecargoMonto:     'Recargo $',
  CodImpAdic:       'Imp. Adic.',
  MontoItem:        'Monto',
};

// Fields that should be formatted as money
const MONEY_FIELDS = new Set([
  'PrcItem', 'MontoItem', 'DescuentoMonto', 'RecargoMonto', 'PrcRef',
]);

// Fields that should be right-aligned
const RIGHT_ALIGN_FIELDS = new Set([
  'NroLinDet', 'QtyItem', 'QtyRef', 'PrcItem', 'PrcRef',
  'DescuentoPct', 'DescuentoMonto', 'RecargoPct', 'RecargoMonto', 'MontoItem',
]);

/**
 * Returns the ordered list of column keys present in the given items array.
 * Known fields come first (in ITEM_COLUMN_ORDER), unknown fields follow alphabetically.
 */
function getDetailColumns(items) {
  const allKeys = new Set(items.flatMap((item) => Object.keys(item)));
  const ordered = ITEM_COLUMN_ORDER.filter((k) => allKeys.has(k));
  const known = new Set(ITEM_COLUMN_ORDER);
  const extra = [...allKeys].filter((k) => !known.has(k)).sort();
  return [...ordered, ...extra];
}

function formatDetailCell(key, value) {
  if (value === undefined || value === null || value === '') return '—';
  if (MONEY_FIELDS.has(key)) {
    const n = parseNumericValue(value);
    return n !== 0
      ? formatMoney(n, { maximumFractionDigits: key === 'PrcItem' || key === 'PrcRef' ? 3 : 0 })
      : value;
  }
  return value;
}

function parseNumericValue(value) {
  if (value === null || value === undefined || value === '') return 0;

  const normalized = String(value).replace(/\s+/g, '').replace(/,/g, '.');
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value, { maximumFractionDigits = 0 } = {}) {
  return new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatMoney(value, { maximumFractionDigits = 0 } = {}) {
  return `$${formatNumber(value, { maximumFractionDigits })}`;
}

function truncateValue(value, maxLength) {
  if (!value || value.length <= maxLength) return value || '—';
  return `${value.slice(0, maxLength - 1)}…`;
}

function getTaxKeys(invoices) {
  return [...new Set(
    invoices.flatMap(inv =>
      Object.keys(inv.metadata).filter(key =>
        key.startsWith('imptoReten') || key.startsWith('recargo') || key.startsWith('descuento')
      )
    )
  )];
}

function buildInvoiceRows(invoices, taxKeys) {
  return invoices.map((inv, idx) => ({
    idx,
    inv,
    _sort: {
      folio: inv.metadata.folio || '',
      fecha: inv.metadata.fechaEmision || '',
      proveedor: inv.metadata.razonSocialEmisor || '',
      rut: inv.metadata.rutEmisor || '',
      neto: parseNumericValue(inv.metadata.montoNeto),
      iva: parseNumericValue(inv.metadata.iva),
      total: parseNumericValue(inv.metadata.montoTotal),
      items: inv.items.length,
      ...Object.fromEntries(taxKeys.map(key => [key, parseNumericValue(inv.metadata[key])])),
    },
  }));
}

function buildVendorRows(invoices, taxKeys) {
  const grouped = {};

  for (const inv of invoices) {
    const rut = inv.metadata.rutEmisor || '?';

    if (!grouped[rut]) {
      grouped[rut] = {
        rut,
        proveedor: inv.metadata.razonSocialEmisor || '—',
        neto: 0,
        iva: 0,
        total: 0,
        facturas: 0,
        items: 0,
        taxes: {},
      };
    }

    const group = grouped[rut];
    group.neto += parseNumericValue(inv.metadata.montoNeto);
    group.iva += parseNumericValue(inv.metadata.iva);
    group.total += parseNumericValue(inv.metadata.montoTotal);
    group.facturas += 1;
    group.items += inv.items.length;

    for (const key of taxKeys) {
      group.taxes[key] = (group.taxes[key] || 0) + parseNumericValue(inv.metadata[key]);
    }
  }

  return Object.values(grouped).map(group => ({
    ...group,
    _sort: {
      proveedor: group.proveedor,
      rut: group.rut,
      neto: group.neto,
      iva: group.iva,
      total: group.total,
      facturas: group.facturas,
      items: group.items,
      ...Object.fromEntries(taxKeys.map(key => [key, group.taxes[key] || 0])),
    },
  }));
}

// Invoice-level metadata columns available in the "por línea" view
const META_COLS = [
  { key: 'folio',               label: 'Folio',          defaultVisible: true  },
  { key: 'fechaEmision',        label: 'Fecha',          defaultVisible: true  },
  { key: 'tipoDTE',             label: 'Tipo DTE',       defaultVisible: false },
  { key: 'razonSocialEmisor',   label: 'Proveedor',      defaultVisible: true  },
  { key: 'rutEmisor',           label: 'RUT Emisor',     defaultVisible: true  },
  { key: 'razonSocialReceptor', label: 'Receptor',       defaultVisible: false },
  { key: 'rutReceptor',         label: 'RUT Receptor',   defaultVisible: false },
  { key: 'montoNeto',           label: 'Neto Factura',   defaultVisible: false },
  { key: 'iva',                 label: 'IVA Factura',    defaultVisible: false },
  { key: 'montoTotal',          label: 'Total Factura',  defaultVisible: false },
];

// Keys hidden by default in the line view (meta cols marked defaultVisible: false)
const DEFAULT_HIDDEN_LINE_COLS = new Set(
  META_COLS.filter((c) => !c.defaultVisible).map((c) => `meta_${c.key}`)
);

/**
 * Flat table — one row per item per invoice.
 * Each row contains all extracted item fields plus invoice-level meta fields (prefixed meta_).
 */
function buildLineRows(invoices) {
  const allItems = invoices.flatMap((inv) => inv.items);
  const itemKeys = getDetailColumns(allItems);

  const rows = [];
  for (const inv of invoices) {
    for (const item of inv.items) {
      const row = {};
      for (const key of itemKeys) {
        row[key] = item[key] ?? '';
      }
      for (const { key } of META_COLS) {
        row[`meta_${key}`] = inv.metadata[key] ?? '';
      }
      row._sort = {
        ...Object.fromEntries(itemKeys.map((k) => [k, item[k] ?? ''])),
        ...Object.fromEntries(META_COLS.map(({ key }) => [`meta_${key}`, inv.metadata[key] ?? ''])),
      };
      rows.push(row);
    }
  }

  return { rows, itemKeys };
}

/**
 * Builds product rows dynamically from actual XML fields.
 * Numeric fields are summed; text fields keep the first non-empty value.
 * NroLinDet (line index) is excluded — it's meaningless when aggregating by product.
 * Returns { rows, orderedKeys, numericKeys }.
 */
function buildDynamicProductRows(invoices) {
  const allItems = invoices.flatMap((inv) => inv.items);
  const allKeys = [...new Set(allItems.flatMap((item) => Object.keys(item)))];
  const skipKeys = new Set(['NroLinDet']);
  const usableKeys = allKeys.filter((k) => !skipKeys.has(k));

  // A key is numeric if every non-empty value across all items is a valid number string.
  // Intentionally uses Number() directly — NOT parseNumericValue — because
  // parseNumericValue(NaN) returns 0 which is finite, causing text fields to be
  // misclassified as numeric.
  const numericKeys = new Set();
  for (const key of usableKeys) {
    const values = allItems
      .map((item) => item[key])
      .filter((v) => v !== undefined && v !== null && v !== '');
    if (values.length > 0 && values.every((v) => !isNaN(Number(String(v).trim())))) {
      numericKeys.add(key);
    }
  }

  // Order: ITEM_COLUMN_ORDER first (minus skipped), then alphabetical extras
  const knownSet = new Set(ITEM_COLUMN_ORDER);
  const orderedKeys = [
    ...ITEM_COLUMN_ORDER.filter((k) => usableKeys.includes(k)),
    ...usableKeys.filter((k) => !knownSet.has(k)).sort(),
  ];

  const grouped = {};

  for (const inv of invoices) {
    const invoiceKey = [
      inv.metadata.rutEmisor || inv.metadata.razonSocialEmisor || '—',
      inv.metadata.folio || inv.name || 'sin-folio',
      inv.metadata.fechaEmision || 'sin-fecha',
    ].join('::');

    for (const item of inv.items) {
      const codigo = item.CdgItem_VlrCodigo?.trim() || '';
      const nombre = (item.NmbItem?.trim() || 'Sin nombre').toUpperCase();
      const unidad = (item.UnmdItem?.trim() || '').toUpperCase();
      const productKey = `${codigo || nombre}::${nombre}::${unidad}`;

      if (!grouped[productKey]) {
        const init = {};
        for (const key of orderedKeys) {
          init[key] = numericKeys.has(key) ? 0 : '';
        }
        grouped[productKey] = { ...init, _facturasSet: new Set() };
      }

      const group = grouped[productKey];
      group._facturasSet.add(invoiceKey);

      for (const key of orderedKeys) {
        const v = item[key];
        if (numericKeys.has(key)) {
          if (v !== undefined && v !== null && v !== '') {
            group[key] += parseNumericValue(v);
          }
        } else if (!group[key] && v) {
          // Keep first non-empty value for text fields
          group[key] = v;
        }
      }
    }
  }

  const rows = Object.values(grouped).map((group) => ({
    ...group,
    _facturas: group._facturasSet.size,
    _sort: Object.fromEntries(orderedKeys.map((k) => [k, group[k]])),
  }));

  return { rows, orderedKeys, numericKeys };
}

// ── Per-view export data builders (module-level, no state) ──────────────────

function buildInvoiceExportData(invoices, taxKeys) {
  const header = ['Folio', 'Fecha', 'Proveedor', 'RUT Emisor', 'Neto', 'IVA',
    ...taxKeys, 'Total', 'Ítems'];
  const rows = invoices.map((inv) => {
    const m = inv.metadata;
    return [
      m.folio || '', m.fechaEmision || '', m.razonSocialEmisor || '', m.rutEmisor || '',
      m.montoNeto || '', m.iva || '',
      ...taxKeys.map((k) => m[k] || ''),
      m.montoTotal || '', inv.items.length,
    ];
  });
  return [header, ...rows];
}

function buildVendorExportData(invoices, taxKeys) {
  const groups = buildVendorRows(invoices, taxKeys);
  const header = ['Proveedor', 'RUT', 'Neto', 'IVA', ...taxKeys, 'Total', 'Facturas', 'Ítems'];
  const rows = groups.map((g) => [
    g.proveedor, g.rut, g.neto, g.iva,
    ...taxKeys.map((k) => g.taxes[k] || 0),
    g.total, g.facturas, g.items,
  ]);
  return [header, ...rows];
}

function buildProductExportData(invoices) {
  const { rows, orderedKeys } = buildDynamicProductRows(invoices);
  const header = [...orderedKeys.map((k) => ITEM_COLUMN_LABELS[k] ?? k), 'Facturas'];
  return [header, ...rows.map((row) => [...orderedKeys.map((k) => row[k] ?? ''), row._facturas])];
}

function buildLineExportData(invoices) {
  const allItems = invoices.flatMap((inv) => inv.items);
  const itemKeys = getDetailColumns(allItems);
  const metaCols = ['folio', 'fechaEmision', 'razonSocialEmisor', 'rutEmisor', 'montoNeto', 'iva', 'montoTotal'];
  const metaLabels = { folio: 'Folio', fechaEmision: 'Fecha', razonSocialEmisor: 'Proveedor',
    rutEmisor: 'RUT Emisor', montoNeto: 'Neto', iva: 'IVA', montoTotal: 'Total' };
  const header = [...metaCols.map((k) => metaLabels[k]), ...itemKeys.map((k) => ITEM_COLUMN_LABELS[k] ?? k)];
  const rows = [];
  for (const inv of invoices) {
    for (const item of inv.items) {
      rows.push([...metaCols.map((k) => inv.metadata[k] ?? ''), ...itemKeys.map((k) => item[k] ?? '')]);
    }
  }
  return [header, ...rows];
}

const DOWNLOAD_VIEWS = [
  { key: 'invoice', label: 'Por factura' },
  { key: 'vendor',  label: 'Por proveedor' },
  { key: 'product', label: 'Por producto' },
  { key: 'line',    label: 'Por línea' },
];

// ────────────────────────────────────────────────────────────────────────────

function App() {
  const { user, loading: authLoading, credits, signOut } = useAuth();
  const [activeModule, setActiveModule] = useState('xml'); // 'xml' | 'ocr' | 'custom'
  const [invoices, setInvoices] = useState([]);
  const [pdfInvoices, setPdfInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [viewMode, setViewMode] = useState('detail'); // 'detail', 'table', 'pdf', or 'totals'
  const [tableSort, setTableSort] = useState({ col: null, dir: 'asc' });
  const [tableMode, setTableMode] = useState('totales');
  const [hiddenProductCols, setHiddenProductCols] = useState(new Set());
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [hiddenLineCols, setHiddenLineCols] = useState(() => new Set(DEFAULT_HIDDEN_LINE_COLS));
  const [linePickerOpen, setLinePickerOpen] = useState(false);
  const [collapseImpuestos, setCollapseImpuestos] = useState(false);
  const [collapseDscRcg, setCollapseDscRcg] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState('xlsx');
  const [downloadViews, setDownloadViews] = useState(() => new Set(['invoice', 'vendor']));

  const [loadProgress, setLoadProgress] = useState(null); // null | { done, total }

  const handleFilesSelected = async (files) => {
    setError('');
    setLoading(true);
    setLoadProgress(files.length > 20 ? { done: 0, total: files.length } : null);

    const allInvoices = [];
    const parsedPdfInvoices = [];
    let skipped = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Run both parsers in parallel per file; skip on error instead of aborting
        const [explorerResult, pdfResult] = await Promise.allSettled([
          parseSIISetDTE(file),
          parseDteFiles([file]),
        ]);

        if (explorerResult.status === 'fulfilled') {
          allInvoices.push(...explorerResult.value);
        } else {
          skipped++;
        }

        if (pdfResult.status === 'fulfilled') {
          parsedPdfInvoices.push(...pdfResult.value);
        }

        if (files.length > 20) {
          setLoadProgress({ done: i + 1, total: files.length });
        }
      }

      if (allInvoices.length === 0) {
        setError(`No se encontraron facturas DTE válidas.${skipped ? ` ${skipped} archivo(s) ignorados.` : ''}`);
        return;
      }

      setInvoices(allInvoices);
      setPdfInvoices(parsedPdfInvoices);
      setSelectedIdx(0);
      setTableMode('invoice');
      setTableSort({ col: null, dir: 'asc' });
      if (skipped > 0) {
        setError(`Cargados ${allInvoices.length} documentos. ${skipped} archivo(s) no se pudieron leer y fueron ignorados.`);
      }
    } catch (err) {
      setError(err.message);
      setInvoices([]);
      setPdfInvoices([]);
    } finally {
      setLoading(false);
      setLoadProgress(null);
    }
  };

  const resetWorkspace = () => {
    setInvoices([]);
    setPdfInvoices([]);
    setSelectedIdx(0);
    setError('');
    setLoading(false);
    setLoadProgress(null);
    setViewMode('detail');
    setTableMode('invoice');
    setTableSort({ col: null, dir: 'asc' });
    setHiddenProductCols(new Set());
    setProductPickerOpen(false);
    setHiddenLineCols(new Set(DEFAULT_HIDDEN_LINE_COLS));
    setLinePickerOpen(false);
    setCollapseImpuestos(false);
    setCollapseDscRcg(false);
    setDownloadOpen(false);
    setDownloadFormat('xlsx');
    setDownloadViews(new Set(['invoice', 'vendor']));
  };

  const calculateAggregates = () => {
    // Only aggregate these financial amount fields (not rates or identifiers)
    const fieldsToAggregate = [
      'montoNeto',
      'montoExento',
      'iva',
      'ivaTerc',
      'montoTotal'
    ];

    const aggregates = {};

    for (const invoice of invoices) {
      for (const key of fieldsToAggregate) {
        const value = invoice.metadata[key];
        if (!value || value === '') continue;

        const numVal = parseNumericValue(value);
        if (numVal > 0) {
          aggregates[key] = (aggregates[key] || 0) + numVal;
        }
      }

      // Also aggregate imptoReten, recargo, and descuento entries
      for (const [key, value] of Object.entries(invoice.metadata)) {
        if (key.startsWith('imptoReten') || key.startsWith('recargo') || key.startsWith('descuento')) {
          const numVal = parseNumericValue(value);
          if (numVal > 0) {
            aggregates[key] = (aggregates[key] || 0) + numVal;
          }
        }
      }
    }

    return aggregates;
  };

  const handleDownload = async () => {
    if (invoices.length === 0 || downloadViews.size === 0) return;
    setDownloadOpen(false);

    const taxKeys = getTaxKeys(invoices);
    const builders = {
      invoice: () => buildInvoiceExportData(invoices, taxKeys),
      vendor:  () => buildVendorExportData(invoices, taxKeys),
      product: () => buildProductExportData(invoices),
      line:    () => buildLineExportData(invoices),
    };
    const viewLabels = Object.fromEntries(DOWNLOAD_VIEWS.map(({ key, label }) => [key, label]));
    const selected = DOWNLOAD_VIEWS.map((v) => v.key).filter((k) => downloadViews.has(k));
    const date = new Date().toISOString().split('T')[0];

    if (downloadFormat === 'xlsx') {
      const { utils, writeFile } = await import('xlsx');
      const wb = utils.book_new();
      for (const view of selected) {
        const ws = utils.aoa_to_sheet(builders[view]());
        utils.book_append_sheet(wb, ws, viewLabels[view]);
      }
      writeFile(wb, `dtes-${date}.xlsx`);
    } else {
      // CSV: one file per selected view
      for (const view of selected) {
        const rows = builders[view]();
        const csv = rows.map((row) =>
          row.map((cell) => {
            const str = String(cell ?? '');
            return str.includes(',') || str.includes('"') || str.includes('\n')
              ? `"${str.replace(/"/g, '""')}"` : str;
          }).join(',')
        ).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `dtes-${view}-${date}.csv`;
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  };

  const moduleNav = (
    <nav className="module-nav">
      <button
        className={`module-nav-btn ${activeModule === 'xml' ? 'active' : ''}`}
        onClick={() => setActiveModule('xml')}
      >
        XML DTE
      </button>
      <button
        className={`module-nav-btn ${activeModule === 'ocr' ? 'active' : ''}`}
        onClick={() => setActiveModule('ocr')}
      >
        OCR Facturas
      </button>
      <button
        className={`module-nav-btn ${activeModule === 'custom' ? 'active' : ''}`}
        onClick={() => setActiveModule('custom')}
      >
        OCR Personalizado
      </button>
    </nav>
  );

  // Auth gate
  if (authLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="ocr-spinner" style={{ width: 36, height: 36 }} />
    </div>
  );
  if (!user) return <AuthPage />;

  const userBar = (
    <div className="app-user-bar">
      <span className="app-user-bar__credits" title="Créditos disponibles">
        {credits.ocr} OCR · {credits.xml} XML
      </span>
      <span className="app-user-bar__email">{user.email}</span>
      <button className="app-user-bar__signout" onClick={signOut}>Salir</button>
    </div>
  );

  if (activeModule === 'custom') {
    return (
      <div className="app-shell">
        <header className="app-shell__header">
          <div className="app-shell__brand">
            <span className="app-shell__eyebrow">Área de trabajo DTE</span>
            <h1>Herramientas XML del SII</h1>
          </div>
          {moduleNav}
          {userBar}
        </header>
        <main className="app-shell__content">
          <div className="page-container">
            <div className="module-title-row">
              <div>
                <h1>OCR Personalizado</h1>
                <p className="module-subtitle">Define los campos que quieres extraer y sube cualquier documento — facturas, guías, contratos, etc.</p>
              </div>
            </div>
            <Suspense fallback={<p className="loading">Cargando módulo…</p>}>
              <CustomOcrModule />
            </Suspense>
          </div>
        </main>
      </div>
    );
  }

  if (activeModule === 'ocr') {
    return (
      <div className="app-shell">
        <header className="app-shell__header">
          <div className="app-shell__brand">
            <span className="app-shell__eyebrow">Área de trabajo DTE</span>
            <h1>Herramientas XML del SII</h1>
          </div>
          {moduleNav}
          {userBar}
        </header>
        <main className="app-shell__content">
          <div className="page-container">
            <div className="module-title-row">
              <div>
                <h1>OCR — Extracción de tabla</h1>
                <p className="module-subtitle">Sube una imagen o PDF de cualquier factura y extrae la tabla principal para descargar en Excel o CSV.</p>
              </div>
            </div>
            <Suspense fallback={<p className="loading">Cargando módulo…</p>}>
              <OcrModule />
            </Suspense>
          </div>
        </main>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="app-shell">
        <header className="app-shell__header">
          <div className="app-shell__brand">
            <span className="app-shell__eyebrow">Área de trabajo DTE</span>
            <h1>Herramientas XML del SII</h1>
          </div>
          {moduleNav}
          {userBar}
        </header>

        <main className="app-shell__content">
          <div className="page-container">
            <div className="module-title-row">
              <div>
                <h1>DTE Parser</h1>
                <p className="module-subtitle">Explora XML del SII por detalle, agregados, PDF y totales.</p>
              </div>
            </div>
            <UploadZone onFilesSelected={handleFilesSelected} disabled={loading} />
            {loading && (
              <p className="loading">
                {loadProgress
                  ? `Procesando ${loadProgress.done} / ${loadProgress.total} archivos...`
                  : 'Procesando archivos...'}
              </p>
            )}
            {error && <p className="error">⚠️ {error}</p>}
          </div>
        </main>
      </div>
    );
  }

  const current = invoices[selectedIdx];
  const currentPdfInvoice = pdfInvoices[selectedIdx] || pdfInvoices[0] || null;

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <div className="app-shell__brand">
          <span className="app-shell__eyebrow">Área de trabajo DTE</span>
          <h1>Herramientas XML del SII</h1>
        </div>
        {moduleNav}
      </header>

      <main className="app-shell__content">
        <div className="page-container">
          {/* View Mode Tabs */}
          <div className="view-mode-tabs">
            <button
              className={`view-tab ${viewMode === 'detail' ? 'active' : ''}`}
              onClick={() => setViewMode('detail')}
            >
              Detalle
            </button>
            <button
              className={`view-tab ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              Agregado
            </button>
            <button
              className={`view-tab ${viewMode === 'pdf' ? 'active' : ''}`}
              onClick={() => setViewMode('pdf')}
            >
              PDF
            </button>
            <div className="tab-actions">
              <div className="download-wrapper">
                <button
                  className="btn-primary"
                  onClick={() => setDownloadOpen((v) => !v)}
                >
                  ⬇ Descarga
                </button>
                {downloadOpen && (
                  <>
                    <div className="download-overlay" onClick={() => setDownloadOpen(false)} />
                    <div className="download-panel">
                      <div className="dl-section">
                        <span className="dl-label">Formato</span>
                        <div className="dl-format-toggle">
                          {['xlsx', 'csv'].map((fmt) => (
                            <button
                              key={fmt}
                              className={`dl-fmt-btn ${downloadFormat === fmt ? 'active' : ''}`}
                              onClick={() => setDownloadFormat(fmt)}
                            >
                              {fmt === 'xlsx' ? 'Excel' : 'CSV'}
                            </button>
                          ))}
                        </div>
                        {downloadFormat === 'csv' && downloadViews.size > 1 && (
                          <p className="dl-hint">CSV descarga un archivo por vista</p>
                        )}
                      </div>
                      <div className="dl-section">
                        <span className="dl-label">Incluir</span>
                        <div className="dl-checkboxes">
                          {DOWNLOAD_VIEWS.map(({ key, label }) => (
                            <label key={key} className="dl-check-item">
                              <input
                                type="checkbox"
                                checked={downloadViews.has(key)}
                                onChange={() => {
                                  setDownloadViews((prev) => {
                                    const next = new Set(prev);
                                    next.has(key) ? next.delete(key) : next.add(key);
                                    return next;
                                  });
                                }}
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <button
                        className="btn-primary dl-go-btn"
                        onClick={handleDownload}
                        disabled={downloadViews.size === 0}
                      >
                        Descargar
                      </button>
                    </div>
                  </>
                )}
              </div>
              <button onClick={resetWorkspace} className="btn-secondary">Reiniciar</button>
            </div>
          </div>

          {/* Batch Progress Bar (Detail/PDF View Only) */}
          {(viewMode === 'detail' || viewMode === 'pdf') && (
            <div className="batch-progress-bar">
              <span className="batch-progress-label">Factura {selectedIdx + 1} de {invoices.length}</span>
              <div className="batch-nav-arrows">
                <button
                  className="batch-arrow-btn"
                  onClick={() => setSelectedIdx(Math.max(0, selectedIdx - 1))}
                  disabled={selectedIdx === 0}
                >
                  ←
                </button>
                <button
                  className="batch-arrow-btn"
                  onClick={() => setSelectedIdx(Math.min(invoices.length - 1, selectedIdx + 1))}
                  disabled={selectedIdx === invoices.length - 1}
                >
                  →
                </button>
              </div>
            </div>
          )}

          {/* Detail View */}
          {viewMode === 'detail' && (
          <div className="content-layout">
        {/* Left sidebar - Metadata */}
        <div className="sidebar">
            {/* Invoice Metadata Section */}
            <div className="sidebar-section">
              <div className="sidebar-section-header">
                <h3>Document Info</h3>
              </div>
              <div className="metadata-list" style={{ maxHeight: '400px' }}>
                {Object.entries(current.metadata).map(([key, value]) => {
                  if (!value || value === '') return null;

                  // Format the label nicely
                  const label = key
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/^./, str => str.toUpperCase())
                    .trim();

                  // Format the value
                  let displayValue = value;
                  if (typeof value === 'string' && value.match(/^\d+$/)) {
                    const num = parseInt(value);
                    if (num > 100) {
                      displayValue = num.toLocaleString();
                    } else {
                      displayValue = value;
                    }
                  }

                  const isHighlight = key === 'montoTotal';

                  return (
                    <div key={key} className={`metadata-row ${isHighlight ? 'highlight' : ''}`}>
                      <span className="meta-label">{label}</span>
                      <span className="meta-value">{displayValue}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right main - Table */}
          <div className="main-content">
            <div className="table-wrapper">
              {(() => {
                const cols = getDetailColumns(current.items);
                return (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        {cols.map((key) => (
                          <th
                            key={key}
                            style={{ textAlign: RIGHT_ALIGN_FIELDS.has(key) ? 'right' : 'left' }}
                          >
                            {ITEM_COLUMN_LABELS[key] ?? key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {current.items.map((item, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          {cols.map((key) => (
                            <td
                              key={key}
                              style={{ textAlign: RIGHT_ALIGN_FIELDS.has(key) ? 'right' : 'left' }}
                            >
                              {formatDetailCell(key, item[key])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        </div>
          )}

          {/* PDF View */}
          {viewMode === 'pdf' && currentPdfInvoice && (
            <Suspense fallback={<p className="loading">Cargando módulo PDF…</p>}>
              <XmlToPdfConverter
                embedded
                controlledInvoices={pdfInvoices}
                controlledSelectedId={currentPdfInvoice.id}
              />
            </Suspense>
          )}

          {/* Table View - All Invoices */}
          {viewMode === 'table' && (() => {
        const taxKeys = getTaxKeys(invoices);
        const imptoKeys = taxKeys.filter((k) => k.startsWith('imptoReten'));
        const dscRcgKeys = taxKeys.filter((k) => k.startsWith('recargo') || k.startsWith('descuento'));

        // Sort helper — handles synthetic collapsed-column sort keys
        const applySort = (rows) => {
          if (!tableSort.col) return rows;
          const col = tableSort.col;
          return [...rows].sort((a, b) => {
            let av, bv;
            if (col === '_impuestos') {
              av = imptoKeys.reduce((s, k) => s + (Number(a._sort[k]) || 0), 0);
              bv = imptoKeys.reduce((s, k) => s + (Number(b._sort[k]) || 0), 0);
            } else if (col === '_dscRcg') {
              av = dscRcgKeys.reduce((s, k) => s + (Number(a._sort[k]) || 0), 0);
              bv = dscRcgKeys.reduce((s, k) => s + (Number(b._sort[k]) || 0), 0);
            } else {
              av = a._sort[col] ?? '';
              bv = b._sort[col] ?? '';
            }
            const cmp = typeof av === 'number'
              ? av - bv
              : String(av).localeCompare(String(bv), 'es', { sensitivity: 'base' });
            return tableSort.dir === 'asc' ? cmp : -cmp;
          });
        };

        const setSort = (col, dir = 'toggle') => {
          setTableSort(prev => {
            if (dir === 'toggle') {
              return prev.col === col
                ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                : { col, dir: 'asc' };
            }

            return { col, dir };
          });
        };

        const SortTh = ({ col, children, right }) => (
          <th style={{ whiteSpace: 'nowrap', textAlign: right ? 'right' : 'left' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
              {children}
              <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1 }}>
                <button className="sort-btn" onClick={() => setSort(col, 'asc')}
                  style={{ opacity: tableSort.col === col && tableSort.dir === 'asc' ? 1 : 0.3 }}>▲</button>
                <button className="sort-btn" onClick={() => setSort(col, 'desc')}
                  style={{ opacity: tableSort.col === col && tableSort.dir === 'desc' ? 1 : 0.3 }}>▼</button>
              </span>
            </span>
          </th>
        );

        const renderToolbar = () => (
          <div className="table-toolbar">
            <button className={`btn-secondary ${tableMode === 'totales' ? 'active' : ''}`} onClick={() => setTableMode('totales')}>
              Totales
            </button>
            <button className={`btn-secondary ${tableMode === 'vendor' ? 'active' : ''}`} onClick={() => setTableMode('vendor')}>
              Por Proveedor
            </button>
            <button className={`btn-secondary ${tableMode === 'invoice' ? 'active' : ''}`} onClick={() => setTableMode('invoice')}>
              Por Factura
            </button>
            <button className={`btn-secondary ${tableMode === 'product' ? 'active' : ''}`} onClick={() => setTableMode('product')}>
              Por Producto
            </button>
            <button className={`btn-secondary ${tableMode === 'line' ? 'active' : ''}`} onClick={() => setTableMode('line')}>
              Por Línea
            </button>
          </div>
        );

        // Collapse toggle buttons — only shown in invoice/vendor modes when 2+ keys exist
        const renderCollapseControls = () => {
          if (tableMode !== 'invoice' && tableMode !== 'vendor') return null;
          const showImpuestos = imptoKeys.length >= 2;
          const showDscRcg = dscRcgKeys.length >= 2;
          if (!showImpuestos && !showDscRcg) return null;
          return (
            <div className="collapse-controls">
              {showImpuestos && (
                <button
                  className={`btn-secondary ${collapseImpuestos ? 'active' : ''}`}
                  onClick={() => setCollapseImpuestos((v) => !v)}
                  title={`${imptoKeys.length} columnas de impuestos retenidos`}
                >
                  {collapseImpuestos ? '▶ Imp. retenidos' : '◀ Colapsar imp. retenidos'}
                </button>
              )}
              {showDscRcg && (
                <button
                  className={`btn-secondary ${collapseDscRcg ? 'active' : ''}`}
                  onClick={() => setCollapseDscRcg((v) => !v)}
                  title={`${dscRcgKeys.length} columnas de desc./recargos`}
                >
                  {collapseDscRcg ? '▶ Desc./Recargos' : '◀ Colapsar desc./recargos'}
                </button>
              )}
            </div>
          );
        };

        if (tableMode === 'totales') {
          return (
            <div className="table-view-wrapper">
              <div className="table-toolbar-row">
                {renderToolbar()}
              </div>
              <AggregatesPanel aggregates={calculateAggregates()} />
            </div>
          );
        }

        if (tableMode === 'vendor') {
          const rows = applySort(buildVendorRows(invoices, taxKeys));
          // Which tax keys to render individually vs collapsed
          const vendorImptoVisible = collapseImpuestos && imptoKeys.length >= 2 ? [] : imptoKeys;
          const vendorDscRcgVisible = collapseDscRcg && dscRcgKeys.length >= 2 ? [] : dscRcgKeys;
          const showImptoCol = collapseImpuestos && imptoKeys.length >= 2;
          const showDscRcgCol = collapseDscRcg && dscRcgKeys.length >= 2;
          // Tax keys that always show individually (not part of any collapse group)
          const alwaysVisible = taxKeys.filter((k) => !imptoKeys.includes(k) && !dscRcgKeys.includes(k));

          return (
            <div className="table-view-wrapper">
              <div className="table-toolbar-row">
                {renderToolbar()}
                {renderCollapseControls()}
              </div>
              <div className="table-wrapper">
                <table className="data-table full-width">
                  <thead>
                    <tr>
                      <th>#</th>
                      <SortTh col="proveedor">Proveedor</SortTh>
                      <SortTh col="rut">RUT</SortTh>
                      <SortTh col="neto" right>Neto</SortTh>
                      <SortTh col="iva" right>IVA</SortTh>
                      {vendorImptoVisible.map((key) => <SortTh key={key} col={key} right>{key.replace('imptoReten', 'Imp.')}</SortTh>)}
                      {showImptoCol && <SortTh col="_impuestos" right>Imp. Ret.</SortTh>}
                      {vendorDscRcgVisible.map((key) => <SortTh key={key} col={key} right>{key}</SortTh>)}
                      {showDscRcgCol && <SortTh col="_dscRcg" right>Desc./Recargos</SortTh>}
                      {alwaysVisible.map((key) => <SortTh key={key} col={key} right>{key}</SortTh>)}
                      <SortTh col="total" right>Total</SortTh>
                      <SortTh col="facturas" right>Facturas</SortTh>
                      <SortTh col="items" right>Ítems</SortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((group, i) => (
                      <tr key={group.rut}>
                        <td>{i + 1}</td>
                        <td>{truncateValue(group.proveedor, 35)}</td>
                        <td>{group.rut}</td>
                        <td style={{ textAlign: 'right' }}>{formatMoney(group.neto)}</td>
                        <td style={{ textAlign: 'right' }}>{formatMoney(group.iva)}</td>
                        {vendorImptoVisible.map((key) => (
                          <td key={key} style={{ textAlign: 'right' }}>
                            {group.taxes[key] ? formatMoney(group.taxes[key]) : '—'}
                          </td>
                        ))}
                        {showImptoCol && (
                          <td style={{ textAlign: 'right' }}>
                            {formatMoney(imptoKeys.reduce((s, k) => s + (group.taxes[k] || 0), 0))}
                          </td>
                        )}
                        {vendorDscRcgVisible.map((key) => (
                          <td key={key} style={{ textAlign: 'right' }}>
                            {group.taxes[key] ? formatMoney(group.taxes[key]) : '—'}
                          </td>
                        ))}
                        {showDscRcgCol && (
                          <td style={{ textAlign: 'right' }}>
                            {formatMoney(dscRcgKeys.reduce((s, k) => s + (group.taxes[k] || 0), 0))}
                          </td>
                        )}
                        {alwaysVisible.map((key) => (
                          <td key={key} style={{ textAlign: 'right' }}>
                            {group.taxes[key] ? formatMoney(group.taxes[key]) : '—'}
                          </td>
                        ))}
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(group.total)}</td>
                        <td style={{ textAlign: 'right' }}>{formatNumber(group.facturas)}</td>
                        <td style={{ textAlign: 'right' }}>{formatNumber(group.items)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        if (tableMode === 'product') {
          const { rows: rawRows, orderedKeys, numericKeys } = buildDynamicProductRows(invoices);
          const visibleKeys = orderedKeys.filter((k) => !hiddenProductCols.has(k));
          const rows = applySort(rawRows);

          const toggleCol = (key) => {
            setHiddenProductCols((prev) => {
              const next = new Set(prev);
              next.has(key) ? next.delete(key) : next.add(key);
              return next;
            });
          };

          return (
            <div className="table-view-wrapper">
              <div className="table-toolbar-row">
                {renderToolbar()}
                <div className="col-picker-wrapper">
                  <button
                    className="btn-secondary col-picker-btn"
                    onClick={() => setProductPickerOpen((v) => !v)}
                  >
                    Columnas&nbsp;
                    <span className="col-picker-count">
                      {visibleKeys.length}/{orderedKeys.length}
                    </span>
                  </button>
                  {productPickerOpen && (
                    <>
                      <div
                        className="col-picker-overlay"
                        onClick={() => setProductPickerOpen(false)}
                      />
                      <div className="col-picker-dropdown">
                        {orderedKeys.map((key) => (
                          <label key={key} className="col-picker-item">
                            <input
                              type="checkbox"
                              checked={!hiddenProductCols.has(key)}
                              onChange={() => toggleCol(key)}
                            />
                            <span>{ITEM_COLUMN_LABELS[key] ?? key}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="table-wrapper">
                <table className="data-table full-width">
                  <thead>
                    <tr>
                      <th>#</th>
                      {visibleKeys.map((key) => (
                        <SortTh
                          key={key}
                          col={key}
                          right={numericKeys.has(key)}
                        >
                          {ITEM_COLUMN_LABELS[key] ?? key}
                        </SortTh>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={row._facturasSet ? i : i}>
                        <td>{i + 1}</td>
                        {visibleKeys.map((key) => {
                          const val = row[key];
                          const isNum = numericKeys.has(key);
                          const align = isNum ? 'right' : 'left';
                          let display;
                          if (val === '' || val === undefined || val === null) {
                            display = '—';
                          } else if (MONEY_FIELDS.has(key)) {
                            display = formatMoney(val, {
                              maximumFractionDigits: key === 'PrcItem' || key === 'PrcRef' ? 3 : 0,
                            });
                          } else if (isNum) {
                            const hasDecimals = Math.abs(val % 1) > 0.000001;
                            display = formatNumber(val, { maximumFractionDigits: hasDecimals ? 3 : 0 });
                          } else {
                            display = truncateValue(String(val), 60);
                          }
                          return (
                            <td
                              key={key}
                              style={{
                                textAlign: align,
                                fontWeight: key === 'MontoItem' ? 600 : undefined,
                              }}
                            >
                              {display}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        if (tableMode === 'line') {
          const { rows: rawRows, itemKeys } = buildLineRows(invoices);
          const rows = applySort(rawRows);

          // All column definitions for the picker
          const allItemColDefs = itemKeys.map((key) => ({ key, label: ITEM_COLUMN_LABELS[key] ?? key, group: 'item' }));
          const allMetaColDefs = META_COLS.map(({ key, label }) => ({ key: `meta_${key}`, label, group: 'meta' }));
          const allColDefs = [...allItemColDefs, ...allMetaColDefs];
          const visibleColDefs = allColDefs.filter((c) => !hiddenLineCols.has(c.key));

          const toggleLineCol = (key) => {
            setHiddenLineCols((prev) => {
              const next = new Set(prev);
              next.has(key) ? next.delete(key) : next.add(key);
              return next;
            });
          };

          return (
            <div className="table-view-wrapper">
              <div className="table-toolbar-row">
                {renderToolbar()}
                <div className="col-picker-wrapper">
                  <button
                    className="btn-secondary col-picker-btn"
                    onClick={() => setLinePickerOpen((v) => !v)}
                  >
                    Columnas&nbsp;
                    <span className="col-picker-count">
                      {visibleColDefs.length}/{allColDefs.length}
                    </span>
                  </button>
                  {linePickerOpen && (
                    <>
                      <div className="col-picker-overlay" onClick={() => setLinePickerOpen(false)} />
                      <div className="col-picker-dropdown">
                        <div className="col-picker-group-label">Campos del ítem</div>
                        {allItemColDefs.map(({ key, label }) => (
                          <label key={key} className="col-picker-item">
                            <input type="checkbox" checked={!hiddenLineCols.has(key)} onChange={() => toggleLineCol(key)} />
                            <span>{label}</span>
                          </label>
                        ))}
                        <div className="col-picker-group-label col-picker-group-label--meta">Datos de la factura</div>
                        {allMetaColDefs.map(({ key, label }) => (
                          <label key={key} className="col-picker-item">
                            <input type="checkbox" checked={!hiddenLineCols.has(key)} onChange={() => toggleLineCol(key)} />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="table-wrapper">
                <table className="data-table full-width">
                  <thead>
                    <tr>
                      <th>#</th>
                      {visibleColDefs.map(({ key, label, group }) => (
                        <SortTh
                          key={key}
                          col={key}
                          right={group === 'item' && RIGHT_ALIGN_FIELDS.has(key)}
                        >
                          {label}
                        </SortTh>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        {visibleColDefs.map(({ key, group }) => {
                          const val = row[key];
                          const isEmpty = val === '' || val === undefined || val === null;
                          let display;
                          if (isEmpty) {
                            display = '—';
                          } else if (group === 'item' && MONEY_FIELDS.has(key)) {
                            display = formatMoney(parseNumericValue(val), {
                              maximumFractionDigits: key === 'PrcItem' || key === 'PrcRef' ? 3 : 0,
                            });
                          } else if (group === 'meta' && (key === 'meta_montoNeto' || key === 'meta_iva' || key === 'meta_montoTotal')) {
                            display = formatMoney(parseNumericValue(val));
                          } else {
                            display = String(val);
                          }
                          return (
                            <td
                              key={key}
                              style={{ textAlign: group === 'item' && RIGHT_ALIGN_FIELDS.has(key) ? 'right' : 'left' }}
                            >
                              {display}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        const rows = applySort(buildInvoiceRows(invoices, taxKeys));
        const invImptoVisible = collapseImpuestos && imptoKeys.length >= 2 ? [] : imptoKeys;
        const invDscRcgVisible = collapseDscRcg && dscRcgKeys.length >= 2 ? [] : dscRcgKeys;
        const showInvImptoCol = collapseImpuestos && imptoKeys.length >= 2;
        const showInvDscRcgCol = collapseDscRcg && dscRcgKeys.length >= 2;
        const invAlwaysVisible = taxKeys.filter((k) => !imptoKeys.includes(k) && !dscRcgKeys.includes(k));

        return (
          <div className="table-view-wrapper">
            <div className="table-toolbar-row">
              {renderToolbar()}
              {renderCollapseControls()}
            </div>
            <div className="table-wrapper">
              <table className="data-table full-width">
                <thead>
                  <tr>
                    <th>#</th>
                    <SortTh col="folio">Folio</SortTh>
                    <SortTh col="fecha">Fecha</SortTh>
                    <SortTh col="proveedor">Proveedor</SortTh>
                    <SortTh col="rut">RUT</SortTh>
                    <SortTh col="neto" right>Neto</SortTh>
                    <SortTh col="iva" right>IVA</SortTh>
                    {invImptoVisible.map((k) => <SortTh key={k} col={k} right>{k.replace('imptoReten', 'Imp.')}</SortTh>)}
                    {showInvImptoCol && <SortTh col="_impuestos" right>Imp. Ret.</SortTh>}
                    {invDscRcgVisible.map((k) => <SortTh key={k} col={k} right>{k}</SortTh>)}
                    {showInvDscRcgCol && <SortTh col="_dscRcg" right>Desc./Recargos</SortTh>}
                    {invAlwaysVisible.map((k) => <SortTh key={k} col={k} right>{k}</SortTh>)}
                    <SortTh col="total" right>Total</SortTh>
                    <SortTh col="items" right>Ítems</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ idx, inv }, i) => (
                    <tr key={idx} onClick={() => { setViewMode('detail'); setSelectedIdx(idx); }} style={{ cursor: 'pointer' }}>
                      <td>{i + 1}</td>
                      <td>{inv.metadata.folio || '—'}</td>
                      <td>{inv.metadata.fechaEmision || '—'}</td>
                      <td>{truncateValue(inv.metadata.razonSocialEmisor || '—', 30)}</td>
                      <td>{inv.metadata.rutEmisor || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(parseNumericValue(inv.metadata.montoNeto))}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(parseNumericValue(inv.metadata.iva))}</td>
                      {invImptoVisible.map((k) => (
                        <td key={k} style={{ textAlign: 'right' }}>
                          {inv.metadata[k] ? formatMoney(parseNumericValue(inv.metadata[k])) : '—'}
                        </td>
                      ))}
                      {showInvImptoCol && (
                        <td style={{ textAlign: 'right' }}>
                          {formatMoney(imptoKeys.reduce((s, k) => s + parseNumericValue(inv.metadata[k]), 0))}
                        </td>
                      )}
                      {invDscRcgVisible.map((k) => (
                        <td key={k} style={{ textAlign: 'right' }}>
                          {inv.metadata[k] ? formatMoney(parseNumericValue(inv.metadata[k])) : '—'}
                        </td>
                      ))}
                      {showInvDscRcgCol && (
                        <td style={{ textAlign: 'right' }}>
                          {formatMoney(dscRcgKeys.reduce((s, k) => s + parseNumericValue(inv.metadata[k]), 0))}
                        </td>
                      )}
                      {invAlwaysVisible.map((k) => (
                        <td key={k} style={{ textAlign: 'right' }}>
                          {inv.metadata[k] ? formatMoney(parseNumericValue(inv.metadata[k])) : '—'}
                        </td>
                      ))}
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(parseNumericValue(inv.metadata.montoTotal))}</td>
                      <td style={{ textAlign: 'right' }}>{formatNumber(inv.items.length)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
          })()}
        </div>
      </main>
    </div>
  );
}

/**
 * Recursively collects all .xml File objects from a FileSystemEntry.
 * readEntries() returns at most 100 entries per call, so we loop until empty.
 */
async function collectXmlFiles(entry) {
  const files = [];

  if (entry.isFile) {
    if (entry.name.endsWith('.xml')) {
      files.push(await new Promise((res, rej) => entry.getFile(res, rej)));
    }
    return files;
  }

  if (entry.isDirectory) {
    const reader = entry.createReader();
    const readBatch = () => new Promise((res, rej) => reader.readEntries(res, rej));
    while (true) {
      const batch = await readBatch();
      if (!batch.length) break;
      const nested = await Promise.all(batch.map(collectXmlFiles));
      files.push(...nested.flat());
    }
  }

  return files;
}

function UploadZone({ onFilesSelected, disabled }) {
  const [isDragging, setIsDragging] = useState(false);
  const [reading, setReading] = useState(false);

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || reading) return;

    const items = Array.from(e.dataTransfer.items);
    setReading(true);
    try {
      const results = await Promise.all(
        items.map((item) => {
          const entry = item.webkitGetAsEntry?.();
          if (entry) return collectXmlFiles(entry);
          const file = item.getAsFile?.();
          return file?.name.endsWith('.xml') ? [file] : [];
        })
      );
      const files = results.flat();
      if (files.length > 0) onFilesSelected(files);
    } finally {
      setReading(false);
    }
  };

  return (
    <div
      className={`upload-zone ${isDragging ? 'dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {reading ? (
        <p>Leyendo archivos de la carpeta...</p>
      ) : (
        <>
          <p>📄 Arrastra archivos XML o una carpeta completa aquí</p>
          <p className="small">o</p>
          <div className="upload-btn-row">
            <label>
              <input
                type="file"
                multiple
                accept=".xml"
                onChange={(e) => { if (e.target.files.length > 0) onFilesSelected(Array.from(e.target.files)); }}
                disabled={disabled}
                style={{ display: 'none' }}
              />
              <span className="btn-browse">Archivos</span>
            </label>
            <label>
              <input
                type="file"
                /* webkitdirectory lets users pick an entire folder — no file-count limit */
                webkitdirectory=""
                onChange={(e) => {
                  const files = Array.from(e.target.files).filter((f) => f.name.endsWith('.xml'));
                  if (files.length > 0) onFilesSelected(files);
                }}
                disabled={disabled}
                style={{ display: 'none' }}
              />
              <span className="btn-browse">Carpeta</span>
            </label>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
