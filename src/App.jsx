import { useState } from 'react';
import { parseSIISetDTE } from './services/dteParser';
import AggregatesPanel from './components/AggregatesPanel';
import './App.css';

function App() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [viewMode, setViewMode] = useState('detail'); // 'detail', 'table', or 'totals'
  const [tableSort, setTableSort] = useState({ col: null, dir: 'asc' });
  const [groupByVendor, setGroupByVendor] = useState(false);

  const handleFilesSelected = async (files) => {
    setError('');
    setLoading(true);

    try {
      const allInvoices = [];
      for (const file of files) {
        const parsed = await parseSIISetDTE(file);
        allInvoices.push(...parsed);
      }
      setInvoices(allInvoices);
      setSelectedIdx(0);
    } catch (err) {
      setError(err.message);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
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

        const numVal = parseInt(value);
        if (!isNaN(numVal) && numVal > 0) {
          aggregates[key] = (aggregates[key] || 0) + numVal;
        }
      }

      // Also aggregate imptoReten, recargo, and descuento entries
      for (const [key, value] of Object.entries(invoice.metadata)) {
        if (key.startsWith('imptoReten') || key.startsWith('recargo') || key.startsWith('descuento')) {
          const numVal = parseFloat(value);
          if (!isNaN(numVal) && numVal > 0) {
            aggregates[key] = (aggregates[key] || 0) + numVal;
          }
        }
      }
    }

    return aggregates;
  };

  const downloadCSV = () => {
    if (invoices.length === 0) return;

    const rows = [];
    rows.push(['Folio', 'Vendor', 'Vendor RUT', 'Date', 'Net Amount', 'IVA', 'Total', 'Item Name', 'Quantity', 'Unit Price', 'Item Total']);

    for (const invoice of invoices) {
      const meta = invoice.metadata;
      for (const item of invoice.items) {
        rows.push([
          meta.folio || '',
          meta.razonSocialEmisor || '',
          meta.rutEmisor || '',
          meta.fechaEmision || '',
          meta.montoNeto || '',
          meta.iva || '',
          meta.montoTotal || '',
          item.NmbItem || '',
          item.QtyItem || '',
          item.PrcItem || '',
          item.MontoItem || '',
        ]);
      }
    }

    const csv = rows.map(row =>
      row.map(cell => {
        const str = String(cell || '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `dtes-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (invoices.length === 0) {
    return (
      <div className="page-container">
        <h1>DTE Parser</h1>
        <UploadZone onFilesSelected={handleFilesSelected} disabled={loading} />
        {loading && <p className="loading">Parsing files...</p>}
        {error && <p className="error">❌ {error}</p>}
      </div>
    );
  }

  const current = invoices[selectedIdx];

  return (
    <div className="page-container">
      {/* View Mode Tabs */}
      <div className="view-mode-tabs">
        <button
          className={`view-tab ${viewMode === 'detail' ? 'active' : ''}`}
          onClick={() => setViewMode('detail')}
        >
          Detail
        </button>
        <button
          className={`view-tab ${viewMode === 'table' ? 'active' : ''}`}
          onClick={() => setViewMode('table')}
        >
          Table
        </button>
        <button
          className={`view-tab ${viewMode === 'totals' ? 'active' : ''}`}
          onClick={() => setViewMode('totals')}
        >
          Totals
        </button>
        <div className="tab-actions">
          <button onClick={downloadCSV} className="btn-primary">⬇ CSV</button>
          <button onClick={() => setInvoices([])} className="btn-secondary">Reset</button>
        </div>
      </div>

      {/* Totals View */}
      {viewMode === 'totals' && (
        <AggregatesPanel aggregates={calculateAggregates()} />
      )}

      {/* Batch Progress Bar (Detail View Only) */}
      {viewMode === 'detail' && (
        <div className="batch-progress-bar">
          <span className="batch-progress-label">Invoice {selectedIdx + 1} of {invoices.length}</span>
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
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Unit Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {current.items.map((item, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{item.CdgItem_VlrCodigo || '—'}</td>
                    <td>{item.NmbItem || '—'}</td>
                    <td>{item.QtyItem || '—'}</td>
                    <td>{item.UnmdItem || '—'}</td>
                    <td>${parseInt(item.PrcItem || 0).toLocaleString()}</td>
                    <td>${parseInt(item.MontoItem || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {/* Table View - All Invoices */}
      {viewMode === 'table' && (() => {
        const taxKeys = [...new Set(
          invoices.flatMap(inv =>
            Object.keys(inv.metadata).filter(k =>
              k.startsWith('imptoReten') || k.startsWith('recargo') || k.startsWith('descuento')
            )
          )
        )];

        // Sort helper
        const applySort = (rows) => {
          if (!tableSort.col) return rows;
          return [...rows].sort((a, b) => {
            const av = a._sort[tableSort.col] ?? '';
            const bv = b._sort[tableSort.col] ?? '';
            const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
            return tableSort.dir === 'asc' ? cmp : -cmp;
          });
        };

        const setSort = (col) => {
          setTableSort(prev =>
            prev.col === col
              ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
              : { col, dir: 'asc' }
          );
        };

        const SortTh = ({ col, children, right }) => (
          <th style={{ whiteSpace: 'nowrap', textAlign: right ? 'right' : 'left' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
              {children}
              <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1 }}>
                <button className="sort-btn" onClick={() => setSort(col)}
                  style={{ opacity: tableSort.col === col && tableSort.dir === 'asc' ? 1 : 0.3 }}>▲</button>
                <button className="sort-btn" onClick={() => { setSort(col); setTableSort(p => ({ ...p, dir: 'desc' })); }}
                  style={{ opacity: tableSort.col === col && tableSort.dir === 'desc' ? 1 : 0.3 }}>▼</button>
              </span>
            </span>
          </th>
        );

        let rows;

        if (groupByVendor) {
          const grouped = {};
          for (const inv of invoices) {
            const rut = inv.metadata.rutEmisor || '?';
            if (!grouped[rut]) {
              grouped[rut] = {
                rut,
                proveedor: inv.metadata.razonSocialEmisor || '—',
                neto: 0, iva: 0, total: 0, facturas: 0, items: 0,
                taxes: {},
              };
            }
            const g = grouped[rut];
            g.neto     += parseInt(inv.metadata.montoNeto  || 0);
            g.iva      += parseInt(inv.metadata.iva        || 0);
            g.total    += parseInt(inv.metadata.montoTotal || 0);
            g.facturas += 1;
            g.items    += inv.items.length;
            for (const k of taxKeys) {
              g.taxes[k] = (g.taxes[k] || 0) + parseInt(inv.metadata[k] || 0);
            }
          }
          rows = Object.values(grouped).map(g => ({
            ...g,
            _sort: { proveedor: g.proveedor, rut: g.rut, neto: g.neto, iva: g.iva, total: g.total, facturas: g.facturas, items: g.items,
              ...Object.fromEntries(taxKeys.map(k => [k, g.taxes[k] || 0])) },
          }));
          rows = applySort(rows);

          return (
            <div className="table-view-wrapper">
              <div className="table-toolbar">
                <button className={`btn-secondary ${groupByVendor ? 'active' : ''}`} onClick={() => setGroupByVendor(false)}>
                  Por factura
                </button>
                <button className={`btn-secondary ${!groupByVendor ? '' : 'active'}`} onClick={() => setGroupByVendor(false)}>
                  Por proveedor
                </button>
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
                      {taxKeys.map(k => <SortTh key={k} col={k} right>{k.replace('imptoReten ', '')}</SortTh>)}
                      <SortTh col="total" right>Total</SortTh>
                      <SortTh col="facturas" right>Facturas</SortTh>
                      <SortTh col="items" right>Ítems</SortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((g, i) => (
                      <tr key={g.rut}>
                        <td>{i + 1}</td>
                        <td>{g.proveedor.substring(0, 35)}</td>
                        <td>{g.rut}</td>
                        <td style={{ textAlign: 'right' }}>${g.neto.toLocaleString()}</td>
                        <td style={{ textAlign: 'right' }}>${g.iva.toLocaleString()}</td>
                        {taxKeys.map(k => (
                          <td key={k} style={{ textAlign: 'right' }}>{g.taxes[k] ? '$' + g.taxes[k].toLocaleString() : '—'}</td>
                        ))}
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>${g.total.toLocaleString()}</td>
                        <td style={{ textAlign: 'right' }}>{g.facturas}</td>
                        <td style={{ textAlign: 'right' }}>{g.items}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        // Per-invoice rows
        rows = invoices.map((inv, idx) => ({
          idx,
          _sort: {
            folio:     inv.metadata.folio || '',
            fecha:     inv.metadata.fechaEmision || '',
            proveedor: inv.metadata.razonSocialEmisor || '',
            rut:       inv.metadata.rutEmisor || '',
            neto:      parseInt(inv.metadata.montoNeto  || 0),
            iva:       parseInt(inv.metadata.iva        || 0),
            total:     parseInt(inv.metadata.montoTotal || 0),
            items:     inv.items.length,
            ...Object.fromEntries(taxKeys.map(k => [k, parseInt(inv.metadata[k] || 0)])),
          },
          inv,
        }));
        rows = applySort(rows);

        return (
          <div className="table-view-wrapper">
            <div className="table-toolbar">
              <button className={`btn-secondary ${!groupByVendor ? 'active' : ''}`} onClick={() => setGroupByVendor(false)}>
                Por factura
              </button>
              <button className={`btn-secondary ${groupByVendor ? 'active' : ''}`} onClick={() => setGroupByVendor(true)}>
                Por proveedor
              </button>
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
                    {taxKeys.map(k => <SortTh key={k} col={k} right>{k.replace('imptoReten ', '')}</SortTh>)}
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
                      <td>{(inv.metadata.razonSocialEmisor || '—').substring(0, 30)}</td>
                      <td>{inv.metadata.rutEmisor || '—'}</td>
                      <td style={{ textAlign: 'right' }}>${parseInt(inv.metadata.montoNeto || 0).toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }}>${parseInt(inv.metadata.iva || 0).toLocaleString()}</td>
                      {taxKeys.map(k => (
                        <td key={k} style={{ textAlign: 'right' }}>{inv.metadata[k] ? '$' + parseInt(inv.metadata[k]).toLocaleString() : '—'}</td>
                      ))}
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>${parseInt(inv.metadata.montoTotal || 0).toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }}>{inv.items.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function UploadZone({ onFilesSelected, disabled }) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      className={`upload-zone ${isDragging ? 'dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.xml'));
        if (files.length > 0) onFilesSelected(files);
      }}
    >
      <p>📄 Drag and drop DTE XML files here</p>
      <p className="small">or</p>
      <label>
        <input
          type="file"
          multiple
          accept=".xml"
          onChange={(e) => { if (e.target.files.length > 0) onFilesSelected(Array.from(e.target.files)); }}
          disabled={disabled}
          style={{ display: 'none' }}
        />
        <span className="btn-browse">Browse Files</span>
      </label>
    </div>
  );
}

export default App;
