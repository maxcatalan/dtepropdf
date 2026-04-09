import { useState } from 'react';
import { parseSIISetDTE } from './services/dteParser';
import './App.css';

function App() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showAggregates, setShowAggregates] = useState(true);

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
    const aggregates = {};

    for (const invoice of invoices) {
      for (const [key, value] of Object.entries(invoice.metadata)) {
        if (!value || value === '') continue;

        // Only aggregate numeric fields (exclude RUT, names, etc)
        const numVal = parseInt(value);
        if (!isNaN(numVal) && numVal > 0) {
          aggregates[key] = (aggregates[key] || 0) + numVal;
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
      {/* Batch Progress Bar */}
      <div className="batch-progress-bar">
        <span className="batch-progress-label">Batch invoice {selectedIdx + 1} of {invoices.length}</span>
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
        <button onClick={downloadCSV} className="btn-primary">⬇ Download CSV</button>
        <button onClick={() => setInvoices([])} className="btn-secondary">Reset</button>
      </div>

      {/* Two-column layout */}
      <div className="content-layout">
        {/* Left sidebar - Metadata */}
        <div className="sidebar">
          {/* Aggregates Section */}
          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <h3>Totals</h3>
              <button
                className="toggle-btn"
                onClick={() => setShowAggregates(!showAggregates)}
                title={showAggregates ? 'Hide' : 'Show'}
              >
                {showAggregates ? '−' : '+'}
              </button>
            </div>
            {showAggregates && (
              <div className="metadata-list">
                {Object.entries(calculateAggregates()).map(([key, value]) => {
                  const label = key
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/^./, str => str.toUpperCase())
                    .trim();

                  return (
                    <div key={key} className="metadata-row aggregate">
                      <span className="meta-label">{label}</span>
                      <span className="meta-value">{value.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

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
