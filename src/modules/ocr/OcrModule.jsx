import { useState } from 'react';
import OcrUploadPanel from './components/OcrUploadPanel';
import OcrTableView from './components/OcrTableView';
import OcrStructurePreview from './components/OcrStructurePreview';
import { extractTableFromFile } from './services/extractTable';
import { ALL_META_FIELDS, ALL_META_KEYS } from './ocrConstants';
import { useAuth } from '../../context/AuthContext';
import './ocr.css';

const STATE = { IDLE: 'idle', LOADING: 'loading', DONE: 'done', ERROR: 'error' };

export default function OcrModule() {
  const { session, refreshCredits } = useAuth();

  const [state, setState] = useState(STATE.IDLE);
  const [file, setFile]   = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError]   = useState('');

  const [activeMetaKeys, setActiveMetaKeys] = useState(new Set(ALL_META_KEYS));
  const [columnMetaOrder, setColumnMetaOrder] = useState([]);
  const [showTable, setShowTable] = useState(true);

  const allMetaOn  = activeMetaKeys.size === ALL_META_KEYS.length;
  const someMetaOn = activeMetaKeys.size > 0 && !allMetaOn;

  const toggleAllMeta = () =>
    setActiveMetaKeys(allMetaOn ? new Set() : new Set(ALL_META_KEYS));

  const toggleMetaKey = (key) => {
    setActiveMetaKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    setColumnMetaOrder(prev => prev.filter(k => k !== key));
  };

  const moveToColumn = (key) =>
    setColumnMetaOrder(prev => prev.includes(key) ? prev : [...prev, key]);

  const moveToHeader = (key) =>
    setColumnMetaOrder(prev => prev.filter(k => k !== key));

  const reorderColumns = (fromKey, toKey, side) => {
    setColumnMetaOrder(prev => {
      const without = prev.filter(k => k !== fromKey);
      const toIdx   = without.indexOf(toKey);
      const insertAt = side === 'right' ? toIdx + 1 : toIdx;
      return [...without.slice(0, insertAt), fromKey, ...without.slice(insertAt)];
    });
  };

  const handleFileSelected = async (selectedFile) => {
    setFile(selectedFile);
    setError('');
    setState(STATE.LOADING);
    try {
      const extracted = await extractTableFromFile(selectedFile, { session });
      setResult(extracted);
      setState(STATE.DONE);
      refreshCredits();
    } catch (err) {
      setError(err.message || 'No se pudo extraer la tabla.');
      setState(STATE.ERROR);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError('');
    setState(STATE.IDLE);
  };

  return (
    <div className="ocr-module">
      <div className="ocr-config-row">
        <div className="ocr-options">
          <p className="ocr-options__title">Extraer</p>

          <div className="ocr-option-group">
            <label className="ocr-option-row__check">
              <input
                type="checkbox"
                checked={allMetaOn}
                ref={el => { if (el) el.indeterminate = someMetaOn; }}
                onChange={toggleAllMeta}
              />
              <div className="ocr-option-group__header">
                <span className="ocr-option-group__label">Encabezado</span>
                <span className="ocr-option-group__desc">Folio, proveedor, montos, etc.</span>
              </div>
            </label>
            <div className="ocr-option-sublist">
              {ALL_META_FIELDS.map(({ key, label }) => (
                <label key={key} className="ocr-option-row ocr-option-row--sub">
                  <input
                    type="checkbox"
                    checked={activeMetaKeys.has(key)}
                    onChange={() => toggleMetaKey(key)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="ocr-option-row">
            <input type="checkbox" checked={showTable} onChange={() => setShowTable(v => !v)} />
            <span>Tabla principal</span>
          </label>
        </div>

        <OcrStructurePreview
          activeMetaKeys={activeMetaKeys}
          columnMetaOrder={columnMetaOrder}
          showTable={showTable}
          onMoveToColumn={moveToColumn}
          onMoveToHeader={moveToHeader}
          onReorderColumns={reorderColumns}
        />
      </div>

      {(state === STATE.IDLE || state === STATE.ERROR) && (
        <>
          <OcrUploadPanel onFileSelected={handleFileSelected} disabled={false} />
          {state === STATE.ERROR && (
            <div className="ocr-error">
              <span><strong>Error:</strong> {error}</span>
              <button className="ocr-btn-ghost" onClick={handleReset}>Reintentar</button>
            </div>
          )}
        </>
      )}

      {state === STATE.LOADING && (
        <div className="ocr-loading">
          <div className="ocr-spinner" />
          <p>Extrayendo de <strong>{file?.name}</strong>…</p>
          <p className="ocr-loading-sub">Consultando Gemini, puede tomar unos segundos.</p>
        </div>
      )}

      {state === STATE.DONE && result && (
        <OcrTableView
          headers={result.headers}
          rows={result.rows}
          meta={result.meta}
          showTable={showTable}
          activeMetaKeys={activeMetaKeys}
          columnMetaOrder={columnMetaOrder}
          filename={file?.name || 'extraccion'}
          onReset={handleReset}
        />
      )}
    </div>
  );
}
