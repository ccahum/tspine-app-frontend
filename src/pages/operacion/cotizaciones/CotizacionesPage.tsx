import { useState, useEffect, useRef, memo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Search, X, Plus, Trash2, Pencil, FileDown, MoreHorizontal } from 'lucide-react';
import jsPDF from 'jspdf';
// Import solo por su efecto secundario: registra doc.autoTable(...) en el prototipo de jsPDF.
// (el default export del paquete no interopera bien con el bundling de Vite, ver doc.autoTable abajo)
import 'jspdf-autotable';
import logoUrl from '../../../assets/logo.png';
import Layout from '../../../components/layout/Layout';
import DateRangeFilter from '../../../components/filters/DateRangeFilter';
import SuccessToast from '../../../components/SuccessToast';
import { MaterialIcon } from '../../../components/icons/MaterialIcon';
import { toLocalDateString } from '../../../lib/date.utils';
import { useSmoothWheelScroll } from '../../../hooks/useSmoothWheelScroll';
import { useResponsiveStyles } from '../../../hooks/useResponsiveStyles';
import {
  cotizacionesService,
  type CotizacionListItem,
  type CotizacionDetail,
  type CotizacionItem,
  type ProductoOption,
  type TerceroOption,
  type PaqueteOption,
} from '../../../services/cotizaciones.service';

type AutoTableDoc = jsPDF & { autoTable: (options: Record<string, unknown>) => void; lastAutoTable: { finalY: number } };

const CUBRIMIENTO_HOSPITALES_ID = 'Zd5c45';
const CUBRIMIENTO_OPTIONS = [
  { id: '1A15', label: 'Particulares' },
  { id: CUBRIMIENTO_HOSPITALES_ID, label: 'Hospitales' },
  { id: '1A17', label: 'Distribuidor' },
  { id: '1A18', label: 'Aseguradora' },
];
const NIVEL_OPTIONS = ['Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel 4', 'Nivel 5', 'Nivel 6'];
const IMPUESTOS_OPTIONS = ['Ninguno', 'Iva', 'Todos'];
const CUBRIMIENTO_TO_CLASIFICACION: Record<string, string> = {
  '1A15': 'PARTICULAR',
  'Zd5c45': 'HOSPITAL',
  '1A17': 'DISTRIBUIDOR',
  '1A18': 'ASEGURADORA',
};

// Letras (con acentos), números, espacios y puntuación básica — sin símbolos raros
// (@#$%^&*<>{}[] etc). Los nombres de cirugía suelen llevar niveles como "L4-L5", por eso
// se permiten números y guión, a diferencia del sanitizeText de solo-letras de otras páginas.
const sanitizeCirugiaDirigido = (value: string): string => value.replace(/[^A-Za-z0-9À-ÿ\s.,'-]/g, '');

const formatDate = (dateString: string | null): string => {
  if (!dateString) return '-';
  try {
    if (dateString.includes('T')) {
      const date = new Date(dateString);
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${day}/${month}/${year}`;
    }
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  } catch {
    return dateString;
  }
};

const formatDateTime = (dateString: string | null): string => {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const mins = String(date.getUTCMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins}`;
  } catch {
    return dateString;
  }
};

const formatMoney = (value: number | null): string => {
  if (value === null || value === undefined) return '-';
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function computeTotales(items: CotizacionItem[], tieneDcto: boolean, porcentajeDcto: unknown, impuestos: string | null) {
  const subtotal = items.reduce((sum, it) => sum + (Number(it.valor) || 0), 0);
  const vrDcto = tieneDcto ? subtotal * (Number(porcentajeDcto) || 0) / 100 : 0;
  const totalAntesImpuestos = subtotal - vrDcto;
  const iva = (impuestos === 'Iva' || impuestos === 'Todos') ? totalAntesImpuestos * 0.16 : 0;
  const retencion = (impuestos === 'Retención' || impuestos === 'Todos') ? totalAntesImpuestos * 0.106667 : 0;
  const total = totalAntesImpuestos + iva - retencion;
  return { subtotal, vrDcto, totalAntesImpuestos, iva, retencion, total };
}

const EMPRESA_INFO = {
  nombre: 'Tecnología Spine S. de R.L de C.V.',
  rfc: 'TSP191206KT8',
  celular: '999 386 7505',
  telefono: '999 666 3454',
  email: 'administracion@tecnologiaspine.com',
};

const PDF_OLIVE: [number, number, number] = [77, 122, 19];
const PDF_NAVY: [number, number, number] = [26, 42, 74];
const PDF_GRAY_BOX: [number, number, number] = [244, 244, 240];
const PDF_GRAY_TEXT: [number, number, number] = [95, 95, 88];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar el logo'));
    img.src = url;
  });
}

// Dibuja "Etiqueta: valor" (etiqueta en negrita) con ajuste de línea; devuelve el Y final.
// dryRun=true solo mide (para calcular el alto de la caja gris antes de rellenarla).
function drawField(doc: AutoTableDoc, label: string, value: string, x: number, maxWidth: number, y: number, dryRun = false): number {
  const lineHeight = 4.2;
  const labelText = `${label}: `;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const labelWidth = doc.getTextWidth(labelText);
  doc.setFont('helvetica', 'normal');
  const lines: string[] = doc.splitTextToSize(value || '-', Math.max(maxWidth - labelWidth, 20));

  if (!dryRun) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PDF_NAVY);
    doc.text(labelText, x, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40, 40, 40);
    doc.text(lines[0] ?? '-', x + labelWidth, y);
    for (let i = 1; i < lines.length; i++) {
      doc.text(lines[i], x, y + i * lineHeight);
    }
  }
  return y + Math.max(1, lines.length) * lineHeight;
}

function drawRightLabelValue(doc: AutoTableDoc, label: string, value: string, rightX: number, y: number) {
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const labelText = `${label}: `;
  const labelWidth = doc.getTextWidth(labelText);
  doc.setFont('helvetica', 'normal');
  const valueWidth = doc.getTextWidth(value);
  const startX = rightX - labelWidth - valueWidth;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PDF_NAVY);
  doc.text(labelText, startX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(value, startX + labelWidth, y);
}

async function buildCotizacionPdf(data: CotizacionDetail): Promise<AutoTableDoc> {
  const { subtotal, iva, retencion, total } = computeTotales(data.items, data.tieneDcto, data.porcentajeDcto, data.impuestos);

  const doc = new jsPDF() as AutoTableDoc;
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const rightX = pageWidth - marginX;

  try {
    const logoImg = await loadImage(logoUrl);
    const logoWidth = 55;
    const logoHeight = logoWidth * (logoImg.naturalHeight / logoImg.naturalWidth);
    doc.addImage(logoImg, 'PNG', marginX, 10, logoWidth, logoHeight);
  } catch {
    // Si el logo no carga (ej. bloqueado por el navegador), se continúa sin él.
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PDF_NAVY);
  doc.text(EMPRESA_INFO.nombre, rightX, 15, { align: 'right' });

  let headerY = 21;
  for (const [label, value] of [
    ['RFC', EMPRESA_INFO.rfc],
    ['Celular', EMPRESA_INFO.celular],
    ['Teléfono', EMPRESA_INFO.telefono],
    ['Email', EMPRESA_INFO.email],
  ]) {
    drawRightLabelValue(doc, label, value, rightX, headerY);
    headerY += 5;
  }

  let y = 50;
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PDF_OLIVE);
  doc.text(`Cotización: ${data.numCotizacion || data.id}`, pageWidth / 2, y, { align: 'center' });
  y += 10;

  // Caja de datos generales: primero se mide (dryRun) para conocer el alto total,
  // se pinta el fondo gris, y luego se dibuja el texto encima.
  const boxStartY = y;
  const colWidth = (rightX - marginX) / 3;
  const innerPad = 3;

  // Las 4 filas comparten la misma cuadrícula de 3 columnas (colWidth) para que
  // los campos queden alineados verticalmente entre filas; "Observaciones" ocupa 2 columnas.
  const measureAll = (dryRun: boolean, startRowY: number) => {
    let rowY = startRowY;
    const b1 = drawField(doc, 'Dirigido a', data.dirigidoA ?? '-', marginX + innerPad, colWidth - innerPad * 2, rowY, dryRun);
    const b2 = drawField(doc, 'Hospital', data.hospital ?? '-', marginX + colWidth + innerPad, colWidth - innerPad * 2, rowY, dryRun);
    const b3 = drawField(doc, 'Doctor', data.medico ?? '-', marginX + colWidth * 2 + innerPad, colWidth - innerPad * 2, rowY, dryRun);
    rowY = Math.max(b1, b2, b3) + 4;

    const b4 = drawField(doc, 'Cirugía', data.cirugia ?? '-', marginX + innerPad, rightX - marginX - innerPad * 2, rowY, dryRun);
    rowY = b4 + 4;

    const b5 = drawField(doc, 'Cubrimiento', data.cubrimiento ?? '-', marginX + innerPad, colWidth - innerPad * 2, rowY, dryRun);
    const b6 = drawField(doc, 'Observaciones', data.observaciones ?? '-', marginX + colWidth + innerPad, colWidth * 2 - innerPad * 2, rowY, dryRun);
    rowY = Math.max(b5, b6) + 4;

    const b7 = drawField(doc, 'N° Proveedor', data.numProveedor ?? '-', marginX + innerPad, colWidth - innerPad * 2, rowY, dryRun);
    const b8 = drawField(doc, 'Tiempo de entrega', data.tiempoEntrega ?? '-', marginX + colWidth + innerPad, colWidth - innerPad * 2, rowY, dryRun);
    const b9 = drawField(doc, 'Fecha', formatDate(data.fecha), marginX + colWidth * 2 + innerPad, colWidth - innerPad * 2, rowY, dryRun);
    return Math.max(b7, b8, b9) + innerPad;
  };

  const boxEndY = measureAll(true, boxStartY + 6);
  doc.setFillColor(...PDF_GRAY_BOX);
  doc.setDrawColor(228, 228, 220);
  doc.roundedRect(marginX, boxStartY, rightX - marginX, boxEndY - boxStartY, 2, 2, 'FD');
  measureAll(false, boxStartY + 6);

  y = boxEndY + 8;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(60, 60, 55);
  doc.text('Atendiendo a la cotización solicitada, le proporcionamos la siguiente información:', marginX, y);
  y += 3;
  doc.setDrawColor(...PDF_OLIVE);
  doc.setLineWidth(0.3);
  doc.line(marginX, y, rightX, y);
  y += 4;

  doc.autoTable({
    startY: y,
    head: [['Cant', 'Referencia', 'Descripción', 'V/r Unitario', 'Importe']],
    body: data.items.map(it => [
      String(it.cantidad ?? '-'),
      it.referencia ?? '-',
      it.descripcion ?? '-',
      formatMoney(it.valorUnitario),
      formatMoney(it.valor),
    ]),
    theme: 'grid',
    headStyles: { fillColor: PDF_OLIVE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 2, textColor: [40, 40, 40], lineColor: [210, 210, 203], lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 26 },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
    },
    margin: { left: marginX, right: marginX },
  });

  const afterItemsY = doc.lastAutoTable.finalY + 6;

  const notaWidth = 110;
  const notaText = 'La presente cotización fue elaborada de acuerdo a los productos y/o servicios solicitados por el cliente. Los precios establecidos en el presente son en moneda nacional mexicana y no generan obligación o compromiso por parte del receptor, salvo manifestación expresa.\n\nEstos precios perderán vigencia a partir del 5to día hábil después de la expedición del presente documento, agradecemos su preferencia y estamos a sus órdenes para aclarar cualquier duda.';
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  const notaLines: string[] = doc.splitTextToSize(notaText, notaWidth - 6);
  const notaHeight = notaLines.length * 3.3 + 6;
  doc.setFillColor(...PDF_GRAY_BOX);
  doc.rect(marginX, afterItemsY, notaWidth, notaHeight, 'F');
  doc.setTextColor(...PDF_GRAY_TEXT);
  doc.text(notaLines, marginX + 3, afterItemsY + 5);

  const totalsX = marginX + notaWidth + 10;
  const totalsWidth = rightX - totalsX;
  const totalsRows: [string, string][] = [
    ['Subtotal', formatMoney(subtotal)],
    ['IVA', formatMoney(iva)],
    ['Retención', formatMoney(retencion)],
    ['Total General', formatMoney(total)],
  ];

  doc.autoTable({
    startY: afterItemsY,
    theme: 'plain',
    body: totalsRows,
    styles: { fontSize: 9, cellPadding: 2.5, lineColor: [222, 222, 214], lineWidth: { bottom: 0.2 } },
    columnStyles: {
      0: { cellWidth: totalsWidth * 0.55, fontStyle: 'bold' },
      1: { cellWidth: totalsWidth * 0.45, halign: 'right' },
    },
    margin: { left: totalsX, right: marginX },
    didParseCell: (hookData: { row: { index: number }; cell: { styles: Record<string, unknown> } }) => {
      if (hookData.row.index === totalsRows.length - 1) {
        hookData.cell.styles.fillColor = PDF_OLIVE;
        hookData.cell.styles.textColor = [255, 255, 255];
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.lineWidth = 0;
      }
    },
  });

  // Borde exterior sutil alrededor de la caja de totales (en vez de una cuadrícula pesada por celda)
  doc.setDrawColor(222, 222, 214);
  doc.setLineWidth(0.2);
  doc.rect(totalsX, afterItemsY, totalsWidth, doc.lastAutoTable.finalY - afterItemsY, 'S');

  const afterFooterY = Math.max(afterItemsY + notaHeight, doc.lastAutoTable.finalY) + 20;

  doc.setDrawColor(120, 120, 115);
  doc.setLineWidth(0.2);
  doc.line(rightX - 55, afterFooterY, rightX, afterFooterY);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);
  doc.text('Firma', rightX - 27.5, afterFooterY + 5, { align: 'center' });

  return doc;
}

