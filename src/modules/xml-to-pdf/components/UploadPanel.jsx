import { useRef, useState } from 'react';

function filterXmlFiles(fileList) {
  return Array.from(fileList || []).filter((file) => {
    const fileName = file.name.toLowerCase();
    return fileName.endsWith('.xml') || file.type.includes('xml');
  });
}

export default function UploadPanel({
  onFilesSelected,
  onSampleRequest,
  disabled = false,
  compact = false,
}) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (fileList) => {
    const xmlFiles = filterXmlFiles(fileList);
    if (xmlFiles.length > 0) {
      onFilesSelected(xmlFiles);
    }
  };

  return (
    <section className={`upload-panel ${compact ? 'upload-panel--compact' : ''}`}>
      <div
        className={`upload-dropzone ${isDragging ? 'is-dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (!disabled) handleFiles(event.dataTransfer.files);
        }}
        onClick={() => {
          if (!disabled) {
            inputRef.current?.click();
          }
        }}
      >
        <span className="upload-dropzone__eyebrow">XML DTE del SII</span>
        <h3>Arrastra tus archivos o abre el explorador</h3>
        <p>
          Convierte uno o varios XML en un PDF con vista tributaria, timbre PDF417 y formato
          listo para imprimir.
        </p>
      </div>

      <div className="upload-actions">
        <button type="button" className="primary-button" onClick={() => inputRef.current?.click()} disabled={disabled}>
          Seleccionar XML
        </button>
        <button type="button" className="ghost-button" onClick={onSampleRequest} disabled={disabled}>
          Cargar ejemplo
        </button>
      </div>

      <p className="upload-note">Tus archivos se procesan localmente en el navegador.</p>

      <input
        ref={inputRef}
        type="file"
        accept=".xml,text/xml,application/xml"
        multiple
        hidden
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </section>
  );
}
