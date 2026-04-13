import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import InvoiceMeasure from './components/InvoiceMeasure';
import InvoicePreview from './components/InvoicePreview';
import UploadPanel from './components/UploadPanel';
import { parseDteFiles } from './services/parseDteXml';
import {
  formatCurrencyLabel,
  getBatchFileName,
  getInvoiceFileName,
} from './utils/formatters';
import { paginateInvoiceByMeasurements } from './utils/paginateInvoice';

export default function XmlToPdfConverter({
  embedded = false,
  controlledInvoices = null,
  controlledSelectedId = '',
}) {
  const isControlled = Array.isArray(controlledInvoices);
  const [invoices, setInvoices] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');
  const [measurements, setMeasurements] = useState({});

  // Batch export state
  const [batchExport, setBatchExport] = useState(null);
  // null | { invoices: Invoice[], index: number, fileName: string }
  const [exportProgress, setExportProgress] = useState(null);
  // null | { done: number, total: number }

  const exportRefs = useRef({});
  // Holds the jsPDF + html2canvas instances during batch export
  const batchStateRef = useRef(null);
  // Guards against re-entrant effect runs while async processing is in progress
  const batchProcessingRef = useRef(false);

  const activeInvoices = isControlled ? controlledInvoices : invoices;
  const activeSelectedId = isControlled ? controlledSelectedId : selectedId;

  // The invoice currently targeted by the measure/export stage.
  // During batch export this advances through each invoice; otherwise it follows
  // the user's selection so the current preview is always ready.
  const exportTargetId = batchExport
    ? batchExport.invoices[batchExport.index]?.id
    : activeSelectedId;

  useEffect(() => {
    setMeasurements((previous) => {
      const next = {};
      for (const invoice of activeInvoices) {
        if (previous[invoice.id]) {
          next[invoice.id] = previous[invoice.id];
        }
      }
      return next;
    });
  }, [activeInvoices]);

  const handleMeasured = useCallback((invoiceId, measurement) => {
    setMeasurements((previous) => {
      const current = previous[invoiceId];
      const same =
        current
        && current.regularPageRowsHeight === measurement.regularPageRowsHeight
        && current.lastPageRowsHeight === measurement.lastPageRowsHeight
        && current.rowHeights.length === measurement.rowHeights.length
        && current.rowHeights.every((height, index) => height === measurement.rowHeights[index]);

      if (same) {
        return previous;
      }

      return {
        ...previous,
        [invoiceId]: measurement,
      };
    });
  }, []);

  const paginatedInvoices = useMemo(() => (
    activeInvoices.map((invoice) => {
      const measurement = measurements[invoice.id];
      return {
        invoice,
        measured: Boolean(measurement),
        pages: paginateInvoiceByMeasurements(invoice, measurement),
      };
    })
  ), [activeInvoices, measurements]);

  const currentInvoiceData = paginatedInvoices.find(({ invoice }) => invoice.id === activeSelectedId)
    || paginatedInvoices[0]
    || null;
  const currentInvoice = currentInvoiceData?.invoice || null;

  // The invoice data for whichever invoice the measure/export stage is currently targeting
  const exportTargetData = paginatedInvoices.find(({ invoice }) => invoice.id === exportTargetId) || null;

  const setExportRef = (invoiceId, pageIndex) => (node) => {
    exportRefs.current[invoiceId] ||= [];

    if (node) {
      exportRefs.current[invoiceId][pageIndex] = node;
      return;
    }

    if (exportRefs.current[invoiceId]) {
      delete exportRefs.current[invoiceId][pageIndex];
    }
  };

  const getExportNodes = (invoiceId) => {
    const nodes = exportRefs.current[invoiceId] || [];
    return nodes.filter(Boolean);
  };

  // Sequential batch export processor.
  // Runs whenever batchExport or measurements change. Guards against re-entry.
  useEffect(() => {
    if (!batchExport || !batchStateRef.current) return;
    if (batchProcessingRef.current) return;

    const targetInvoice = batchExport.invoices[batchExport.index];
    if (!targetInvoice) return;

    // Wait until this invoice has been measured before capturing
    if (!measurements[targetInvoice.id]) return;

    batchProcessingRef.current = true;

    (async () => {
      try {
        // Give React two frames to commit the paginated export stage to the DOM
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        if (!batchStateRef.current) return; // reset happened mid-export

        const { pdf, html2canvas } = batchStateRef.current;
        const nodes = getExportNodes(targetInvoice.id);
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        for (const element of nodes) {
          const canvas = await html2canvas(element, {
            backgroundColor: '#ffffff',
            scale: Math.min(window.devicePixelRatio || 1, 2),
            useCORS: true,
            logging: false,
            windowWidth: element.scrollWidth,
            windowHeight: element.scrollHeight,
          });

          if (!batchStateRef.current) return;

          const imageData = canvas.toDataURL('image/png');
          const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
          const width = canvas.width * ratio;
          const height = canvas.height * ratio;
          const x = (pageWidth - width) / 2;
          const y = (pageHeight - height) / 2;

          if (batchStateRef.current.pageCount > 0) {
            pdf.addPage();
          }
          batchStateRef.current.pageCount++;
          pdf.addImage(imageData, 'PNG', x, y, width, height, undefined, 'FAST');
        }

        const nextIndex = batchExport.index + 1;
        const total = batchExport.invoices.length;

        if (nextIndex >= total) {
          pdf.save(batchExport.fileName);
          setBatchExport(null);
          batchStateRef.current = null;
          setExportProgress(null);
          setExporting('');
        } else {
          setExportProgress({ done: nextIndex, total });
          setBatchExport((prev) => (prev ? { ...prev, index: nextIndex } : null));
        }
      } finally {
        batchProcessingRef.current = false;
      }
    })();
  }, [batchExport, measurements]);

  const handleFilesSelected = async (files) => {
    setError('');
    setLoading(true);

    try {
      const parsed = await parseDteFiles(files);
      setInvoices(parsed);
      setSelectedId(parsed[0]?.id || '');
      setMeasurements({});
    } catch (parseError) {
      setInvoices([]);
      setSelectedId('');
      setError(parseError.message || 'No se pudieron convertir los XML seleccionados.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSample = async () => {
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/test-dte.xml');
      if (!response.ok) {
        throw new Error('No se pudo cargar el XML de ejemplo.');
      }

      const blob = await response.blob();
      const sampleFile = new File([blob], 'test-dte.xml', { type: 'text/xml' });
      await handleFilesSelected([sampleFile]);
    } catch (sampleError) {
      setError(sampleError.message || 'No se pudo cargar el ejemplo.');
      setLoading(false);
    }
  };

  const handleExportCurrent = async () => {
    if (!currentInvoice || !currentInvoiceData?.measured) return;

    setError('');
    setExporting('current');

    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      if (document.fonts?.ready) {
        try { await document.fonts.ready; } catch { /* continue */ }
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const nodes = getExportNodes(currentInvoice.id);
      if (!nodes.length) throw new Error('No hay documentos listos para exportar.');

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      for (const [index, element] of nodes.entries()) {
        const canvas = await html2canvas(element, {
          backgroundColor: '#ffffff',
          scale: Math.min(window.devicePixelRatio || 1, 2),
          useCORS: true,
          logging: false,
          windowWidth: element.scrollWidth,
          windowHeight: element.scrollHeight,
        });

        const imageData = canvas.toDataURL('image/png');
        const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
        const width = canvas.width * ratio;
        const height = canvas.height * ratio;
        const x = (pageWidth - width) / 2;
        const y = (pageHeight - height) / 2;

        if (index > 0) pdf.addPage();
        pdf.addImage(imageData, 'PNG', x, y, width, height, undefined, 'FAST');
      }

      pdf.save(getInvoiceFileName(currentInvoice));
    } catch (exportError) {
      setError(exportError.message || 'No se pudo exportar el PDF actual.');
    } finally {
      setExporting('');
    }
  };

  const handleExportAll = async () => {
    if (!activeInvoices.length || exporting) return;

    setError('');
    setExporting('all');

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
    batchStateRef.current = { pdf, html2canvas, pageCount: 0 };
    batchProcessingRef.current = false;

    setExportProgress({ done: 0, total: activeInvoices.length });
    setBatchExport({
      invoices: activeInvoices,
      index: 0,
      fileName: getBatchFileName(activeInvoices),
    });
  };

  const resetConverter = () => {
    setInvoices([]);
    setSelectedId('');
    setError('');
    setLoading(false);
    setExporting('');
    setMeasurements({});
    setBatchExport(null);
    setExportProgress(null);
    batchStateRef.current = null;
    batchProcessingRef.current = false;
  };

  const isBusy = loading || Boolean(exporting);

  return (
    <div className={`xml2pdf-app ${embedded ? 'xml2pdf-app--embedded' : ''}`}>
      {!embedded && (
        <header className="converter-topbar">
          <div>
            <span className="brand-badge">Modulo independiente</span>
            <h1>Conversor XML DTE a PDF</h1>
          </div>
          {invoices.length > 0 && (
            <button type="button" className="ghost-button" onClick={resetConverter}>
              Limpiar carga
            </button>
          )}
        </header>
      )}

      {error && <div className="status-banner status-banner--error">{error}</div>}
      {loading && <div className="status-banner">Procesando XML y preparando la vista previa...</div>}
      {!loading && currentInvoice && !currentInvoiceData?.measured && !batchExport && (
        <div className="status-banner">Midiendo alturas reales para calcular los saltos de pagina...</div>
      )}

      {/* Batch export progress overlay */}
      {exportProgress && (
        <div className="export-progress-overlay">
          <div className="export-progress-card">
            <p className="export-progress-title">Convirtiendo documentos a PDF...</p>
            <div className="export-progress-track">
              <div
                className="export-progress-fill"
                style={{ width: `${(exportProgress.done / exportProgress.total) * 100}%` }}
              />
            </div>
            <span className="export-progress-label">
              {exportProgress.done} de {exportProgress.total}
            </span>
          </div>
        </div>
      )}

      {!activeInvoices.length && !isControlled && (
        <section className="landing">
          <div className="landing-copy">
            <span className="landing-copy__eyebrow">Cliente-side, rapido y listo para imprimir</span>
            <h2>Sube XML del SII y conviertelo en un PDF con el mismo lenguaje visual de un DTE.</h2>
            <p>
              El modulo lee facturas, boletas, notas y guias del SII, arma una vista previa
              legible y genera un PDF descargable con folio, receptor, detalle de items y timbre
              PDF417 cuando el TED viene incluido.
            </p>

            <div className="feature-grid">
              <div className="feature-card">
                <strong>Vista tributaria</strong>
                <span>Cabecera, recuadros, totales y composicion tipo factura chilena.</span>
              </div>
              <div className="feature-card">
                <strong>PDF417 del TED</strong>
                <span>Renderizado local del timbre electronico para la representacion visual.</span>
              </div>
              <div className="feature-card">
                <strong>PDF descargable</strong>
                <span>Exporta el documento actual o una carga completa en un solo archivo PDF.</span>
              </div>
            </div>
          </div>

          <UploadPanel onFilesSelected={handleFilesSelected} onSampleRequest={handleLoadSample} disabled={loading} />
        </section>
      )}

      {currentInvoice && (
        <section className={`workspace ${isControlled ? 'workspace--single' : ''}`}>
          {!isControlled && (
            <aside className="workspace-sidebar">
              <UploadPanel
                onFilesSelected={handleFilesSelected}
                onSampleRequest={handleLoadSample}
                disabled={isBusy}
                compact
              />

              <div className="sidebar-card">
                <h3>Documentos cargados</h3>
                <div className="document-list">
                  {activeInvoices.map((invoice, index) => (
                    <button
                      key={invoice.id}
                      type="button"
                      className={`document-card ${invoice.id === currentInvoice.id ? 'is-active' : ''}`}
                      onClick={() => setSelectedId(invoice.id)}
                      disabled={isBusy}
                    >
                      <span>Documento {index + 1}</span>
                      <strong>{invoice.document.typeLabel}</strong>
                      <small>Folio {invoice.document.number}</small>
                      <small>{formatCurrencyLabel(invoice.totals.total)}</small>
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          )}

          <main className={`workspace-main ${isControlled ? 'workspace-main--full' : ''}`}>
            <div className="toolbar">
              <div className="toolbar-copy">
                <h3>Vista previa tributaria</h3>
                <p>
                  Fuente: <strong>{currentInvoice.sourceName}</strong>
                </p>
              </div>

              <div className="toolbar-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleExportCurrent}
                  disabled={isBusy || !currentInvoiceData?.measured}
                >
                  {exporting === 'current' ? 'Generando PDF...' : 'Descargar PDF actual'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleExportAll}
                  disabled={isBusy}
                >
                  {exporting === 'all' ? 'Convirtiendo...' : 'Descargar todos'}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => window.print()}
                  disabled={isBusy || !currentInvoiceData?.measured}
                >
                  Imprimir actual
                </button>
              </div>
            </div>

            <div className="preview-shell">
              <div className="preview-scroll">
                <InvoicePreview invoice={currentInvoice} pages={currentInvoiceData?.pages || []} mode="screen" />
              </div>
            </div>
          </main>
        </section>
      )}

      {/* Measure stage — only the invoice currently targeted (lazy) */}
      <div className="invoice-measure-stage" aria-hidden="true">
        {exportTargetData && !exportTargetData.measured && (
          <InvoiceMeasure
            key={`measure-${exportTargetId}`}
            invoice={exportTargetData.invoice}
            onMeasured={handleMeasured}
          />
        )}
      </div>

      {/* Export stage — only the invoice currently targeted, and only once measured (lazy) */}
      <div className="invoice-export-stage" aria-hidden="true">
        {exportTargetData?.measured && (
          <div key={`export-${exportTargetId}`} className="invoice-export-frame">
            <InvoicePreview
              invoice={exportTargetData.invoice}
              pages={exportTargetData.pages}
              mode="export"
              onPageRef={(pageIndex) => setExportRef(exportTargetData.invoice.id, pageIndex)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