function cotizacionPdfFileName(data: CotizacionDetail): string {
  return `Cotizacion-${data.numCotizacion || data.id}.pdf`;
}

async function generarPdfCotizacion(data: CotizacionDetail) {
  const doc = await buildCotizacionPdf(data);
  doc.save(cotizacionPdfFileName(data));
}

async function enviarCotizacionPorWhatsapp(data: CotizacionDetail) {
  const doc = await buildCotizacionPdf(data);
  const fileName = cotizacionPdfFileName(data);
  const { total } = computeTotales(data.items, data.tieneDcto, data.porcentajeDcto, data.impuestos);
  const mensaje = `Cotización ${data.numCotizacion || data.id} — Total: ${formatMoney(total)}`;

  const blob: Blob = doc.output('blob');
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean; share?: (data: ShareData) => Promise<void> };

  if (nav.canShare && nav.share) {
    const file = new File([blob], fileName, { type: 'application/pdf' });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: fileName, text: mensaje });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // Si falla por otro motivo, se sigue con el flujo de respaldo abajo.
      }
    }
  }

  // Respaldo: el navegador no soporta adjuntar archivos vía "compartir".
  // Se descarga el PDF y se abre WhatsApp con el mensaje, para que el usuario adjunte el PDF manualmente.
  doc.save(fileName);
  window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank');
}

const CotizacionRow = memo(({ item, index, onSelect }: { item: CotizacionListItem; index: number; onSelect: (id: string) => void }) => (
  <tr
    style={styles.tr}
    onClick={() => onSelect(item.id)}
    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}
  >
    <td style={{ ...styles.td, textAlign: 'center', fontWeight: 600, color: '#9ca3af', width: '40px' }}>{index + 1}</td>
    <td style={styles.td}>
      <span style={styles.idCode}>{item.numCotizacion || item.id}</span>
    </td>
    <td style={styles.td}>{formatDate(item.fecha)}</td>
    <td style={styles.td}>{item.usuario ?? '-'}</td>
    <td style={{ ...styles.td, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.hospital ?? '-'}</td>
    <td style={{ ...styles.td, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.medico ?? '-'}</td>
    <td style={{ ...styles.td, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, color: '#6b6b60' }}>{item.cirugia ?? '-'}</td>
    <td style={styles.td}>{item.sede ?? '-'}</td>
  </tr>
));

const CotizacionCard = memo(({ item, onSelect }: { item: CotizacionListItem; onSelect: (id: string) => void }) => (
  <div style={styles.mobileCard} onClick={() => onSelect(item.id)}>
    <div style={styles.mobileCardTopRow}>
      <span style={styles.mobileCardId}>{item.numCotizacion || item.id}</span>
      <span style={styles.mobileCardDate}>{formatDate(item.fecha)}</span>
    </div>
    <div style={styles.mobileCardMainRow}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={styles.mobileCardTitle}>{item.hospital ?? 'Sin hospital'}</div>
        <div style={styles.mobileCardSubtext}>{item.medico ?? '-'}</div>
      </div>
    </div>
    <div style={styles.mobileCardFieldsRow}>
      <div style={styles.mobileCardField}>
        <span style={styles.mobileCardFieldLabel}>Sede</span>
        <span style={styles.mobileCardFieldValue}>{item.sede ?? '-'}</span>
      </div>
      <div style={styles.mobileCardField}>
        <span style={styles.mobileCardFieldLabel}>Usuario</span>
        <span style={styles.mobileCardFieldValue}>{item.usuario ?? '-'}</span>
      </div>
      <div style={{ ...styles.mobileCardField, flex: 1, minWidth: 0 }}>
        <span style={styles.mobileCardFieldLabel}>Cirugía</span>
        <span style={{ ...styles.mobileCardFieldValue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.cirugia ?? '-'}</span>
      </div>
    </div>
  </div>
));

function DetalleItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.detalleItem}>
      <span style={styles.detalleLabel}>{label}</span>
      <span style={styles.detalleValue}>{children}</span>
    </div>
  );
}

const emptyItemForm = { productoId: '', productoLabel: '', articulo: '', cantidad: '', valorUnitario: '', valor: '', observaciones: '' };

/** cantidad × valor unitario, redondeado a 2 decimales; '' si algún operando falta. */
const recalcValor = (cantidad: string, valorUnitario: string): string => {
  const c = Number(cantidad);
  const vu = Number(valorUnitario);
  if (!cantidad || !valorUnitario || isNaN(c) || isNaN(vu)) return '';
  return (Math.round(c * vu * 100) / 100).toString();
};

