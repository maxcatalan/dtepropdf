import { useRef, useState } from 'react';

const ACCEPTED = '.jpg,.jpeg,.png,.webp,.pdf';

function filterFiles(fileList) {
  return Array.from(fileList || []).filter((f) => {
    const name = f.name.toLowerCase();
    return name.endsWith('.jpg') || name.endsWith('.jpeg') ||
           name.endsWith('.png') || name.endsWith('.webp') ||
           name.endsWith('.pdf');
  });
}

export default function OcrUploadPanel({
  onFileSelected,
  disabled,
  eyebrow = 'Imagen o PDF',
  title = 'Arrastra tu factura o abre el explorador',
  description = 'Sube una imagen (JPG, PNG, WEBP) o PDF de tu factura y el sistema extraerá la tabla principal de ítems.',
  details = [],
  note = 'El archivo se procesa a través de la API — no se almacena en ningún servidor.',
  actionLabel = 'Seleccionar archivo',
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (fileList) => {
    const valid = filterFiles(fileList);
    if (valid.length > 0) onFileSelected(valid[0]);
  };

  return (
    <section className="ocr-upload-panel">
      <div
        className={`ocr-dropzone ${dragging ? 'is-dragging' : ''} ${disabled ? 'is-disabled' : ''}`}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (!disabled) handleFiles(e.dataTransfer.files); }}
      >
        <span className="ocr-dropzone__eyebrow">{eyebrow}</span>
        <h3>{title}</h3>
        <p>{description}</p>
        {details.length > 0 && (
          <ul className="ocr-upload-details">
            {details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="ocr-upload-actions">
        <button
          type="button"
          className="ocr-btn-primary"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          {actionLabel}
        </button>
      </div>

      <p className="ocr-upload-note">{note}</p>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        hidden
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />
    </section>
  );
}
