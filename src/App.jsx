import { useState } from 'react';
import { parseSIISetDTE } from './services/dteParser';
import './App.css';

function App() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    } catch (err) {
      setError(err.message);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (invoices.length === 0) return;

    // Flatten all invoices and items into rows
    const rows = [];
    rows.push(['Folio', 'Vendor', 'Vendor RUT', 'Date', 'Net Amount', 'IVA', 'Total', 'Item Name', 'Quantity', 'Unit Price', 'Item Total']);

    for (const invoice of invoices) {
      const meta = invoice.metadata;
      const itemCount = invoice.items.length;

      for (let i = 0; i < itemCount; i++) {
        const item = invoice.items[i];
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

    // Convert to CSV
    const csv = rows.map(row =>
      row.map(cell => {
        // Escape quotes and wrap in quotes if needed
        const str = String(cell || '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',')
    ).join('\n');

    // Download
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

  return (
    <div className="app">
      <h1>DTE Parser</h1>

      {invoices.length === 0 ? (
        <div className="upload-section">
          <UploadZone onFilesSelected={handleFilesSelected} disabled={loading} />
          {loading && <p className="loading">Parsing files...</p>}
          {error && <p className="error">❌ {error}</p>}
        </div>
      ) : (
        <div className="results-section">
          <div className="results-header">
            <h2>✓ Parsed {invoices.length} invoice(s)</h2>
            <button onClick={() => setInvoices([])} className="btn-reset">Reset</button>
            <button onClick={downloadCSV} className="btn-download">Download CSV</button>
          </div>

          {invoices.map((invoice, idx) => (
            <div key={idx} className="invoice-card">
              <h3>{invoice.name}</h3>
              <div className="metadata-grid">
                <div><strong>Type:</strong> {invoice.metadata.tipoDTE || '—'}</div>
                <div><strong>Date:</strong> {invoice.metadata.fechaEmision || '—'}</div>
                <div><strong>Net:</strong> ${parseInt(invoice.metadata.montoNeto || 0).toLocaleString()}</div>
                <div><strong>IVA:</strong> ${parseInt(invoice.metadata.iva || 0).toLocaleString()}</div>
                <div><strong>Total:</strong> <strong>${parseInt(invoice.metadata.montoTotal || 0).toLocaleString()}</strong></div>
              </div>

              <table className="items-table">
                <thead>
                  <tr>
                    <th>Item Name</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Item Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, i) => (
                    <tr key={i}>
                      <td>{item.NmbItem || '—'}</td>
                      <td>{item.QtyItem || '—'}</td>
                      <td>${parseInt(item.PrcItem || 0).toLocaleString()}</td>
                      <td>${parseInt(item.MontoItem || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UploadZone({ onFilesSelected, disabled }) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.xml'));
    if (files.length > 0) {
      onFilesSelected(files);
    }
  };

  const handleInputChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      onFilesSelected(files);
    }
  };

  return (
    <div
      className={`upload-zone ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <p>📄 Drag and drop DTE XML files here</p>
      <p className="small">or</p>
      <label>
        <input
          type="file"
          multiple
          accept=".xml"
          onChange={handleInputChange}
          disabled={disabled}
          style={{ display: 'none' }}
        />
        <span className="btn-browse">Browse Files</span>
      </label>
    </div>
  );
}

export default App;