function AddItemForm({ cotizacionId, onDone, onSaved }: { cotizacionId: string; onDone: () => void; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyItemForm);
  const [productoSearch, setProductoSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: productoResults = [] } = useQuery<ProductoOption[]>({
    queryKey: ['cotizaciones-productos', productoSearch, cotizacionId],
    queryFn: () => cotizacionesService.searchProductos(productoSearch, cotizacionId),
    enabled: !!productoSearch.trim(),
  });

  const createMutation = useMutation({
    mutationFn: () => cotizacionesService.createItem(cotizacionId, {
      productoId: form.productoId,
      cantidad: Number(form.cantidad),
      valorUnitario: Number(form.valorUnitario),
      observaciones: form.observaciones || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizacion', cotizacionId] });
      onDone();
      onSaved();
    },
  });

  const handleGuardar = () => {
    if (!form.productoId) { setError('Selecciona una descripción (producto).'); return; }
    if (!form.cantidad || Number(form.cantidad) <= 0) { setError('La cantidad debe ser mayor a cero.'); return; }
    if (!form.valorUnitario || Number(form.valorUnitario) <= 0) { setError('El valor unitario debe ser mayor a cero.'); return; }
    if (!form.valor || Number(form.valor) <= 0) { setError('El valor debe ser mayor a cero.'); return; }
    setError(null);
    createMutation.mutate();
  };

  return (
    <div style={styles.addItemForm}>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Descripción *</label>
        {form.productoId ? (
          <span style={styles.medicoTag}>
            {form.productoLabel}
            <X size={12} style={{ cursor: 'pointer' }} onClick={() => setForm({ ...form, productoId: '', productoLabel: '', articulo: '' })} />
          </span>
        ) : (
          <div style={{ position: 'relative' as const }}>
            <input
              style={styles.formInput}
              placeholder="Buscar producto..."
              value={productoSearch}
              onChange={e => setProductoSearch(e.target.value)}
            />
            {productoSearch.trim() && (
              <div style={styles.medicoDropdown}>
                {productoResults.length === 0 ? (
                  <div style={{ padding: '0.6rem 0.75rem', color: '#9ca3af', fontSize: '0.85rem' }}>Sin resultados</div>
                ) : (
                  productoResults.map(p => (
                    <div
                      key={p.id}
                      style={styles.medicoDropdownItem}
                      onClick={() => {
                        const nuevoValorUnitario = p.precioSugerido !== null ? String(p.precioSugerido) : form.valorUnitario;
                        setForm({
                          ...form,
                          productoId: p.id,
                          productoLabel: `${p.referencia ?? ''} / ${p.nombre ?? ''}`.replace(/^ \/ /, ''),
                          articulo: `Fórmula para ${p.nombre ?? ''}`,
                          valorUnitario: nuevoValorUnitario,
                          valor: recalcValor(form.cantidad, nuevoValorUnitario),
                        });
                        setProductoSearch('');
                      }}
                    >
                      {p.referencia} / {p.nombre}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {form.productoId && (
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Artículo</label>
          <input style={{ ...styles.formInput, color: '#6b6b60' }} value={form.articulo} readOnly />
        </div>
      )}

      <div style={styles.formRow3}>
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Cantidad *</label>
          <input
            type="number"
            style={styles.formInput}
            value={form.cantidad}
            onChange={e => setForm({ ...form, cantidad: e.target.value, valor: recalcValor(e.target.value, form.valorUnitario) })}
          />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Valor Unitario *</label>
          <input
            type="number"
            step="0.01"
            style={styles.formInput}
            value={form.valorUnitario}
            onChange={e => setForm({ ...form, valorUnitario: e.target.value, valor: recalcValor(form.cantidad, e.target.value) })}
          />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Valor</label>
          <input style={{ ...styles.formInput, color: '#6b6b60', backgroundColor: '#f4f4ee', cursor: 'not-allowed' }} value={form.valor ? formatMoney(Number(form.valor)) : ''} disabled />
        </div>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Observaciones</label>
        <input style={styles.formInput} value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} />
      </div>

      {error && <span style={styles.errorText}>{error}</span>}

      <div style={styles.formActions}>
        <button style={styles.cancelBtn} onClick={onDone}>Cancelar</button>
        <button style={styles.saveBtn} onClick={handleGuardar} disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

function ItemDetailModal({ item, cotizacionId, onClose, onSaved, onDeleted }: {
  item: CotizacionItem;
  cotizacionId: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    productoId: item.productoId ?? '',
    productoLabel: `${item.referencia ?? ''} / ${item.descripcion ?? ''}`.replace(/^ \/ /, ''),
    cantidad: item.cantidad !== null ? String(item.cantidad) : '',
    valorUnitario: item.valorUnitario !== null ? String(item.valorUnitario) : '',
  });
  const [productoSearch, setProductoSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: productoResults = [] } = useQuery<ProductoOption[]>({
    queryKey: ['cotizaciones-productos', productoSearch, cotizacionId],
    queryFn: () => cotizacionesService.searchProductos(productoSearch, cotizacionId),
    enabled: editing && !!productoSearch.trim(),
  });

  const valorCalculado = recalcValor(form.cantidad, form.valorUnitario);

  const hasChanges =
    form.productoId !== (item.productoId ?? '') ||
    form.cantidad !== (item.cantidad !== null ? String(item.cantidad) : '') ||
    form.valorUnitario !== (item.valorUnitario !== null ? String(item.valorUnitario) : '');

  const updateMutation = useMutation({
    mutationFn: () => cotizacionesService.updateItem(item.id, {
      productoId: form.productoId,
      cantidad: Number(form.cantidad),
      valorUnitario: Number(form.valorUnitario),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizacion', cotizacionId] });
      setEditing(false);
      onSaved();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => cotizacionesService.deleteItem(item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizacion', cotizacionId] });
      onDeleted();
      onClose();
    },
  });

  const handleGuardar = () => {
    if (!form.productoId) { setError('Selecciona una descripción (producto).'); return; }
    if (!form.cantidad || Number(form.cantidad) <= 0) { setError('La cantidad debe ser mayor a cero.'); return; }
    if (!form.valorUnitario || Number(form.valorUnitario) <= 0) { setError('El valor unitario debe ser mayor a cero.'); return; }
    if (!hasChanges) { setEditing(false); return; }
    setError(null);
    updateMutation.mutate();
  };

  return (
    <div className="modal-overlay-anim" style={{ ...styles.modalOverlay, zIndex: 10001 }} onClick={onClose}>
      <div className="modal-content-anim" style={{ ...styles.modalContent, maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{item.descripcion ?? item.referencia ?? 'Ítem'}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {!editing && (
              <>
                <button style={styles.iconBtnDanger} onClick={() => setConfirmDelete(true)} title="Eliminar">
                  <Trash2 size={16} />
                </button>
                <button style={styles.iconBtnEdit} onClick={() => setEditing(true)} title="Editar">
                  <Pencil size={14} /> Editar
                </button>
              </>
            )}
            <button style={styles.closeBtn} onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div style={styles.modalBody}>
          {confirmDelete ? (
            <div style={styles.confirmBox}>
              <span style={{ fontWeight: 600, color: '#16170f' }}>¿Eliminar este ítem? Esta acción no se puede deshacer.</span>
              <div style={styles.formActions}>
                <button style={styles.cancelBtn} onClick={() => setConfirmDelete(false)}>Cancelar</button>
                <button style={styles.deleteBtn} onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                  {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          ) : editing ? (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.9rem' }}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Descripción *</label>
                {form.productoId ? (
                  <span style={styles.medicoTag}>
                    {form.productoLabel}
                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => setForm({ ...form, productoId: '', productoLabel: '' })} />
                  </span>
                ) : (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      style={styles.formInput}
                      placeholder="Buscar producto..."
                      value={productoSearch}
                      onChange={e => setProductoSearch(e.target.value)}
                    />
                    {productoSearch.trim() && (
                      <div style={styles.medicoDropdown}>
                        {productoResults.length === 0 ? (
                          <div style={{ padding: '0.6rem 0.75rem', color: '#9ca3af', fontSize: '0.85rem' }}>Sin resultados</div>
                        ) : (
                          productoResults.map(p => (
                            <div
                              key={p.id}
                              style={styles.medicoDropdownItem}
                              onClick={() => {
                                setForm({
                                  ...form,
                                  productoId: p.id,
                                  productoLabel: `${p.referencia ?? ''} / ${p.nombre ?? ''}`.replace(/^ \/ /, ''),
                                });
                                setProductoSearch('');
                              }}
                            >
                              {p.referencia} / {p.nombre}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={styles.formColStack}>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Cantidad *</label>
                  <input type="number" style={styles.formInput} value={form.cantidad} onChange={e => setForm({ ...form, cantidad: e.target.value })} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Valor Unitario *</label>
                  <input type="number" step="0.01" style={styles.formInput} value={form.valorUnitario} onChange={e => setForm({ ...form, valorUnitario: e.target.value })} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Valor</label>
                  <input style={{ ...styles.formInput, color: '#6b6b60', backgroundColor: '#f4f4ee', cursor: 'not-allowed' }} value={valorCalculado ? formatMoney(Number(valorCalculado)) : ''} disabled />
                </div>
              </div>

              {error && <span style={styles.errorText}>{error}</span>}

              <div style={styles.formActions}>
                <button style={styles.cancelBtn} onClick={() => { setEditing(false); setError(null); }}>Cancelar</button>
                <button
                  style={{ ...styles.saveBtn, ...(!hasChanges ? styles.saveBtnDisabled : {}) }}
                  onClick={handleGuardar}
                  disabled={updateMutation.isPending || !hasChanges}
                >
                  {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '1.1rem' }}>
              <DetalleItem label="Hospital">{item.hospital ?? '-'}</DetalleItem>
              <DetalleItem label="Referencia">{item.referencia ?? '-'}</DetalleItem>
              <DetalleItem label="Descripción">
                {item.referencia && item.descripcion ? `${item.referencia} / ${item.descripcion}` : item.descripcion ?? '-'}
              </DetalleItem>
              <DetalleItem label="Cantidad">{item.cantidad ?? '-'}</DetalleItem>
              <DetalleItem label="Valor Unitario">{formatMoney(item.valorUnitario)}</DetalleItem>
              <DetalleItem label="Valor">{formatMoney(item.valor)}</DetalleItem>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TerceroButtonList({ label, required, clasificacion, valueId, onSelect, id, error }: {
  label: string;
  required?: boolean;
  clasificacion: string;
  valueId: string;
  onSelect: (id: string, label: string) => void;
  id?: string;
  error?: boolean;
}) {
  const { data: options = [] } = useQuery<TerceroOption[]>({
    queryKey: ['cotizaciones-terceros-fijas', clasificacion],
    queryFn: () => cotizacionesService.searchTerceros(undefined, clasificacion),
  });

  return (
    <div style={styles.formGroup} id={id}>
      <label style={styles.formLabel}>{label}{required ? ' *' : ''}</label>
      <div style={styles.pickBtnGrid}>
        {options.map(o => (
          <button
            key={o.id}
            type="button"
            style={{ ...styles.pickBtn, ...(valueId === o.id ? styles.pickBtnActive : {}), ...(error ? styles.inputError : {}) }}
            onClick={() => onSelect(o.id, o.nombreCompleto)}
          >
            {o.nombreCompleto}
          </button>
        ))}
      </div>
    </div>
  );
}

function TerceroPicker({ label, required, valueId, valueLabel, onSelect, clasificacion, disabled, disabledHint, id, error }: {
  label: string;
  required?: boolean;
  valueId: string;
  valueLabel: string;
  onSelect: (id: string, label: string) => void;
  clasificacion?: string;
  disabled?: boolean;
  disabledHint?: string;
  id?: string;
  error?: boolean;
}) {
  const [search, setSearch] = useState('');
  const { data: results = [] } = useQuery<TerceroOption[]>({
    queryKey: ['cotizaciones-terceros', search, clasificacion],
    queryFn: () => cotizacionesService.searchTerceros(search, clasificacion),
    enabled: !disabled && !!search.trim(),
  });

  return (
    <div style={styles.formGroup} id={id}>
      <label style={styles.formLabel}>{label}{required ? ' *' : ''}</label>
      {valueId ? (
        <span style={styles.medicoTag}>
          {valueLabel}
          <X size={12} style={{ cursor: 'pointer' }} onClick={() => onSelect('', '')} />
        </span>
      ) : disabled ? (
        <span style={{ ...styles.formInput, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>
          {disabledHint ?? `Selecciona primero`}
        </span>
      ) : (
        <div style={{ position: 'relative' as const }}>
          <input
            style={{ ...styles.formInput, ...(error ? styles.inputError : {}) }}
            placeholder={`Buscar ${label.toLowerCase()}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search.trim() && (
            <div style={styles.medicoDropdown}>
              {results.length === 0 ? (
                <div style={{ padding: '0.6rem 0.75rem', color: '#9ca3af', fontSize: '0.85rem' }}>Sin resultados</div>
              ) : (
                results.map(t => (
                  <div key={t.id} style={styles.medicoDropdownItem} onClick={() => { onSelect(t.id, t.nombreCompleto); setSearch(''); }}>
                    {t.nombreCompleto}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TerceroMultiPicker({ label, values, onChange, id }: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  id?: string;
}) {
  const [search, setSearch] = useState('');
  const { data: results = [] } = useQuery<TerceroOption[]>({
    queryKey: ['cotizaciones-terceros-multi', search],
    queryFn: () => cotizacionesService.searchTerceros(search),
    enabled: !!search.trim(),
  });
  const availableResults = results.filter(r => !values.includes(r.nombreCompleto));

  return (
    <div style={styles.formGroup} id={id}>
      <label style={styles.formLabel}>{label}</label>
      {values.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' }}>
          {values.map(v => (
            <span key={v} style={styles.medicoTag}>
              {v}
              <X size={12} style={{ cursor: 'pointer' }} onClick={() => onChange(values.filter(x => x !== v))} />
            </span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' as const }}>
        <input
          style={styles.formInput}
          placeholder="Buscar médico..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search.trim() && (
          <div style={styles.medicoDropdown}>
            {availableResults.length === 0 ? (
              <div style={{ padding: '0.6rem 0.75rem', color: '#9ca3af', fontSize: '0.85rem' }}>Sin resultados</div>
            ) : (
              availableResults.map(t => (
                <div key={t.id} style={styles.medicoDropdownItem} onClick={() => { onChange([...values, t.nombreCompleto]); setSearch(''); }}>
                  {t.nombreCompleto}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ListPicker({ label, required, options, valueId, valueLabel, onSelect, id, error }: {
  label: string;
  required?: boolean;
  options: { id: string; nombre: string | null }[];
  valueId: string;
  valueLabel: string;
  onSelect: (id: string, label: string) => void;
  id?: string;
  error?: boolean;
}) {
  const [search, setSearch] = useState('');
  const filtered = search.trim()
    ? options.filter(o => (o.nombre ?? '').toLowerCase().includes(search.trim().toLowerCase()))
    : options;

  return (
    <div style={styles.formGroup} id={id}>
      <label style={styles.formLabel}>{label}{required ? ' *' : ''}</label>
      {valueId ? (
        <span style={styles.medicoTag}>
          {valueLabel}
          <X size={12} style={{ cursor: 'pointer' }} onClick={() => onSelect('', '')} />
        </span>
      ) : (
        <div style={{ position: 'relative' as const }}>
          <input
            style={{ ...styles.formInput, ...(error ? styles.inputError : {}) }}
            placeholder={`Buscar ${label.toLowerCase()}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search.trim() && (
            <div style={styles.medicoDropdown}>
              {filtered.length === 0 ? (
                <div style={{ padding: '0.6rem 0.75rem', color: '#9ca3af', fontSize: '0.85rem' }}>Sin resultados</div>
              ) : (
                filtered.slice(0, 30).map(o => (
                  <div key={o.id} style={styles.medicoDropdownItem} onClick={() => { onSelect(o.id, o.nombre ?? ''); setSearch(''); }}>
                    {o.nombre}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const toDateInputValue = (iso: string | null): string => iso ? iso.slice(0, 10) : '';

function EditCotizacionForm({ cotizacion, onCancel, onSaved }: {
  cotizacion: CotizacionDetail;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    fecha: toDateInputValue(cotizacion.fecha),
    dirigidoA: cotizacion.dirigidoA ?? '',
    medicos: cotizacion.medico ? cotizacion.medico.split(',').map(s => s.trim()).filter(Boolean) : [] as string[],
    hospitalId: cotizacion.hospitalId ?? '',
    hospitalLabel: cotizacion.hospital ?? '',
    cirugia: cotizacion.cirugia ?? '',
    cubrimientoId: cotizacion.cubrimientoId ?? '',
    empresaId: cotizacion.empresaId ?? '',
    empresaLabel: cotizacion.empresa ?? '',
    responsableEconomicoId: cotizacion.responsableEconomicoId ?? '',
    responsableEconomicoLabel: cotizacion.responsableEconomico ?? '',
    numProveedor: cotizacion.numProveedor ?? '',
    tiempoEntrega: cotizacion.tiempoEntrega ?? '',
    observaciones: cotizacion.observaciones ?? '',
    paqueteId: cotizacion.paqueteId ?? '',
    paqueteLabel: cotizacion.paquete ?? '',
    nivel: cotizacion.nivel ?? '',
    tieneDcto: cotizacion.tieneDcto,
    porcentajeDcto: cotizacion.porcentajeDcto !== null ? String(cotizacion.porcentajeDcto) : '',
    impuestos: cotizacion.impuestos ?? '',
  });
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  const { subtotal, vrDcto, totalAntesImpuestos, iva, retencion, total } = computeTotales(cotizacion.items, form.tieneDcto, form.porcentajeDcto, form.impuestos);

  const { data: paquetes = [] } = useQuery<PaqueteOption[]>({
    queryKey: ['cotizaciones-paquetes'],
    queryFn: () => cotizacionesService.getPaquetes(),
  });

  // Tarifa: si el responsable económico tiene tarifa propia asignada se usa esa; si no, cae al
  // cubrimiento general seleccionado (misma id que la subtarifa de nivel superior).
  const { data: terceroTarifa } = useQuery({
    queryKey: ['cotizacion-tercero-tarifa', form.responsableEconomicoId],
    queryFn: () => cotizacionesService.getTerceroTarifa(form.responsableEconomicoId),
    enabled: !!form.responsableEconomicoId,
  });
  const tarifaId = terceroTarifa?.tarifaId || form.cubrimientoId;
  const tarifaLabel = terceroTarifa?.tarifaNombre || CUBRIMIENTO_OPTIONS.find(o => o.id === form.cubrimientoId)?.label || '';

  const updateMutation = useMutation({
    mutationFn: () => cotizacionesService.updateCotizacion(cotizacion.id, {
      fecha: form.fecha || undefined,
      dirigidoA: form.dirigidoA,
      medico: form.medicos.join(', '),
      hospitalId: form.hospitalId,
      cirugia: form.cirugia,
      cubrimientoId: form.cubrimientoId,
      empresaId: form.empresaId,
      responsableEconomicoId: form.responsableEconomicoId,
      numProveedor: form.numProveedor,
      tarifaId,
      tiempoEntrega: form.tiempoEntrega,
      observaciones: form.observaciones,
      paqueteId: form.paqueteId,
      nivel: form.nivel,
      tieneDcto: form.tieneDcto,
      porcentajeDcto: form.porcentajeDcto ? Number(form.porcentajeDcto) : 0,
      vrDcto,
      impuestos: form.impuestos,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizacion', cotizacion.id] });
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
      onSaved('Cotización actualizada');
    },
  });

  const handleGuardar = () => {
    if (!form.fecha) { setError({ field: 'fecha', message: 'Selecciona la fecha.' }); return; }
    if (!form.dirigidoA.trim()) { setError({ field: 'dirigidoA', message: 'Ingresa a quién va dirigida.' }); return; }
    if (!form.hospitalId) { setError({ field: 'hospital', message: 'Selecciona el hospital.' }); return; }
    if (!form.cirugia.trim()) { setError({ field: 'cirugia', message: 'Ingresa la cirugía.' }); return; }
    if (!form.cubrimientoId) { setError({ field: 'cubrimiento', message: 'Selecciona el cubrimiento.' }); return; }
    if (!form.empresaId) { setError({ field: 'empresa', message: 'Selecciona la empresa.' }); return; }
    if (!form.responsableEconomicoId) { setError({ field: 'responsable', message: 'Selecciona el responsable económico.' }); return; }
    if (form.cubrimientoId === CUBRIMIENTO_HOSPITALES_ID && !form.numProveedor.trim()) { setError({ field: 'numProveedor', message: 'Ingresa el N° de proveedor.' }); return; }
    if (form.cubrimientoId === CUBRIMIENTO_HOSPITALES_ID && !form.tiempoEntrega.trim()) { setError({ field: 'tiempoEntrega', message: 'Ingresa el tiempo de entrega.' }); return; }
    if (!form.impuestos) { setError({ field: 'impuestos', message: 'Selecciona impuestos.' }); return; }
    setError(null);
    updateMutation.mutate();
  };

  useEffect(() => {
    if (!error) return;
    document.getElementById(`cotizacion-edit-field-${error.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '1.1rem' }}>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>N° Cotización</label>
        <input style={{ ...styles.formInput, color: '#9ca3af', backgroundColor: '#f4f4ee' }} value={cotizacion.numCotizacion || cotizacion.id} disabled />
      </div>

      <div style={styles.formGroup} id="cotizacion-edit-field-fecha">
        <label style={styles.formLabel}>Fecha *</label>
        <input type="date" style={{ ...styles.formInput, ...(error?.field === 'fecha' ? styles.inputError : {}) }} value={form.fecha} onChange={e => { setForm({ ...form, fecha: e.target.value }); setError(null); }} />
        {error?.field === 'fecha' && <span style={styles.errorText}>{error.message}</span>}
      </div>

      <div style={styles.formGroup} id="cotizacion-edit-field-dirigidoA">
        <label style={styles.formLabel}>Dirigido a *</label>
        <input style={{ ...styles.formInput, ...(error?.field === 'dirigidoA' ? styles.inputError : {}) }} value={form.dirigidoA} onChange={e => { setForm({ ...form, dirigidoA: sanitizeCirugiaDirigido(e.target.value) }); setError(null); }} />
        {error?.field === 'dirigidoA' && <span style={styles.errorText}>{error.message}</span>}
      </div>

      <TerceroMultiPicker label="Médico" values={form.medicos} onChange={medicos => setForm({ ...form, medicos })} />

      <TerceroPicker
        label="Hospital"
        required
        id="cotizacion-edit-field-hospital"
        error={error?.field === 'hospital'}
        valueId={form.hospitalId}
        valueLabel={form.hospitalLabel}
        onSelect={(id, label) => {
          const autoResponsable = form.cubrimientoId === CUBRIMIENTO_HOSPITALES_ID
            ? { responsableEconomicoId: id, responsableEconomicoLabel: label }
            : {};
          setForm({ ...form, hospitalId: id, hospitalLabel: label, ...autoResponsable });
          setError(null);
        }}
        clasificacion="HOSPITAL"
      />
      {error?.field === 'hospital' && <span style={styles.errorText}>{error.message}</span>}

      <div style={styles.formGroup} id="cotizacion-edit-field-cirugia">
        <label style={styles.formLabel}>Cirugía *</label>
        <input style={{ ...styles.formInput, ...(error?.field === 'cirugia' ? styles.inputError : {}) }} value={form.cirugia} onChange={e => { setForm({ ...form, cirugia: sanitizeCirugiaDirigido(e.target.value) }); setError(null); }} />
        {error?.field === 'cirugia' && <span style={styles.errorText}>{error.message}</span>}
      </div>

      <div style={styles.formGroup} id="cotizacion-edit-field-cubrimiento">
        <label style={styles.formLabel}>Cubrimiento *</label>
        <div style={styles.pickBtnGrid}>
          {CUBRIMIENTO_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              style={{ ...styles.pickBtn, ...(form.cubrimientoId === opt.id ? styles.pickBtnActive : {}), ...(error?.field === 'cubrimiento' ? styles.inputError : {}) }}
              onClick={() => {
                const autoResponsable = opt.id === CUBRIMIENTO_HOSPITALES_ID && form.hospitalId
                  ? { responsableEconomicoId: form.hospitalId, responsableEconomicoLabel: form.hospitalLabel }
                  : { responsableEconomicoId: '', responsableEconomicoLabel: '' };
                setForm({ ...form, cubrimientoId: opt.id, ...autoResponsable });
                setError(null);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {error?.field === 'cubrimiento' && <span style={styles.errorText}>{error.message}</span>}
      </div>

      <TerceroButtonList
        label="Empresa"
        required
        clasificacion="EMPRESA"
        id="cotizacion-edit-field-empresa"
        error={error?.field === 'empresa'}
        valueId={form.empresaId}
        onSelect={(id, label) => { setForm({ ...form, empresaId: id, empresaLabel: label }); setError(null); }}
      />
      {error?.field === 'empresa' && <span style={styles.errorText}>{error.message}</span>}

      <TerceroPicker
        label="Responsable Económico"
        required
        id="cotizacion-edit-field-responsable"
        error={error?.field === 'responsable'}
        clasificacion={CUBRIMIENTO_TO_CLASIFICACION[form.cubrimientoId]}
        disabled={!form.cubrimientoId}
        disabledHint="Selecciona primero el cubrimiento"
        valueId={form.responsableEconomicoId}
        valueLabel={form.responsableEconomicoLabel}
        onSelect={(id, label) => { setForm({ ...form, responsableEconomicoId: id, responsableEconomicoLabel: label }); setError(null); }}
      />
      {error?.field === 'responsable' && <span style={styles.errorText}>{error.message}</span>}

      <div style={styles.formGroup} id="cotizacion-edit-field-numProveedor">
        <label style={styles.formLabel}>N° Proveedor{form.cubrimientoId === CUBRIMIENTO_HOSPITALES_ID ? ' *' : ''}</label>
        <input style={{ ...styles.formInput, ...(error?.field === 'numProveedor' ? styles.inputError : {}) }} value={form.numProveedor} onChange={e => { setForm({ ...form, numProveedor: sanitizeCirugiaDirigido(e.target.value) }); setError(null); }} />
        {error?.field === 'numProveedor' && <span style={styles.errorText}>{error.message}</span>}
      </div>

      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Tarifa</label>
        <span style={{ ...styles.formInput, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>
          {tarifaLabel || 'Selecciona hospital/responsable económico y cubrimiento'}
        </span>
      </div>

      <div style={styles.formGroup} id="cotizacion-edit-field-tiempoEntrega">
        <label style={styles.formLabel}>Tiempo de Entrega{form.cubrimientoId === CUBRIMIENTO_HOSPITALES_ID ? ' *' : ''}</label>
        <input style={{ ...styles.formInput, ...(error?.field === 'tiempoEntrega' ? styles.inputError : {}) }} value={form.tiempoEntrega} onChange={e => { setForm({ ...form, tiempoEntrega: sanitizeCirugiaDirigido(e.target.value) }); setError(null); }} />
        {error?.field === 'tiempoEntrega' && <span style={styles.errorText}>{error.message}</span>}
      </div>

      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Observaciones</label>
        <input style={styles.formInput} value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} />
      </div>

      <ListPicker label="Paquete" options={paquetes} valueId={form.paqueteId} valueLabel={form.paqueteLabel} onSelect={(id, label) => setForm({ ...form, paqueteId: id, paqueteLabel: label })} />

      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Nivel</label>
        <div style={styles.pickBtnGrid}>
          {NIVEL_OPTIONS.map(n => (
            <button
              key={n}
              type="button"
              style={{ ...styles.pickBtn, ...(form.nivel === n ? styles.pickBtnActive : {}) }}
              onClick={() => setForm({ ...form, nivel: form.nivel === n ? '' : n })}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Subtotal</label>
        <input
          style={{ ...styles.formInput, color: '#6b6b60', backgroundColor: '#f4f4ee', cursor: 'not-allowed' }}
          value={formatMoney(subtotal)}
          disabled
        />
      </div>

      <div style={styles.formGroup}>
        <label style={styles.formLabel}>¿Tiene Dcto? *</label>
        <div style={styles.pickBtnGrid}>
          <button type="button" style={{ ...styles.pickBtn, ...(!form.tieneDcto ? styles.pickBtnActive : {}) }} onClick={() => setForm({ ...form, tieneDcto: false })}>No</button>
          <button type="button" style={{ ...styles.pickBtn, ...(form.tieneDcto ? styles.pickBtnActive : {}) }} onClick={() => setForm({ ...form, tieneDcto: true })}>Sí</button>
        </div>
      </div>

      {form.tieneDcto && (
        <>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>% Dto</label>
            <input type="number" step="0.01" style={styles.formInput} value={form.porcentajeDcto} onChange={e => setForm({ ...form, porcentajeDcto: e.target.value })} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>V/R Dcto</label>
            <input
              style={{ ...styles.formInput, color: '#6b6b60', backgroundColor: '#f4f4ee', cursor: 'not-allowed' }}
              value={formatMoney(vrDcto)}
              disabled
            />
          </div>
        </>
      )}

      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Total antes de Impuestos</label>
        <input
          style={{ ...styles.formInput, color: '#6b6b60', backgroundColor: '#f4f4ee', cursor: 'not-allowed' }}
          value={formatMoney(totalAntesImpuestos)}
          disabled
        />
      </div>

      <div style={styles.formGroup} id="cotizacion-edit-field-impuestos">
        <label style={styles.formLabel}>Impuestos *</label>
        <div style={styles.pickBtnGrid}>
          {IMPUESTOS_OPTIONS.map(opt => (
            <button
              key={opt}
              type="button"
              style={{ ...styles.pickBtn, ...(form.impuestos === opt ? styles.pickBtnActive : {}), ...(error?.field === 'impuestos' ? styles.inputError : {}) }}
              onClick={() => { setForm({ ...form, impuestos: opt }); setError(null); }}
            >
              {opt}
            </button>
          ))}
        </div>
        {error?.field === 'impuestos' && <span style={styles.errorText}>{error.message}</span>}
      </div>

      <div style={styles.formGroup}>
        <label style={styles.formLabel}>I.V.A.</label>
        <input
          style={{ ...styles.formInput, color: '#6b6b60', backgroundColor: '#f4f4ee', cursor: 'not-allowed' }}
          value={formatMoney(iva)}
          disabled
        />
      </div>

      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Retención</label>
        <input
          style={{ ...styles.formInput, color: '#6b6b60', backgroundColor: '#f4f4ee', cursor: 'not-allowed' }}
          value={formatMoney(retencion)}
          disabled
        />
      </div>

      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Total</label>
        <input
          style={{ ...styles.formInput, color: '#16170f', fontWeight: 700, backgroundColor: '#f4f4ee', cursor: 'not-allowed' }}
          value={formatMoney(total)}
          disabled
        />
      </div>

      <div style={styles.formActions}>
        <button style={styles.cancelBtn} onClick={onCancel}>Cancelar</button>
        <button style={styles.saveBtn} onClick={handleGuardar} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

function NuevaCotizacionModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    fecha: toLocalDateString(new Date()),
    dirigidoA: '',
    medicos: [] as string[],
    hospitalId: '',
    hospitalLabel: '',
    cirugia: '',
    cubrimientoId: '',
    empresaId: '',
    empresaLabel: '',
    responsableEconomicoId: '',
    responsableEconomicoLabel: '',
    numProveedor: '',
    tiempoEntrega: '',
    observaciones: '',
    paqueteId: '',
    paqueteLabel: '',
    nivel: '',
    tieneDcto: false,
    porcentajeDcto: '',
    impuestos: '',
  });
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  const { vrDcto, totalAntesImpuestos, iva, retencion, total } = computeTotales([], form.tieneDcto, form.porcentajeDcto, form.impuestos);

  const { data: paquetes = [] } = useQuery<PaqueteOption[]>({
    queryKey: ['cotizaciones-paquetes'],
    queryFn: () => cotizacionesService.getPaquetes(),
  });

  // Tarifa: si el responsable económico tiene tarifa propia asignada se usa esa; si no, cae al
  // cubrimiento general seleccionado (misma id que la subtarifa de nivel superior).
  const { data: terceroTarifa } = useQuery({
    queryKey: ['cotizacion-tercero-tarifa', form.responsableEconomicoId],
    queryFn: () => cotizacionesService.getTerceroTarifa(form.responsableEconomicoId),
    enabled: !!form.responsableEconomicoId,
  });
  const tarifaId = terceroTarifa?.tarifaId || form.cubrimientoId;
  const tarifaLabel = terceroTarifa?.tarifaNombre || CUBRIMIENTO_OPTIONS.find(o => o.id === form.cubrimientoId)?.label || '';

  const createMutation = useMutation({
    mutationFn: () => cotizacionesService.createCotizacion({
      fecha: form.fecha,
      dirigidoA: form.dirigidoA,
      medico: form.medicos.join(', '),
      hospitalId: form.hospitalId,
      cirugia: form.cirugia,
      cubrimientoId: form.cubrimientoId,
      empresaId: form.empresaId,
      responsableEconomicoId: form.responsableEconomicoId,
      numProveedor: form.numProveedor,
      tarifaId,
      tiempoEntrega: form.tiempoEntrega,
      observaciones: form.observaciones,
      paqueteId: form.paqueteId,
      nivel: form.nivel,
      tieneDcto: form.tieneDcto,
      porcentajeDcto: form.tieneDcto && form.porcentajeDcto ? Number(form.porcentajeDcto) : undefined,
      impuestos: form.impuestos,
    }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
      onCreated(`Cotización ${created.numCotizacion || created.id} creada`);
    },
  });

  const handleGuardar = () => {
    if (!form.fecha) { setError({ field: 'fecha', message: 'Selecciona la fecha.' }); return; }
    if (!form.dirigidoA.trim()) { setError({ field: 'dirigidoA', message: 'Ingresa a quién va dirigida.' }); return; }
    if (!form.hospitalId) { setError({ field: 'hospital', message: 'Selecciona el hospital.' }); return; }
    if (!form.cirugia.trim()) { setError({ field: 'cirugia', message: 'Ingresa la cirugía.' }); return; }
    if (!form.cubrimientoId) { setError({ field: 'cubrimiento', message: 'Selecciona el cubrimiento.' }); return; }
    if (!form.empresaId) { setError({ field: 'empresa', message: 'Selecciona la empresa.' }); return; }
    if (!form.responsableEconomicoId) { setError({ field: 'responsable', message: 'Selecciona el responsable económico.' }); return; }
    if (form.cubrimientoId === CUBRIMIENTO_HOSPITALES_ID && !form.numProveedor.trim()) { setError({ field: 'numProveedor', message: 'Ingresa el N° de proveedor.' }); return; }
    if (form.cubrimientoId === CUBRIMIENTO_HOSPITALES_ID && !form.tiempoEntrega.trim()) { setError({ field: 'tiempoEntrega', message: 'Ingresa el tiempo de entrega.' }); return; }
    if (!form.impuestos) { setError({ field: 'impuestos', message: 'Selecciona impuestos.' }); return; }
    setError(null);
    createMutation.mutate();
  };

  useEffect(() => {
    if (!error) return;
    document.getElementById(`cotizacion-create-field-${error.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  return (
    <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={onClose}>
      <div className="modal-content-anim" style={{ ...styles.modalContent, maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Nueva Cotización</h2>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={styles.modalBody}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '1.1rem' }}>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>N° Cotización</label>
              <input style={{ ...styles.formInput, color: '#9ca3af', backgroundColor: '#f4f4ee' }} placeholder="Se genera automáticamente" disabled />
            </div>

            <div style={styles.formGroup} id="cotizacion-create-field-fecha">
              <label style={styles.formLabel}>Fecha *</label>
              <input type="date" style={{ ...styles.formInput, ...(error?.field === 'fecha' ? styles.inputError : {}) }} value={form.fecha} onChange={e => { setForm({ ...form, fecha: e.target.value }); setError(null); }} />
              {error?.field === 'fecha' && <span style={styles.errorText}>{error.message}</span>}
            </div>

            <div style={styles.formGroup} id="cotizacion-create-field-dirigidoA">
              <label style={styles.formLabel}>Dirigido a *</label>
              <input style={{ ...styles.formInput, ...(error?.field === 'dirigidoA' ? styles.inputError : {}) }} value={form.dirigidoA} onChange={e => { setForm({ ...form, dirigidoA: sanitizeCirugiaDirigido(e.target.value) }); setError(null); }} />
              {error?.field === 'dirigidoA' && <span style={styles.errorText}>{error.message}</span>}
            </div>

            <TerceroMultiPicker label="Médico" values={form.medicos} onChange={medicos => setForm({ ...form, medicos })} />

            <TerceroPicker
              label="Hospital"
              required
              id="cotizacion-create-field-hospital"
              error={error?.field === 'hospital'}
              valueId={form.hospitalId}
              valueLabel={form.hospitalLabel}
              onSelect={(id, label) => {
                // Si el cubrimiento ya es Hospitales, el responsable económico por defecto es el
                // propio hospital — el usuario lo puede cambiar después si hace falta.
                const autoResponsable = form.cubrimientoId === CUBRIMIENTO_HOSPITALES_ID
                  ? { responsableEconomicoId: id, responsableEconomicoLabel: label }
                  : {};
                setForm({ ...form, hospitalId: id, hospitalLabel: label, ...autoResponsable });
                setError(null);
              }}
              clasificacion="HOSPITAL"
            />
            {error?.field === 'hospital' && <span style={styles.errorText}>{error.message}</span>}

            <div style={styles.formGroup} id="cotizacion-create-field-cirugia">
              <label style={styles.formLabel}>Cirugía *</label>
              <input style={{ ...styles.formInput, ...(error?.field === 'cirugia' ? styles.inputError : {}) }} value={form.cirugia} onChange={e => { setForm({ ...form, cirugia: sanitizeCirugiaDirigido(e.target.value) }); setError(null); }} />
              {error?.field === 'cirugia' && <span style={styles.errorText}>{error.message}</span>}
            </div>

            <div style={styles.formGroup} id="cotizacion-create-field-cubrimiento">
              <label style={styles.formLabel}>Cubrimiento *</label>
              <div style={styles.pickBtnGrid}>
                {CUBRIMIENTO_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    style={{ ...styles.pickBtn, ...(form.cubrimientoId === opt.id ? styles.pickBtnActive : {}), ...(error?.field === 'cubrimiento' ? styles.inputError : {}) }}
                    onClick={() => {
                      const autoResponsable = opt.id === CUBRIMIENTO_HOSPITALES_ID && form.hospitalId
                        ? { responsableEconomicoId: form.hospitalId, responsableEconomicoLabel: form.hospitalLabel }
                        : { responsableEconomicoId: '', responsableEconomicoLabel: '' };
                      setForm({ ...form, cubrimientoId: opt.id, empresaId: '', empresaLabel: '', ...autoResponsable });
                      setError(null);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {error?.field === 'cubrimiento' && <span style={styles.errorText}>{error.message}</span>}
            </div>

            {form.cubrimientoId && (
              <TerceroButtonList
                label="Empresa"
                required
                clasificacion="EMPRESA"
                id="cotizacion-create-field-empresa"
                error={error?.field === 'empresa'}
                valueId={form.empresaId}
                onSelect={(id, label) => { setForm({ ...form, empresaId: id, empresaLabel: label }); setError(null); }}
              />
            )}
            {error?.field === 'empresa' && <span style={styles.errorText}>{error.message}</span>}

            <TerceroPicker
              label="Responsable Económico"
              required
              id="cotizacion-create-field-responsable"
              error={error?.field === 'responsable'}
              clasificacion={CUBRIMIENTO_TO_CLASIFICACION[form.cubrimientoId]}
              disabled={!form.cubrimientoId}
              disabledHint="Selecciona primero el cubrimiento"
              valueId={form.responsableEconomicoId}
              valueLabel={form.responsableEconomicoLabel}
              onSelect={(id, label) => { setForm({ ...form, responsableEconomicoId: id, responsableEconomicoLabel: label }); setError(null); }}
            />
            {error?.field === 'responsable' && <span style={styles.errorText}>{error.message}</span>}

            <div style={styles.formGroup} id="cotizacion-create-field-numProveedor">
              <label style={styles.formLabel}>N° Proveedor{form.cubrimientoId === CUBRIMIENTO_HOSPITALES_ID ? ' *' : ''}</label>
              <input style={{ ...styles.formInput, ...(error?.field === 'numProveedor' ? styles.inputError : {}) }} value={form.numProveedor} onChange={e => { setForm({ ...form, numProveedor: sanitizeCirugiaDirigido(e.target.value) }); setError(null); }} />
              {error?.field === 'numProveedor' && <span style={styles.errorText}>{error.message}</span>}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Tarifa</label>
              <span style={{ ...styles.formInput, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>
                {tarifaLabel || 'Selecciona hospital/responsable económico y cubrimiento'}
              </span>
            </div>

            <div style={styles.formGroup} id="cotizacion-create-field-tiempoEntrega">
              <label style={styles.formLabel}>Tiempo de Entrega{form.cubrimientoId === CUBRIMIENTO_HOSPITALES_ID ? ' *' : ''}</label>
              <input style={{ ...styles.formInput, ...(error?.field === 'tiempoEntrega' ? styles.inputError : {}) }} value={form.tiempoEntrega} onChange={e => { setForm({ ...form, tiempoEntrega: sanitizeCirugiaDirigido(e.target.value) }); setError(null); }} />
              {error?.field === 'tiempoEntrega' && <span style={styles.errorText}>{error.message}</span>}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Observaciones</label>
              <input style={styles.formInput} value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} />
            </div>

            <ListPicker label="Paquete" options={paquetes} valueId={form.paqueteId} valueLabel={form.paqueteLabel} onSelect={(id, label) => setForm({ ...form, paqueteId: id, paqueteLabel: label })} />

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Nivel</label>
              <div style={styles.pickBtnGrid}>
                {NIVEL_OPTIONS.map(n => (
                  <button
                    key={n}
                    type="button"
                    style={{ ...styles.pickBtn, ...(form.nivel === n ? styles.pickBtnActive : {}) }}
                    onClick={() => setForm({ ...form, nivel: form.nivel === n ? '' : n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Subtotal</label>
              <input
                style={{ ...styles.formInput, color: '#6b6b60', backgroundColor: '#f4f4ee', cursor: 'not-allowed' }}
                value={formatMoney(0)}
                disabled
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>¿Tiene Dcto? *</label>
              <div style={styles.pickBtnGrid}>
                <button type="button" style={{ ...styles.pickBtn, ...(!form.tieneDcto ? styles.pickBtnActive : {}) }} onClick={() => setForm({ ...form, tieneDcto: false })}>No</button>
                <button type="button" style={{ ...styles.pickBtn, ...(form.tieneDcto ? styles.pickBtnActive : {}) }} onClick={() => setForm({ ...form, tieneDcto: true })}>Sí</button>
              </div>
            </div>

            {form.tieneDcto && (
              <>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>% Dto</label>
                  <input type="number" step="0.01" style={styles.formInput} value={form.porcentajeDcto} onChange={e => setForm({ ...form, porcentajeDcto: e.target.value })} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>V/R Dcto</label>
                  <input
                    style={{ ...styles.formInput, color: '#6b6b60', backgroundColor: '#f4f4ee', cursor: 'not-allowed' }}
                    value={formatMoney(vrDcto)}
                    disabled
                  />
                </div>
              </>
            )}

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Total antes de Impuestos</label>
              <input
                style={{ ...styles.formInput, color: '#6b6b60', backgroundColor: '#f4f4ee', cursor: 'not-allowed' }}
                value={formatMoney(totalAntesImpuestos)}
                disabled
              />
            </div>

            <div style={styles.formGroup} id="cotizacion-create-field-impuestos">
              <label style={styles.formLabel}>Impuestos *</label>
              <div style={styles.pickBtnGrid}>
                {IMPUESTOS_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    style={{ ...styles.pickBtn, ...(form.impuestos === opt ? styles.pickBtnActive : {}), ...(error?.field === 'impuestos' ? styles.inputError : {}) }}
                    onClick={() => { setForm({ ...form, impuestos: opt }); setError(null); }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {error?.field === 'impuestos' && <span style={styles.errorText}>{error.message}</span>}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>I.V.A.</label>
              <input
                style={{ ...styles.formInput, color: '#6b6b60', backgroundColor: '#f4f4ee', cursor: 'not-allowed' }}
                value={formatMoney(iva)}
                disabled
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Retención</label>
              <input
                style={{ ...styles.formInput, color: '#6b6b60', backgroundColor: '#f4f4ee', cursor: 'not-allowed' }}
                value={formatMoney(retencion)}
                disabled
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Total</label>
              <input
                style={{ ...styles.formInput, color: '#16170f', fontWeight: 700, backgroundColor: '#f4f4ee', cursor: 'not-allowed' }}
                value={formatMoney(total)}
                disabled
              />
            </div>

            <div style={styles.formActions}>
              <button style={styles.cancelBtn} onClick={onClose}>Cancelar</button>
              <button style={styles.saveBtn} onClick={handleGuardar} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetalleModal({ id, onClose, onNotify, onDeleted }: { id: string; onClose: () => void; onNotify: (message: string) => void; onDeleted: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CotizacionItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useQuery<CotizacionDetail>({
    queryKey: ['cotizacion', id],
    queryFn: () => cotizacionesService.getById(id),
  });

  useEffect(() => {
    if (!showMoreMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showMoreMenu]);

  const handleGenerarPdf = async () => {
    if (!data) return;
    setGeneratingPdf(true);
    try {
      await generarPdfCotizacion(data);
    } catch (err) {
      alert('No se pudo generar el PDF. Intenta de nuevo.');
      console.error(err);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleEnviarWhatsapp = async () => {
    if (!data) return;
    setSendingWhatsapp(true);
    try {
      await enviarCotizacionPorWhatsapp(data);
    } catch (err) {
      alert('No se pudo enviar por WhatsApp. Intenta de nuevo.');
      console.error(err);
    } finally {
      setSendingWhatsapp(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: () => cotizacionesService.deleteCotizacion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
      onDeleted();
      onClose();
    },
  });

  return (
    <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={onClose}>
      <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{data?.numCotizacion || data?.id || ''}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {data && !editing && !confirmDelete && (
              <div style={{ position: 'relative' as const }} ref={moreMenuRef}>
                <button
                  className="btn-press"
                  style={styles.iconMenuBtn}
                  onClick={() => setShowMoreMenu(o => !o)}
                >
                  <MoreHorizontal size={20} />
                </button>
                {showMoreMenu && (
                  <div style={styles.moreMenu}>
                    <button
                      style={styles.moreMenuItem}
                      onClick={() => { setShowMoreMenu(false); setEditing(true); }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f4f4ee'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <Pencil size={15} />
                      Editar
                    </button>
                    <div style={styles.moreMenuDivider} />
                    <button
                      style={{ ...styles.moreMenuItem, ...styles.moreMenuItemDanger }}
                      onClick={() => { setShowMoreMenu(false); setConfirmDelete(true); }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fdf0ec'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <Trash2 size={15} />
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            )}
            <button style={styles.closeBtn} onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>
        <div style={styles.modalBody}>
          {isLoading || !data ? (
            <div style={{ textAlign: 'center' as const, padding: '2rem', color: '#9ca3af' }}>Cargando...</div>
          ) : confirmDelete ? (
            <div style={styles.confirmBox}>
              <span style={{ fontWeight: 600, color: '#16170f' }}>¿Eliminar esta cotización? Esta acción no se puede deshacer.</span>
              <div style={styles.formActions}>
                <button style={styles.cancelBtn} onClick={() => setConfirmDelete(false)}>Cancelar</button>
                <button style={styles.deleteBtn} onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                  {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          ) : editing ? (
            <EditCotizacionForm
              cotizacion={data}
              onCancel={() => setEditing(false)}
              onSaved={msg => { setEditing(false); onNotify(msg); }}
            />
          ) : (
            <>
              <div style={styles.detalleGrid}>
                <DetalleItem label="N° Cotización">{data.numCotizacion || data.id}</DetalleItem>
                <DetalleItem label="Registrado Por">{data.usuario ?? '-'}</DetalleItem>
                <DetalleItem label="Marca de Tiempo">{formatDateTime(data.marcaDeTiempo)}</DetalleItem>
                <DetalleItem label="Fecha">{formatDate(data.fecha)}</DetalleItem>
                <DetalleItem label="Dirigido a">{data.dirigidoA ?? '-'}</DetalleItem>
                <DetalleItem label="Médico">{data.medico ?? '-'}</DetalleItem>
                <DetalleItem label="Hospital">{data.hospital ?? '-'}</DetalleItem>
                <DetalleItem label="Cirugía">{data.cirugia ?? '-'}</DetalleItem>
                <DetalleItem label="Cubrimiento">{data.cubrimiento ?? '-'}</DetalleItem>
                <DetalleItem label="Responsable Económico">{data.responsableEconomico ?? '-'}</DetalleItem>
                <DetalleItem label="N° Proveedor">{data.numProveedor ?? '-'}</DetalleItem>
                <DetalleItem label="Tarifa">{data.tarifa ?? '-'}</DetalleItem>
                <DetalleItem label="Tiempo de Entrega">{data.tiempoEntrega ?? '-'}</DetalleItem>
                <DetalleItem label="¿Tiene Dcto?">{data.tieneDcto ? 'Sí' : 'No'}</DetalleItem>
                {data.tieneDcto && (
                  <>
                    <DetalleItem label="% Dto">{data.porcentajeDcto !== null ? `${data.porcentajeDcto}%` : '-'}</DetalleItem>
                    <DetalleItem label="V/R Dcto">{formatMoney(data.vrDcto)}</DetalleItem>
                    <DetalleItem label="V/R Dcto $">{formatMoney(data.vrDctoPesos)}</DetalleItem>
                  </>
                )}
                <DetalleItem label="Impuestos">{data.impuestos ?? '-'}</DetalleItem>
                <DetalleItem label="Empresa">{data.empresa ?? '-'}</DetalleItem>
                <DetalleItem label="Sede">{data.sede ?? '-'}</DetalleItem>
                <DetalleItem label="Paquete">{data.paquete ?? '-'}</DetalleItem>
                <DetalleItem label="Observaciones">{data.observaciones ?? '-'}</DetalleItem>
                <DetalleItem label="Nota">{data.nota ?? '-'}</DetalleItem>
              </div>

              <div style={styles.sectionDivider} />

              <div style={styles.sectionHeader}>
                <span style={styles.sectionTitle}>Items</span>
                <span style={styles.countBadge}>{data.items.length}</span>
                {!showAddItem && (
                  <button className="btn-press header-btn-primary" style={{ ...styles.pillBtnPrimary, marginLeft: 'auto' }} onClick={() => setShowAddItem(true)}>
                    <Plus size={14} /> Agregar
                  </button>
                )}
              </div>

              {showAddItem && (
                <AddItemForm cotizacionId={data.id} onDone={() => setShowAddItem(false)} onSaved={() => onNotify('Ítem agregado')} />
              )}

              {data.items.length === 0 ? (
                <div style={styles.emptySection}>No hay ítems</div>
              ) : (
                <div style={styles.itemsTableWrap}>
                  <table style={styles.itemsTable}>
                    <thead>
                      <tr>
                        {['Cantidad', 'Sistema', 'Referencia', 'Descripción', 'Valor Unitario', 'Valor', 'Observaciones'].map((h, i) => (
                          <th key={i} style={styles.itemsTh}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map(it => (
                        <tr
                          key={it.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelectedItem(it)}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <td style={styles.itemsTd}>{it.cantidad ?? '-'}</td>
                          <td style={{ ...styles.itemsTd, color: '#6b6b60' }}>{it.sistema ?? '-'}</td>
                          <td style={{ ...styles.itemsTd, fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.78rem', color: '#6b8c1f' }}>{it.referencia ?? '-'}</td>
                          <td style={styles.itemsTd}>{it.descripcion ?? '-'}</td>
                          <td style={{ ...styles.itemsTd, textAlign: 'right' as const }}>{formatMoney(it.valorUnitario)}</td>
                          <td style={{ ...styles.itemsTd, textAlign: 'right' as const, fontWeight: 700 }}>{formatMoney(it.valor)}</td>
                          <td style={{ ...styles.itemsTd, color: '#6b6b60' }}>{it.observaciones ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={styles.sectionDivider} />

              <div style={styles.sectionHeader}>
                <span style={styles.sectionTitle}>Remisión Asociada</span>
                <span style={styles.countBadge}>{data.remisionesAsociadas.length}</span>
              </div>

              {data.remisionesAsociadas.length === 0 ? (
                <div style={styles.emptySection}>No hay artículos</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' }}>
                  {data.remisionesAsociadas.map(r => (
                    <div
                      key={r.id}
                      style={styles.remisionRow}
                      onClick={() => navigate(`/operacion/remisiones/${r.id}`)}
                    >
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.8rem', fontWeight: 700, color: '#6b8c1f' }}>
                        {r.numRemision || r.id}
                      </span>
                      <span style={{ color: '#6b6b60', fontSize: '0.85rem' }}>{r.estado ?? '-'}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.5rem' }}>
                <button className="btn-press header-btn-secondary" style={styles.pillBtn} onClick={handleEnviarWhatsapp} disabled={sendingWhatsapp}>
                  <i className="fa-brands fa-whatsapp" style={{ fontSize: 16, color: '#4d7a13' }} />
                  {sendingWhatsapp ? 'Enviando...' : 'Enviar por WhatsApp'}
                </button>
                <button className="btn-press header-btn-primary" style={styles.pillBtnPrimary} onClick={handleGenerarPdf} disabled={generatingPdf}>
                  <FileDown size={16} /> {generatingPdf ? 'Generando...' : 'Generar PDF'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {selectedItem && data && (
        <ItemDetailModal
          item={selectedItem}
          cotizacionId={data.id}
          onClose={() => setSelectedItem(null)}
          onSaved={() => onNotify('Ítem actualizado')}
          onDeleted={() => onNotify('Ítem eliminado')}
        />
      )}
    </div>
  );
}

export default function CotizacionesPage() {
  const { isMobile } = useResponsiveStyles();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(tableWrapRef, [], 3);

  useEffect(() => {
    document.body.style.overflow = (showCreateModal || selectedId) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showCreateModal, selectedId]);

  // Le da sombra a la tarjeta fija (título + toolbar) solo mientras está "pegada" arriba por el
  // scroll — mismo patrón que Remisiones / Solicitud de Programación.
  const [isStuck, setIsStuck] = useState(false);
  useEffect(() => {
    const handleScroll = () => setIsStuck(window.scrollY > 4);
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Deep-link desde el buscador global (/operacion/cotizaciones?id=...): abre el modal de
  // detalle directo al llegar, sin depender de que esa cotización esté en la página cargada.
  // Reacciona a cambios en searchParams (no solo al montar): si el usuario ya estaba en esta
  // página, React Router no la vuelve a montar al navegar a la misma ruta con otro query.
  useEffect(() => {
    const idFromUrl = searchParams.get('id');
    if (idFromUrl) {
      setSelectedId(idFromUrl);
      setSearchParams(params => { params.delete('id'); return params; }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const query = { page, limit: 300, search: search || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined };

  const { data, isLoading } = useQuery({
    queryKey: ['cotizaciones', query],
    queryFn: () => cotizacionesService.findAll(query),
    placeholderData: keepPreviousData,
  });

  const items = data?.data ?? [];

  return (
    <Layout>
      <div style={styles.pageWrapper}>
        <button
          type="button"
          onClick={() => navigate('/operacion')}
          style={styles.backLink}
          onMouseEnter={e => { e.currentTarget.style.color = '#4d7a13'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6b7280'; }}
        >
          <MaterialIcon name="arrow_back" size={16} />
          Volver
        </button>

        <div style={{ ...styles.contentCard, ...(isStuck ? styles.contentCardStuck : {}) }}>
          <div style={styles.header}>
            <h1 style={styles.title}>Cotizaciones</h1>
          </div>

          <div style={styles.toolbar}>
            <div style={styles.searchWrap}>
              <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                style={styles.searchInput}
                placeholder="Buscar por N° cotización, hospital, médico, usuario..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>

            <DateRangeFilter
              dateFrom={dateFrom}
              dateTo={dateTo}
              onChange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1); }}
            />

            <button className="btn-press header-btn-primary" style={styles.pillBtnPrimary} onClick={() => setShowCreateModal(true)}>
              <Plus size={16} />
              Nueva Cotización
            </button>

            <span style={styles.totalLabel}>{isLoading ? '...' : `${data?.total ?? 0} registros`}</span>
          </div>
        </div>

        <div ref={tableWrapRef} style={styles.tableWrap}>
          {isLoading && items.length === 0 ? (
            <div style={styles.empty}>Cargando...</div>
          ) : items.length === 0 ? (
            <div style={styles.empty}>Sin registros</div>
          ) : isMobile ? (
            <div style={styles.mobileCardList}>
              {items.map(item => (
                <CotizacionCard key={item.id} item={item} onSelect={setSelectedId} />
              ))}
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr style={styles.thead}>
                  {['#', 'N° Cotización', 'Fecha', 'Usuario', 'Hospital', 'Médico', 'Cirugía', 'Sede'].map((h, i) => (
                    <th key={i} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <CotizacionRow key={item.id} item={item} index={(page - 1) * 300 + index} onSelect={setSelectedId} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {data && data.totalPages > 1 && (
          <div style={styles.pagination}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ ...styles.pageBtn, ...(page === 1 ? styles.pageBtnDisabled : {}) }}
            >
              <MaterialIcon name="chevron_left" size={16} /> Anterior
            </button>
            <span style={styles.pageLabel}>Página {page} de {data.totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              style={{ ...styles.pageBtn, ...(page === data.totalPages ? styles.pageBtnDisabled : {}) }}
            >
              Siguiente <MaterialIcon name="chevron_right" size={16} />
            </button>
          </div>
        )}
      </div>

      {selectedId && (
        <DetalleModal
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onNotify={msg => setToastMessage(msg)}
          onDeleted={() => setToastMessage('Cotización eliminada')}
        />
      )}
      {showCreateModal && (
        <NuevaCotizacionModal
          onClose={() => setShowCreateModal(false)}
          onCreated={msg => { setShowCreateModal(false); setToastMessage(msg); }}
        />
      )}
      <SuccessToast show={!!toastMessage} message={toastMessage ?? ''} onClose={() => setToastMessage(null)} />
    </Layout>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: { padding: '0.05rem 1.5rem 1.5rem' },
  backLink: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.75rem', padding: '0.25rem 0.1rem', border: 'none', background: 'transparent', color: '#6b7280', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const, transition: 'color 0.15s ease' },
  contentCard: { backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '16px', padding: '1.25rem', marginBottom: '1.5rem', position: 'sticky' as const, top: '60px', zIndex: 10, boxShadow: '0 0 0 rgba(0,0,0,0)', transition: 'box-shadow 0.2s ease, border-color 0.2s ease' },
  contentCardStuck: { boxShadow: '0 8px 20px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' },
  header: { marginBottom: '1.25rem' },
  title: { fontSize: '1.4rem', fontWeight: 700, color: '#333', margin: 0 },
  toolbar: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' as const },
  searchWrap: { position: 'relative' as const, flex: 1, minWidth: '280px' },
  searchInput: { width: '100%', padding: '0.6rem 0.75rem 0.6rem 2.25rem', border: 'none', backgroundColor: '#f5f5f0', borderRadius: '10px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const, color: '#374151' },
  totalLabel: { fontSize: '0.8rem', color: '#9ca3af', whiteSpace: 'nowrap' as const, marginLeft: 'auto' },
  tableWrap: { backgroundColor: '#fff', borderRadius: '16px', overflowX: 'auto' as const, overflowY: 'auto' as const, maxHeight: 'calc(100vh - 260px)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #eeeee6' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.84375rem' },
  thead: { backgroundColor: '#f9fafb' },
  th: { padding: '0.7rem 0.875rem', textAlign: 'left' as const, fontWeight: 500, color: '#9ca3af', fontSize: '0.68rem', textTransform: 'uppercase' as const, letterSpacing: '0.04em', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' as const, position: 'sticky' as const, top: 0, backgroundColor: '#f9fafb', zIndex: 1 },
  td: { padding: '0.65rem 0.875rem', borderBottom: '1px solid #f3f4f0', verticalAlign: 'middle' as const, color: '#33342a' },
  tr: { backgroundColor: '#fff', cursor: 'pointer', transition: 'background-color 0.15s ease' },
  idCode: { fontSize: '0.84375rem', fontWeight: 600, color: '#4d7a13' },
  mobileCardList: { display: 'flex', flexDirection: 'column' as const, gap: '0.75rem', padding: '0.75rem' },
  mobileCard: { backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '12px', padding: '0.85rem', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  mobileCardTopRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' },
  mobileCardId: { fontSize: '0.8rem', fontWeight: 700, color: '#4d7a13' },
  mobileCardDate: { fontSize: '0.75rem', color: '#9ca3af' },
  mobileCardMainRow: { display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.7rem' },
  mobileCardTitle: { fontSize: '0.9rem', fontWeight: 700, color: '#16170f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  mobileCardSubtext: { fontSize: '0.78rem', color: '#6b7280', marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  mobileCardFieldsRow: { display: 'flex', gap: '1.25rem', paddingTop: '0.6rem', borderTop: '1px solid #f3f4f0' },
  mobileCardField: { display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', minWidth: 0 },
  mobileCardFieldLabel: { fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  mobileCardFieldValue: { fontSize: '0.82rem', fontWeight: 600, color: '#374151' },
  empty: { textAlign: 'center' as const, padding: '3rem', color: '#9ca3af' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' },
  pageLabel: { fontSize: '0.875rem', fontWeight: 600, color: '#33342a' },
  pageBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.5rem 1rem', backgroundColor: '#e9f2d8', color: '#3f6510', border: '1px solid #dbe8c2', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '0.84375rem' },
  pageBtnDisabled: { backgroundColor: '#f4f4ee', borderColor: '#eeeee6', color: '#c7c7ba', cursor: 'not-allowed' as const },
  modalOverlay: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '2rem' },
  modalContent: { backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #eeeee6', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', position: 'sticky' as const, top: 0, zIndex: 1 },
  modalTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#16170f', margin: 0 },
  closeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: 'none', backgroundColor: '#f4f4ee', borderRadius: '8px', cursor: 'pointer', color: '#6b6b60' },
  iconMenuBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: '1px solid #e5e7eb', borderRadius: '999px', cursor: 'pointer', color: '#33342a', flexShrink: 0, backgroundColor: 'transparent' },
  moreMenu: { position: 'absolute' as const, top: 'calc(100% + 8px)', right: 0, backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: '180px', overflow: 'hidden', zIndex: 200, padding: '0.35rem' },
  moreMenuItem: { display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.6rem 0.75rem', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.84375rem', color: '#33342a', fontWeight: 600, textAlign: 'left' as const },
  moreMenuItemDanger: { color: '#c65b3f' },
  moreMenuDivider: { height: '1px', backgroundColor: '#eeeee6', margin: '0.3rem 0' },
  modalBody: { padding: '1.5rem' },
  detalleGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '1.25rem 1.5rem' },
  detalleItem: { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem', minWidth: 0 },
  detalleLabel: { fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  detalleValue: { fontSize: '0.9375rem', fontWeight: 400, color: '#16170f', lineHeight: 1.4, wordBreak: 'break-word' as const },
  sectionDivider: { height: '1px', backgroundColor: '#eeeee6', margin: '1.5rem 0' },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' },
  sectionTitle: { fontSize: '0.95rem', fontWeight: 700, color: '#16170f' },
  countBadge: { backgroundColor: '#e5e7eb', color: '#6b7280', fontSize: '0.72rem', fontWeight: 700, minWidth: '1.4rem', height: '1.4rem', padding: '0 0.4rem', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  emptySection: { textAlign: 'center' as const, padding: '1.5rem', color: '#9ca3af', fontSize: '0.85rem', backgroundColor: '#f9fafb', borderRadius: '10px' },
  itemsTableWrap: { overflowX: 'auto' as const, borderRadius: '10px', border: '1px solid #eeeee6' },
  itemsTable: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.82rem' },
  itemsTh: { padding: '0.55rem 0.75rem', textAlign: 'left' as const, fontWeight: 500, color: '#9ca3af', fontSize: '0.65rem', textTransform: 'uppercase' as const, letterSpacing: '0.04em', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' as const },
  itemsTd: { padding: '0.55rem 0.75rem', borderBottom: '1px solid #f3f4f0', color: '#33342a' },
  remisionRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.9rem', backgroundColor: '#f9fafb', border: '1px solid #eeeee6', borderRadius: '10px', cursor: 'pointer' },
  addItemForm: { display: 'flex', flexDirection: 'column' as const, gap: '0.9rem', backgroundColor: '#f9fafb', border: '1px solid #eeeee6', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' },
  formGroup: { display: 'flex', flexDirection: 'column' as const, gap: '0.4rem' },
  formRow3: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' },
  formColStack: { display: 'flex', flexDirection: 'column' as const, gap: '0.9rem' },
  formLabel: { fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  formInput: { padding: '0.75rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', backgroundColor: '#fff' },
  medicoTag: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderRadius: '999px', backgroundColor: '#f3f4f6', color: '#333', fontSize: '0.8rem', fontWeight: 600, width: 'fit-content' as const },
  medicoDropdown: { position: 'absolute' as const, top: 'calc(100% + 0.35rem)', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto' as const, zIndex: 20 },
  medicoDropdownItem: { padding: '0.6rem 0.75rem', fontSize: '0.85rem', fontWeight: 600, color: '#333', cursor: 'pointer' },
  errorText: { fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 },
  inputError: { borderColor: '#dc2626' },
  formActions: { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' },
  cancelBtn: { padding: '0.5rem 1.5rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: '#333' },
  saveBtn: { padding: '0.5rem 1.5rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
  saveBtnDisabled: { backgroundColor: '#e5e7eb', color: '#9ca3af', cursor: 'not-allowed' as const },
  deleteBtn: { padding: '0.5rem 1.5rem', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
  iconBtnDanger: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', borderRadius: '8px', cursor: 'pointer', color: '#dc2626' },
  iconBtnEdit: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0 0.75rem', height: '34px', border: 'none', backgroundColor: '#6b8c1f', borderRadius: '8px', cursor: 'pointer', color: '#fff', fontWeight: 600, fontSize: '0.82rem' },
  confirmBox: { display: 'flex', flexDirection: 'column' as const, gap: '1rem', padding: '1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px' },
  pickBtnGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' },
  pickBtn: { padding: '0.5rem 0.9rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', color: '#374151', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', outline: 'none' },
  pickBtnActive: { backgroundColor: '#6b8c1f', borderColor: '#6b8c1f', color: '#fff' },
  // Mismo formato de "pill" que los botones de acción del header en ProgramacionDetailPage/RemisionDetailPage
  // (clases .header-btn-secondary / .header-btn-primary / .header-btn-danger en index.css aportan el fondo y el hover).
  pillBtn: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #e5e7eb', borderRadius: '12px', color: '#33342a', fontWeight: 600, fontSize: '0.84375rem', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  pillBtnPrimary: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #dbe8c2', borderRadius: '12px', color: '#3f6510', fontWeight: 600, fontSize: '0.84375rem', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  pillBtnDanger: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #fecaca', borderRadius: '12px', color: '#dc2626', fontWeight: 600, fontSize: '0.84375rem', cursor: 'pointer', whiteSpace: 'nowrap' as const },
};
