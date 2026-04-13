import { describe, expect, it } from 'vitest';
import { parseDteXml } from './parseDteXml';

const dteXml = `<?xml version="1.0" encoding="UTF-8"?>
<DTE>
  <Documento>
    <Encabezado>
      <IdDoc>
        <TipoDTE>33</TipoDTE>
        <Folio>456</Folio>
        <FchEmis>2026-03-05</FchEmis>
        <FchVenc>2026-04-05</FchVenc>
        <FmaPago>2</FmaPago>
      </IdDoc>
      <Emisor>
        <RUTEmisor>76000000-0</RUTEmisor>
        <RznSoc>Proveedor PDF</RznSoc>
        <GiroEmis>Distribucion</GiroEmis>
        <DirOrigen>Av. Siempre Viva 123</DirOrigen>
        <CmnaOrigen>Santiago</CmnaOrigen>
        <CiudadOrigen>Santiago</CiudadOrigen>
      </Emisor>
      <Receptor>
        <RUTRecep>11111111-1</RUTRecep>
        <RznSocRecep>Cliente PDF</RznSocRecep>
        <GiroRecep>Retail</GiroRecep>
        <DirRecep>Calle Falsa 456</DirRecep>
        <CmnaRecep>Providencia</CmnaRecep>
        <CiudadRecep>Santiago</CiudadRecep>
      </Receptor>
      <Totales>
        <MntNeto>1000</MntNeto>
        <TasaIVA>19</TasaIVA>
        <IVA>190</IVA>
        <MntTotal>1190</MntTotal>
        <ImptoReten>
          <TipoImp>27</TipoImp>
          <TasaImp>10</TasaImp>
          <MontoImp>50</MontoImp>
        </ImptoReten>
      </Totales>
    </Encabezado>
    <DscRcgGlobal>
      <TpoMov>D</TpoMov>
      <GlosaDR>@@Descuento especial</GlosaDR>
      <TpoValor>$</TpoValor>
      <ValorDR>30</ValorDR>
    </DscRcgGlobal>
    <Detalle>
      <NroLinDet>1</NroLinDet>
      <CdgItem>
        <VlrCodigo>SKU-1</VlrCodigo>
      </CdgItem>
      <NmbItem>Producto PDF</NmbItem>
      <DscItem>Descripcion larga</DscItem>
      <QtyItem>2</QtyItem>
      <UnmdItem>UN</UnmdItem>
      <PrcItem>500</PrcItem>
      <MontoItem>1000</MontoItem>
    </Detalle>
    <TED>
      <DD>
        <RE>76000000-0</RE>
        <TD>33</TD>
        <F>456</F>
      </DD>
    </TED>
  </Documento>
</DTE>`;

describe('parseDteXml', () => {
  it('normaliza el documento PDF con impuestos, descuentos y TED', () => {
    const invoices = parseDteXml(dteXml, 'factura.xml');
    const [invoice] = invoices;

    expect(invoices).toHaveLength(1);
    expect(invoice.document.typeCode).toBe('33');
    expect(invoice.document.number).toBe('456');
    expect(invoice.document.paymentMethodLabel).toBe('Credito');
    expect(invoice.issuer.name).toBe('Proveedor PDF');
    expect(invoice.receiver.name).toBe('Cliente PDF');
    expect(invoice.items).toHaveLength(1);
    expect(invoice.items[0]).toMatchObject({
      code: 'SKU-1',
      name: 'Producto PDF',
      description: 'Descripcion larga',
      quantity: 2,
      unitPrice: 500,
      total: 1000,
    });
    expect(invoice.totals).toMatchObject({
      net: 1000,
      vatRate: 19,
      vat: 190,
      total: 1190,
      withholdings: 50,
      discount: 30,
    });
    expect(invoice.taxes).toHaveLength(1);
    expect(invoice.adjustments.discounts).toHaveLength(1);
    expect(invoice.stamp.available).toBe(true);
    expect(invoice.stamp.text).toContain('<TED>');
  });
});
