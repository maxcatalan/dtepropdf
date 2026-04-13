import { useLayoutEffect, useRef } from 'react';
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

function TableHead() {
  return (
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
  );
}

function FooterSkeleton({ invoice, vatLabel }) {
  return (
    <>
      <div className="amount-words">
        <span>SON</span>
        <strong>{invoice.document.amountInWords}</strong>
      </div>

      <div className="invoice-bottom">
        <section className="invoice-stamp">
          <div className="stamp-measure-box" />
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
  );
}

export default function InvoiceMeasure({ invoice, onMeasured }) {
  const regularPageRef = useRef(null);
  const regularTableRef = useRef(null);
  const regularBodyRef = useRef(null);
  const regularPageNumberRef = useRef(null);

  const lastPageRef = useRef(null);
  const lastTableRef = useRef(null);
  const lastBodyRef = useRef(null);
  const amountWordsRef = useRef(null);

  const rowRefs = useRef([]);

  const vatLabel = invoice.totals.vatRate
    ? `${formatDocumentAmount(invoice.totals.vatRate)}% I.V.A.`
    : 'I.V.A.';

  const issuerLocation = [invoice.issuer.commune, invoice.issuer.city].filter(Boolean).join(' - ');

  const setRowRef = (index) => (node) => {
    rowRefs.current[index] = node;
  };

  useLayoutEffect(() => {
    let cancelled = false;

    async function measure() {
      try {
        if (document.fonts?.ready) {
          await document.fonts.ready;
        }
      } catch {
        // Continue measuring with currently available fonts.
      }

      requestAnimationFrame(() => {
        if (cancelled) return;

        const regularPage = regularPageRef.current;
        const regularTable = regularTableRef.current;
        const regularBody = regularBodyRef.current;
        const regularPageNumber = regularPageNumberRef.current;

        const lastPage = lastPageRef.current;
        const lastTable = lastTableRef.current;
        const lastBody = lastBodyRef.current;
        const amountWords = amountWordsRef.current;

        const rows = rowRefs.current.filter(Boolean);

        if (
          !regularPage
          || !regularTable
          || !regularBody
          || !regularPageNumber
          || !lastPage
          || !lastTable
          || !lastBody
          || !amountWords
          || rows.length !== invoice.items.length
        ) {
          return;
        }

        const regularPageRect = regularPage.getBoundingClientRect();
        const lastPageRect = lastPage.getBoundingClientRect();
        const regularTableMarginBottom = parseFloat(getComputedStyle(regularTable).marginBottom) || 0;
        const lastTableMarginBottom = parseFloat(getComputedStyle(lastTable).marginBottom) || 0;

        const regularRowsHeight = Math.max(
          0,
          regularPageNumber.getBoundingClientRect().top
            - regularBody.getBoundingClientRect().top
            - regularTableMarginBottom,
        );

        const lastRowsHeight = Math.max(
          0,
          amountWords.getBoundingClientRect().top
            - lastBody.getBoundingClientRect().top
            - lastTableMarginBottom,
        );

        onMeasured(invoice.id, {
          regularPageRowsHeight: Math.min(regularRowsHeight, regularPageRect.height),
          lastPageRowsHeight: Math.min(lastRowsHeight, lastPageRect.height),
          rowHeights: rows.map((row) => row.getBoundingClientRect().height),
        });
      });
    }

    measure();

    return () => {
      cancelled = true;
    };
  }, [invoice, onMeasured]);

  return (
    <div className="invoice-measure">
      <article ref={regularPageRef} className="invoice-sheet invoice-sheet--measure">
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

        <table ref={regularTableRef} className="invoice-items">
          <TableHead />
          <tbody ref={regularBodyRef} />
        </table>

        <div ref={regularPageNumberRef} className="invoice-page-number">Pagina 1 de 1</div>
      </article>

      <article ref={lastPageRef} className="invoice-sheet invoice-sheet--measure">
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

        <table ref={lastTableRef} className="invoice-items">
          <TableHead />
          <tbody ref={lastBodyRef} />
        </table>

        <div ref={amountWordsRef}>
          <FooterSkeleton invoice={invoice} vatLabel={vatLabel} />
        </div>

        <div className="invoice-page-number">Pagina 1 de 1</div>
      </article>

      <div className="invoice-rows-measure">
        <table className="invoice-items invoice-items--measure">
          <TableHead />
          <tbody>
            {invoice.items.map((item, index) => (
              <tr key={`${invoice.id}-measure-${item.lineNumber}-${index}`} ref={setRowRef(index)}>
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
      </div>
    </div>
  );
}
