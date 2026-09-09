import { useState, useEffect, useRef, memo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigateWithLoading } from '../../../hooks/useNavigateWithLoading';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Search, X, Plus, Trash2, Pencil, FileDown, MoreHorizontal, Check } from 'lucide-react';
// jsPDF (+ jspdf-autotable, html2canvas, dompurify) pesa ~380kB/124kB gzip — es más de lo que
// pesa toda esta página. Se carga con import() dinámico dentro de buildCotizacionPdf, solo
// cuando el usuario realmente pide un PDF, en vez de venir incluido desde que se abre Cotizaciones.
import type jsPDF from 'jspdf';
import fondoCotizacionUrl from '../../../assets/cotización.png';
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
  type PaqueteConsumoOption,
  type SedeOption,
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

// Sede por defecto al agregar/editar una cotización: la del perfil del usuario logueado (puede
// cambiarse a otra sede desde el formulario).
const getUsuarioActualSedeId = (): string => {
  try {
    const usuario = JSON.parse(localStorage.getItem('usuario') ?? '{}');
    return usuario?.sedeId ?? '';
  } catch {
    return '';
  }
};
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
// Letras (con acentos), números, un solo espacio entre palabras y puntuación básica. Se excluyen
// saltos de línea/tabs del set permitido (solo se permite el espacio ' ') y se recorta cualquier
// espacio inicial, para que no se pueda dejar un campo "vacío" a base de solo espacios.
const sanitizeCirugiaDirigido = (value: string): string =>
  value.replace(/[^A-Za-z0-9À-ÿ .,'-]/g, '').replace(/^ +/, '');

/** Solo dígitos y un único punto decimal — para Cantidad y Valor Unitario. */
const sanitizeNumeric = (value: string): string => {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const [entero, ...resto] = cleaned.split('.');
  return resto.length > 0 ? `${entero}.${resto.join('')}` : entero;
};

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

function computeTotalesFromSubtotal(subtotal: number, tieneDcto: boolean, porcentajeDcto: unknown, impuestos: string | null) {
  const vrDcto = tieneDcto ? subtotal * (Number(porcentajeDcto) || 0) / 100 : 0;
  const totalAntesImpuestos = subtotal - vrDcto;
  const iva = (impuestos === 'Iva' || impuestos === 'Todos') ? totalAntesImpuestos * 0.16 : 0;
  const retencion = (impuestos === 'Retención' || impuestos === 'Todos') ? totalAntesImpuestos * 0.106667 : 0;
  const total = totalAntesImpuestos + iva - retencion;
  return { subtotal, vrDcto, totalAntesImpuestos, iva, retencion, total };
}

function computeTotales(items: CotizacionItem[], tieneDcto: boolean, porcentajeDcto: unknown, impuestos: string | null) {
  const subtotal = items.reduce((sum, it) => sum + (Number(it.valor) || 0), 0);
  return computeTotalesFromSubtotal(subtotal, tieneDcto, porcentajeDcto, impuestos);
}

const EMPRESA_INFO = {
  nombre: 'Tecnología Spine S. de R.L de C.V.',
  rfc: 'TSP191206KT8',
  celular: '999 386 7505',
  telefono: '999 666 3454',
  email: 'administracion@tecnologiaspine.com',
};

// Colores tomados directamente del logo de Tecnología Spine (muestreados pixel a pixel del PNG:
// carbón de "Tecnología" = rgb(37,38,36), verde de "Spine" = rgb(106,124,9) — son los dos colores
// dominantes reales del archivo, no una estimación visual). PDF_OLIVE_BORDER es el mismo verde
// claro ya usado como acento en la UI de este módulo (#dbe8c2).
const PDF_DARK: [number, number, number] = [37, 38, 36];
const PDF_OLIVE: [number, number, number] = [106, 124, 9];
const PDF_OLIVE_BORDER: [number, number, number] = [219, 232, 194];
const PDF_GRAY_TEXT: [number, number, number] = [95, 95, 88];
const PDF_WHITE: [number, number, number] = [255, 255, 255];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = url;
  });
}

// Ícono de celular: contorno de teléfono redondeado + botón (círculo relleno) en la base.
// y es la línea base del texto que acompaña al ícono; el ícono se centra verticalmente contra ella.
function drawPhoneIcon(doc: AutoTableDoc, x: number, y: number, color: [number, number, number]) {
  const h = 3.6;
  const w = h * 0.55;
  const top = y - h + 0.8;
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, top, w, h, w * 0.25, w * 0.25, 'S');
  doc.setFillColor(...color);
  doc.circle(x + w / 2, top + h - w * 0.32, w * 0.16, 'F');
}

// Ícono de correo: sobre (rectángulo) con la solapa en "V".
function drawEmailIcon(doc: AutoTableDoc, x: number, y: number, color: [number, number, number]) {
  const h = 2.6;
  const w = h * 1.4;
  const top = y - h + 0.7;
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  doc.rect(x, top, w, h, 'S');
  doc.line(x, top, x + w / 2, top + h * 0.62);
  doc.line(x + w / 2, top + h * 0.62, x + w, top);
}

// Dibuja "Etiqueta: valor" (etiqueta en negrita) con ajuste de línea; devuelve el Y final.
// dryRun=true solo mide (para calcular el alto de la caja antes de rellenarla).
function drawField(doc: AutoTableDoc, label: string, value: string, x: number, maxWidth: number, y: number, dryRun = false): number {
  const lineHeight = 3.6;
  const labelText = `${label}: `;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const labelWidth = doc.getTextWidth(labelText);
  doc.setFont('helvetica', 'normal');
  const lines: string[] = doc.splitTextToSize(value || '-', Math.max(maxWidth - labelWidth, 20));

  if (!dryRun) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PDF_DARK);
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

async function buildCotizacionPdf(data: CotizacionDetail): Promise<AutoTableDoc> {
  const { subtotal, vrDcto, iva, retencion, total } = computeTotales(data.items, data.tieneDcto, data.porcentajeDcto, data.impuestos);

  const [{ default: JsPDF }] = await Promise.all([
    import('jspdf'),
    // Import solo por su efecto secundario: registra doc.autoTable(...) en el prototipo de jsPDF
    // (el default export del paquete no interopera bien con el bundling de Vite).
    import('jspdf-autotable'),
  ]);
  const doc = new JsPDF({ unit: 'mm', format: 'letter' }) as AutoTableDoc;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const rightX = pageWidth - marginX;

  // Membrete: imagen de fondo diseñada en Canva (logo + ola de colores del logo ya "horneados"
  // en la imagen), a página completa. Se vuelve a dibujar en cada página nueva (ver drawFondo más
  // abajo), tanto si la agrega automáticamente la tabla de consumos como si se agrega a mano antes
  // de Nota/Totales/Firma — antes esas páginas nuevas quedaban en blanco, sin membrete.
  const HEADER_SAFE_Y = 48;
  // La ola decorativa del membrete arranca ~82% de la altura de la imagen (medido pixel a pixel
  // con pngjs sobre el PNG real) — nada de contenido debe dibujarse por debajo de esta línea o
  // queda encimado con la ola.
  const FOOTER_SAFE_Y = pageHeight * 0.82;
  // HEADER_SAFE_Y (48) es seguro para la página 1, donde ahí mismo empieza el nombre de la empresa
  // (texto chico, tolera pisar el desvanecido de la curva). Pero en una página 2+, donde lo primero
  // que se dibuja es un bloque sólido (cabecera verde de la tabla, o el título "Nota:"), esa curva
  // superior del membrete sigue activa a esa altura y se nota el encime — recién se despeja del
  // todo ~27% de la altura de la página (medido igual que FOOTER_SAFE_Y).
  const CONTINUATION_TOP_Y = pageHeight * 0.27;
  let fondoImg: HTMLImageElement | null = null;
  try {
    fondoImg = await loadImage(fondoCotizacionUrl);
    doc.addImage(fondoImg, 'PNG', 0, 0, pageWidth, pageHeight);
  } catch {
    // Si el membrete no carga (ej. bloqueado por el navegador), se continúa sin él.
  }
  const drawFondo = () => {
    if (fondoImg) doc.addImage(fondoImg, 'PNG', 0, 0, pageWidth, pageHeight);
  };

  // Identidad de la empresa, inmediatamente debajo del logo. Es texto angosto pegado al margen
  // izquierdo, así que a esa altura no pisa la ola decorativa (que ocupa más el lado derecho) —
  // por eso puede ir en HEADER_SAFE_Y (48) y no necesita bajar hasta CONTINUATION_TOP_Y como la
  // tabla. Se repite igual en cada página nueva (ver willDrawPage y el salto manual más abajo).
  const iconGap = 5;
  const drawCompanyHeader = () => {
    let hy = HEADER_SAFE_Y;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PDF_DARK);
    doc.text(EMPRESA_INFO.nombre, marginX, hy);
    hy += 4.8;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PDF_GRAY_TEXT);
    doc.text(`${EMPRESA_INFO.rfc}`, marginX, hy);
    hy += 4.6;
    doc.text(EMPRESA_INFO.telefono, marginX, hy);
    hy += 4.6;
    doc.text(EMPRESA_INFO.email, marginX, hy);
    return hy;
  };

  let y = drawCompanyHeader() + 12;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(60, 60, 55);
  doc.text('Atendiendo a la cotización solicitada, le proporcionamos la siguiente información:', marginX, y);
  y += 3;
  doc.setDrawColor(...PDF_OLIVE);
  doc.setLineWidth(0.3);
  doc.line(marginX, y, rightX, y);
  y += 6;

  // Dos recuadros lado a lado, en la misma fila: "Información General" y "Otros datos". La
  // cabecera (título) va en una barra verde pegada al cuerpo, como el encabezado de la tabla de
  // consumos; el cuerpo lista los campos alineados a la izquierda (etiqueta en negrita + valor).
  const boxGap = 6;
  const boxWidth = (rightX - marginX - boxGap) / 2;
  const box1X = marginX;
  const box2X = marginX + boxWidth + boxGap;
  const headerH = 5.5;
  const boxInnerPad = 4;
  const fieldGap = 0.8;

  doc.setFillColor(...PDF_OLIVE);
  doc.rect(box1X, y, boxWidth, headerH, 'F');
  doc.rect(box2X, y, boxWidth, headerH, 'F');
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Información General', box1X + boxWidth / 2, y + headerH / 2 + 1.1, { align: 'center' });
  doc.text('Otros datos', box2X + boxWidth / 2, y + headerH / 2 + 1.1, { align: 'center' });
  const bodyStartY = y + headerH;

  const infoGeneralFields: [string, string][] = [
    ['Dirigido a', data.dirigidoA ?? '-'],
    ['Cubrimiento', data.cubrimiento ?? '-'],
    ['Cirugía', data.cirugia ?? '-'],
    ['Fecha', formatDate(data.fecha)],
  ];
  const otrosDatosFields: [string, string][] = [
    ['Hospital', data.hospital ?? '-'],
    ['Doctor', data.medico ?? '-'],
    ['Tiempo de entrega', data.tiempoEntrega ?? '-'],
    ['N° de Proveedor', data.numProveedor ?? '-'],
  ];

  const measureInfoBody = (dryRun: boolean, boxX: number, fields: [string, string][]) => {
    const contentX = boxX + boxInnerPad;
    const contentW = boxWidth - boxInnerPad * 2;
    let rowY = bodyStartY + 4;
    for (const [label, value] of fields) {
      rowY = drawField(doc, label, value, contentX, contentW, rowY, dryRun) + fieldGap;
    }
    return rowY;
  };

  const box1BodyEnd = measureInfoBody(true, box1X, infoGeneralFields) - fieldGap + 2.2;
  const box2BodyEnd = measureInfoBody(true, box2X, otrosDatosFields) - fieldGap + 2.2;
  const bodyEndY = Math.max(box1BodyEnd, box2BodyEnd);

  doc.setFillColor(...PDF_WHITE);
  doc.rect(box1X, bodyStartY, boxWidth, bodyEndY - bodyStartY, 'F');
  doc.rect(box2X, bodyStartY, boxWidth, bodyEndY - bodyStartY, 'F');
  measureInfoBody(false, box1X, infoGeneralFields);
  measureInfoBody(false, box2X, otrosDatosFields);

  doc.setDrawColor(...PDF_OLIVE_BORDER);
  doc.setLineWidth(0.2);
  doc.rect(box1X, y, boxWidth, bodyEndY - y, 'S');
  doc.rect(box2X, y, boxWidth, bodyEndY - y, 'S');

  y = bodyEndY + 8;

  // Tabla de consumos: encabezado sólido en el verde del logo (en vez del carbón anterior), con
  // un borde exterior fino (incluye los laterales) y un filo horizontal entre filas. Todas las
  // filas quedan en blanco (sin cebreado) a pedido.
  // pageTableStartY/pageTableEndY siguen la posición del primer y último renglón de la tabla EN
  // LA PÁGINA ACTUAL (se reasignan en willDrawPage/didDrawPage) — antes se guardaba un solo rect
  // desde el inicio de la tabla hasta el final, lo cual solo servía si la tabla cabía en una sola
  // página; con muchos consumos ahora puede abarcar varias, así que el borde se dibuja por página.
  let pageTableStartY = y;
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
    theme: 'plain',
    headStyles: {
      fillColor: PDF_OLIVE,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9.5,
      cellPadding: { top: 2.2, right: 3, bottom: 2.2, left: 3 },
    },
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 1.5, right: 3, bottom: 1.5, left: 3 },
      textColor: [45, 45, 40],
      fillColor: PDF_WHITE,
      lineColor: PDF_OLIVE_BORDER,
      lineWidth: { bottom: 0.15 },
    },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 26 },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right', fontStyle: 'bold', textColor: PDF_OLIVE },
    },
    // top: dónde arranca la tabla en cada página nueva que se agregue (la primera usa startY, no
    // esto) — usa CONTINUATION_TOP_Y, no HEADER_SAFE_Y, porque acá lo primero que se dibuja es la
    // cabecera sólida de la tabla, que si no se despeja bien de la curva superior del membrete se
    // nota encimada. bottom: reserva el espacio de la ola decorativa de abajo, para que la tabla
    // salte de página en vez de dibujar filas encima de ella.
    margin: { left: marginX, right: marginX, top: CONTINUATION_TOP_Y, bottom: pageHeight - FOOTER_SAFE_Y },
    willDrawPage: (hookData: { pageNumber: number; cursor: { y: number } | null }) => {
      if (hookData.pageNumber > 1) { drawFondo(); drawCompanyHeader(); }
      pageTableStartY = hookData.cursor?.y ?? CONTINUATION_TOP_Y;
    },
    didDrawPage: (hookData: { cursor: { y: number } | null }) => {
      const pageTableEndY = hookData.cursor?.y ?? pageTableStartY;
      doc.setDrawColor(...PDF_OLIVE_BORDER);
      doc.setLineWidth(0.2);
      doc.rect(marginX, pageTableStartY, rightX - marginX, pageTableEndY - pageTableStartY, 'S');
    },
  });

  let afterItemsY = doc.lastAutoTable.finalY + 6;

  const notaWidth = 100;
  const notaText = 'La presente cotización fue elaborada de acuerdo a los productos y/o servicios solicitados por el cliente. Los precios establecidos en el presente son en moneda nacional mexicana y no generan obligación o compromiso por parte del receptor, salvo manifestación expresa.\n\nEstos precios perderán vigencia a partir del 5to día hábil después de la expedición del presente documento, agradecemos su preferencia y estamos a sus órdenes para aclarar cualquier duda.';
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  const notaLines: string[] = doc.splitTextToSize(notaText, notaWidth);
  const notaHeight = notaLines.length * 3.3 + 5;

  const totalsX = marginX + notaWidth + 12;
  const totalsWidth = rightX - totalsX;
  const totalsRows: [string, string][] = [['Subtotal', formatMoney(subtotal)]];
  if (data.tieneDcto && vrDcto > 0) {
    totalsRows.push([`Descuento${data.porcentajeDcto !== null ? ` ${data.porcentajeDcto}%` : ''}`, `-${formatMoney(vrDcto)}`]);
  }
  if (iva > 0) totalsRows.push(['IVA', formatMoney(iva)]);
  if (retencion > 0) totalsRows.push(['Retención', `-${formatMoney(retencion)}`]);
  totalsRows.push(['Total', formatMoney(total)]);

  // Estimación conservadora del alto de la tabla de totales (cellPadding 3+3 arriba/abajo + una
  // línea de texto por fila), para decidir si el bloque completo (Nota + Totales + contacto/firma)
  // cabe antes de la ola del membrete. Si no cabe, se agrega una página nueva (con membrete) y todo
  // el bloque se dibuja ahí — antes este bloque no verificaba espacio y quedaba encimado con la ola.
  const estimatedTotalsHeight = totalsRows.length * 9.7;
  const footerBlockReserve = 18 + 8; // separación antes de la firma + texto "Firma" debajo de la línea
  if (afterItemsY + Math.max(notaHeight, estimatedTotalsHeight) + footerBlockReserve > FOOTER_SAFE_Y) {
    doc.addPage();
    drawFondo();
    drawCompanyHeader();
    afterItemsY = CONTINUATION_TOP_Y;
  }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PDF_DARK);
  doc.text('Nota:', marginX, afterItemsY);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_GRAY_TEXT);
  doc.text(notaLines, marginX, afterItemsY + 5);

  doc.autoTable({
    startY: afterItemsY,
    theme: 'plain',
    body: totalsRows,
    styles: { fontSize: 9, cellPadding: { top: 3, right: 3, bottom: 3, left: 3 }, fillColor: PDF_WHITE, lineColor: PDF_OLIVE_BORDER, lineWidth: { bottom: 0.15 } },
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
        hookData.cell.styles.fontSize = 10;
        hookData.cell.styles.lineWidth = 0;
      }
    },
  });

  // Borde exterior sutil alrededor de la caja de totales (en vez de una cuadrícula pesada por celda)
  doc.setDrawColor(...PDF_OLIVE_BORDER);
  doc.setLineWidth(0.2);
  doc.rect(totalsX, afterItemsY, totalsWidth, doc.lastAutoTable.finalY - afterItemsY, 'S');

  // Sin límite superior artificial: antes se topaba en FOOTER_SAFE_Y - 14, y si la nota o los
  // totales terminaban más abajo que eso (cotizaciones con varios ítems), el contacto y la firma
  // quedaban encimados sobre ese contenido. Ahora siempre se ubican debajo de donde termine lo
  // que esté más abajo (nota o totales), sin importar cuánto crezca la tabla de arriba.
  const afterFooterY = Math.max(afterItemsY + notaHeight, doc.lastAutoTable.finalY) + 18;

  // Contacto (correo + celular) a la izquierda, a la misma altura que la firma a la derecha.
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_GRAY_TEXT);
  drawEmailIcon(doc, marginX, afterFooterY - 6, PDF_OLIVE);
  doc.text(EMPRESA_INFO.email, marginX + iconGap, afterFooterY - 6);
  drawPhoneIcon(doc, marginX, afterFooterY - 1, PDF_OLIVE);
  doc.text(EMPRESA_INFO.celular, marginX + iconGap, afterFooterY - 1);

  doc.setDrawColor(...PDF_DARK);
  doc.setLineWidth(0.2);
  doc.line(rightX - 55, afterFooterY, rightX, afterFooterY);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PDF_DARK);
  doc.text('Firma', rightX - 27.5, afterFooterY + 5, { align: 'center' });

  return doc;
}

