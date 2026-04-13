import { describe, expect, it } from 'vitest';
import { parseSIISetDTE } from './dteParser';

const setDteXml = `<?xml version="1.0" encoding="UTF-8"?>
<SetDTE>
  <DTE>
    <Documento>
      <Encabezado>
        <IdDoc>
          <TipoDTE>33</TipoDTE>
          <Folio>123</Folio>
          <FchEmis>2026-03-05</FchEmis>
        </IdDoc>
        <Emisor>
          <RUTEmisor>76000000-0</RUTEmisor>
          <RznSoc>Proveedor Demo</RznSoc>
        </Emisor>
        <Receptor>
          <RUTRecep>11111111-1</RUTRecep>
          <RznSocRecep>Cliente Demo</RznSocRecep>
        </Receptor>
        <Totales>
          <MntNeto>1000</MntNeto>
          <IVA>190</IVA>
          <MntTotal>1190</MntTotal>
        </Totales>
      </Encabezado>
      <Detalle>
        <NroLinDet>1</NroLinDet>
        <CdgItem>
          <TpoCodigo>INT1</TpoCodigo>
          <VlrCodigo>ABC123</VlrCodigo>
        </CdgItem>
        <NmbItem>Producto demo</NmbItem>
        <QtyItem>2</QtyItem>
        <PrcItem>500</PrcItem>
        <MontoItem>1000</MontoItem>
      </Detalle>
    </Documento>
  </DTE>
</SetDTE>`;

describe('parseSIISetDTE', () => {
  it('arma nombres legibles usando la metadata normalizada del documento', async () => {
    const file = new File([setDteXml], 'demo.xml', { type: 'text/xml' });

    const invoices = await parseSIISetDTE(file);

    expect(invoices).toHaveLength(1);
    expect(invoices[0].name).toBe('Proveedor Demo — Folio 123 (2026-03-05)');
    expect(invoices[0].metadata.folio).toBe('123');
    expect(invoices[0].metadata.razonSocialEmisor).toBe('Proveedor Demo');
    expect(invoices[0].items[0].CdgItem_VlrCodigo).toBe('ABC123');
  });
});
