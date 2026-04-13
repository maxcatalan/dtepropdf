import Pdf417Stamp from './Pdf417Stamp';
import {
  formatDocumentAmount,
  formatLongDate,
  formatQuantity,
} from '../utils/formatters';

function InfoCell({ label, value }) {
  return (
    <div className="info-cell">
      <span className="info-cell__label">{label}:</span>
      <span className="info-cell__value">{value || '—'}</span>
    </div>
  );
}

function InvoicePage({ invoice, page, mode = 'screen', pageRef }) {
  const vatLabel = invoice.totals.vatRate
    ? `${formatDocumentAmount(invoice.totals.vatRate)}% I.V.A.`
    : 'I.V.A.';

  const issuerLocation = [invoice.issuer.commune, invoice.issuer.city].filter(Boolean).join(' - ');

  return (
    <article ref={pageRef} className={`invoice-sheet invoice-sheet--${mode}`}>
      <header className="invoice-sheet__top">
        <div className="invoice-issuer">
          <h2>{invoice.issuer.name}</h2>
          <p className="invoice-issuer__address">{invoice.issuer.address || 'Direccion no informada'}</p>
          <p className="invoice-issuer__location">{issuerLocation || 'Ubicacion no informada'}</p>
          <p className="invoice-issuer__line">{invoice.issuer.businessLine || 'Giro no informado'}</p>
        </div>

        <div className="invoice-document-box">
          <p>R.U.T.: {invoice.issuer.rut || '—'}</p>
          <p>{invoice.document.typeLabel}</p>
          <p>Nº: {invoice.document.number || '—'}</p>
          <p>{invoice.document.issueDateLong}</p>
        </div>
      </header>

      <section className="invoice-party-box">
        <div className="invoice-party-grid">
          <InfoCell label="Señor" value={invoice.receiver.name} />
          <InfoCell label="Ciudad" value={invoice.receiver.city} />
          <InfoCell label="Giro" value={invoice.receiver.businessLine} />
          <InfoCell label="Comuna" value={invoice.receiver.commune} />
          <InfoCell label="R.U.T." value={invoice.receiver.rut} />
          <InfoCell label="Forma pago" value={invoice.document.paymentMethodLabel} />
          <InfoCell label="Direccion" value={invoice.receiver.address} />
          <InfoCell
            label="Fecha venc"
            value={invoice.document.dueDate ? formatLongDate(invoice.document.dueDate) : '—'}
          />
        </div>
      </section>

      <table className="invoice-items">
        <thead>
          <tr>
            <th className="invoice-items__number">Nro.</th>
            <th className="invoice-items__code">Cod.</th>
            <th className="invoice-items__description">Descripcion</th>
            <th className="invoice-items__qty">Cant.</th>
            <th className="invoice-items__price">Precio Unit.</th>
            <th className="invoice-items__total">Valor Item</th>
          </tr>
        </thead>
        <tbody>
          {page.items.map((item) => (
            <tr key={`${invoice.id}-${page.pageNumber}-${item.lineNumber}`}>
              <td>{item.lineNumber}</td>
              <td className="invoice-items__code-cell">{item.code || '—'}</td>
              <td className="invoice-items__description-cell">
                <strong>{item.name}</strong>
              </td>
              <td>{formatQuantity(item.quantity)}</td>
              <td>{formatDocumentAmount(item.unitPrice, { maximumFractionDigits: 3 })}</td>
              <td>{formatDocumentAmount(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {page.isLastPage ? (
        <>
          <div className="amount-words">
            <span>SON</span>
            <strong>{invoice.document.amountInWords}</strong>
          </div>

          <div className="invoice-bottom">
            <section className="invoice-stamp">
              <Pdf417Stamp text={invoice.stamp.text} />
              <p className="stamp-caption">{invoice.stamp.legend}</p>
              <p className="stamp-url">Verifique documento en: {invoice.stamp.verificationUrl}</p>
            </section>

            <section className="invoice-totals">
              <div className="totals-row">
                <span>Impuestos:</span>
                <strong>{formatDocumentAmount(invoice.totals.additionalTaxes)}</strong>
              </div>
              <div className="totals-row">
                <span>Retenciones:</span>
                <strong>{formatDocumentAmount(invoice.totals.withholdings)}</strong>
              </div>
              <div className="totals-row">
                <span>Descuento:</span>
                <strong>{formatDocumentAmount(invoice.totals.discount)}</strong>
              </div>
              <div className="totals-row">
                <span>Recargo:</span>
                <strong>{formatDocumentAmount(invoice.totals.surcharge)}</strong>
              </div>
              <div className="totals-row">
                <span>Neto:</span>
                <strong>{formatDocumentAmount(invoice.totals.net)}</strong>
              </div>
              <div className="totals-row">
                <span>Exento:</span>
                <strong>{formatDocumentAmount(invoice.totals.exempt)}</strong>
              </div>
              <div className="totals-row">
                <span>{vatLabel}:</span>
                <strong>{formatDocumentAmount(invoice.totals.vat)}</strong>
              </div>
              <div className="totals-total">
                <span>Monto Total:</span>
                <strong>{formatDocumentAmount(invoice.totals.total)}</strong>
              </div>
            </section>
          </div>
        </>
      ) : null}

      <div className="invoice-page-number">Pagina {page.pageNumber} de {page.totalPages}</div>
    </article>
  );
}

export default function InvoicePreview({ invoice, pages, mode = 'screen', onPageRef }) {
  return (
    <div className={`invoice-document invoice-document--${mode}`}>
      {pages.map((page, index) => (
        <InvoicePage
          key={`${invoice.id}-page-${page.pageNumber}`}
          invoice={invoice}
          page={page}
          mode={mode}
          pageRef={onPageRef ? onPageRef(index) : undefined}
        />
      ))}
    </div>
  );
}