function cotizacionPdfFileName(data: CotizacionDetail): string {
  return `Cotizacion-${data.numCotizacion || data.id}.pdf`;
}

async function generarPdfCotizacion(data: CotizacionDetail, forceDownload = false) {
  const doc = await buildCotizacionPdf(data);
  const fileName = cotizacionPdfFileName(data);

  if (forceDownload) {
    // En móvil, doc.save() (un <a download> con blob "application/pdf") suele terminar abriendo
    // el visor de PDF integrado del navegador en vez de descargar — cambiar el tipo del blob a uno
    // genérico, sin visor asociado, hace que el navegador no tenga más opción que descargarlo.
    const blob = doc.output('blob');
    const downloadBlob = new Blob([blob], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(downloadBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  doc.save(fileName);
}

// true si de verdad se compartió/abrió WhatsApp, false si el usuario canceló el cuadro nativo de
// compartir — el llamador usa esto para no mostrar un mensaje de éxito cuando en realidad no pasó
// nada.
async function enviarCotizacionPorWhatsapp(data: CotizacionDetail): Promise<boolean> {
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
        return true;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return false;
        // Si falla por otro motivo, se sigue con el flujo de respaldo abajo.
      }
    }
  }

  // Respaldo: el navegador no soporta adjuntar archivos vía "compartir".
  // Se descarga el PDF y se abre WhatsApp con el mensaje, para que el usuario adjunte el PDF manualmente.
  doc.save(fileName);
  window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank');
  return true;
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
    <td style={{ ...styles.td, paddingRight: '0.3rem' }}>{formatDate(item.fecha)}</td>
    <td style={{ ...styles.td, paddingLeft: '0.3rem' }}>{item.usuario ?? '-'}</td>
    <td style={{ ...styles.td, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.hospital ?? '-'}</td>
    <td style={{ ...styles.td, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.medico ?? '-'}</td>
    <td style={{ ...styles.td, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, color: '#6b6b60' }}>{item.cirugia ?? '-'}</td>
    <td style={styles.td}>{item.sede ?? '-'}</td>
    <td style={{ ...styles.td, fontWeight: 700, color: '#3f6510', whiteSpace: 'nowrap' as const }}>{formatMoney(item.total)}</td>
  </tr>
));

const CotizacionCard = memo(({ item, onSelect }: { item: CotizacionListItem; onSelect: (id: string) => void }) => (
  <div style={styles.mobileCard} onClick={() => onSelect(item.id)}>
    <div style={styles.mobileCardTopRow}>
      <span style={styles.mobileCardId}>{item.numCotizacion || item.id}</span>
      <span style={styles.mobileCardDate}>{formatDate(item.fecha)}</span>
    </div>
    <div style={styles.mobileCardMainRow}>
      <span style={styles.modalTitleIconBadge}>
        <MaterialIcon name="request_quote" size={18} color="#4d7a13" />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={styles.mobileCardTitle}>{item.hospital ?? 'Sin hospital'}</div>
        <div style={styles.mobileCardSubtext}>{item.medico ?? '-'}</div>
      </div>
    </div>
    <div style={styles.mobileCardFieldsRow}>
      <div style={{ ...styles.mobileCardField, flex: 1 }}>
        <span style={styles.mobileCardFieldLabel}>Sede</span>
        <span style={styles.mobileCardFieldValue}>{item.sede ?? '-'}</span>
      </div>
      <div style={{ ...styles.mobileCardField, flex: 1 }}>
        <span style={styles.mobileCardFieldLabel}>Usuario</span>
        <span style={styles.mobileCardFieldValue}>{item.usuario ?? '-'}</span>
      </div>
      <div style={{ ...styles.mobileCardField, flex: 1 }}>
        <span style={styles.mobileCardFieldLabel}>Cirugía</span>
        <span style={styles.mobileCardFieldValue}>{item.cirugia ?? '-'}</span>
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

function AddItemForm({ cotizacionId, tarifaId, tarifaLabel, onDone, onSaved }: { cotizacionId: string; tarifaId?: string | null; tarifaLabel?: string | null; onDone: () => void; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyItemForm);
  const [productoSearch, setProductoSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: productoResults = [] } = useQuery<ProductoOption[]>({
    queryKey: ['cotizaciones-productos', productoSearch, cotizacionId, tarifaId],
    queryFn: () => cotizacionesService.searchProductos(productoSearch, cotizacionId, tarifaId ?? undefined),
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
    <div className="modal-overlay-anim" style={{ ...styles.modalOverlay, zIndex: 10001 }} onClick={onDone}>
      <div className="modal-content-anim" style={{ ...styles.modalContent, maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Agregar Consumo</h2>
          <button style={styles.closeBtn} onClick={onDone}>
            <X size={18} />
          </button>
        </div>
        <div style={styles.modalBody}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.9rem' }}>
            <div style={styles.tarifaHint}>
              {tarifaLabel
                ? <>El precio sugerido de cada producto se calcula según la tarifa <strong style={{ color: '#3f6510' }}>{tarifaLabel}</strong>.</>
                : 'No hay una tarifa seleccionada — ingresa el valor unitario manualmente.'}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Producto *</label>
              {form.productoId ? (
                <span style={styles.medicoTag}>
                  {form.productoLabel}
                  <X size={12} style={{ cursor: 'pointer' }} onClick={() => setForm({ ...form, productoId: '', productoLabel: '', articulo: '' })} />
                </span>
              ) : (
                <div style={{ position: 'relative' as const }}>
                  <input
                    style={styles.formInput}
                    placeholder="Buscar por clave, nombre o sistema..."
                    value={productoSearch}
                    onChange={e => setProductoSearch(sanitizeCirugiaDirigido(e.target.value))}
                  />
                  {productoSearch.trim() && (
                    <div style={styles.medicoDropdown}>
                      {productoResults.length === 0 ? (
                        <div style={{ padding: '0.6rem 0.75rem', color: '#9ca3af', fontSize: '0.85rem' }}>Sin resultados</div>
                      ) : (
                        productoResults.map(p => (
                          <div
                            key={p.id}
                            style={{ ...styles.medicoDropdownItem, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}
                            onClick={() => {
                              const nuevoValorUnitario = p.precioSugerido !== null ? String(p.precioSugerido) : form.valorUnitario;
                              const nuevaCantidad = form.cantidad || '1';
                              setForm({
                                ...form,
                                productoId: p.id,
                                productoLabel: `${p.referencia ?? ''} / ${p.nombre ?? ''}`.replace(/^ \/ /, ''),
                                articulo: `Fórmula para ${p.nombre ?? ''}`,
                                cantidad: nuevaCantidad,
                                valorUnitario: nuevoValorUnitario,
                                valor: recalcValor(nuevaCantidad, nuevoValorUnitario),
                              });
                              setProductoSearch('');
                            }}
                          >
                            <span>
                              {p.referencia && <span style={styles.productoClaveTag}>{p.referencia}</span>}
                              {p.referencia ? ' / ' : ''}{p.nombre}
                            </span>
                            {p.sistema && <span style={styles.productoSistemaTag}>{p.sistema}</span>}
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
                  type="text"
                  inputMode="decimal"
                  style={styles.formInput}
                  value={form.cantidad}
                  onChange={e => { const cantidad = sanitizeNumeric(e.target.value); setForm({ ...form, cantidad, valor: recalcValor(cantidad, form.valorUnitario) }); }}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Valor Un*</label>
                <input
                  type="text"
                  inputMode="decimal"
                  style={styles.formInput}
                  value={form.valorUnitario}
                  onChange={e => { const valorUnitario = sanitizeNumeric(e.target.value); setForm({ ...form, valorUnitario, valor: recalcValor(form.cantidad, valorUnitario) }); }}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Valor</label>
                <input style={{ ...styles.formInput, color: '#6b6b60', backgroundColor: '#f4f4ee', cursor: 'not-allowed' }} value={form.valor ? formatMoney(Number(form.valor)) : ''} disabled />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Observaciones</label>
              <input style={styles.formInput} value={form.observaciones} onChange={e => setForm({ ...form, observaciones: sanitizeCirugiaDirigido(e.target.value) })} />
            </div>

            {error && <span style={styles.errorText}>{error}</span>}

            <div style={styles.formActions}>
              <button style={styles.cancelBtn} onClick={onDone}>Cancelar</button>
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

interface StagedItem {
  localId: string;
  productoId: string;
  productoLabel: string;
  articulo: string;
  cantidad: string;
  valorUnitario: string;
  valor: string;
  observaciones: string;
}

/** Igual a AddItemForm, pero agrega el ítem a una lista en memoria en vez de guardarlo en el
 * servidor — se usa al crear una cotización nueva, que todavía no tiene id (no se puede llamar
 * a POST :id/items). Los ítems en memoria se envían al servidor recién cuando se crea la
 * cotización (ver NuevaCotizacionModal). Por eso tampoco se le pasa cotizacionId a
 * searchProductos: sin cotización aún no hay tarifa para sugerir precio, el usuario lo ingresa. */
function AddStagedItemForm({ tarifaId, tarifaLabel, onAdd, onDone }: { tarifaId?: string; tarifaLabel?: string | null; onAdd: (item: StagedItem) => void; onDone: () => void }) {
  const [form, setForm] = useState(emptyItemForm);
  const [productoSearch, setProductoSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: productoResults = [] } = useQuery<ProductoOption[]>({
    queryKey: ['cotizaciones-productos', productoSearch, tarifaId],
    queryFn: () => cotizacionesService.searchProductos(productoSearch, undefined, tarifaId),
    enabled: !!productoSearch.trim(),
  });

  const handleAgregar = () => {
    if (!form.productoId) { setError('Selecciona una descripción (producto).'); return; }
    if (!form.cantidad || Number(form.cantidad) <= 0) { setError('La cantidad debe ser mayor a cero.'); return; }
    if (!form.valorUnitario || Number(form.valorUnitario) <= 0) { setError('El valor unitario debe ser mayor a cero.'); return; }
    if (!form.valor || Number(form.valor) <= 0) { setError('El valor debe ser mayor a cero.'); return; }
    setError(null);
    onAdd({ ...form, localId: crypto.randomUUID() });
    onDone();
  };

  return (
    <div className="modal-overlay-anim" style={{ ...styles.modalOverlay, zIndex: 10001 }} onClick={onDone}>
      <div className="modal-content-anim" style={{ ...styles.modalContent, maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Agregar Consumo</h2>
          <button style={styles.closeBtn} onClick={onDone}>
            <X size={18} />
          </button>
        </div>
        <div style={styles.modalBody}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.9rem' }}>
            <div style={styles.tarifaHint}>
              {tarifaLabel
                ? <>El precio sugerido de cada producto se calcula según la tarifa <strong style={{ color: '#3f6510' }}>{tarifaLabel}</strong>.</>
                : 'No hay una tarifa seleccionada — ingresa el valor unitario manualmente.'}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Producto *</label>
              {form.productoId ? (
                <span style={styles.medicoTag}>
                  {form.productoLabel}
                  <X size={12} style={{ cursor: 'pointer' }} onClick={() => setForm({ ...form, productoId: '', productoLabel: '', articulo: '' })} />
                </span>
              ) : (
                <div style={{ position: 'relative' as const }}>
                  <input
                    style={styles.formInput}
                    placeholder="Buscar por clave, nombre o sistema..."
                    value={productoSearch}
                    onChange={e => setProductoSearch(sanitizeCirugiaDirigido(e.target.value))}
                  />
                  {productoSearch.trim() && (
                    <div style={styles.medicoDropdown}>
                      {productoResults.length === 0 ? (
                        <div style={{ padding: '0.6rem 0.75rem', color: '#9ca3af', fontSize: '0.85rem' }}>Sin resultados</div>
                      ) : (
                        productoResults.map(p => (
                          <div
                            key={p.id}
                            style={{ ...styles.medicoDropdownItem, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}
                            onClick={() => {
                              const nuevoValorUnitario = p.precioSugerido !== null ? String(p.precioSugerido) : form.valorUnitario;
                              const nuevaCantidad = form.cantidad || '1';
                              setForm({
                                ...form,
                                productoId: p.id,
                                productoLabel: `${p.referencia ?? ''} / ${p.nombre ?? ''}`.replace(/^ \/ /, ''),
                                articulo: `Fórmula para ${p.nombre ?? ''}`,
                                cantidad: nuevaCantidad,
                                valorUnitario: nuevoValorUnitario,
                                valor: recalcValor(nuevaCantidad, nuevoValorUnitario),
                              });
                              setProductoSearch('');
                            }}
                          >
                            <span>
                              {p.referencia && <span style={styles.productoClaveTag}>{p.referencia}</span>}
                              {p.referencia ? ' / ' : ''}{p.nombre}
                            </span>
                            {p.sistema && <span style={styles.productoSistemaTag}>{p.sistema}</span>}
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
                  type="text"
                  inputMode="decimal"
                  style={styles.formInput}
                  value={form.cantidad}
                  onChange={e => { const cantidad = sanitizeNumeric(e.target.value); setForm({ ...form, cantidad, valor: recalcValor(cantidad, form.valorUnitario) }); }}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Valor Un*</label>
                <input
                  type="text"
                  inputMode="decimal"
                  style={styles.formInput}
                  value={form.valorUnitario}
                  onChange={e => { const valorUnitario = sanitizeNumeric(e.target.value); setForm({ ...form, valorUnitario, valor: recalcValor(form.cantidad, valorUnitario) }); }}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Valor</label>
                <input style={{ ...styles.formInput, color: '#6b6b60', backgroundColor: '#f4f4ee', cursor: 'not-allowed' }} value={form.valor ? formatMoney(Number(form.valor)) : ''} disabled />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Observaciones</label>
              <input style={styles.formInput} value={form.observaciones} onChange={e => setForm({ ...form, observaciones: sanitizeCirugiaDirigido(e.target.value) })} />
            </div>

            {error && <span style={styles.errorText}>{error}</span>}

            <div style={styles.formActions}>
              <button type="button" style={styles.cancelBtn} onClick={onDone}>Cancelar</button>
              <button type="button" style={styles.saveBtn} onClick={handleAgregar}>Agregar</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Igual a ItemDetailModal, pero para un consumo que todavía vive en memoria (formulario de
 * Crear cotización, aún sin id): en vez de mutaciones al servidor, onSave/onDelete solo tocan
 * el arreglo local de stagedItems del formulario padre. */
function StagedItemDetailModal({ item, tarifaId, onClose, onSave, onDelete }: {
  item: StagedItem;
  tarifaId?: string;
  onClose: () => void;
  onSave: (updated: StagedItem) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    productoId: item.productoId,
    productoLabel: item.productoLabel,
    articulo: item.articulo,
    cantidad: item.cantidad,
    valorUnitario: item.valorUnitario,
    observaciones: item.observaciones,
  });
  const [productoSearch, setProductoSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: productoResults = [] } = useQuery<ProductoOption[]>({
    queryKey: ['cotizaciones-productos', productoSearch, tarifaId],
    queryFn: () => cotizacionesService.searchProductos(productoSearch, undefined, tarifaId),
    enabled: editing && !!productoSearch.trim(),
  });

  const valorCalculado = recalcValor(form.cantidad, form.valorUnitario);

  const hasChanges =
    form.productoId !== item.productoId ||
    form.cantidad !== item.cantidad ||
    form.valorUnitario !== item.valorUnitario ||
    form.observaciones !== item.observaciones;

  const handleGuardar = () => {
    if (!form.productoId) { setError('Selecciona un producto.'); return; }
    if (!form.cantidad || Number(form.cantidad) <= 0) { setError('La cantidad debe ser mayor a cero.'); return; }
    if (!form.valorUnitario || Number(form.valorUnitario) <= 0) { setError('El valor unitario debe ser mayor a cero.'); return; }
    if (!hasChanges) { setEditing(false); return; }
    setError(null);
    onSave({ ...item, ...form, valor: valorCalculado });
    setEditing(false);
  };

  return (
    <div className="modal-overlay-anim" style={{ ...styles.modalOverlay, zIndex: 10001 }} onClick={onClose}>
      <div className="modal-content-anim" style={{ ...styles.modalContent, maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{item.productoLabel || 'Consumo'}</h2>
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
              <span style={{ fontWeight: 600, color: '#16170f' }}>¿Quitar este consumo?</span>
              <div style={styles.formActions}>
                <button style={styles.cancelBtn} onClick={() => setConfirmDelete(false)}>Cancelar</button>
                <button style={styles.deleteBtn} onClick={() => { onDelete(); onClose(); }}>Eliminar</button>
              </div>
            </div>
          ) : editing ? (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.9rem' }}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Producto *</label>
                {form.productoId ? (
                  <span style={styles.medicoTag}>
                    {form.productoLabel}
                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => setForm({ ...form, productoId: '', productoLabel: '', articulo: '' })} />
                  </span>
                ) : (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      style={styles.formInput}
                      placeholder="Buscar por clave, nombre o sistema..."
                      value={productoSearch}
                      onChange={e => setProductoSearch(sanitizeCirugiaDirigido(e.target.value))}
                    />
                    {productoSearch.trim() && (
                      <div style={styles.medicoDropdown}>
                        {productoResults.length === 0 ? (
                          <div style={{ padding: '0.6rem 0.75rem', color: '#9ca3af', fontSize: '0.85rem' }}>Sin resultados</div>
                        ) : (
                          productoResults.map(p => (
                            <div
                              key={p.id}
                              style={{ ...styles.medicoDropdownItem, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}
                              onClick={() => {
                                const nuevoValorUnitario = p.precioSugerido !== null ? String(p.precioSugerido) : form.valorUnitario;
                                setForm({
                                  ...form,
                                  productoId: p.id,
                                  productoLabel: `${p.referencia ?? ''} / ${p.nombre ?? ''}`.replace(/^ \/ /, ''),
                                  articulo: `Fórmula para ${p.nombre ?? ''}`,
                                  valorUnitario: nuevoValorUnitario,
                                });
                                setProductoSearch('');
                              }}
                            >
                              <span>
                                {p.referencia && <span style={styles.productoClaveTag}>{p.referencia}</span>}
                                {p.referencia ? ' / ' : ''}{p.nombre}
                              </span>
                              {p.sistema && <span style={styles.productoSistemaTag}>{p.sistema}</span>}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={styles.formRow3}>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Cantidad *</label>
                  <input type="text" inputMode="decimal" style={styles.formInput} value={form.cantidad} onChange={e => setForm({ ...form, cantidad: sanitizeNumeric(e.target.value) })} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Valor Un*</label>
                  <input type="text" inputMode="decimal" style={styles.formInput} value={form.valorUnitario} onChange={e => setForm({ ...form, valorUnitario: sanitizeNumeric(e.target.value) })} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Valor</label>
                  <input style={{ ...styles.formInput, color: '#6b6b60', backgroundColor: '#f4f4ee', cursor: 'not-allowed' }} value={valorCalculado ? formatMoney(Number(valorCalculado)) : ''} disabled />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Observaciones</label>
                <input style={styles.formInput} value={form.observaciones} onChange={e => setForm({ ...form, observaciones: sanitizeCirugiaDirigido(e.target.value) })} />
              </div>

              {error && <span style={styles.errorText}>{error}</span>}

              <div style={styles.formActions}>
                <button style={styles.cancelBtn} onClick={() => { setEditing(false); setError(null); }}>Cancelar</button>
                <button
                  style={{ ...styles.saveBtn, ...(!hasChanges ? styles.saveBtnDisabled : {}) }}
                  onClick={handleGuardar}
                  disabled={!hasChanges}
                >
                  Guardar
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '1.1rem' }}>
              <DetalleItem label="Producto">{item.productoLabel || '-'}</DetalleItem>
              <DetalleItem label="Cantidad">{item.cantidad || '-'}</DetalleItem>
              <DetalleItem label="Valor Unitario">{formatMoney(Number(item.valorUnitario))}</DetalleItem>
              <DetalleItem label="Valor">{formatMoney(Number(item.valor))}</DetalleItem>
              <DetalleItem label="Observaciones">{item.observaciones || '-'}</DetalleItem>
            </div>
          )}
        </div>
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
          <h2 style={styles.modalTitle}>{item.descripcion ?? item.referencia ?? 'Consumo'}</h2>
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
              <span style={{ fontWeight: 600, color: '#16170f' }}>¿Eliminar este consumo? Esta acción no se puede deshacer.</span>
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
                <label style={styles.formLabel}>Producto *</label>
                {form.productoId ? (
                  <span style={styles.medicoTag}>
                    {form.productoLabel}
                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => setForm({ ...form, productoId: '', productoLabel: '' })} />
                  </span>
                ) : (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      style={styles.formInput}
                      placeholder="Buscar por clave, nombre o sistema..."
                      value={productoSearch}
                      onChange={e => setProductoSearch(sanitizeCirugiaDirigido(e.target.value))}
                    />
                    {productoSearch.trim() && (
                      <div style={styles.medicoDropdown}>
                        {productoResults.length === 0 ? (
                          <div style={{ padding: '0.6rem 0.75rem', color: '#9ca3af', fontSize: '0.85rem' }}>Sin resultados</div>
                        ) : (
                          productoResults.map(p => (
                            <div
                              key={p.id}
                              style={{ ...styles.medicoDropdownItem, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}
                              onClick={() => {
                                setForm({
                                  ...form,
                                  productoId: p.id,
                                  productoLabel: `${p.referencia ?? ''} / ${p.nombre ?? ''}`.replace(/^ \/ /, ''),
                                });
                                setProductoSearch('');
                              }}
                            >
                              <span>
                              {p.referencia && <span style={styles.productoClaveTag}>{p.referencia}</span>}
                              {p.referencia ? ' / ' : ''}{p.nombre}
                            </span>
                              {p.sistema && <span style={styles.productoSistemaTag}>{p.sistema}</span>}
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
                  <input type="text" inputMode="decimal" style={styles.formInput} value={form.cantidad} onChange={e => setForm({ ...form, cantidad: sanitizeNumeric(e.target.value) })} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Valor Un*</label>
                  <input type="text" inputMode="decimal" style={styles.formInput} value={form.valorUnitario} onChange={e => setForm({ ...form, valorUnitario: sanitizeNumeric(e.target.value) })} />
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
            onMouseDown={e => e.preventDefault()}
            onClick={e => { onSelect(o.id, o.nombreCompleto); e.currentTarget.blur(); }}
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

function TerceroMultiPicker({ label, values, onChange, disabled, disabledHint, id, clasificacion }: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  disabledHint?: string;
  id?: string;
  clasificacion?: string;
}) {
  const [search, setSearch] = useState('');
  const { data: results = [] } = useQuery<TerceroOption[]>({
    queryKey: ['cotizaciones-terceros-multi', search, clasificacion],
    queryFn: () => cotizacionesService.searchTerceros(search, clasificacion),
    enabled: !disabled && !!search.trim(),
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
      {disabled ? (
        <span style={{ ...styles.formInput, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>
          {disabledHint ?? 'Selecciona primero'}
        </span>
      ) : (
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
      )}
    </div>
  );
}

function ListPicker({ label, required, options, valueId, valueLabel, onSelect, id, error, disabled, disabledHint }: {
  label: string;
  required?: boolean;
  options: { id: string; nombre: string | null }[];
  valueId: string;
  valueLabel: string;
  onSelect: (id: string, label: string) => void;
  id?: string;
  error?: boolean;
  disabled?: boolean;
  disabledHint?: string;
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
      ) : disabled ? (
        <span style={{ ...styles.formInput, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>
          {disabledHint ?? 'Selecciona primero'}
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

function EditCotizacionForm({ cotizacion, onCancel, onSaved, onNotify }: {
  cotizacion: CotizacionDetail;
  onCancel: () => void;
  onSaved: (message: string) => void;
  onNotify: (message: string, variant?: 'check' | 'info') => void;
}) {
  const queryClient = useQueryClient();
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CotizacionItem | null>(null);
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);
  const [confirmAddConsumoConPaquete, setConfirmAddConsumoConPaquete] = useState(false);
  // hasFormChanges (más abajo) solo compara los campos del formulario — agregar/editar/eliminar
  // consumos no toca esos campos, así que sin esto Guardar no detectaba el cambio y salía del modo
  // edición sin llamar a la API ni mostrar el mensaje de éxito.
  const [itemsChanged, setItemsChanged] = useState(false);
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
    sedeId: cotizacion.sedeId ?? getUsuarioActualSedeId(),
    numProveedor: cotizacion.numProveedor ?? '',
    tiempoEntrega: cotizacion.tiempoEntrega ?? '',
    observaciones: cotizacion.observaciones ?? '',
    paqueteId: cotizacion.paqueteId ?? '',
    paqueteLabel: cotizacion.paquete ?? '',
    nivel: cotizacion.nivel || NIVEL_OPTIONS[0],
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

  const { data: sedeOptions = [] } = useQuery<SedeOption[]>({
    queryKey: ['cotizaciones-sedes'],
    queryFn: () => cotizacionesService.getSedes(),
  });

  // Tarifa: si el responsable económico tiene tarifa propia asignada se usa esa; si no, cae al
  // cubrimiento general seleccionado (misma id que la subtarifa de nivel superior).
  const { data: terceroTarifa, isLoading: terceroTarifaLoading } = useQuery({
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
      sedeId: form.sedeId,
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

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => cotizacionesService.deleteItem(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizacion', cotizacion.id] });
      setConfirmDeleteItemId(null);
      setItemsChanged(true);
      onNotify('Consumo eliminado');
      // Tocar los consumos (agregar o eliminar) de una cotización con paquete la desvincula del
      // paquete: ya no refleja fielmente lo que el paquete define. Se limpia en el formulario local;
      // se persiste como null/'' recién cuando se guarde la edición (igual que cualquier otro campo).
      setForm(prev => (prev.paqueteId ? { ...prev, paqueteId: '', paqueteLabel: '', nivel: '' } : prev));
    },
  });

  // Si cambia el Cubrimiento o el Responsable Económico y eso cambia la tarifa resuelta, los
  // consumos ya agregados se recalculan y guardan de inmediato contra la lista de precios de la
  // nueva tarifa (mismo comportamiento de "guardado inmediato" que agregar/editar/eliminar un
  // consumo, sin esperar al botón Guardar del formulario). recalculatedTarifaRef evita recalcular
  // dos veces para la misma tarifa (ej. por re-renders) y arranca en la tarifa ya persistida para
  // no disparar un recálculo al montar el formulario. Se espera a que termine de resolver
  // terceroTarifa antes de comparar, para no disparar con el valor intermedio de fallback
  // (form.cubrimientoId) mientras la consulta de tarifa propia del responsable aún está en curso.
  const recalculatedTarifaRef = useRef<string | null>(cotizacion.tarifaId ?? null);

  const recalcPreciosMutation = useMutation({
    mutationFn: (nuevoTarifaId: string) => cotizacionesService.recalcularPrecios(cotizacion.id, nuevoTarifaId),
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ['cotizacion', cotizacion.id] });
      if (result.actualizados > 0 && result.omitidos > 0) {
        onNotify(`Se actualizaron los precios de ${result.actualizados} consumo(s) según la nueva tarifa. ${result.omitidos} no tienen precio en la nueva tarifa y conservan su valor anterior.`, 'info');
      } else if (result.actualizados > 0) {
        onNotify(`Se actualizaron los precios de ${result.actualizados} consumo(s) según la nueva tarifa.`, 'info');
      } else if (result.omitidos > 0) {
        onNotify(`Ningún consumo tiene precio en la nueva tarifa; conservan su valor anterior.`, 'info');
      }
    },
  });

  useEffect(() => {
    if (terceroTarifaLoading) return;
    if (!tarifaId || tarifaId === recalculatedTarifaRef.current) return;
    recalculatedTarifaRef.current = tarifaId;
    if (cotizacion.items.length > 0) {
      recalcPreciosMutation.mutate(tarifaId);
    }
  }, [tarifaId, terceroTarifaLoading]);

  const validateForm = (): { field: string; message: string } | null => {
    if (!form.fecha) return { field: 'fecha', message: 'Selecciona la fecha.' };
    if (!form.dirigidoA.trim()) return { field: 'dirigidoA', message: 'Ingresa a quién va dirigida.' };
    if (!form.hospitalId) return { field: 'hospital', message: 'Selecciona el hospital.' };
    if (!form.cirugia.trim()) return { field: 'cirugia', message: 'Ingresa la cirugía.' };
    if (!form.cubrimientoId) return { field: 'cubrimiento', message: 'Selecciona el cubrimiento.' };
    if (!form.empresaId) return { field: 'empresa', message: 'Selecciona la empresa.' };
    if (!form.responsableEconomicoId) return { field: 'responsable', message: 'Selecciona el responsable económico.' };
    if (!form.sedeId) return { field: 'sede', message: 'Selecciona la sede.' };
    if (form.cubrimientoId === CUBRIMIENTO_HOSPITALES_ID && !form.numProveedor.trim()) return { field: 'numProveedor', message: 'Ingresa el N° de proveedor.' };
    if (form.cubrimientoId === CUBRIMIENTO_HOSPITALES_ID && !form.tiempoEntrega.trim()) return { field: 'tiempoEntrega', message: 'Ingresa el tiempo de entrega.' };
    if (form.tieneDcto && !form.porcentajeDcto.trim()) return { field: 'porcentajeDcto', message: 'Ingresa el porcentaje de descuento.' };
    if (!form.impuestos) return { field: 'impuestos', message: 'Selecciona impuestos.' };
    return null;
  };

  const formError = validateForm();

  const originalMedicos = cotizacion.medico ? cotizacion.medico.split(',').map(s => s.trim()).filter(Boolean) : [];
  const medicosChanged = form.medicos.length !== originalMedicos.length || form.medicos.some((m, i) => m !== originalMedicos[i]);

  const hasFormChanges =
    form.fecha !== toDateInputValue(cotizacion.fecha) ||
    form.dirigidoA !== (cotizacion.dirigidoA ?? '') ||
    medicosChanged ||
    form.hospitalId !== (cotizacion.hospitalId ?? '') ||
    form.cirugia !== (cotizacion.cirugia ?? '') ||
    form.cubrimientoId !== (cotizacion.cubrimientoId ?? '') ||
    form.empresaId !== (cotizacion.empresaId ?? '') ||
    form.responsableEconomicoId !== (cotizacion.responsableEconomicoId ?? '') ||
    form.sedeId !== (cotizacion.sedeId ?? getUsuarioActualSedeId()) ||
    form.numProveedor !== (cotizacion.numProveedor ?? '') ||
    form.tiempoEntrega !== (cotizacion.tiempoEntrega ?? '') ||
    form.observaciones !== (cotizacion.observaciones ?? '') ||
    form.paqueteId !== (cotizacion.paqueteId ?? '') ||
    form.nivel !== (cotizacion.nivel || NIVEL_OPTIONS[0]) ||
    form.tieneDcto !== cotizacion.tieneDcto ||
    form.porcentajeDcto !== (cotizacion.porcentajeDcto !== null ? String(cotizacion.porcentajeDcto) : '') ||
    form.impuestos !== (cotizacion.impuestos ?? '');

  const handleGuardar = () => {
    if (formError) { setError(formError); return; }
    if (!hasFormChanges) {
      // Los consumos (agregar/editar/eliminar) ya se guardan solos apenas ocurren, no con este
      // botón — pero si eso fue lo único que cambió, Guardar debe avisar igual, no salir en
      // silencio como si no hubiera pasado nada.
      if (itemsChanged) onSaved('Cotización editada'); else onCancel();
      return;
    }
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

      <TerceroMultiPicker label="Médico" values={form.medicos} onChange={medicos => setForm({ ...form, medicos })} clasificacion="DOCTOR" />

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
              onMouseDown={e => e.preventDefault()}
              onClick={e => {
                const autoResponsable = opt.id === CUBRIMIENTO_HOSPITALES_ID && form.hospitalId
                  ? { responsableEconomicoId: form.hospitalId, responsableEconomicoLabel: form.hospitalLabel }
                  : { responsableEconomicoId: '', responsableEconomicoLabel: '' };
                setForm({ ...form, cubrimientoId: opt.id, ...autoResponsable });
                setError(null);
                e.currentTarget.blur();
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

      <div style={styles.formGroup} id="cotizacion-edit-field-sede">
        <label style={styles.formLabel}>Sede *</label>
        <select
          style={{ ...styles.formInput, ...(error?.field === 'sede' ? styles.inputError : {}) }}
          value={form.sedeId}
          onChange={e => { setForm({ ...form, sedeId: e.target.value }); setError(null); }}
        >
          <option value="">Selecciona...</option>
          {sedeOptions.map(s => (
            <option key={s.id} value={s.id}>{s.nombre}</option>
          ))}
        </select>
        {error?.field === 'sede' && <span style={styles.errorText}>{error.message}</span>}
      </div>

      <div style={styles.formGroup} id="cotizacion-edit-field-numProveedor">
        <label style={styles.formLabel}>N° Proveedor{form.cubrimientoId === CUBRIMIENTO_HOSPITALES_ID ? ' *' : ''}</label>
        <input style={{ ...styles.formInput, ...(error?.field === 'numProveedor' ? styles.inputError : {}) }} value={form.numProveedor} onChange={e => { setForm({ ...form, numProveedor: sanitizeCirugiaDirigido(e.target.value) }); setError(null); }} />
        {error?.field === 'numProveedor' && <span style={styles.errorText}>{error.message}</span>}
      </div>

      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Tarifa</label>
        <span style={{ ...styles.formInput, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>
          {tarifaLabel || 'Se selecciona automaticamente al seleccionar el cubrimiento'}
        </span>
      </div>

      <div style={styles.formGroup} id="cotizacion-edit-field-tiempoEntrega">
        <label style={styles.formLabel}>Tiempo de Entrega{form.cubrimientoId === CUBRIMIENTO_HOSPITALES_ID ? ' *' : ''}</label>
        <input style={{ ...styles.formInput, ...(error?.field === 'tiempoEntrega' ? styles.inputError : {}) }} value={form.tiempoEntrega} onChange={e => { setForm({ ...form, tiempoEntrega: sanitizeCirugiaDirigido(e.target.value) }); setError(null); }} />
        {error?.field === 'tiempoEntrega' && <span style={styles.errorText}>{error.message}</span>}
      </div>

      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Observaciones</label>
        <input style={styles.formInput} value={form.observaciones} onChange={e => setForm({ ...form, observaciones: sanitizeCirugiaDirigido(e.target.value) })} />
      </div>

      <ListPicker
        label="Paquete"
        options={paquetes}
        valueId={form.paqueteId}
        valueLabel={form.paqueteLabel}
        onSelect={(id, label) => setForm({ ...form, paqueteId: id, paqueteLabel: label, nivel: id ? (form.nivel || NIVEL_OPTIONS[0]) : '' })}
        disabled={!tarifaId || (!form.paqueteId && cotizacion.items.length > 0)}
        disabledHint={!tarifaId ? 'Selecciona primero una tarifa' : 'No puedes agregar un paquete mientras haya consumos agregados'}
      />

      {form.paqueteId && (
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Nivel</label>
          <select
            style={styles.formInput}
            value={form.nivel}
            onChange={e => setForm({ ...form, nivel: e.target.value })}
          >
            {NIVEL_OPTIONS.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      )}

      <div style={styles.sectionDivider} />

      <div style={styles.formGroup}>
        <div style={styles.sectionHeader}>
          <span style={{ ...styles.sectionTitle, color: '#374151' }}>Consumos</span>
          <span style={styles.countBadge}>{cotizacion.items.length}</span>
        </div>

        {cotizacion.items.length > 0 && tarifaLabel && (
          <div style={styles.tarifaHint}>
            El valor unitario de los consumos es referente a la tarifa <strong style={{ color: '#3f6510' }}>{tarifaLabel}</strong>.
          </div>
        )}

        {cotizacion.items.length === 0 ? (
          <div style={styles.emptySection}>No hay consumos</div>
        ) : (
          <div style={styles.consumosTableWrap}>
            <table style={styles.consumosTable}>
              <thead>
                <tr>
                  {['Cant.', 'Producto', 'Valor Unit.', 'Valor', 'OBSERV.', ''].map((h, i) => (
                    <th key={i} style={styles.consumosTh}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cotizacion.items.map(it => {
                  const producto = `${it.referencia ? `${it.referencia} / ` : ''}${it.descripcion ?? '-'}${it.sistema ? ` (${it.sistema})` : ''}`;
                  return (
                    <tr
                      key={it.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedItem(it)}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <td style={styles.consumosTd}>{it.cantidad ?? '-'}</td>
                      <td style={{ ...styles.consumosTd, ...styles.consumosTdTruncate }} title={producto}>{producto}</td>
                      <td style={styles.consumosTd}>{formatMoney(it.valorUnitario)}</td>
                      <td style={{ ...styles.consumosTd, fontWeight: 700, color: '#3f6510' }}>{formatMoney(it.valor)}</td>
                      <td style={{ ...styles.consumosTd, ...styles.consumosTdTruncate }} title={it.observaciones ?? undefined}>{it.observaciones ?? '-'}</td>
                      <td style={styles.consumosTd} onClick={e => e.stopPropagation()}>
                        {confirmDeleteItemId === it.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <button
                              type="button"
                              style={styles.rowDeleteBtn}
                              title="Confirmar eliminar"
                              disabled={deleteItemMutation.isPending}
                              onClick={() => deleteItemMutation.mutate(it.id)}
                            >
                              <Check size={14} />
                            </button>
                            <button
                              type="button"
                              style={{ ...styles.rowDeleteBtn, color: '#6b6b60' }}
                              title="Cancelar"
                              onClick={() => setConfirmDeleteItemId(null)}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <button type="button" style={styles.rowDeleteBtn} title="Eliminar" onClick={() => setConfirmDeleteItemId(it.id)}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {confirmAddConsumoConPaquete ? (
          <div style={styles.tarifaHint}>
            Al agregar un consumo manualmente, la cotización ya no quedará asociada al paquete <strong style={{ color: '#3f6510' }}>{form.paqueteLabel}</strong> se quitará el paquete y el nivel, pero los consumos ya cargados se mantendrán. ¿Deseas continuar?
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
              <button
                type="button"
                className="btn-press header-btn-primary"
                style={{ ...styles.pillBtnPrimary, justifyContent: 'center' as const }}
                onClick={() => { setConfirmAddConsumoConPaquete(false); setShowAddItem(true); }}
              >
                Continuar
              </button>
              <button type="button" style={styles.cancelBtn} onClick={() => setConfirmAddConsumoConPaquete(false)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="btn-press header-btn-primary"
              disabled={!tarifaId}
              style={{ ...styles.pillBtnPrimary, marginTop: '0.75rem', justifyContent: 'center' as const, ...(!tarifaId ? styles.pickBtnDisabled : {}) }}
              onClick={() => { if (form.paqueteId) setConfirmAddConsumoConPaquete(true); else setShowAddItem(true); }}
            >
              <Plus size={14} /> Agregar consumos
            </button>
            {!tarifaId && (
              <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Debes tener seleccionada una tarifa para agregar consumos</span>
            )}
          </>
        )}

        {showAddItem && (
          <AddItemForm
            cotizacionId={cotizacion.id}
            tarifaId={tarifaId}
            tarifaLabel={tarifaLabel}
            onDone={() => setShowAddItem(false)}
            onSaved={() => {
              setItemsChanged(true);
              onNotify('Consumo agregado');
              setForm(prev => (prev.paqueteId ? { ...prev, paqueteId: '', paqueteLabel: '', nivel: '' } : prev));
            }}
          />
        )}

        {selectedItem && (
          <ItemDetailModal
            item={selectedItem}
            cotizacionId={cotizacion.id}
            onClose={() => setSelectedItem(null)}
            onSaved={() => { setItemsChanged(true); onNotify('Consumo actualizado'); }}
            onDeleted={() => { setItemsChanged(true); onNotify('Consumo eliminado'); }}
          />
        )}
      </div>

      <div style={styles.sectionDivider} />

      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Subtotal</label>
        <input
          style={{ ...styles.formInput, color: '#6b6b60', backgroundColor: '#f4f4ee', cursor: 'not-allowed' }}
          value={formatMoney(subtotal)}
          disabled
        />
      </div>

      <div style={styles.formGroup}>
        <label style={styles.formLabel}>¿Tiene Descuento? *</label>
        <div style={styles.pickBtnGrid}>
          <button type="button" style={{ ...styles.pickBtn, ...(!form.tieneDcto ? styles.pickBtnActive : {}) }} onMouseDown={e => e.preventDefault()} onClick={e => { setForm({ ...form, tieneDcto: false }); e.currentTarget.blur(); }}>No</button>
          <button type="button" style={{ ...styles.pickBtn, ...(form.tieneDcto ? styles.pickBtnActive : {}) }} onMouseDown={e => e.preventDefault()} onClick={e => { setForm({ ...form, tieneDcto: true }); e.currentTarget.blur(); }}>Sí</button>
        </div>
      </div>

      {form.tieneDcto && (
        <>
          <div style={styles.formGroup} id="cotizacion-edit-field-porcentajeDcto">
            <label style={styles.formLabel}>Porcentaje de descuento *</label>
            <input type="number" step="0.01" style={{ ...styles.formInput, ...(error?.field === 'porcentajeDcto' ? styles.inputError : {}) }} value={form.porcentajeDcto} onChange={e => { setForm({ ...form, porcentajeDcto: e.target.value }); setError(null); }} />
            {error?.field === 'porcentajeDcto' && <span style={styles.errorText}>{error.message}</span>}
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Valor de descuento</label>
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
              onMouseDown={e => e.preventDefault()}
              onClick={e => { setForm({ ...form, impuestos: opt }); setError(null); e.currentTarget.blur(); }}
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
        <button
          style={{ ...styles.saveBtn, ...(updateMutation.isPending || formError ? styles.saveBtnDisabled : {}) }}
          onClick={handleGuardar}
          disabled={updateMutation.isPending || !!formError}
        >
          {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

function NuevaCotizacionModal({ onClose, onCreated, onNotify }: {
  onClose: () => void;
  onCreated: (message: string) => void;
  onNotify: (message: string, variant?: 'check' | 'info') => void;
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
    sedeId: getUsuarioActualSedeId(),
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
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedStagedItem, setSelectedStagedItem] = useState<StagedItem | null>(null);
  const [confirmAddConsumoConPaquete, setConfirmAddConsumoConPaquete] = useState(false);

  const stagedSubtotal = stagedItems.reduce((sum, it) => sum + (Number(it.valor) || 0), 0);
  const { subtotal, vrDcto, totalAntesImpuestos, iva, retencion, total } = computeTotalesFromSubtotal(stagedSubtotal, form.tieneDcto, form.porcentajeDcto, form.impuestos);

  const { data: paquetes = [] } = useQuery<PaqueteOption[]>({
    queryKey: ['cotizaciones-paquetes'],
    queryFn: () => cotizacionesService.getPaquetes(),
  });

  const { data: sedeOptions = [] } = useQuery<SedeOption[]>({
    queryKey: ['cotizaciones-sedes'],
    queryFn: () => cotizacionesService.getSedes(),
  });

  // Tarifa: si el responsable económico tiene tarifa propia asignada se usa esa; si no, cae al
  // cubrimiento general seleccionado (misma id que la subtarifa de nivel superior).
  const { data: terceroTarifa, isLoading: terceroTarifaLoading } = useQuery({
    queryKey: ['cotizacion-tercero-tarifa', form.responsableEconomicoId],
    queryFn: () => cotizacionesService.getTerceroTarifa(form.responsableEconomicoId),
    enabled: !!form.responsableEconomicoId,
  });
  const tarifaId = terceroTarifa?.tarifaId || form.cubrimientoId;
  const tarifaLabel = terceroTarifa?.tarifaNombre || CUBRIMIENTO_OPTIONS.find(o => o.id === form.cubrimientoId)?.label || '';

  // Si hay un paquete + nivel seleccionados, los consumos ya no se agregan a mano: se traen del
  // paquete (detalle_paquetes) según el nivel elegido, con precio según la tarifa resuelta arriba.
  // Al cambiar cualquiera de los tres, se vuelve a traer la lista completa (reemplaza lo que hubiera).
  const paqueteConsumosQuery = useQuery<PaqueteConsumoOption[]>({
    queryKey: ['cotizacion-paquete-consumos', form.paqueteId, form.nivel, tarifaId],
    queryFn: () => cotizacionesService.getPaqueteConsumos(form.paqueteId, form.nivel, tarifaId || undefined),
    enabled: !!form.paqueteId && !!form.nivel && !!tarifaId,
  });

  useEffect(() => {
    if (!form.paqueteId || !form.nivel || !tarifaId || !paqueteConsumosQuery.data) return;
    setStagedItems(paqueteConsumosQuery.data.map(p => {
      const productoLabel = `${p.referencia ?? ''} / ${p.nombre ?? ''}`.replace(/^ \/ /, '');
      const valorUnitario = p.precioSugerido !== null ? String(p.precioSugerido) : '0';
      const cantidad = String(p.cantidad);
      return {
        localId: crypto.randomUUID(),
        productoId: p.id,
        productoLabel,
        articulo: `Fórmula para ${p.nombre ?? ''}`,
        cantidad,
        valorUnitario,
        valor: recalcValor(cantidad, valorUnitario),
        observaciones: '',
      };
    }));
  }, [paqueteConsumosQuery.data]);

  // Si cambia el Cubrimiento o el Responsable Económico (y con eso la tarifa resuelta) y ya hay
  // consumos agregados a mano, se recalculan sus precios contra la nueva tarifa — mismo
  // comportamiento que en edición (recalcPreciosMutation), pero acá los consumos todavía viven en
  // memoria (no hay cotizacionId), así que se resuelve por productoId en vez de por cotización.
  // Si los consumos vienen de un paquete, ya se recalculan solos vía paqueteConsumosQuery arriba.
  const recalculatedTarifaRef = useRef<string | null>(null);

  const recalcStagedPreciosMutation = useMutation({
    mutationFn: (nuevoTarifaId: string) => cotizacionesService.getPreciosPorProductos(stagedItems.map(it => it.productoId), nuevoTarifaId),
    onSuccess: precios => {
      const precioPorProducto = new Map(precios.map(p => [p.productoId, p.precio]));
      const actualizados = precios.filter(p => p.precio !== null).length;
      const omitidos = precios.filter(p => p.precio === null).length;
      setStagedItems(prev => prev.map(it => {
        const nuevoPrecio = precioPorProducto.get(it.productoId);
        if (nuevoPrecio === undefined || nuevoPrecio === null) return it;
        const valorUnitario = String(nuevoPrecio);
        return { ...it, valorUnitario, valor: recalcValor(it.cantidad, valorUnitario) };
      }));
      if (actualizados > 0 && omitidos > 0) {
        onNotify(`Se actualizaron los precios de ${actualizados} consumo(s) según la nueva tarifa. ${omitidos} no tienen precio en la nueva tarifa y conservan su valor anterior.`, 'info');
      } else if (actualizados > 0) {
        onNotify(`Se actualizaron los precios de ${actualizados} consumo(s) según la nueva tarifa.`, 'info');
      } else if (omitidos > 0) {
        onNotify(`Ningún consumo tiene precio en la nueva tarifa; conservan su valor anterior.`, 'info');
      }
    },
  });

  useEffect(() => {
    if (terceroTarifaLoading) return;
    if (!tarifaId || tarifaId === recalculatedTarifaRef.current) return;
    recalculatedTarifaRef.current = tarifaId;
    if (stagedItems.length > 0 && !form.paqueteId) {
      recalcStagedPreciosMutation.mutate(tarifaId);
    }
  }, [tarifaId, terceroTarifaLoading]);

  // Bloqueo secuencial: cada campo solo se habilita cuando los campos obligatorios anteriores
  // ya se llenaron, para guiar al usuario en el orden correcto del formulario.
  const dirigidoAListo = !!form.dirigidoA.trim();
  const camposParaCubrimientoListos = dirigidoAListo && !!form.hospitalId && !!form.cirugia.trim();

  const createMutation = useMutation({
    mutationFn: async () => {
      const created = await cotizacionesService.createCotizacion({
        fecha: form.fecha,
        dirigidoA: form.dirigidoA,
        medico: form.medicos.join(', '),
        hospitalId: form.hospitalId,
        cirugia: form.cirugia,
        cubrimientoId: form.cubrimientoId,
        empresaId: form.empresaId,
        responsableEconomicoId: form.responsableEconomicoId,
        sedeId: form.sedeId,
        numProveedor: form.numProveedor,
        tarifaId,
        tiempoEntrega: form.tiempoEntrega,
        observaciones: form.observaciones,
        paqueteId: form.paqueteId,
        nivel: form.nivel,
        tieneDcto: form.tieneDcto,
        porcentajeDcto: form.tieneDcto && form.porcentajeDcto ? Number(form.porcentajeDcto) : undefined,
        impuestos: form.impuestos,
      });
      // Los ítems se armaron en memoria (todavía no existía el id de la cotización) — ahora que
      // ya se creó, se registran uno por uno EN ORDEN (no en paralelo): el listado del detalle se
      // ordena por marcaDeTiempo, así que si se mandaran todos a la vez con Promise.all, el orden
      // de llegada al servidor no estaría garantizado y podrían quedar desordenados respecto al
      // orden en que se agregaron en el formulario.
      for (const it of stagedItems) {
        await cotizacionesService.createItem(created.id, {
          productoId: it.productoId,
          cantidad: Number(it.cantidad),
          valorUnitario: Number(it.valorUnitario),
          observaciones: it.observaciones || undefined,
        });
      }
      return created;
    },
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
    if (!form.sedeId) { setError({ field: 'sede', message: 'Selecciona la sede.' }); return; }
    if (form.cubrimientoId === CUBRIMIENTO_HOSPITALES_ID && !form.numProveedor.trim()) { setError({ field: 'numProveedor', message: 'Ingresa el N° de proveedor.' }); return; }
    if (form.cubrimientoId === CUBRIMIENTO_HOSPITALES_ID && !form.tiempoEntrega.trim()) { setError({ field: 'tiempoEntrega', message: 'Ingresa el tiempo de entrega.' }); return; }
    if (form.tieneDcto && !form.porcentajeDcto.trim()) { setError({ field: 'porcentajeDcto', message: 'Ingresa el porcentaje de descuento.' }); return; }
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
          <h2 style={styles.modalTitle}>Nueva cotización</h2>
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

            <TerceroMultiPicker
              label="Médico"
              values={form.medicos}
              onChange={medicos => setForm({ ...form, medicos })}
              clasificacion="DOCTOR"
              disabled={!dirigidoAListo}
              disabledHint="Ingresa primero a quién va dirigida"
            />

            <TerceroPicker
              label="Hospital"
              required
              id="cotizacion-create-field-hospital"
              error={error?.field === 'hospital'}
              valueId={form.hospitalId}
              valueLabel={form.hospitalLabel}
              disabled={!dirigidoAListo}
              disabledHint="Ingresa primero a quién va dirigida"
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
              {!form.hospitalId ? (
                <span style={{ ...styles.formInput, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>
                  Selecciona primero el hospital
                </span>
              ) : (
                <input style={{ ...styles.formInput, ...(error?.field === 'cirugia' ? styles.inputError : {}) }} value={form.cirugia} onChange={e => { setForm({ ...form, cirugia: sanitizeCirugiaDirigido(e.target.value) }); setError(null); }} />
              )}
              {error?.field === 'cirugia' && <span style={styles.errorText}>{error.message}</span>}
            </div>

            <div style={styles.formGroup} id="cotizacion-create-field-cubrimiento">
              <label style={styles.formLabel}>Cubrimiento *</label>
              <div style={styles.pickBtnGrid}>
                {CUBRIMIENTO_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={!camposParaCubrimientoListos}
                    style={{
                      ...styles.pickBtn,
                      ...(form.cubrimientoId === opt.id ? styles.pickBtnActive : {}),
                      ...(error?.field === 'cubrimiento' ? styles.inputError : {}),
                      ...(!camposParaCubrimientoListos ? styles.pickBtnDisabled : {}),
                    }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => {
                      const autoResponsable = opt.id === CUBRIMIENTO_HOSPITALES_ID && form.hospitalId
                        ? { responsableEconomicoId: form.hospitalId, responsableEconomicoLabel: form.hospitalLabel }
                        : { responsableEconomicoId: '', responsableEconomicoLabel: '' };
                      setForm({ ...form, cubrimientoId: opt.id, empresaId: '', empresaLabel: '', ...autoResponsable });
                      setError(null);
                      e.currentTarget.blur();
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {!camposParaCubrimientoListos && (
                <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Completa Dirigido a, Hospital y Cirugía primero</span>
              )}
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

            <div style={styles.formGroup} id="cotizacion-create-field-sede">
              <label style={styles.formLabel}>Sede *</label>
              <select
                style={{ ...styles.formInput, ...(error?.field === 'sede' ? styles.inputError : {}) }}
                value={form.sedeId}
                onChange={e => { setForm({ ...form, sedeId: e.target.value }); setError(null); }}
              >
                <option value="">Selecciona...</option>
                {sedeOptions.map(s => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
              {error?.field === 'sede' && <span style={styles.errorText}>{error.message}</span>}
            </div>

            <div style={styles.formGroup} id="cotizacion-create-field-numProveedor">
              <label style={styles.formLabel}>N° Proveedor{form.cubrimientoId === CUBRIMIENTO_HOSPITALES_ID ? ' *' : ''}</label>
              <input style={{ ...styles.formInput, ...(error?.field === 'numProveedor' ? styles.inputError : {}) }} value={form.numProveedor} onChange={e => { setForm({ ...form, numProveedor: sanitizeCirugiaDirigido(e.target.value) }); setError(null); }} />
              {error?.field === 'numProveedor' && <span style={styles.errorText}>{error.message}</span>}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Tarifa</label>
              <span style={{ ...styles.formInput, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>
                {tarifaLabel || 'Se selecciona automaticamente al seleccionar el cubrimiento'}
              </span>
            </div>

            <div style={styles.formGroup} id="cotizacion-create-field-tiempoEntrega">
              <label style={styles.formLabel}>Tiempo de Entrega{form.cubrimientoId === CUBRIMIENTO_HOSPITALES_ID ? ' *' : ''}</label>
              <input style={{ ...styles.formInput, ...(error?.field === 'tiempoEntrega' ? styles.inputError : {}) }} value={form.tiempoEntrega} onChange={e => { setForm({ ...form, tiempoEntrega: sanitizeCirugiaDirigido(e.target.value) }); setError(null); }} />
              {error?.field === 'tiempoEntrega' && <span style={styles.errorText}>{error.message}</span>}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Observaciones</label>
              <input style={styles.formInput} value={form.observaciones} onChange={e => setForm({ ...form, observaciones: sanitizeCirugiaDirigido(e.target.value) })} />
            </div>

            <ListPicker
              label="Paquete"
              options={paquetes}
              valueId={form.paqueteId}
              valueLabel={form.paqueteLabel}
              onSelect={(id, label) => setForm({ ...form, paqueteId: id, paqueteLabel: label, nivel: id ? (form.nivel || NIVEL_OPTIONS[0]) : '' })}
              disabled={!tarifaId || (!form.paqueteId && stagedItems.length > 0)}
              disabledHint={!tarifaId ? 'Selecciona primero una tarifa' : 'No puedes agregar un paquete mientras haya consumos agregados'}
            />

            {form.paqueteId && (
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Nivel</label>
                <select
                  style={styles.formInput}
                  value={form.nivel}
                  onChange={e => setForm({ ...form, nivel: e.target.value })}
                >
                  {NIVEL_OPTIONS.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={styles.sectionDivider} />

            <div style={styles.formGroup}>
              <div style={styles.sectionHeader}>
                <span style={{ ...styles.sectionTitle, color: '#374151' }}>Consumos</span>
                <span style={styles.countBadge}>{stagedItems.length}</span>
              </div>

              {stagedItems.length > 0 && tarifaLabel && (
                <div style={styles.tarifaHint}>
                  El valor unitario de los consumos es referente a la tarifa <strong style={{ color: '#3f6510' }}>{tarifaLabel}</strong>.
                </div>
              )}

              {form.paqueteId && (
                <div style={styles.tarifaHint}>
                  {paqueteConsumosQuery.isFetching
                    ? 'Cargando consumos del paquete...'
                    : 'Estos consumos se cargaron según el paquete y nivel seleccionados. Si agregas un consumo manualmente, la cotización dejará de estar asociada al paquete.'}
                </div>
              )}

              {stagedItems.length === 0 ? (
                <div style={styles.emptySection}>No hay consumos</div>
              ) : (
                <div style={styles.consumosTableWrap}>
                  <table style={styles.consumosTable}>
                    <thead>
                      <tr>
                        {['Cant.', 'Producto', 'Valor Unit.', 'Valor', 'OBSERV.', ''].map((h, i) => (
                          <th key={i} style={styles.consumosTh}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stagedItems.map(it => (
                        <tr
                          key={it.localId}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelectedStagedItem(it)}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <td style={styles.consumosTd}>{it.cantidad}</td>
                          <td style={{ ...styles.consumosTd, ...styles.consumosTdTruncate }} title={it.productoLabel}>{it.productoLabel}</td>
                          <td style={styles.consumosTd}>{formatMoney(Number(it.valorUnitario))}</td>
                          <td style={{ ...styles.consumosTd, fontWeight: 700, color: '#3f6510' }}>{formatMoney(Number(it.valor))}</td>
                          <td style={{ ...styles.consumosTd, ...styles.consumosTdTruncate }} title={it.observaciones || undefined}>{it.observaciones || '-'}</td>
                          <td style={styles.consumosTd} onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              style={styles.rowDeleteBtn}
                              title="Eliminar"
                              onClick={() => { setStagedItems(prev => prev.filter(x => x.localId !== it.localId)); onNotify('Consumo eliminado'); }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {confirmAddConsumoConPaquete ? (
                <div style={styles.tarifaHint}>
                  Al agregar un consumo manualmente, la cotización ya no quedará asociada al paquete <strong style={{ color: '#3f6510' }}>{form.paqueteLabel}</strong> se quitará el paquete y el nivel, pero los consumos ya cargados se mantendrán. ¿Deseas continuar?
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                    <button
                      type="button"
                      className="btn-press header-btn-primary"
                      style={{ ...styles.pillBtnPrimary, justifyContent: 'center' as const }}
                      onClick={() => { setConfirmAddConsumoConPaquete(false); setShowAddItem(true); }}
                    >
                      Continuar
                    </button>
                    <button type="button" style={styles.cancelBtn} onClick={() => setConfirmAddConsumoConPaquete(false)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn-press header-btn-primary"
                    disabled={!tarifaId}
                    style={{ ...styles.pillBtnPrimary, marginTop: '0.75rem', justifyContent: 'center' as const, ...(!tarifaId ? styles.pickBtnDisabled : {}) }}
                    onClick={() => { if (form.paqueteId) setConfirmAddConsumoConPaquete(true); else setShowAddItem(true); }}
                  >
                    <Plus size={14} /> Agregar consumos
                  </button>
                  {!tarifaId && (
                    <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Debes tener seleccionada una tarifa para agregar consumos</span>
                  )}
                </>
              )}

              {showAddItem && (
                <AddStagedItemForm
                  tarifaId={tarifaId}
                  tarifaLabel={tarifaLabel}
                  onAdd={item => {
                    setStagedItems(prev => [...prev, item]);
                    if (form.paqueteId) setForm(prev => ({ ...prev, paqueteId: '', paqueteLabel: '', nivel: '' }));
                    onNotify('Consumo agregado');
                  }}
                  onDone={() => setShowAddItem(false)}
                />
              )}

              {selectedStagedItem && (
                <StagedItemDetailModal
                  item={selectedStagedItem}
                  tarifaId={tarifaId}
                  onClose={() => setSelectedStagedItem(null)}
                  onSave={updated => {
                    setStagedItems(prev => prev.map(x => (x.localId === updated.localId ? updated : x)));
                    setSelectedStagedItem(null);
                  }}
                  onDelete={() => { setStagedItems(prev => prev.filter(x => x.localId !== selectedStagedItem.localId)); onNotify('Consumo eliminado'); }}
                />
              )}
            </div>

            <div style={styles.sectionDivider} />

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Subtotal</label>
              <input
                style={{ ...styles.formInput, color: '#6b6b60', backgroundColor: '#f4f4ee', cursor: 'not-allowed' }}
                value={formatMoney(subtotal)}
                disabled
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>¿Tiene Descuento? *</label>
              <div style={styles.pickBtnGrid}>
                <button type="button" style={{ ...styles.pickBtn, ...(!form.tieneDcto ? styles.pickBtnActive : {}) }} onMouseDown={e => e.preventDefault()} onClick={e => { setForm({ ...form, tieneDcto: false }); e.currentTarget.blur(); }}>No</button>
                <button type="button" style={{ ...styles.pickBtn, ...(form.tieneDcto ? styles.pickBtnActive : {}) }} onMouseDown={e => e.preventDefault()} onClick={e => { setForm({ ...form, tieneDcto: true }); e.currentTarget.blur(); }}>Sí</button>
              </div>
            </div>

            {form.tieneDcto && (
              <>
                <div style={styles.formGroup} id="cotizacion-create-field-porcentajeDcto">
                  <label style={styles.formLabel}>Porcentaje de descuento *</label>
                  <input type="number" step="0.01" style={{ ...styles.formInput, ...(error?.field === 'porcentajeDcto' ? styles.inputError : {}) }} value={form.porcentajeDcto} onChange={e => { setForm({ ...form, porcentajeDcto: e.target.value }); setError(null); }} />
                  {error?.field === 'porcentajeDcto' && <span style={styles.errorText}>{error.message}</span>}
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Valor de descuento</label>
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
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => { setForm({ ...form, impuestos: opt }); setError(null); e.currentTarget.blur(); }}
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

function DetalleModal({ id, onClose, onNotify, onDeleted }: { id: string; onClose: () => void; onNotify: (message: string, variant?: 'check' | 'info') => void; onDeleted: () => void }) {
  const { isMobile } = useResponsiveStyles();
  const navigate = useNavigateWithLoading();
  const queryClient = useQueryClient();
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
      await generarPdfCotizacion(data, isMobile);
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
      const enviado = await enviarCotizacionPorWhatsapp(data);
      if (enviado) onNotify('Cotización enviada por WhatsApp');
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={styles.modalTitleIconBadge}>
              <MaterialIcon name="request_quote" size={20} color="#4d7a13" />
            </span>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.1rem' }}>
              <span style={styles.modalTitleLabel}>Cotización</span>
              <h2 style={styles.modalTitle}>{data?.numCotizacion || data?.id || ''}</h2>
            </div>
          </div>
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
              onNotify={onNotify}
            />
          ) : (
            <>
              <div style={styles.sectionHeader}>
                <span style={{ ...styles.sectionTitle, color: '#374151' }}>Información General</span>
              </div>
              <div style={styles.infoSectionBox}>
                <div style={styles.detalleGrid}>
                  <DetalleItem label="N° Cotización">{data.numCotizacion || data.id}</DetalleItem>
                  <DetalleItem label="Registrado Por">{data.usuario ?? '-'}</DetalleItem>
                  <DetalleItem label="Marca de Tiempo">{formatDateTime(data.marcaDeTiempo)}</DetalleItem>
                  <DetalleItem label="Fecha">{formatDate(data.fecha)}</DetalleItem>
                  <DetalleItem label="Dirigido a">{data.dirigidoA ?? '-'}</DetalleItem>
                  <DetalleItem label="Médico">{data.medico ?? '-'}</DetalleItem>
                  <DetalleItem label="Hospital">{data.hospital ?? '-'}</DetalleItem>
                  <DetalleItem label="Cirugía">{data.cirugia ?? '-'}</DetalleItem>
                  <DetalleItem label="Sede">{data.sede ?? '-'}</DetalleItem>
                </div>
              </div>

              <div style={styles.sectionDivider} />

              <div style={styles.sectionHeader}>
                <span style={{ ...styles.sectionTitle, color: '#374151' }}>Datos comerciales</span>
              </div>
              <div style={styles.infoSectionBox}>
                <div style={styles.detalleGrid}>
                  <DetalleItem label="Cubrimiento">{data.cubrimiento ?? '-'}</DetalleItem>
                  <DetalleItem label="Responsable Económico">{data.responsableEconomico ?? '-'}</DetalleItem>
                  <DetalleItem label="N° Proveedor">{data.numProveedor ?? '-'}</DetalleItem>
                  <DetalleItem label="Tarifa">{data.tarifa ?? '-'}</DetalleItem>
                  <DetalleItem label="Tiempo de Entrega">{data.tiempoEntrega ?? '-'}</DetalleItem>
                  <DetalleItem label="Empresa">{data.empresa ?? '-'}</DetalleItem>
                  <DetalleItem label="¿Tiene Descuento?">{data.tieneDcto ? 'Sí' : 'No'}</DetalleItem>
                  {data.tieneDcto && (
                    <>
                      <DetalleItem label="Porcentaje de descuento">{data.porcentajeDcto !== null ? `${data.porcentajeDcto}%` : '-'}</DetalleItem>
                      <DetalleItem label="Valor de descuento">{formatMoney(data.vrDcto)}</DetalleItem>
                      <DetalleItem label="V/R Dcto $">{formatMoney(data.vrDctoPesos)}</DetalleItem>
                    </>
                  )}
                  <DetalleItem label="Impuestos">{data.impuestos ?? '-'}</DetalleItem>
                  <DetalleItem label="Paquete">{data.paquete ?? '-'}</DetalleItem>
                  <DetalleItem label="Observaciones">{data.observaciones ?? '-'}</DetalleItem>
                  <DetalleItem label="Nota">{data.nota ?? '-'}</DetalleItem>
                </div>
              </div>

              <div style={styles.sectionDivider} />

              <div style={styles.sectionHeader}>
                <span style={{ ...styles.sectionTitle, color: '#374151' }}>Consumos</span>
                <span style={styles.countBadge}>{data.items.length}</span>
              </div>

              {data.items.length > 0 && data.tarifa && (
                <div style={styles.tarifaHint}>
                  El valor unitario de los consumos es referente a la tarifa <strong style={{ color: '#3f6510' }}>{data.tarifa}</strong>.
                </div>
              )}

              {data.items.length === 0 ? (
                <div style={styles.emptySection}>No hay consumos</div>
              ) : (
                <div style={styles.consumosTableWrap}>
                  <table style={styles.consumosTable}>
                    <thead>
                      <tr>
                        {['Cant.', 'Producto', 'Valor Unit.', 'Valor', 'OBSERV.'].map((h, i) => (
                          <th key={i} style={styles.consumosTh}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map(it => {
                        const producto = `${it.referencia ? `${it.referencia} / ` : ''}${it.descripcion ?? '-'}${it.sistema ? ` (${it.sistema})` : ''}`;
                        return (
                          <tr
                            key={it.id}
                            style={{ cursor: 'pointer' }}
                            onClick={() => setSelectedItem(it)}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                          >
                            <td style={styles.consumosTd}>{it.cantidad ?? '-'}</td>
                            <td style={{ ...styles.consumosTd, ...styles.consumosTdTruncate }} title={producto}>{producto}</td>
                            <td style={styles.consumosTd}>{formatMoney(it.valorUnitario)}</td>
                            <td style={{ ...styles.consumosTd, fontWeight: 700, color: '#3f6510' }}>{formatMoney(it.valor)}</td>
                            <td style={{ ...styles.consumosTd, ...styles.consumosTdTruncate }} title={it.observaciones ?? undefined}>{it.observaciones ?? '-'}</td>
                          </tr>
                        );
                      })}
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
                      onClick={() => navigate(`/operacion/remisiones/${r.id}`, '/operacion/remisiones/:id')}
                    >
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.8rem', fontWeight: 700, color: '#6b8c1f' }}>
                        {r.numRemision || r.id}
                      </span>
                      <span style={{ color: '#6b6b60', fontSize: '0.85rem' }}>{r.estado ?? '-'}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' as const : 'row' as const, justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.5rem' }}>
                <button className="btn-press header-btn-secondary" style={{ ...styles.pillBtn, ...(isMobile ? { justifyContent: 'center' as const, width: '100%' } : {}) }} onClick={handleEnviarWhatsapp} disabled={sendingWhatsapp}>
                  <i className="fa-brands fa-whatsapp" style={{ fontSize: 16, color: '#4d7a13' }} />
                  {sendingWhatsapp ? 'Enviando...' : 'Enviar por WhatsApp'}
                </button>
                <button className="btn-press header-btn-primary" style={{ ...styles.pillBtnPrimary, ...(isMobile ? { justifyContent: 'center' as const, width: '100%' } : {}) }} onClick={handleGenerarPdf} disabled={generatingPdf}>
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
          onSaved={() => onNotify('Consumo actualizado')}
          onDeleted={() => onNotify('Consumo eliminado')}
        />
      )}
    </div>
  );
}

export default function CotizacionesPage() {
  const { isMobile } = useResponsiveStyles();
  const navigate = useNavigateWithLoading();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<'check' | 'info'>('check');
  const tableWrapRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(tableWrapRef, [], 3);

  useEffect(() => {
    if (!(showCreateModal || selectedId)) return;
    // overflow:hidden solo en el body no basta en iOS Safari — el fondo se sigue pudiendo
    // deslizar con el dedo. Fijar la posición del body en el scroll actual sí lo bloquea ahí, y
    // se restaura la posición exacta al cerrar el modal.
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [showCreateModal, selectedId]);

  // Le da sombra a la tarjeta fija (título + toolbar) solo mientras está "pegada" arriba por el
  // scroll de la PÁGINA — mismo patrón que Remisiones / Solicitud de Programación. El colapso del
  // título/filtros en móvil también depende únicamente de este scroll (no del scroll interno de
  // tableWrap): desplazarse dentro de la lista de registros no debe afectar al apartado principal,
  // solo el scroll de la página completa (hacia arriba o abajo, fuera del contenedor de la lista).
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

  const query = { page, limit: 200, search: search || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined };

  const { data, isLoading } = useQuery({
    queryKey: ['cotizaciones', query],
    queryFn: () => cotizacionesService.findAll(query),
    placeholderData: keepPreviousData,
  });

  const items = data?.data ?? [];

  return (
    <>
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

        <div
          style={{
            ...styles.contentCard,
            // Con el título/filtros colapsados solo queda la barra buscadora adentro, pero el
            // padding del contenedor (pensado para cuando tenía todo el contenido) seguía siendo
            // el mismo — se veía un contenedor mucho más alto de lo necesario.
            ...(isMobile && isStuck ? {
              padding: '0.6rem 1.25rem',
              transition: `${styles.contentCard.transition}, padding 0.2s ease`,
            } : {}),
            // En móvil se deja la sombra siempre puesta, para separar visualmente la tarjeta de
            // la lista incluso antes de que la página empiece a desplazarse.
            ...(isStuck || isMobile ? styles.contentCardStuck : {}),
          }}
        >
          <div
            style={{
              ...styles.header,
              ...(isMobile ? {
                maxHeight: isStuck ? '0px' : '40px',
                opacity: isStuck ? 0 : 1,
                marginBottom: isStuck ? 0 : styles.header.marginBottom,
                overflow: 'hidden' as const,
                transition: 'max-height 0.2s ease, opacity 0.15s ease, margin-bottom 0.2s ease',
              } : {}),
            }}
          >
            {!isMobile && (
              <span style={styles.modalTitleIconBadge}>
                <MaterialIcon name="request_quote" size={20} color="#4d7a13" />
              </span>
            )}
            <h1 style={styles.title}>Cotizaciones</h1>
          </div>

          <div
            style={{
              ...styles.toolbar,
              // El filtro/botón y el contador colapsan a 0 de alto, pero como el buscador (flex:1,
              // minWidth:280px) no deja suficiente ancho para que quepan al lado, igual "envuelven"
              // a su propia línea del flex-wrap — y el gap entre esas líneas invisibles seguía
              // reservando espacio debajo del buscador.
              ...(isMobile && isStuck ? { gap: 0 } : {}),
            }}
          >
            <div style={styles.searchWrap}>
              <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                style={styles.searchInput}
                placeholder="Buscar por N° cotización, hospital, médico, usuario..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                ...(isMobile ? {
                  maxHeight: isStuck ? '0px' : '50px',
                  opacity: isStuck ? 0 : 1,
                  overflow: 'hidden' as const,
                  transition: 'max-height 0.2s ease, opacity 0.15s ease',
                } : {}),
              }}
            >
              <DateRangeFilter
                dateFrom={dateFrom}
                dateTo={dateTo}
                onChange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1); }}
              />

              <button
                className="btn-press header-btn-primary"
                style={{ ...styles.pillBtnPrimary, ...(isMobile ? { padding: '0.4rem 0.7rem', fontSize: '0.8125rem', whiteSpace: 'nowrap' as const } : {}) }}
                onClick={() => setShowCreateModal(true)}
              >
                <Plus size={16} />
                {isMobile ? (dateFrom || dateTo ? '' : 'Nueva') : 'Nueva cotización'}
              </button>
            </div>

            <span
              style={{
                ...styles.totalLabel,
                // Ya no se colapsa junto con el título/filtros: se queda visible debajo de la
                // barra buscadora incluso con la tarjeta colapsada. Como toolbar queda con gap:0
                // en ese estado (para no reservar espacio de las líneas invisibles del filtro y
                // el botón, que sí siguen colapsando), el espacio respecto al buscador se le da
                // directo con marginTop en vez de depender del gap del flex.
                ...(isMobile ? {
                  display: 'block' as const,
                  ...(isStuck ? { marginTop: '0.35rem' } : {}),
                } : {}),
              }}
            >
              {isLoading ? '...' : `${data?.total ?? 0} registros`}
            </span>
          </div>
        </div>

        <div
          ref={tableWrapRef}
          style={{
            ...styles.tableWrap,
            // Aprovecha el espacio que queda libre debajo de la paginación en móvil. El espaciado
            // con la tarjeta de arriba no depende de esto (es el marginBottom de contentCard) —
            // este maxHeight solo mueve el borde INFERIOR de la lista hacia abajo.
            ...(isMobile ? { maxHeight: 'calc(100vh - 250px)' } : {}),
          }}
        >
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
                  {['#', 'N° Cotización', 'Fecha', 'Usuario', 'Hospital', 'Médico', 'Cirugía', 'Sede', 'Total'].map((h, i) => (
                    <th key={i} style={{ ...styles.th, ...(i === 2 ? { paddingRight: '0.3rem' } : {}), ...(i === 3 ? { paddingLeft: '0.3rem' } : {}) }}>{h}</th>
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
          onNotify={(msg, variant) => { setToastMessage(msg); setToastVariant(variant ?? 'check'); }}
          onDeleted={() => { setToastMessage('Cotización eliminada'); setToastVariant('check'); }}
        />
      )}
      {showCreateModal && (
        <NuevaCotizacionModal
          onClose={() => setShowCreateModal(false)}
          onCreated={msg => { setShowCreateModal(false); setToastMessage(msg); setToastVariant('check'); }}
          onNotify={(msg, variant) => { setToastMessage(msg); setToastVariant(variant ?? 'check'); }}
        />
      )}
      <SuccessToast
        show={!!toastMessage}
        message={toastMessage ?? ''}
        onClose={() => setToastMessage(null)}
        icon={toastVariant === 'info' ? (
          <svg width="30" height="30" viewBox="0 0 52 52">
            <circle cx="26" cy="26" r="23" fill="none" stroke="currentColor" strokeWidth="3.5" />
            <line x1="26" y1="15" x2="26" y2="30" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
            <circle cx="26" cy="38" r="2.3" fill="currentColor" />
          </svg>
        ) : undefined}
      />
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: { padding: '0.05rem 1.5rem 1.5rem' },
  backLink: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.75rem', padding: '0.25rem 0.1rem', border: 'none', background: 'transparent', color: '#6b7280', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const, transition: 'color 0.15s ease' },
  contentCard: { backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '16px', padding: '1.25rem', marginBottom: '1.5rem', position: 'sticky' as const, top: '60px', zIndex: 10, boxShadow: '0 0 0 rgba(0,0,0,0)', transition: 'box-shadow 0.2s ease, border-color 0.2s ease, margin-bottom 0.2s ease' },
  contentCardStuck: { boxShadow: '0 8px 20px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' },
  header: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' },
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
  mobileCardFieldValue: { fontSize: '0.82rem', fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  empty: { textAlign: 'center' as const, padding: '3rem', color: '#9ca3af' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' },
  pageLabel: { fontSize: '0.875rem', fontWeight: 600, color: '#33342a' },
  pageBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.5rem 1rem', backgroundColor: '#e9f2d8', color: '#3f6510', border: '1px solid #dbe8c2', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '0.84375rem' },
  pageBtnDisabled: { backgroundColor: '#f4f4ee', borderColor: '#eeeee6', color: '#c7c7ba', cursor: 'not-allowed' as const },
  modalOverlay: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '2rem' },
  modalContent: { backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #eeeee6', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', position: 'sticky' as const, top: 0, zIndex: 1 },
  modalTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#16170f', margin: 0 },
  modalTitleLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  modalTitleIconBadge: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#4d7a13', flexShrink: 0 },
  closeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: 'none', backgroundColor: '#f4f4ee', borderRadius: '8px', cursor: 'pointer', color: '#6b6b60' },
  iconMenuBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: '1px solid #e5e7eb', borderRadius: '999px', cursor: 'pointer', color: '#33342a', flexShrink: 0, backgroundColor: 'transparent' },
  moreMenu: { position: 'absolute' as const, top: 'calc(100% + 8px)', right: 0, backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: '180px', overflow: 'hidden', zIndex: 200, padding: '0.35rem' },
  moreMenuItem: { display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.6rem 0.75rem', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.84375rem', color: '#33342a', fontWeight: 600, textAlign: 'left' as const },
  moreMenuItemDanger: { color: '#c65b3f' },
  moreMenuDivider: { height: '1px', backgroundColor: '#eeeee6', margin: '0.3rem 0' },
  modalBody: { padding: '1.5rem' },
  detalleGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '1.25rem 1.5rem' },
  infoSectionBox: { backgroundColor: '#f9fafb', border: '1px solid #eeeee6', borderRadius: '10px', padding: '1.25rem' },
  detalleItem: { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem', minWidth: 0 },
  detalleLabel: { fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  detalleValue: { fontSize: '0.9375rem', fontWeight: 400, color: '#16170f', lineHeight: 1.4, wordBreak: 'break-word' as const },
  sectionDivider: { height: '1px', backgroundColor: '#eeeee6', margin: '1.5rem 0' },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' },
  sectionTitle: { fontSize: '0.95rem', fontWeight: 700, color: '#16170f' },
  countBadge: { backgroundColor: '#e5e7eb', color: '#6b7280', fontSize: '0.72rem', fontWeight: 700, minWidth: '1.4rem', height: '1.4rem', padding: '0 0.4rem', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  emptySection: { textAlign: 'center' as const, padding: '1.5rem', color: '#9ca3af', fontSize: '0.85rem', backgroundColor: '#f9fafb', borderRadius: '10px' },
  remisionRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.9rem', backgroundColor: '#f9fafb', border: '1px solid #eeeee6', borderRadius: '10px', cursor: 'pointer' },
  addItemForm: { display: 'flex', flexDirection: 'column' as const, gap: '0.9rem', backgroundColor: '#f9fafb', border: '1px solid #eeeee6', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' },
  formGroup: { display: 'flex', flexDirection: 'column' as const, gap: '0.4rem' },
  formRow3: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.75rem' },
  tarifaHint: { padding: '0.65rem 0.9rem', backgroundColor: '#f4f4ee', borderRadius: '10px', fontSize: '0.82rem', color: '#6b6b60', lineHeight: 1.4, marginBottom: '0.9rem' },
  productoSistemaTag: { fontSize: '0.7rem', fontWeight: 600, color: '#9ca3af', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  productoClaveTag: { color: '#3f6510' },
  consumosTableWrap: { overflow: 'auto' as const, maxHeight: '320px', borderRadius: '10px', border: '1px solid #eeeee6' },
  consumosTable: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.72rem' },
  consumosTh: { padding: '0.45rem 0.6rem', textAlign: 'left' as const, fontWeight: 700, color: '#9ca3af', fontSize: '0.6rem', textTransform: 'uppercase' as const, letterSpacing: '0.03em', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' as const, position: 'sticky' as const, top: 0 },
  consumosTd: { padding: '0.45rem 0.6rem', borderBottom: '1px solid #f3f4f0', color: '#33342a', whiteSpace: 'nowrap' as const },
  consumosTdTruncate: { overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, maxWidth: '130px' },
  formColStack: { display: 'flex', flexDirection: 'column' as const, gap: '0.9rem' },
  formLabel: { fontSize: '0.75rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  formInput: { padding: '0.75rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', backgroundColor: '#fff' },
  medicoTag: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', borderRadius: '999px', backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510', fontSize: '0.8rem', fontWeight: 600, width: 'fit-content' as const },
  medicoDropdown: { position: 'absolute' as const, top: 'calc(100% + 0.35rem)', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto' as const, zIndex: 20 },
  medicoDropdownItem: { padding: '0.6rem 0.75rem', fontSize: '0.85rem', fontWeight: 600, color: '#333', cursor: 'pointer' },
  errorText: { fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 },
  inputError: { border: '1.5px solid #dc2626' },
  formActions: { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' },
  cancelBtn: { padding: '0.5rem 1.5rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: '#333' },
  saveBtn: { padding: '0.5rem 1.5rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
  saveBtnDisabled: { backgroundColor: '#e5e7eb', color: '#9ca3af', cursor: 'not-allowed' as const },
  deleteBtn: { padding: '0.5rem 1.5rem', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
  iconBtnDanger: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', borderRadius: '8px', cursor: 'pointer', color: '#dc2626' },
  rowDeleteBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', border: 'none', backgroundColor: 'transparent', borderRadius: '6px', cursor: 'pointer', color: '#dc2626' },
  iconBtnEdit: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0 0.75rem', height: '34px', border: 'none', backgroundColor: '#6b8c1f', borderRadius: '8px', cursor: 'pointer', color: '#fff', fontWeight: 600, fontSize: '0.82rem' },
  confirmBox: { display: 'flex', flexDirection: 'column' as const, gap: '1rem', padding: '1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px' },
  pickBtnGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' },
  pickBtn: { padding: '0.5rem 0.9rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', color: '#6b7280', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const },
  pickBtnActive: { backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510' },
  pickBtnDisabled: { backgroundColor: '#f4f4ee', border: '1px solid #eeeee6', color: '#c4c4bc', cursor: 'not-allowed' as const },
  // Mismo formato de "pill" que los botones de acción del header en ProgramacionDetailPage/RemisionDetailPage
  // (clases .header-btn-secondary / .header-btn-primary / .header-btn-danger en index.css aportan el fondo y el hover).
  pillBtn: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #e5e7eb', borderRadius: '12px', color: '#33342a', fontWeight: 600, fontSize: '0.84375rem', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  pillBtnPrimary: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #dbe8c2', borderRadius: '12px', color: '#3f6510', fontWeight: 600, fontSize: '0.84375rem', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  pillBtnDanger: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #fecaca', borderRadius: '12px', color: '#dc2626', fontWeight: 600, fontSize: '0.84375rem', cursor: 'pointer', whiteSpace: 'nowrap' as const },
};
