import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader, X, ChevronDown, Receipt, CheckCircle, Circle, Plus, AlertCircle } from 'lucide-react';
import jsPDF from 'jspdf';
// Import solo por su efecto secundario: registra doc.autoTable(...) en el prototipo de jsPDF.
// (el default export del paquete no interopera bien con el bundling de Vite, ver doc.autoTable abajo)
import 'jspdf-autotable';
import logoUrl from '../../../assets/logo.png';
import logoCabcari from '../../../assets/logo-cabcari.jpg';
import logoNeurotec from '../../../assets/logo-neurotec.jpg';
import Layout from '../../../components/layout/Layout';
import PdfIcon from '../../../components/icons/PdfIcon';
import { MaterialIcon } from '../../../components/icons/MaterialIcon';
import SuccessToast from '../../../components/SuccessToast';
import {
  remisionesService,
  ESTADOS_REMISION,
  CATEGORIAS_COMISION,
  TIPOS_COMISION,
  SELECCIONE_TIPO_COMISION,
  IMPUESTOS_REMISION,
  type RemisionDetail,
  type RemisionDetailTecnico,
  type TecnicoOption,
  type CubrimientoOption,
  type TarifaOption,
} from '../../../services/remisiones.service';
import { useResponsiveStyles } from '../../../hooks/useResponsiveStyles';
import { useSmoothWheelScroll } from '../../../hooks/useSmoothWheelScroll';
import { esSuperAdmin } from '../../../lib/auth.utils';

const getTecnicoInitials = (nombreCompleto: string): string => {
  const words = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '-';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 2][0]).toUpperCase();
};

function AnimatedMoney({ value, start, duration = 500 }: { value: unknown; start: boolean; duration?: number }) {
  const target = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!start || Number.isNaN(target)) return;
    const startTime = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(target * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, target, duration]);

  if (value === null || value === undefined || Number.isNaN(target)) return <>-</>;
  return <>{`$${display.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</>;
}

const formatMoney = (value: any): string => {
  if (value === null || value === undefined) return '-';
  const num = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isNaN(num) ? '-' : `$${num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    const date  = new Date(dateString);
    const year  = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day   = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const mins  = String(date.getUTCMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins}`;
  } catch {
    return dateString;
  }
};

const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const formatDateTimeLong = (dateString: string | null): string => {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    const day = date.getUTCDate();
    const month = MESES_ES[date.getUTCMonth()];
    const year = date.getUTCFullYear();
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const mins = String(date.getUTCMinutes()).padStart(2, '0');
    const secs = String(date.getUTCSeconds()).padStart(2, '0');
    return `${day} de ${month} de ${year} a las ${hours}:${mins}:${secs}`;
  } catch {
    return dateString;
  }
};

// ─── Generación de PDF de Remisión ──────────────────────────────────────────
// Mismo patrón de jsPDF + jspdf-autotable establecido en CotizacionesPage.tsx.

type AutoTableDoc = jsPDF & { autoTable: (options: Record<string, unknown>) => void; lastAutoTable: { finalY: number } };

// Datos de respaldo: se usan solo si la remisión no tiene empresa vinculada o a esa
// empresa aún no se le cargaron sus datos fiscales (celular/oficina/correo/rfc).
const EMPRESA_INFO_DEFAULT = {
  nombre: 'Tecnología Spine S. de R.L de C.V.',
  rfc: 'TSP191206KT8',
  celular: '999 386 7505',
  telefono: '999 666 3454',
  email: 'administracion@tecnologiaspine.com',
};

function getEmpresaInfo(data: RemisionDetail) {
  const df = data.empresa?.datosFiscales;
  return {
    nombre: df?.razonSocial || data.empresa?.nombreCompleto || EMPRESA_INFO_DEFAULT.nombre,
    rfc: df?.rfc || EMPRESA_INFO_DEFAULT.rfc,
    celular: df?.celular || EMPRESA_INFO_DEFAULT.celular,
    telefono: df?.oficina || EMPRESA_INFO_DEFAULT.telefono,
    email: df?.correo || EMPRESA_INFO_DEFAULT.email,
  };
}

// Cada empresa tiene su propio diseño de PDF (colores tomados de su logo) — se detecta
// por el nombre del Tercero vinculado a la remisión.
type EmpresaKey = 'tecnologia-spine' | 'cabcari' | 'guillermo';

function detectEmpresaKey(nombreEmpresa: string | null | undefined): EmpresaKey {
  const key = (nombreEmpresa ?? '').toLowerCase();
  if (key.includes('cabcari')) return 'cabcari';
  if (key.includes('guillermo')) return 'guillermo';
  return 'tecnologia-spine';
}

const EMPRESA_LOGOS: Record<EmpresaKey, { url: string; format: 'PNG' | 'JPEG' }> = {
  'tecnologia-spine': { url: logoUrl, format: 'PNG' },
  'cabcari': { url: logoCabcari, format: 'JPEG' },
  'guillermo': { url: logoNeurotec, format: 'JPEG' },
};

function getEmpresaLogo(nombreEmpresa: string | null | undefined): { url: string; format: 'PNG' | 'JPEG' } {
  return EMPRESA_LOGOS[detectEmpresaKey(nombreEmpresa)];
}

const PDF_OLIVE: [number, number, number] = [77, 122, 19];
const PDF_NAVY: [number, number, number] = [26, 42, 74];
const PDF_BLUE: [number, number, number] = [29, 78, 216];
const PDF_GRAY_BOX: [number, number, number] = [244, 244, 240];

// Paleta Cabcari (tonos azules del logo)
const CABCARI_BLUE_DARK: [number, number, number] = [22, 51, 89];
const CABCARI_BLUE: [number, number, number] = [37, 99, 235];
const CABCARI_BLUE_LIGHT: [number, number, number] = [222, 234, 253];

// Paleta Neuro Tec Spine / Guillermo Alfredo Gualdrón Bateca (navy monocromático, sin verde)
const NEUROTEC_NAVY: [number, number, number] = [15, 45, 74];
const NEUROTEC_GRAY_LINE: [number, number, number] = [220, 220, 214];

function loadPdfImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar el logo'));
    img.src = url;
  });
}

// Dibuja "Etiqueta: valor" (etiqueta en negrita) con ajuste de línea; devuelve el Y final.
// dryRun=true solo mide (para calcular el alto de la caja gris antes de rellenarla).
function drawPdfField(doc: AutoTableDoc, label: string, value: string, x: number, maxWidth: number, y: number, dryRun = false, labelColor: [number, number, number] = PDF_NAVY): number {
  const lineHeight = 3;
  const labelText = `${label}: `;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  const labelWidth = doc.getTextWidth(labelText);
  doc.setFont('helvetica', 'normal');
  const lines: string[] = doc.splitTextToSize(value || '-', Math.max(maxWidth - labelWidth, 20));

  if (!dryRun) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...labelColor);
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

// Dibuja "Etiqueta: valor" en una sola línea, midiendo el ancho de la etiqueta con la
// MISMA fuente (negrita) con la que se dibuja — medirlo ya en fuente normal la subestima
// (negrita es más ancha) y el valor queda pegado a la etiqueta sin espacio visible.
function drawLabelValue(doc: AutoTableDoc, label: string, value: string, x: number, y: number, withColon = true) {
  const labelText = withColon ? `${label}: ` : `${label} `;
  doc.setFont('helvetica', 'bold');
  const labelWidth = doc.getTextWidth(labelText);
  doc.text(labelText, x, y);
  doc.setFont('helvetica', 'normal');
  doc.text(value, x + labelWidth, y);
}

async function buildRemisionPdfTecnologiaSpine(data: RemisionDetail): Promise<AutoTableDoc> {
  const empresaInfo = getEmpresaInfo(data);
  const empresaLogo = getEmpresaLogo(data.empresa?.nombreCompleto);

  const doc = new jsPDF() as AutoTableDoc;
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const rightX = pageWidth - marginX;

  doc.setFontSize(6.5);
  doc.setTextColor(30, 30, 30);
  drawLabelValue(doc, 'Nombre', 'Remisión', marginX, 10.5);
  drawLabelValue(doc, 'Código', 'RE-TSOPE-01', marginX, 13.8);

  try {
    const logoImg = await loadPdfImage(empresaLogo.url);
    const logoWidth = 42;
    const logoHeight = logoWidth * (logoImg.naturalHeight / logoImg.naturalWidth);
    doc.addImage(logoImg, empresaLogo.format, rightX - logoWidth, 9, logoWidth, logoHeight);
  } catch {
    // Si el logo no carga (ej. bloqueado por el navegador), se continúa sin él.
  }

  // Caja "Remisión" / "Fecha de Cirugía" (columna izquierda)
  const badgeX = marginX;
  const badgeWidth = 40;
  let badgeY = 19;
  const drawBadge = (label: string, value: string) => {
    doc.setFillColor(...PDF_OLIVE);
    doc.rect(badgeX, badgeY, badgeWidth, 4, 'F');
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(label, badgeX + 2, badgeY + 2.9);
    badgeY += 4;
    doc.setDrawColor(228, 228, 220);
    doc.setFillColor(255, 255, 255);
    doc.rect(badgeX, badgeY, badgeWidth, 5.5, 'FD');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PDF_BLUE);
    doc.text(value, badgeX + badgeWidth / 2, badgeY + 3.8, { align: 'center' });
    badgeY += 5.5 + 1.5;
  };
  drawBadge('Remisión:', data.numRemision || data.id);
  drawBadge('Fecha de Cirugía:', formatDate(data.programacion?.fechaQx ?? null));

  // Información de la empresa (columna central)
  const infoX = marginX + badgeWidth + 8;
  let infoY = 20;
  doc.setFontSize(6.5);
  const drawInfoLine = (label: string, value: string, withColon = true) => {
    doc.setTextColor(...PDF_NAVY);
    drawLabelValue(doc, label, value, infoX, infoY, withColon);
    infoY += 3.3;
  };
  drawInfoLine('Razón Social', empresaInfo.nombre);
  drawInfoLine('RFC', empresaInfo.rfc);
  drawInfoLine('Cel.', empresaInfo.celular, false);
  drawInfoLine('Off.', empresaInfo.telefono, false);
  drawInfoLine('Email', empresaInfo.email);

  let y = Math.max(badgeY, infoY) + 3.5;

  // Caja gris de datos generales (2 columnas): Paciente/Doctor, Anestesiólogo/Cirugía,
  // Hospital/Cubrimiento, y Técnicos a lo ancho completo.
  const boxStartY = y;
  const colWidth = (rightX - marginX) / 2;
  const innerPad = 2;
  const rowGap = 2;

  const doctorNombres = (data.programacion?.medicos ?? []).map(m => m.medico.nombreCompleto).join(', ') || '-';
  const tecnicosText = data.tecnicos.map(t => t.tecnico?.nombreCompleto).filter(Boolean).join(' , ') || '-';

  const measureAll = (dryRun: boolean, startRowY: number) => {
    let rowY = startRowY;
    const b1 = drawPdfField(doc, 'Paciente', data.paciente ?? '-', marginX + innerPad, colWidth - innerPad * 2, rowY, dryRun);
    const b2 = drawPdfField(doc, 'Doctor', doctorNombres, marginX + colWidth + innerPad, colWidth - innerPad * 2, rowY, dryRun);
    rowY = Math.max(b1, b2) + rowGap;

    const b3 = drawPdfField(doc, 'Anestesiólogo', data.anestesiologo ?? '-', marginX + innerPad, colWidth - innerPad * 2, rowY, dryRun);
    const b4 = drawPdfField(doc, 'Cirugía', data.cirugiaRealizada ?? '-', marginX + colWidth + innerPad, colWidth - innerPad * 2, rowY, dryRun);
    rowY = Math.max(b3, b4) + rowGap;

    const b5 = drawPdfField(doc, 'Hospital', data.programacion?.hospital?.nombre ?? '-', marginX + innerPad, colWidth - innerPad * 2, rowY, dryRun);
    const b6 = drawPdfField(doc, 'Cubrimiento', data.cubrimiento?.nombre ?? '-', marginX + colWidth + innerPad, colWidth - innerPad * 2, rowY, dryRun);
    rowY = Math.max(b5, b6) + rowGap;

    const b7 = drawPdfField(doc, 'Técnicos', tecnicosText, marginX + innerPad, rightX - marginX - innerPad * 2, rowY, dryRun);
    return b7 + innerPad;
  };

  const boxEndY = measureAll(true, boxStartY + 4);
  doc.setFillColor(...PDF_GRAY_BOX);
  doc.setDrawColor(228, 228, 220);
  doc.roundedRect(marginX, boxStartY, rightX - marginX, boxEndY - boxStartY, 2, 2, 'FD');
  measureAll(false, boxStartY + 4);

  y = boxEndY + 5;

  doc.autoTable({
    startY: y,
    head: [['Cant', 'Referencia', 'Descripción', 'V/R Unitario', 'Importe']],
    body: data.consumos.map(it => [
      String(it.cantidad ?? '-'),
      it.productoReferencia ?? '-',
      it.productoNombre ?? '-',
      formatMoney(it.valorUnitario),
      formatMoney(it.valor),
    ]),
    theme: 'grid',
    headStyles: { fillColor: PDF_OLIVE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    styles: { fontSize: 6.5, cellPadding: 1.4, textColor: [40, 40, 40], lineColor: [210, 210, 203], lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 30 },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
    },
    margin: { left: marginX, right: marginX },
  });

  const afterItemsY = doc.lastAutoTable.finalY + 5;

  // Caja izquierda: Observaciones + Recibí de conformidad
  const leftBoxWidth = 110;
  const obsColWidth = leftBoxWidth * 0.62;
  const bottomBoxHeight = 20;

  doc.setDrawColor(222, 222, 214);
  doc.setLineWidth(0.2);
  doc.rect(marginX, afterItemsY, leftBoxWidth, bottomBoxHeight, 'S');
  doc.line(marginX + obsColWidth, afterItemsY, marginX + obsColWidth, afterItemsY + bottomBoxHeight);

  // La caja de Observaciones queda en blanco (para anotación manual), igual que en el
  // PDF del sistema anterior — programacion.observaciones no es la fuente correcta aquí
  // (puede traer valores de otra naturaleza, ej. "Aseguradora" del cubrimiento).
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PDF_NAVY);
  doc.text('Observaciones:', marginX + 2.5, afterItemsY + 4.5);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PDF_NAVY);
  doc.text('Recibí de conformidad', marginX + obsColWidth + 2.5, afterItemsY + 4.5);

  // Caja derecha: totales
  const totalsX = marginX + leftBoxWidth + 8;
  const totalsWidth = rightX - totalsX;
  const totalsRows: [string, string][] = [
    ['Subtotal', formatMoney(data.subtotal)],
    ['Dcto %', formatMoney(data.descuentos)],
    ['Total Antes Impuesto', formatMoney(data.totalAntesImp)],
    ['IVA', formatMoney(data.iva)],
    ['Retención', formatMoney(data.retencion)],
    ['Total a pagar', formatMoney(data.total)],
  ];

  doc.autoTable({
    startY: afterItemsY,
    theme: 'plain',
    body: totalsRows,
    styles: { fontSize: 6.5, cellPadding: 1.3, lineColor: [222, 222, 214], lineWidth: { bottom: 0.2 } },
    columnStyles: {
      0: { cellWidth: totalsWidth * 0.6, fontStyle: 'bold' },
      1: { cellWidth: totalsWidth * 0.4, halign: 'right' },
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
  doc.setDrawColor(222, 222, 214);
  doc.setLineWidth(0.2);
  doc.rect(totalsX, afterItemsY, totalsWidth, doc.lastAutoTable.finalY - afterItemsY, 'S');

  let y2 = Math.max(afterItemsY + bottomBoxHeight, doc.lastAutoTable.finalY) + 7;

  // Texto de pagaré
  doc.setFontSize(6.3);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(60, 60, 55);
  const pagareText = `Por el presente Pagaré reconozco deber y me obligo a pagar incondicionalmente a la orden de ${empresaInfo.nombre} en , el día ${formatDate(data.programacion?.fechaQx ?? null)} la cantidad de ${formatMoney(data.total)} valor de la mercancía que he recibido a mi entera satisfacción. Este pagaré es mercantil y está regido por la ley general de títulos y operaciones de crédito en sus artículos 170, 171, 172, 173, 174 y artículos correlativos por no ser pagaré domiciliado.`;
  const pagareLines: string[] = doc.splitTextToSize(pagareText, rightX - marginX);
  doc.text(pagareLines, marginX, y2);
  y2 += pagareLines.length * 2.7 + 6;

  // Pie: generado por / fecha de creación
  doc.setFontSize(6.5);
  doc.setTextColor(30, 30, 30);
  drawLabelValue(doc, 'Generado por', data.usuario?.nombreCompleto ?? '-', marginX, y2);
  y2 += 4;
  drawLabelValue(doc, 'Fecha de Creación', formatDateTimeLong(data.creadoEn), marginX, y2);

  return doc;
}

// ─── Diseño Cabcari: banda superior de color con la info de la empresa integrada,
// y el N° de Remisión / Fecha de Cirugía como dos "pills" lado a lado debajo. ────────
async function buildRemisionPdfCabcari(data: RemisionDetail): Promise<AutoTableDoc> {
  const empresaInfo = getEmpresaInfo(data);
  const empresaLogo = getEmpresaLogo(data.empresa?.nombreCompleto);

  const doc = new jsPDF() as AutoTableDoc;
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const rightX = pageWidth - marginX;

  let logoBottom = 9;
  try {
    const logoImg = await loadPdfImage(empresaLogo.url);
    const logoWidth = 42;
    const logoHeight = logoWidth * (logoImg.naturalHeight / logoImg.naturalWidth);
    doc.addImage(logoImg, empresaLogo.format, marginX, 9, logoWidth, logoHeight);
    logoBottom = 9 + logoHeight;
  } catch {
    // Si el logo no carga, se continúa sin él.
  }

  // Datos (Nombre/Código/Razón Social/RFC/Cel/Off/Email) englobados en una caja con
  // borde azul, anclada al extremo derecho (con espacio en blanco entre ella y el logo)
  // — mismo estilo que la caja de Paciente/Doctor de abajo.
  const infoBoxWidth = 45;
  const infoBoxX = rightX - infoBoxWidth;
  const infoInnerPad = 3;

  const measureInfoBox = (dryRun: boolean, startY: number) => {
    let rowY = startY;
    rowY = drawPdfField(doc, 'Nombre', 'Remisión', infoBoxX + infoInnerPad, infoBoxWidth - infoInnerPad * 2, rowY, dryRun, CABCARI_BLUE_DARK);
    rowY = drawPdfField(doc, 'Código', 'RE-TSOPE-01', infoBoxX + infoInnerPad, infoBoxWidth - infoInnerPad * 2, rowY, dryRun, CABCARI_BLUE_DARK);
    rowY = drawPdfField(doc, 'Razón Social', empresaInfo.nombre, infoBoxX + infoInnerPad, infoBoxWidth - infoInnerPad * 2, rowY, dryRun, CABCARI_BLUE_DARK);
    rowY = drawPdfField(doc, 'RFC', empresaInfo.rfc, infoBoxX + infoInnerPad, infoBoxWidth - infoInnerPad * 2, rowY, dryRun, CABCARI_BLUE_DARK);
    rowY = drawPdfField(doc, 'Cel.', empresaInfo.celular, infoBoxX + infoInnerPad, infoBoxWidth - infoInnerPad * 2, rowY, dryRun, CABCARI_BLUE_DARK);
    rowY = drawPdfField(doc, 'Off.', empresaInfo.telefono, infoBoxX + infoInnerPad, infoBoxWidth - infoInnerPad * 2, rowY, dryRun, CABCARI_BLUE_DARK);
    rowY = drawPdfField(doc, 'Email', empresaInfo.email, infoBoxX + infoInnerPad, infoBoxWidth - infoInnerPad * 2, rowY, dryRun, CABCARI_BLUE_DARK);
    return rowY + infoInnerPad;
  };

  const infoBoxStartY = 9;
  const infoBoxEndY = measureInfoBox(true, infoBoxStartY + 4);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...CABCARI_BLUE);
  doc.setLineWidth(0.3);
  doc.roundedRect(infoBoxX, infoBoxStartY, infoBoxWidth, infoBoxEndY - infoBoxStartY, 2, 2, 'FD');
  measureInfoBox(false, infoBoxStartY + 4);

  let y = Math.max(logoBottom, infoBoxEndY) + 4;
  doc.setDrawColor(...CABCARI_BLUE);
  doc.setLineWidth(0.6);
  doc.line(marginX, y, rightX, y);
  y += 5;

  // Pills lado a lado: N° de Remisión / Fecha de Cirugía
  const pillGap = 5;
  const pillWidth = (rightX - marginX - pillGap) / 2;
  const pillHeight = 11;
  const drawPill = (x: number, label: string, value: string) => {
    doc.setDrawColor(...CABCARI_BLUE);
    doc.setLineWidth(0.3);
    doc.setFillColor(...CABCARI_BLUE_LIGHT);
    doc.roundedRect(x, y, pillWidth, pillHeight, 2, 2, 'FD');
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...CABCARI_BLUE_DARK);
    doc.text(label.toUpperCase(), x + 4, y + 4.2);
    doc.setFontSize(9);
    doc.setTextColor(...CABCARI_BLUE);
    doc.text(value, x + 4, y + 8.8);
  };
  drawPill(marginX, 'Remisión', data.numRemision || data.id);
  drawPill(marginX + pillWidth + pillGap, 'Fecha de Cirugía', formatDate(data.programacion?.fechaQx ?? null));
  y += pillHeight + 6;

  // Caja de datos generales (blanca, borde azul) — mismos campos que el resto de diseños
  const boxStartY = y;
  const colWidth = (rightX - marginX) / 2;
  const innerPad = 2;
  const rowGap = 2;

  const doctorNombres = (data.programacion?.medicos ?? []).map(m => m.medico.nombreCompleto).join(', ') || '-';
  const tecnicosText = data.tecnicos.map(t => t.tecnico?.nombreCompleto).filter(Boolean).join(' , ') || '-';

  const measureAll = (dryRun: boolean, startRowY: number) => {
    let rowY = startRowY;
    const b1 = drawPdfField(doc, 'Paciente', data.paciente ?? '-', marginX + innerPad, colWidth - innerPad * 2, rowY, dryRun, CABCARI_BLUE_DARK);
    const b2 = drawPdfField(doc, 'Doctor', doctorNombres, marginX + colWidth + innerPad, colWidth - innerPad * 2, rowY, dryRun, CABCARI_BLUE_DARK);
    rowY = Math.max(b1, b2) + rowGap;

    const b3 = drawPdfField(doc, 'Anestesiólogo', data.anestesiologo ?? '-', marginX + innerPad, colWidth - innerPad * 2, rowY, dryRun, CABCARI_BLUE_DARK);
    const b4 = drawPdfField(doc, 'Cirugía', data.cirugiaRealizada ?? '-', marginX + colWidth + innerPad, colWidth - innerPad * 2, rowY, dryRun, CABCARI_BLUE_DARK);
    rowY = Math.max(b3, b4) + rowGap;

    const b5 = drawPdfField(doc, 'Hospital', data.programacion?.hospital?.nombre ?? '-', marginX + innerPad, colWidth - innerPad * 2, rowY, dryRun, CABCARI_BLUE_DARK);
    const b6 = drawPdfField(doc, 'Cubrimiento', data.cubrimiento?.nombre ?? '-', marginX + colWidth + innerPad, colWidth - innerPad * 2, rowY, dryRun, CABCARI_BLUE_DARK);
    rowY = Math.max(b5, b6) + rowGap;

    const b7 = drawPdfField(doc, 'Técnicos', tecnicosText, marginX + innerPad, rightX - marginX - innerPad * 2, rowY, dryRun, CABCARI_BLUE_DARK);
    return b7 + innerPad;
  };

  const boxEndY = measureAll(true, boxStartY + 4);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...CABCARI_BLUE);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, boxStartY, rightX - marginX, boxEndY - boxStartY, 2, 2, 'FD');
  measureAll(false, boxStartY + 4);

  y = boxEndY + 5;

  doc.autoTable({
    startY: y,
    head: [['Cant', 'Referencia', 'Descripción', 'V/R Unitario', 'Importe']],
    body: data.consumos.map(it => [
      String(it.cantidad ?? '-'),
      it.productoReferencia ?? '-',
      it.productoNombre ?? '-',
      formatMoney(it.valorUnitario),
      formatMoney(it.valor),
    ]),
    theme: 'grid',
    headStyles: { fillColor: CABCARI_BLUE_DARK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    styles: { fontSize: 6.5, cellPadding: 1.4, textColor: [40, 40, 40], fillColor: [255, 255, 255], lineColor: [205, 219, 240], lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 30 },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
    },
    margin: { left: marginX, right: marginX },
  });

  const afterItemsY = doc.lastAutoTable.finalY + 5;

  const leftBoxWidth = 110;
  const obsColWidth = leftBoxWidth * 0.62;
  const bottomBoxHeight = 20;

  doc.setDrawColor(...CABCARI_BLUE);
  doc.setLineWidth(0.3);
  doc.rect(marginX, afterItemsY, leftBoxWidth, bottomBoxHeight, 'S');
  doc.line(marginX + obsColWidth, afterItemsY, marginX + obsColWidth, afterItemsY + bottomBoxHeight);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CABCARI_BLUE_DARK);
  doc.text('Observaciones:', marginX + 2.5, afterItemsY + 4.5);
  doc.text('Recibí de conformidad', marginX + obsColWidth + 2.5, afterItemsY + 4.5);

  const totalsX = marginX + leftBoxWidth + 8;
  const totalsWidth = rightX - totalsX;
  const totalsRows: [string, string][] = [
    ['Subtotal', formatMoney(data.subtotal)],
    ['Dcto %', formatMoney(data.descuentos)],
    ['Total Antes Impuesto', formatMoney(data.totalAntesImp)],
    ['IVA', formatMoney(data.iva)],
    ['Retención', formatMoney(data.retencion)],
    ['Total a pagar', formatMoney(data.total)],
  ];

  doc.autoTable({
    startY: afterItemsY,
    theme: 'plain',
    body: totalsRows,
    styles: { fontSize: 6.5, cellPadding: 1.3, lineColor: [205, 219, 240], lineWidth: { bottom: 0.2 } },
    columnStyles: {
      0: { cellWidth: totalsWidth * 0.6, fontStyle: 'bold' },
      1: { cellWidth: totalsWidth * 0.4, halign: 'right' },
    },
    margin: { left: totalsX, right: marginX },
    didParseCell: (hookData: { row: { index: number }; cell: { styles: Record<string, unknown> } }) => {
      if (hookData.row.index === totalsRows.length - 1) {
        hookData.cell.styles.fillColor = CABCARI_BLUE_DARK;
        hookData.cell.styles.textColor = [255, 255, 255];
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.lineWidth = 0;
      }
    },
  });
  doc.setDrawColor(...CABCARI_BLUE);
  doc.setLineWidth(0.3);
  doc.rect(totalsX, afterItemsY, totalsWidth, doc.lastAutoTable.finalY - afterItemsY, 'S');

  let y2 = Math.max(afterItemsY + bottomBoxHeight, doc.lastAutoTable.finalY) + 7;

  doc.setFontSize(6.3);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(60, 60, 55);
  const pagareText = `Por el presente Pagaré reconozco deber y me obligo a pagar incondicionalmente a la orden de ${empresaInfo.nombre} en , el día ${formatDate(data.programacion?.fechaQx ?? null)} la cantidad de ${formatMoney(data.total)} valor de la mercancía que he recibido a mi entera satisfacción. Este pagaré es mercantil y está regido por la ley general de títulos y operaciones de crédito en sus artículos 170, 171, 172, 173, 174 y artículos correlativos por no ser pagaré domiciliado.`;
  const pagareLines: string[] = doc.splitTextToSize(pagareText, rightX - marginX);
  doc.text(pagareLines, marginX, y2);
  y2 += pagareLines.length * 2.7 + 6;

  doc.setFontSize(6.5);
  doc.setTextColor(30, 30, 30);
  drawLabelValue(doc, 'Generado por', data.usuario?.nombreCompleto ?? '-', marginX, y2);
  y2 += 4;
  drawLabelValue(doc, 'Fecha de Creación', formatDateTimeLong(data.creadoEn), marginX, y2);

  return doc;
}

// ─── Diseño Neuro Tec Spine (Guillermo Alfredo Gualdrón Bateca): monocromático en navy,
// sin verde — logo arriba a la derecha, título de Remisión, y una caja de datos generales
// con borde navy (mismo patrón robusto de caja que Tecnología Spine y Cabcari). ──────────
async function buildRemisionPdfNeurotec(data: RemisionDetail): Promise<AutoTableDoc> {
  const empresaInfo = getEmpresaInfo(data);
  const empresaLogo = getEmpresaLogo(data.empresa?.nombreCompleto);

  const doc = new jsPDF() as AutoTableDoc;
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const rightX = pageWidth - marginX;

  let logoBottom = 9;
  try {
    const logoImg = await loadPdfImage(empresaLogo.url);
    const logoWidth = 42;
    const logoHeight = logoWidth * (logoImg.naturalHeight / logoImg.naturalWidth);
    doc.addImage(logoImg, empresaLogo.format, rightX - logoWidth, 9, logoWidth, logoHeight);
    logoBottom = 9 + logoHeight;
  } catch {
    // Si el logo no carga, se continúa sin él.
  }

  doc.setFontSize(12.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NEUROTEC_NAVY);
  doc.text(`Remisión: ${data.numRemision || data.id}`, marginX, 15);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`Fecha de Cirugía: ${formatDate(data.programacion?.fechaQx ?? null)}`, marginX, 19.5);

  doc.setDrawColor(...NEUROTEC_NAVY);
  doc.setLineWidth(0.4);
  doc.line(marginX, 22, marginX + 60, 22);

  let infoY = 27;
  doc.setFontSize(6.5);
  const drawInfoLine = (label: string, value: string, withColon = true) => {
    doc.setTextColor(...NEUROTEC_NAVY);
    drawLabelValue(doc, label, value, marginX, infoY, withColon);
    infoY += 3.4;
  };
  drawInfoLine('Razón Social', empresaInfo.nombre);
  drawInfoLine('RFC', empresaInfo.rfc);
  drawInfoLine('Cel.', empresaInfo.celular, false);
  drawInfoLine('Off.', empresaInfo.telefono, false);
  drawInfoLine('Email', empresaInfo.email);

  doc.setFontSize(5.8);
  doc.setTextColor(160, 160, 160);
  doc.text('Nombre: Remisión  ·  Código: RE-TSOPE-01', marginX, infoY + 1.5);
  infoY += 6;

  let y = Math.max(infoY, logoBottom) + 3;

  // Caja de datos generales (blanca, borde navy) — mismos campos que los otros diseños
  const boxStartY = y;
  const colWidth = (rightX - marginX) / 2;
  const innerPad = 2;
  const rowGap = 2;

  const doctorNombres = (data.programacion?.medicos ?? []).map(m => m.medico.nombreCompleto).join(', ') || '-';
  const tecnicosText = data.tecnicos.map(t => t.tecnico?.nombreCompleto).filter(Boolean).join(' , ') || '-';

  const measureAll = (dryRun: boolean, startRowY: number) => {
    let rowY = startRowY;
    const b1 = drawPdfField(doc, 'Paciente', data.paciente ?? '-', marginX + innerPad, colWidth - innerPad * 2, rowY, dryRun, NEUROTEC_NAVY);
    const b2 = drawPdfField(doc, 'Doctor', doctorNombres, marginX + colWidth + innerPad, colWidth - innerPad * 2, rowY, dryRun, NEUROTEC_NAVY);
    rowY = Math.max(b1, b2) + rowGap;

    const b3 = drawPdfField(doc, 'Anestesiólogo', data.anestesiologo ?? '-', marginX + innerPad, colWidth - innerPad * 2, rowY, dryRun, NEUROTEC_NAVY);
    const b4 = drawPdfField(doc, 'Cirugía', data.cirugiaRealizada ?? '-', marginX + colWidth + innerPad, colWidth - innerPad * 2, rowY, dryRun, NEUROTEC_NAVY);
    rowY = Math.max(b3, b4) + rowGap;

    const b5 = drawPdfField(doc, 'Hospital', data.programacion?.hospital?.nombre ?? '-', marginX + innerPad, colWidth - innerPad * 2, rowY, dryRun, NEUROTEC_NAVY);
    const b6 = drawPdfField(doc, 'Cubrimiento', data.cubrimiento?.nombre ?? '-', marginX + colWidth + innerPad, colWidth - innerPad * 2, rowY, dryRun, NEUROTEC_NAVY);
    rowY = Math.max(b5, b6) + rowGap;

    const b7 = drawPdfField(doc, 'Técnicos', tecnicosText, marginX + innerPad, rightX - marginX - innerPad * 2, rowY, dryRun, NEUROTEC_NAVY);
    return b7 + innerPad;
  };

  const boxEndY = measureAll(true, boxStartY + 4);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...NEUROTEC_NAVY);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, boxStartY, rightX - marginX, boxEndY - boxStartY, 2, 2, 'FD');
  measureAll(false, boxStartY + 4);

  y = boxEndY + 5;

  doc.autoTable({
    startY: y,
    head: [['Cant', 'Referencia', 'Descripción', 'V/R Unitario', 'Importe']],
    body: data.consumos.map(it => [
      String(it.cantidad ?? '-'),
      it.productoReferencia ?? '-',
      it.productoNombre ?? '-',
      formatMoney(it.valorUnitario),
      formatMoney(it.valor),
    ]),
    theme: 'grid',
    headStyles: { fillColor: NEUROTEC_NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    styles: { fontSize: 6.5, cellPadding: 1.4, textColor: [40, 40, 40], lineColor: [222, 222, 214], lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 30 },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
    },
    margin: { left: marginX, right: marginX },
  });

  const afterItemsY = doc.lastAutoTable.finalY + 5;

  const leftBoxWidth = 110;
  const obsColWidth = leftBoxWidth * 0.62;
  const bottomBoxHeight = 20;

  doc.setDrawColor(...NEUROTEC_GRAY_LINE);
  doc.setLineWidth(0.2);
  doc.rect(marginX, afterItemsY, leftBoxWidth, bottomBoxHeight, 'S');
  doc.line(marginX + obsColWidth, afterItemsY, marginX + obsColWidth, afterItemsY + bottomBoxHeight);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NEUROTEC_NAVY);
  doc.text('Observaciones:', marginX + 2.5, afterItemsY + 4.5);
  doc.text('Recibí de conformidad', marginX + obsColWidth + 2.5, afterItemsY + 4.5);

  const totalsX = marginX + leftBoxWidth + 8;
  const totalsWidth = rightX - totalsX;
  const totalsRows: [string, string][] = [
    ['Subtotal', formatMoney(data.subtotal)],
    ['Dcto %', formatMoney(data.descuentos)],
    ['Total Antes Impuesto', formatMoney(data.totalAntesImp)],
    ['IVA', formatMoney(data.iva)],
    ['Retención', formatMoney(data.retencion)],
    ['Total a pagar', formatMoney(data.total)],
  ];

  doc.autoTable({
    startY: afterItemsY,
    theme: 'plain',
    body: totalsRows,
    styles: { fontSize: 6.5, cellPadding: 1.3, lineColor: [222, 222, 214], lineWidth: { bottom: 0.2 } },
    columnStyles: {
      0: { cellWidth: totalsWidth * 0.6, fontStyle: 'bold' },
      1: { cellWidth: totalsWidth * 0.4, halign: 'right' },
    },
    margin: { left: totalsX, right: marginX },
    didParseCell: (hookData: { row: { index: number }; cell: { styles: Record<string, unknown> } }) => {
      if (hookData.row.index === totalsRows.length - 1) {
        hookData.cell.styles.fillColor = NEUROTEC_NAVY;
        hookData.cell.styles.textColor = [255, 255, 255];
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.lineWidth = 0;
      }
    },
  });
  doc.setDrawColor(...NEUROTEC_GRAY_LINE);
  doc.setLineWidth(0.2);
  doc.rect(totalsX, afterItemsY, totalsWidth, doc.lastAutoTable.finalY - afterItemsY, 'S');

  let y2 = Math.max(afterItemsY + bottomBoxHeight, doc.lastAutoTable.finalY) + 7;

  doc.setFontSize(6.3);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(90, 90, 85);
  const pagareText = `Por el presente Pagaré reconozco deber y me obligo a pagar incondicionalmente a la orden de ${empresaInfo.nombre} en , el día ${formatDate(data.programacion?.fechaQx ?? null)} la cantidad de ${formatMoney(data.total)} valor de la mercancía que he recibido a mi entera satisfacción. Este pagaré es mercantil y está regido por la ley general de títulos y operaciones de crédito en sus artículos 170, 171, 172, 173, 174 y artículos correlativos por no ser pagaré domiciliado.`;
  const pagareLines: string[] = doc.splitTextToSize(pagareText, rightX - marginX);
  doc.text(pagareLines, marginX, y2);
  y2 += pagareLines.length * 2.7 + 6;

  doc.setFontSize(6.5);
  doc.setTextColor(30, 30, 30);
  drawLabelValue(doc, 'Generado por', data.usuario?.nombreCompleto ?? '-', marginX, y2);
  y2 += 4;
  drawLabelValue(doc, 'Fecha de Creación', formatDateTimeLong(data.creadoEn), marginX, y2);

  return doc;
}

async function buildRemisionPdf(data: RemisionDetail): Promise<AutoTableDoc> {
  const key = detectEmpresaKey(data.empresa?.nombreCompleto);
  if (key === 'cabcari') return buildRemisionPdfCabcari(data);
  if (key === 'guillermo') return buildRemisionPdfNeurotec(data);
  return buildRemisionPdfTecnologiaSpine(data);
}

function remisionPdfFileName(data: RemisionDetail): string {
  return `Remision-${data.numRemision || data.id}.pdf`;
}

async function generarPdfRemision(data: RemisionDetail) {
  const doc = await buildRemisionPdf(data);
  doc.save(remisionPdfFileName(data));
}

const ESTADO_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'definitiva':    { bg: '#dcfce7', text: '#166534', dot: '#16a34a' },
  'tramitada':     { bg: '#dbeafe', text: '#1e40af', dot: '#2563eb' },
  'descorche':     { bg: '#f3e8ff', text: '#6b21a8', dot: '#9333ea' },
  'trazabilidad':  { bg: '#fef3c7', text: '#92400e', dot: '#d97706' },
};

const getEstadoColors = (estado: string | null) => ESTADO_COLORS[(estado ?? '').trim().toLowerCase()] ?? { bg: '#f3f4f6', text: '#555', dot: '#9ca3af' };

export default function RemisionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isMobile } = useResponsiveStyles();
  const [mainTab, setMainTab] = useState('resumen');
  const [hoveredConsumoId, setHoveredConsumoId] = useState<string | null>(null);
  const [hoveredTecnicoId, setHoveredTecnicoId] = useState<string | null>(null);
  const [hoveredBonoId, setHoveredBonoId] = useState<string | null>(null);
  const [hoveredFacturaId, setHoveredFacturaId] = useState<string | null>(null);
  const [selectedTecnico, setSelectedTecnico] = useState<RemisionDetailTecnico | null>(null);
  const [comisionTooltipPos, setComisionTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const [estadoMenuOpen, setEstadoMenuOpen] = useState(false);
  const [hoveredEstadoOpt, setHoveredEstadoOpt] = useState<string | null>(null);
  const estadoMenuRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const tecnicosScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(tecnicosScrollRef, [mainTab]);
  const bonosScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(bonosScrollRef, [mainTab]);
  const consumosScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(consumosScrollRef, [mainTab]);
  const facturacionScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(facturacionScrollRef, [mainTab]);

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [convertirFacturaTooltipPos, setConvertirFacturaTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const [showFacturaSuccess, setShowFacturaSuccess] = useState(false);

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

  const [showEditModal, setShowEditModal] = useState(false);
  const [showEditSuccess, setShowEditSuccess] = useState(false);
  const [editForm, setEditForm] = useState({
    paciente: '',
    cirugiaRealizada: '',
    anestesiologo: '',
    impuestos: '',
    tieneDcto: false,
    porcentajeDcto: '',
    vrDctoPesos: '',
  });
  const [editUsuario, setEditUsuario] = useState<TecnicoOption | null>(null);
  const [usuarioSearch, setUsuarioSearch] = useState('');
  const [editCubrimiento, setEditCubrimiento] = useState<CubrimientoOption | null>(null);
  const [editTarifa, setEditTarifa] = useState<TarifaOption | null>(null);
  const [editEmpresa, setEditEmpresa] = useState<TecnicoOption | null>(null);
  const [editResponsable, setEditResponsable] = useState<TecnicoOption | null>(null);
  const [responsableSearch, setResponsableSearch] = useState('');
  const [editError, setEditError] = useState<{ field: string; message: string } | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [isScrolled, setIsScrolled] = useState(false);
  const [showCompactHeader, setShowCompactHeader] = useState(false);
  const [compactHeaderClosing, setCompactHeaderClosing] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 80);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (isScrolled) {
      setShowCompactHeader(true);
      setCompactHeaderClosing(false);
      return;
    }
    if (!showCompactHeader) return;
    setCompactHeaderClosing(true);
    const timer = setTimeout(() => {
      setShowCompactHeader(false);
      setCompactHeaderClosing(false);
    }, 120);
    return () => clearTimeout(timer);
  }, [isScrolled, showCompactHeader]);

  const [showComisionModal, setShowComisionModal] = useState(false);
  const [comisionForm, setComisionForm] = useState({
    categoria: '',
    tipo: '',
    vrComision: '',
    observaciones: '',
    agregarIva: false,
    cargarPorcentaje: '',
    quieresDesglosar: false,
    seleccioneTipo: '',
  });
  const [comisionTecnico, setComisionTecnico] = useState<TecnicoOption | null>(null);
  const [tecnicoSearch, setTecnicoSearch] = useState('');
  const [comisionError, setComisionError] = useState<{ field: string; message: string } | null>(null);
  const [showConfirmComision, setShowConfirmComision] = useState(false);

  useEffect(() => {
    document.body.style.overflow = (selectedTecnico || showComisionModal || showConfirmComision || showEditModal || showDeleteConfirm) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [selectedTecnico, showComisionModal, showConfirmComision, showEditModal, showDeleteConfirm]);

  useEffect(() => {
    if (!estadoMenuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (estadoMenuRef.current && !estadoMenuRef.current.contains(e.target as Node)) {
        setEstadoMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [estadoMenuOpen]);

  const { data: remision, isLoading, error } = useQuery<RemisionDetail | null>({
    queryKey: ['remision', id],
    queryFn: () => remisionesService.getById(id!),
    enabled: !!id,
  });

  const [statsMounted, setStatsMounted] = useState(false);
  useEffect(() => {
    if (!remision) return;
    const raf = requestAnimationFrame(() => setStatsMounted(true));
    return () => cancelAnimationFrame(raf);
  }, [remision]);

  const updateEstadoMutation = useMutation({
    mutationFn: (estado: string) => remisionesService.updateEstado(id!, estado),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remision', id] });
      setEstadoMenuOpen(false);
    },
  });

  const puedeEditarRemision = remision?.estado === 'Tramitada' || remision?.estado === 'Descorche';

  const { data: cubrimientosRemision = [] } = useQuery<CubrimientoOption[]>({
    queryKey: ['cubrimientos'],
    queryFn: () => remisionesService.findCubrimientos(),
    enabled: showEditModal,
  });

  const { data: usuarioResults = [] } = useQuery<TecnicoOption[]>({
    queryKey: ['comisiones-tecnicos', usuarioSearch],
    queryFn: () => remisionesService.searchTecnicos(usuarioSearch),
    enabled: showEditModal,
  });

  const { data: responsableResults = [] } = useQuery<TecnicoOption[]>({
    queryKey: ['comisiones-tecnicos', responsableSearch],
    queryFn: () => remisionesService.searchTecnicos(responsableSearch),
    enabled: showEditModal,
  });

  const { data: empresaResults = [] } = useQuery<TecnicoOption[]>({
    queryKey: ['empresas'],
    queryFn: () => remisionesService.searchEmpresas(),
    enabled: showEditModal && !!editCubrimiento,
  });

  const { data: tarifaResults = [] } = useQuery<TarifaOption[]>({
    queryKey: ['remision-tarifas', editCubrimiento?.id],
    queryFn: () => remisionesService.findTarifasByCubrimiento(editCubrimiento!.id),
    enabled: showEditModal && !!editCubrimiento,
  });

  const updateRemisionMutation = useMutation({
    mutationFn: () => remisionesService.updateRemision(id!, {
      usuarioId: editUsuario?.id,
      paciente: editForm.paciente,
      cirugiaRealizada: editForm.cirugiaRealizada,
      cubrimientoId: editCubrimiento?.id,
      tarifaId: editTarifa?.id,
      empresaId: editEmpresa?.id,
      responsableEconomicoId: editResponsable?.id,
      anestesiologo: editForm.anestesiologo,
      impuestos: editForm.impuestos || undefined,
      tieneDcto: editForm.tieneDcto,
      porcentajeDcto: editForm.tieneDcto && editForm.porcentajeDcto ? Number(editForm.porcentajeDcto) : undefined,
      vrDctoPesos: editForm.tieneDcto && editForm.vrDctoPesos ? Number(editForm.vrDctoPesos) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remision', id] });
      setShowEditModal(false);
      setShowEditSuccess(true);
    },
  });

  const openEditModal = () => {
    if (!remision) return;
    setEditForm({
      paciente: remision.paciente ?? '',
      cirugiaRealizada: remision.cirugiaRealizada ?? '',
      anestesiologo: remision.anestesiologo ?? '',
      impuestos: remision.impuestos ?? '',
      tieneDcto: remision.tieneDcto,
      porcentajeDcto: remision.porcentajeDcto ? String(remision.porcentajeDcto) : '',
      vrDctoPesos: remision.vrDctoPesos ? String(remision.vrDctoPesos) : '',
    });
    setEditUsuario(remision.usuario);
    setUsuarioSearch('');
    setEditCubrimiento(remision.cubrimiento);
    setEditTarifa(remision.tarifa);
    setEditEmpresa(remision.empresa);
    setEditResponsable(remision.responsableEconomico);
    setResponsableSearch('');
    setEditError(null);
    setShowMoreMenu(false);
    setShowEditModal(true);
  };

  const handleGuardarEdit = () => {
    if (!editForm.paciente.trim()) { setEditError({ field: 'paciente', message: 'Ingresa el nombre del paciente.' }); return; }
    if (!editCubrimiento) { setEditError({ field: 'cubrimiento', message: 'Selecciona el cubrimiento.' }); return; }
    if (!editTarifa) { setEditError({ field: 'tarifa', message: 'Selecciona la tarifa.' }); return; }
    if (!editEmpresa) { setEditError({ field: 'empresa', message: 'Selecciona la empresa.' }); return; }
    if (!editResponsable) { setEditError({ field: 'responsable', message: 'Selecciona el responsable económico.' }); return; }
    if (!editUsuario) { setEditError({ field: 'usuario', message: 'Selecciona el usuario.' }); return; }
    if (!editForm.anestesiologo.trim()) { setEditError({ field: 'anestesiologo', message: 'Ingresa el anestesiólogo.' }); return; }
    if (!editForm.cirugiaRealizada.trim()) { setEditError({ field: 'cirugiaRealizada', message: 'Ingresa la cirugía realizada.' }); return; }
    setEditError(null);
    updateRemisionMutation.mutate();
  };

  useEffect(() => {
    if (!editError) return;
    document.getElementById(`remision-edit-field-${editError.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [editError]);

  const deleteRemisionMutation = useMutation({
    mutationFn: () => remisionesService.deleteRemision(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remisiones'] });
      navigate('/operacion/remision');
    },
    onError: (err: any) => {
      setDeleteError(err?.response?.data?.message ?? 'No se pudo eliminar la remisión.');
    },
  });

  const convertirFacturaMutation = useMutation({
    mutationFn: () => remisionesService.convertirEnFactura(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remision', id] });
      setShowFacturaSuccess(true);
    },
  });

  const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const { data: tecnicoResults = [] } = useQuery<TecnicoOption[]>({
    queryKey: ['comisiones-tecnicos', tecnicoSearch],
    queryFn: () => remisionesService.searchTecnicos(tecnicoSearch),
    enabled: showComisionModal,
  });

  const createComisionMutation = useMutation({
    mutationFn: () => remisionesService.createComision({
      programacionId: remision!.programacion!.id,
      categoria: comisionForm.categoria,
      tipo: comisionForm.tipo || undefined,
      tecnicoId: comisionTecnico?.id,
      remisionId: id!,
      vrComision: Number(comisionForm.vrComision),
      observaciones: comisionForm.observaciones || undefined,
      agregarIva: comisionForm.agregarIva,
      cargarPorcentaje: comisionForm.agregarIva && comisionForm.cargarPorcentaje ? Number(comisionForm.cargarPorcentaje) : undefined,
      quieresDesglosar: comisionForm.quieresDesglosar,
      seleccioneTipo: comisionForm.seleccioneTipo || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remision', id] });
      setShowConfirmComision(false);
      setShowComisionModal(false);
    },
  });

  const openComisionModal = () => {
    setComisionForm({
      categoria: '',
      tipo: '',
      vrComision: '',
      observaciones: '',
      agregarIva: false,
      cargarPorcentaje: '',
      quieresDesglosar: false,
      seleccioneTipo: '',
    });
    setComisionTecnico(null);
    setTecnicoSearch('');
    setComisionError(null);
    setShowConfirmComision(false);
    setShowComisionModal(true);
  };

  // TOTAL FACTURA (preview) — misma fórmula que getDetTecnicoDetalle
  const comisionVrComision = Number(comisionForm.vrComision) || 0;
  const comisionSubTotal = comisionForm.agregarIva ? comisionVrComision : comisionVrComision / 1.16;
  const comisionIva = comisionForm.quieresDesglosar ? comisionSubTotal * 0.16 : 0;
  const comisionRetIva = comisionForm.quieresDesglosar ? comisionSubTotal * 0.10667 : 0;
  const comisionEsActEmpresarial = comisionForm.seleccioneTipo.trim().toUpperCase() === 'ACTIVIDAD EMPRESARIAL';
  const comisionRetIsr = comisionForm.quieresDesglosar ? (comisionEsActEmpresarial ? 0 : comisionSubTotal * 0.0125) : 0;
  const comisionTotalFactura = comisionSubTotal + comisionIva - comisionRetIva - comisionRetIsr;

  const handleGuardarComision = () => {
    if (!comisionForm.tipo) { setComisionError({ field: 'tipo', message: 'Selecciona el tipo de comisión.' }); return; }
    if (!comisionForm.categoria) { setComisionError({ field: 'categoria', message: 'Selecciona la categoría.' }); return; }
    if (!comisionTecnico) { setComisionError({ field: 'tecnico', message: 'Selecciona el nombre de contacto.' }); return; }
    if (!comisionForm.vrComision || Number(comisionForm.vrComision) <= 0) { setComisionError({ field: 'vrComision', message: 'El valor de asignación debe ser mayor a cero.' }); return; }
    if (comisionForm.quieresDesglosar && !comisionForm.seleccioneTipo) { setComisionError({ field: 'seleccioneTipo', message: 'Selecciona el tipo (Actividad Empresarial o Resico).' }); return; }
    setComisionError(null);
    setShowConfirmComision(true);
  };

  useEffect(() => {
    if (!comisionError) return;
    document.getElementById(`comision-field-${comisionError.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [comisionError]);

  if (isLoading) return <Layout><div style={{ padding: '2rem', textAlign: 'center' }}><Loader className="spinner" size={32} /></div></Layout>;
  if (error) return <Layout><div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>Error al cargar: {(error as any)?.message || 'Error desconocido'}</div></Layout>;
  if (!remision) return <Layout><div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>Remisión no encontrada</div></Layout>;

  const bonosComisionesFlat = remision.bonosComisiones.flatMap(g => g.items.map(it => ({ ...it, categoria: g.categoria })));
  const totalBonosComisiones = bonosComisionesFlat.reduce((sum, it) => sum + it.monto, 0);

  const bloqueosEliminar: string[] = [];
  if (!puedeEditarRemision) bloqueosEliminar.push('el estado no es Tramitada ni Descorche');
  if (remision.tieneFactura) bloqueosEliminar.push('ya tiene factura asociada');
  if (remision.consumos.length > 0) bloqueosEliminar.push('tiene consumos asociados');
  if (remision.tecnicos.length > 0) bloqueosEliminar.push('tiene técnicos asignados');
  if (bonosComisionesFlat.length > 0) bloqueosEliminar.push('tiene comisiones asociadas');
  const puedeEliminarRemision = bloqueosEliminar.length === 0;

  const mainTabItems: { key: string; label: string; count: number | null }[] = [
    { key: 'resumen', label: 'Resumen', count: null },
    { key: 'consumos', label: 'Consumos', count: remision.consumos.length },
    { key: 'facturacion', label: 'Facturación', count: remision.facturas.length },
  ];

  return (
    <Layout>
      {showCompactHeader && (
        <div style={{ ...styles.compactHeaderPositioner, left: isMobile ? 0 : '60px' }}>
          <div
            className={compactHeaderClosing ? 'compact-header-slide-out' : 'compact-header-slide-in'}
            style={styles.compactHeader}
          >
            <span style={styles.compactTitle}>Remisión {remision.numRemision || remision.id}</span>
            {remision.programacion?.id && (
              <span style={styles.titleId}>Programación {remision.programacion.id}</span>
            )}
          </div>
        </div>
      )}
      <div style={styles.container}>
        <button
          type="button"
          onClick={() => navigate('/operacion/remision')}
          style={styles.backLink}
          onMouseEnter={e => { e.currentTarget.style.color = '#4d7a13'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6b7280'; }}
        >
          <MaterialIcon name="arrow_back" size={16} />
          Volver
        </button>

        <div style={styles.headerCard}>
          <div style={styles.header}>
            <span style={styles.titleIconBadge}>
              <MaterialIcon name="receipt_long" size={30} color="#4d7a13" />
            </span>
            <div style={styles.titleGroup}>
              <div style={styles.titleRow}>
                <h1 style={styles.title}>{remision.numRemision || remision.id}</h1>
              </div>
              <div style={styles.breadcrumbRow}>
                <span style={styles.breadcrumbId}> {remision.programacion?.numProgram || remision.programacion?.id || '-'}</span>
              </div>
            </div>

            <div style={styles.headerActions}>
              {esSuperAdmin() && (
                <div style={{ position: 'relative' as const }}>
                  <button
                    className="btn-press header-btn-primary"
                    style={{ ...styles.btnPillPrimary, ...(!remision.puedeConvertirFactura || convertirFacturaMutation.isPending ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                    onClick={() => { if (remision.puedeConvertirFactura && !convertirFacturaMutation.isPending) convertirFacturaMutation.mutate(); }}
                    onMouseEnter={e => {
                      if (remision.puedeConvertirFactura) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      setConvertirFacturaTooltipPos({ top: rect.top, left: rect.left + rect.width / 2 });
                    }}
                    onMouseLeave={() => setConvertirFacturaTooltipPos(null)}
                  >
                    <Receipt size={16} />
                    {convertirFacturaMutation.isPending ? 'Convirtiendo...' : 'Convertir en Factura'}
                  </button>
                  {!remision.puedeConvertirFactura && convertirFacturaTooltipPos && (
                    <div style={{ ...styles.tooltipBubble, top: convertirFacturaTooltipPos.top - 8, left: convertirFacturaTooltipPos.left }}>
                      No hay consumos pendientes por facturar en esta remisión.
                    </div>
                  )}
                </div>
              )}
              <button
                className="btn-press header-btn-secondary"
                style={styles.btnPill}
                disabled={pdfGenerating}
                onClick={async () => {
                  if (!remision || pdfGenerating) return;
                  setPdfGenerating(true);
                  try {
                    await generarPdfRemision(remision);
                  } finally {
                    setPdfGenerating(false);
                  }
                }}
              >
                <PdfIcon size={16} color="#4d7a13" />
                {pdfGenerating ? 'Generando...' : 'Remisión'}
              </button>

              <span style={styles.headerDivider} />

              <div style={{ position: 'relative' as const }} ref={moreMenuRef}>
                <button
                  className="btn-press header-btn-secondary"
                  style={styles.iconMenuBtn}
                  onClick={() => setShowMoreMenu(o => !o)}
                >
                  <MaterialIcon name="more_horiz" size={20} />
                </button>
                {showMoreMenu && (
                  <div style={styles.dropdown}>
                    <button
                      style={{ ...styles.dropdownItem, ...(!puedeEditarRemision ? styles.dropdownItemDisabled : {}) }}
                      onClick={openEditModal}
                      disabled={!puedeEditarRemision}
                      title={!puedeEditarRemision ? 'Solo se pueden editar remisiones en estado Tramitada o Descorche.' : undefined}
                      onMouseEnter={e => { if (puedeEditarRemision) e.currentTarget.style.backgroundColor = '#f4f4ee'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <MaterialIcon name="edit" size={17} />
                      Editar Remisión
                    </button>
                    <div style={styles.dropdownDivider} />
                    <button
                      style={{ ...styles.dropdownItem, ...styles.dropdownItemDanger, ...(!puedeEditarRemision ? styles.dropdownItemDisabled : {}) }}
                      onClick={() => { if (!puedeEditarRemision) return; setShowMoreMenu(false); setDeleteError(null); setShowDeleteConfirm(true); }}
                      disabled={!puedeEditarRemision}
                      title={!puedeEditarRemision ? 'Solo se pueden eliminar remisiones en estado Tramitada o Descorche.' : undefined}
                      onMouseEnter={e => { if (puedeEditarRemision) e.currentTarget.style.backgroundColor = '#f7ece8'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <MaterialIcon name="delete" size={17} />
                      Eliminar Remisión
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={styles.infoBar}>
            <div style={styles.infoBarItem}>
              <span style={styles.infoBarLabel}>Total</span>
              <span style={styles.infoBarValue}><AnimatedMoney value={remision.total} start={statsMounted} /></span>
              <span style={styles.infoBarDividerLine} />
            </div>
            <div style={styles.infoBarItem}>
              <span style={styles.infoBarLabel}>Saldo</span>
              <span style={styles.infoBarValue}><AnimatedMoney value={remision.saldo} start={statsMounted} /></span>
              <span style={styles.infoBarDividerLine} />
            </div>
            <div style={styles.infoBarItem}>
              <span style={styles.infoBarLabel}>Hospital</span>
              <span style={styles.infoBarValue}>{remision.programacion?.hospital?.nombre || '-'}</span>
              <span style={styles.infoBarDividerLine} />
            </div>
            <div style={styles.infoBarItem}>
              <span style={styles.infoBarLabel}>Usuario</span>
              <span style={styles.infoBarValue}>{remision.usuario?.nombreCompleto || '-'}</span>
              <span style={styles.infoBarDividerLine} />
            </div>
            <div style={{ ...styles.infoBarItem, position: 'relative' as const }} ref={estadoMenuRef}>
              <span style={styles.infoBarLabel}>Estado</span>
              {(() => {
                const c = getEstadoColors(remision.estado);
                return (
                  <span
                    style={{ ...styles.estadoBadge, backgroundColor: c.bg, color: c.text, opacity: updateEstadoMutation.isPending ? 0.6 : 1, width: 'fit-content' }}
                    onClick={() => !updateEstadoMutation.isPending && setEstadoMenuOpen(o => !o)}
                  >
                    <span style={{ ...styles.estadoDot, backgroundColor: c.dot }} />
                    {remision.estado || '-'}
                    <ChevronDown size={14} />
                  </span>
                );
              })()}
              {estadoMenuOpen && (
                <div style={styles.estadoMenu}>
                  {ESTADOS_REMISION.map(opt => {
                    const oc = getEstadoColors(opt);
                    return (
                      <div
                        key={opt}
                        style={{
                          ...styles.estadoMenuItem,
                          ...(opt === remision.estado ? styles.estadoMenuItemActive : {}),
                          ...(hoveredEstadoOpt === opt ? styles.estadoMenuItemHover : {}),
                        }}
                        onClick={() => updateEstadoMutation.mutate(opt)}
                        onMouseEnter={() => setHoveredEstadoOpt(opt)}
                        onMouseLeave={() => setHoveredEstadoOpt(null)}
                      >
                        <span style={{ ...styles.estadoDot, backgroundColor: oc.dot }} />
                        {opt}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div style={styles.mainTabBar}>
            {mainTabItems.map(({ key, label, count }) => {
              const active = mainTab === key;
              return (
                <button
                  key={key}
                  style={{ ...styles.mainTabBtn, ...(active ? styles.mainTabBtnActive : styles.mainTabBtnInactive) }}
                  onClick={e => { setMainTab(key); e.currentTarget.blur(); }}
                >
                  {label}
                  {count !== null && (
                    <span style={{ ...styles.mainTabBadge, ...(active ? styles.mainTabBadgeActive : {}) }}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {mainTab === 'resumen' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.6fr 1fr', gap: '1.5rem', marginBottom: '2rem', alignItems: 'start' }}>
          <div style={styles.generalCard}>
            <div style={styles.sectionTitleRow}>
              <h2 style={styles.sectionTitle}>Información General</h2>
            </div>
            <div style={styles.generalGrid}>
              <div style={styles.generalItem}><span style={styles.generalLabel}>N° Program</span><span style={styles.generalValue}>{remision.programacion?.numProgram || remision.programacion?.id || '-'}</span></div>
              <div style={styles.generalItem}><span style={styles.generalLabel}>N° Remisión</span><span style={styles.generalValue}>{remision.numRemision || remision.id}</span></div>
              <div style={styles.generalItem}><span style={styles.generalLabel}>Usuario</span><span style={styles.generalValue}>{remision.usuario?.nombreCompleto || '-'}</span></div>
              <div style={styles.generalItem}><span style={styles.generalLabel}>Marca de Tiempo</span><span style={styles.generalValue}>{formatDateTime(remision.creadoEn)}</span></div>
              <div style={styles.generalItem}><span style={styles.generalLabel}>Fecha QX</span><span style={styles.generalValue}>{formatDate(remision.programacion?.fechaQx ?? null)}</span></div>
              <div style={styles.generalItem}><span style={styles.generalLabel}>Hora QX</span><span style={styles.generalValue}>{remision.programacion?.horaQx || '-'}</span></div>
              <div style={styles.generalItem}><span style={styles.generalLabel}>Sede</span><span style={styles.generalValue}>{remision.programacion?.sede?.nombre || '-'}</span></div>
              <div style={styles.generalItem}><span style={styles.generalLabel}>Ciudad QX</span><span style={styles.generalValue}>{remision.programacion?.hospital?.ciudadCat?.nombre || '-'}</span></div>
              <div style={styles.generalItem}><span style={styles.generalLabel}>Médico</span><span style={styles.generalValue}>{remision.programacion?.medicos.map(m => m.medico.nombreCompleto).join(', ') || '-'}</span></div>
              <div style={styles.generalItem}><span style={styles.generalLabel}>Hospital</span><span style={styles.generalValue}>{remision.programacion?.hospital?.nombre || '-'}</span></div>
              <div style={styles.generalItem}><span style={styles.generalLabel}>Tarifa</span><span style={styles.generalValue}>{remision.tarifa?.nombre || '-'}</span></div>
              <div style={styles.generalItem}><span style={styles.generalLabel}>Status</span><span style={styles.generalValue}>{remision.status ? 'Activa' : 'Inactiva'}</span></div>
              <div style={styles.generalItem}><span style={styles.generalLabel}>Observaciones</span><span style={styles.generalValue}>{remision.programacion?.observaciones || '-'}</span></div>
              <div style={styles.generalItem}><span style={styles.generalLabel}>Empresa</span><span style={styles.generalValue}>{remision.empresa?.nombreCompleto || '-'}</span></div>
              <div style={styles.generalItem}><span style={styles.generalLabel}>Paciente</span><span style={styles.generalValue}>{remision.paciente || '-'}</span></div>
              <div style={styles.generalItem}><span style={styles.generalLabel}>Cirugía Realizada</span><span style={styles.generalValue}>{remision.cirugiaRealizada || '-'}</span></div>
              <div style={styles.generalItem}><span style={styles.generalLabel}>Cubrimiento</span><span style={styles.generalValue}>{remision.cubrimiento?.nombre || '-'}</span></div>
              <div style={styles.generalItem}><span style={styles.generalLabel}>Responsable Económico</span><span style={styles.generalValue}>{remision.responsableEconomico?.nombreCompleto || '-'}</span></div>
              <div style={styles.generalItem}><span style={styles.generalLabel}>Anestesiólogo</span><span style={styles.generalValue}>{remision.anestesiologo || '-'}</span></div>
              <div style={styles.generalItem}><span style={styles.generalLabel}>Firma</span><span style={styles.generalValue}>{remision.firma || '-'}</span></div>
              <div style={styles.generalItem}><span style={styles.generalLabel}>Consumo</span><span style={styles.generalValue}>{remision.programacion?.consumo || '-'}</span></div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '1.5rem' }}>
            <div>
              <div style={styles.sectionTitleRow}>
                <h2 style={styles.sectionTitle}>Técnicos Asociados</h2>
                <span style={styles.badge}>{remision.tecnicos.length}</span>
              </div>
              {remision.tecnicos.length === 0 ? (
                <div style={styles.emptyState}>No hay datos relacionados</div>
              ) : (
                <div style={styles.remList}>
                  <div style={{ ...styles.tecnicoRow, ...styles.colHeader }}>
                    <span style={styles.colHeaderText}>Nombre Técnico</span>
                    <span style={styles.colHeaderText}>N° Programación</span>
                    <span style={styles.colHeaderText}>Remisión</span>
                  </div>
                  <div ref={tecnicosScrollRef} style={styles.scrollBody}>
                    {remision.tecnicos.map((t, i) => {
                      const hoverStyle = hoveredTecnicoId === t.id ? styles.rowHover : {};
                      return (
                        <div
                          key={t.id}
                          style={{ ...styles.tecnicoRow, ...(i > 0 ? styles.rowBorder : {}), ...hoverStyle, cursor: 'pointer' }}
                          onMouseEnter={() => setHoveredTecnicoId(t.id)}
                          onMouseLeave={() => setHoveredTecnicoId(null)}
                          onClick={() => setSelectedTecnico(t)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                            {t.tecnico?.nombreCompleto && <span style={styles.tecnicoAvatar}>{getTecnicoInitials(t.tecnico.nombreCompleto)}</span>}
                            <span style={styles.cellText}>{t.tecnico?.nombreCompleto || '-'}</span>
                          </div>
                          <span style={styles.cellText}>{remision.programacion?.numProgram || remision.programacion?.id || '-'}</span>
                          <span style={styles.cellText}>{remision.numRemision || remision.id}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div style={styles.sectionTitleRow}>
                <h2 style={styles.sectionTitle}>Bonos y Comisiones</h2>
                <span style={styles.badge}>{bonosComisionesFlat.length}</span>
              </div>
              {bonosComisionesFlat.length === 0 ? (
                <div style={styles.emptyState}>No hay datos relacionados</div>
              ) : (
                <div style={styles.remList}>
                  <div style={{ ...styles.bonoRow, ...styles.colHeader }}>
                    <span style={styles.colHeaderText}>Categoría</span>
                    <span style={styles.colHeaderText}>Técnico</span>
                    <span style={{ ...styles.colHeaderText, textAlign: 'right' }}>Monto</span>
                  </div>
                  <div ref={bonosScrollRef} style={styles.scrollBody}>
                    {bonosComisionesFlat.map((item, i) => {
                      const hoverStyle = hoveredBonoId === item.id ? styles.rowHover : {};
                      return (
                        <div
                          key={item.id}
                          style={{ ...styles.bonoRow, ...(i > 0 ? styles.rowBorder : {}), ...hoverStyle, cursor: 'pointer' }}
                          onMouseEnter={() => setHoveredBonoId(item.id)}
                          onMouseLeave={() => setHoveredBonoId(null)}
                          onClick={() => navigate(`/operacion/comisiones/${item.id}`)}
                        >
                          <span style={styles.cellText}>{item.categoria}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                            {item.tecnico && <span style={styles.tecnicoAvatar}>{getTecnicoInitials(item.tecnico)}</span>}
                            <span style={styles.cellText}>{item.tecnico ?? '-'}</span>
                          </div>
                          <span style={{ ...styles.cellText, textAlign: 'right', fontWeight: 600, color: '#333' }}>{formatMoney(item.monto)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={styles.tableTotalRow}>
                    <span>Total</span>
                    <span>{formatMoney(totalBonosComisiones)}</span>
                  </div>
                </div>
              )}
              <div style={{ position: 'relative' as const }}>
                <button
                  style={{ ...styles.addComisionBtnBelow, ...(!remision.programacion || remision.programacion.consumoNoValidado ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                  onClick={() => { if (remision.programacion && !remision.programacion.consumoNoValidado) openComisionModal(); }}
                  onMouseEnter={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setComisionTooltipPos({ top: rect.top, left: rect.left + rect.width / 2 });
                  }}
                  onMouseLeave={() => setComisionTooltipPos(null)}
                >
                  <Plus size={16} /> Agregar Comisión
                </button>
                {comisionTooltipPos && (!remision.programacion || remision.programacion.consumoNoValidado) && (
                  <div style={{ ...styles.tooltipBubble, top: comisionTooltipPos.top - 8, left: comisionTooltipPos.left }}>
                    {!remision.programacion
                      ? 'Esta remisión no tiene una programación asociada.'
                      : 'La programación debe tener todos sus consumos validados para poder agregar comisiones.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        )}

        {mainTab === 'consumos' && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={styles.sectionTitleRow}>
            <h2 style={styles.sectionTitle}>Consumos</h2>
            <span style={styles.badge}>{remision.consumos.length}</span>
          </div>
          {remision.consumos.length === 0 ? (
            <div style={styles.emptyState}>No hay datos relacionados</div>
          ) : (
            <div style={styles.remList}>
              <div style={{ ...styles.consumoRow, ...styles.colHeader }}>
                <span style={styles.colHeaderText}>Cant.</span>
                <span style={styles.colHeaderText}>Referencia</span>
                <span style={styles.colHeaderText}>Producto</span>
                <span style={{ ...styles.colHeaderText, textAlign: 'right' }}>Valor</span>
                <span style={{ ...styles.colHeaderText, textAlign: 'right' }}>Facturado</span>
                <span style={{ ...styles.colHeaderText, textAlign: 'right' }}>Por Facturar</span>
              </div>
              <div ref={consumosScrollRef} style={styles.scrollBody}>
                {remision.consumos.map((c, i) => {
                  const hoverStyle = hoveredConsumoId === c.id ? styles.rowHover : {};
                  return (
                    <div
                      key={c.id}
                      style={{ ...styles.consumoRow, ...(i > 0 ? styles.rowBorder : {}), ...hoverStyle, cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredConsumoId(c.id)}
                      onMouseLeave={() => setHoveredConsumoId(null)}
                      onClick={() => navigate(`/operacion/consumos/${c.id}`)}
                    >
                      <span style={styles.cellText}>{c.cantidad}</span>
                      <span style={styles.cellCode}>{c.productoReferencia || c.productoId || '-'}</span>
                      <span style={styles.cellText}>{c.productoNombre || '-'}</span>
                      <span style={{ ...styles.cellText, textAlign: 'right', fontWeight: 600, color: '#333' }}>{formatMoney(c.valor)}</span>
                      <span style={{ ...styles.cellText, textAlign: 'right', color: '#16a34a' }}>{formatMoney(c.facturado)}</span>
                      <span style={{ ...styles.cellText, textAlign: 'right', color: c.porFacturar > 0 ? '#a16207' : '#9ca3af' }}>{formatMoney(c.porFacturar)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        )}

        {mainTab === 'facturacion' && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={styles.sectionTitleRow}>
            <h2 style={styles.sectionTitle}>Facturación</h2>
            <span style={styles.badge}>{remision.facturas.length}</span>
          </div>
          {remision.facturas.length === 0 ? (
            <div style={styles.emptyState}>No hay datos relacionados</div>
          ) : (
            <div style={styles.remList}>
              <div style={{ ...styles.facturaRow, ...styles.colHeader }}>
                <span style={styles.colHeaderText}>Folio</span>
                <span style={styles.colHeaderText}>Fecha Creación</span>
                <span style={styles.colHeaderText}>Generada Por</span>
                <span style={styles.colHeaderText}>Cliente</span>
                <span style={{ ...styles.colHeaderText, textAlign: 'right' }}>Total</span>
              </div>
              <div ref={facturacionScrollRef} style={styles.scrollBody}>
                {remision.facturas.map((f, i) => {
                  const hoverStyle = hoveredFacturaId === f.id ? styles.rowHover : {};
                  return (
                    <div
                      key={f.id}
                      style={{ ...styles.facturaRow, ...(i > 0 ? styles.rowBorder : {}), ...hoverStyle }}
                      onMouseEnter={() => setHoveredFacturaId(f.id)}
                      onMouseLeave={() => setHoveredFacturaId(null)}
                    >
                      <span style={styles.cellText}>{f.folioFacturacion || '-'}</span>
                      <span style={styles.cellText}>{formatDate(f.fechaCreacion)}</span>
                      <span style={styles.cellText}>{f.generadaPor || '-'}</span>
                      <span style={styles.cellText}>{f.cliente || '-'}</span>
                      <span style={{ ...styles.cellText, textAlign: 'right', fontWeight: 600, color: '#333' }}>{formatMoney(f.total)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        )}

      </div>

      {selectedTecnico && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setSelectedTecnico(null)}>
          <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Técnico Asociado</h2>
              <button style={styles.closeBtn} onClick={() => setSelectedTecnico(null)}>
                <X size={20} />
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.infoRow}><span style={styles.label}>Nombre Técnico</span><span style={styles.value}>{selectedTecnico.tecnico?.nombreCompleto || '-'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>N° Programación</span><span style={styles.value}>{selectedTecnico.programacion?.numProgram || selectedTecnico.programacion?.id || '-'}</span></div>
              <div style={styles.infoRow}>
                <span style={styles.label}>Remisión</span>
                <span
                  style={{ ...styles.value, color: '#db2777', cursor: selectedTecnico.remision ? 'pointer' : 'default' }}
                  onClick={() => selectedTecnico.remision && navigate(`/operacion/remisiones/${selectedTecnico.remision.id}`)}
                >
                  {selectedTecnico.remision?.numRemision || selectedTecnico.remision?.id || '-'}
                </span>
              </div>
              <div style={styles.infoRow}><span style={styles.label}>Fecha de Registro</span><span style={styles.value}>{formatDateTime(selectedTecnico.fechaRegistro)}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Registrado Por</span><span style={styles.value}>{selectedTecnico.registradoPor?.nombreCompleto || '-'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Última Edición</span><span style={styles.value}>{formatDateTime(selectedTecnico.ultimaEdicion)}</span></div>
              <div style={{ ...styles.infoRow, borderBottom: 'none' }}><span style={styles.label}>Editado Por</span><span style={styles.value}>{selectedTecnico.editadoPor?.nombreCompleto || '-'}</span></div>
            </div>
          </div>
        </div>
      )}

      {showComisionModal && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setShowComisionModal(false)}>
          <div className="modal-content-anim" style={styles.editModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <button style={styles.closeBtn} onClick={() => setShowComisionModal(false)}>
                <X size={18} />
              </button>
              <h2 style={styles.modalTitle}>Agregar Comisión</h2>
            </div>

            <div style={styles.editModalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>N° Programación *</label>
                <span style={styles.readOnlyPill}>{remision.programacion?.numProgram ?? remision.programacion?.id ?? '-'}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>No Remisión *</label>
                <span style={styles.readOnlyPill}>{remision.numRemision || remision.id}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Paciente</label>
                <span style={styles.readOnlyField}>{remision.paciente || '-'}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Fecha QX *</label>
                <span style={styles.readOnlyField}>{formatDate(remision.programacion?.fechaQx ?? null)}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Doctor *</label>
                <div style={styles.medicoTagsWrap}>
                  {remision.programacion?.medicos.length ? remision.programacion.medicos.map((m, i) => (
                    <span key={i} style={styles.medicoTag}>{m.medico.nombreCompleto}</span>
                  )) : <span style={styles.readOnlyField}>-</span>}
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Hospital *</label>
                <span style={styles.medicoTag}>{remision.programacion?.hospital?.nombre ?? '-'}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Consumo *</label>
                <span style={{ ...styles.readOnlyField, whiteSpace: 'pre-wrap' as const, minHeight: '44px', display: 'block' }}>
                  {remision.programacion?.consumo || '-'}
                </span>
              </div>

              <div style={styles.formGroup} id="comision-field-tipo">
                <label style={styles.label}>Tipo</label>
                <div style={styles.horaGrid}>
                  {TIPOS_COMISION.map(t => (
                    <button
                      key={t}
                      type="button"
                      style={{ ...styles.sedeBtn, ...(comisionForm.tipo === t ? styles.sedeBtnActive : {}), ...(comisionError?.field === 'tipo' ? styles.inputError : {}) }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => { setComisionForm({ ...comisionForm, tipo: t }); setComisionError(null); e.currentTarget.blur(); }}
                    >
                      {comisionForm.tipo === t ? <CheckCircle size={14} style={{ flexShrink: 0 }} /> : <Circle size={14} style={{ flexShrink: 0 }} />}
                      {t}
                    </button>
                  ))}
                </div>
                {comisionError?.field === 'tipo' && <span style={styles.errorText}>{comisionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="comision-field-categoria">
                <label style={styles.label}>Categoría *</label>
                <div style={styles.sedeGrid}>
                  {CATEGORIAS_COMISION.map(c => (
                    <button
                      key={c}
                      type="button"
                      style={{ ...styles.sedeBtn, ...(comisionForm.categoria === c ? styles.sedeBtnActive : {}), ...(comisionError?.field === 'categoria' ? styles.inputError : {}) }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => { setComisionForm({ ...comisionForm, categoria: c }); setComisionError(null); e.currentTarget.blur(); }}
                    >
                      {comisionForm.categoria === c ? <CheckCircle size={14} style={{ flexShrink: 0 }} /> : <Circle size={14} style={{ flexShrink: 0 }} />}
                      {c}
                    </button>
                  ))}
                </div>
                {comisionError?.field === 'categoria' && <span style={styles.errorText}>{comisionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="comision-field-tecnico">
                <label style={styles.label}>Nombre Contacto</label>
                {comisionTecnico && (
                  <div style={styles.medicoTagsWrap}>
                    <span style={styles.medicoTag}>
                      {comisionTecnico.nombreCompleto}
                      <X size={12} style={{ cursor: 'pointer' }} onClick={() => setComisionTecnico(null)} />
                    </span>
                  </div>
                )}
                {!comisionTecnico && (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      style={{ ...styles.input, ...(comisionError?.field === 'tecnico' ? styles.inputError : {}) }}
                      placeholder="Buscar técnico o contacto..."
                      value={tecnicoSearch}
                      onChange={e => { setTecnicoSearch(e.target.value); setComisionError(null); }}
                    />
                    {tecnicoSearch.trim() && (
                      <div style={styles.medicoDropdown}>
                        {tecnicoResults.length === 0 ? (
                          <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                        ) : (
                          tecnicoResults.map(t => (
                            <div
                              key={t.id}
                              style={styles.medicoDropdownItem}
                              onClick={() => { setComisionTecnico(t); setTecnicoSearch(''); setComisionError(null); }}
                            >
                              <Plus size={14} /> {t.nombreCompleto}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                {comisionError?.field === 'tecnico' && <span style={styles.errorText}>{comisionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="comision-field-vrComision">
                <label style={styles.label}>Valor Asignación *</label>
                <div style={styles.stepperWrap}>
                  <input
                    type="number"
                    step="0.01"
                    style={{ ...styles.input, paddingRight: '5rem', ...(comisionError?.field === 'vrComision' ? styles.inputError : {}) }}
                    placeholder="$ 0.00"
                    value={comisionForm.vrComision}
                    onChange={e => { setComisionForm({ ...comisionForm, vrComision: e.target.value }); setComisionError(null); }}
                  />
                  <div style={styles.stepperBtns}>
                    <button type="button" style={styles.stepperBtn} onClick={() => { setComisionForm({ ...comisionForm, vrComision: String((Number(comisionForm.vrComision) || 0) - 100) }); setComisionError(null); }}>−</button>
                    <button type="button" style={styles.stepperBtn} onClick={() => { setComisionForm({ ...comisionForm, vrComision: String((Number(comisionForm.vrComision) || 0) + 100) }); setComisionError(null); }}>+</button>
                  </div>
                </div>
                {comisionError?.field === 'vrComision' && <span style={styles.errorText}>{comisionError.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Observaciones</label>
                <textarea
                  ref={autoResizeTextarea}
                  style={{ ...styles.input, minHeight: '44px', resize: 'none' as const, overflow: 'hidden' as const }}
                  value={comisionForm.observaciones}
                  onChange={e => { setComisionForm({ ...comisionForm, observaciones: e.target.value }); autoResizeTextarea(e.target); }}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>¿Agregar IVA?</label>
                <div style={styles.horaGrid}>
                  <button
                    type="button"
                    style={{ ...styles.sedeBtn, ...(!comisionForm.agregarIva ? styles.sedeBtnActive : {}) }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => { setComisionForm({ ...comisionForm, agregarIva: false }); e.currentTarget.blur(); }}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    style={{ ...styles.sedeBtn, ...(comisionForm.agregarIva ? styles.sedeBtnActive : {}) }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => { setComisionForm({ ...comisionForm, agregarIva: true }); e.currentTarget.blur(); }}
                  >
                    Sí
                  </button>
                </div>
              </div>

              {comisionForm.agregarIva && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Porcentaje de IVA a Cargar</label>
                  <div style={{ position: 'relative' as const }}>
                    <input
                      type="number"
                      step="0.01"
                      style={{ ...styles.input, paddingRight: '2.5rem' }}
                      placeholder="16.00"
                      value={comisionForm.cargarPorcentaje}
                      onChange={e => setComisionForm({ ...comisionForm, cargarPorcentaje: e.target.value })}
                    />
                    <span style={styles.percentSuffix}>%</span>
                  </div>
                </div>
              )}

              <div style={styles.formGroup}>
                <label style={styles.label}>¿Quieres Desglosar?</label>
                <div style={styles.horaGrid}>
                  <button
                    type="button"
                    style={{ ...styles.sedeBtn, ...(!comisionForm.quieresDesglosar ? styles.sedeBtnActive : {}) }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => { setComisionForm({ ...comisionForm, quieresDesglosar: false }); e.currentTarget.blur(); }}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    style={{ ...styles.sedeBtn, ...(comisionForm.quieresDesglosar ? styles.sedeBtnActive : {}) }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => { setComisionForm({ ...comisionForm, quieresDesglosar: true }); e.currentTarget.blur(); }}
                  >
                    Sí
                  </button>
                </div>
              </div>

              {comisionForm.quieresDesglosar && (
                <div style={styles.formGroup} id="comision-field-seleccioneTipo">
                  <label style={styles.label}>Seleccione Tipo</label>
                  <div style={styles.horaGrid}>
                    {SELECCIONE_TIPO_COMISION.map(t => (
                      <button
                        key={t}
                        type="button"
                        style={{ ...styles.sedeBtn, ...(comisionForm.seleccioneTipo === t ? styles.sedeBtnActive : {}), ...(comisionError?.field === 'seleccioneTipo' ? styles.inputError : {}) }}
                        onMouseDown={e => e.preventDefault()}
                        onClick={e => { setComisionForm({ ...comisionForm, seleccioneTipo: comisionForm.seleccioneTipo === t ? '' : t }); setComisionError(null); e.currentTarget.blur(); }}
                      >
                        {comisionForm.seleccioneTipo === t ? <CheckCircle size={14} style={{ flexShrink: 0 }} /> : <Circle size={14} style={{ flexShrink: 0 }} />}
                        {t}
                      </button>
                    ))}
                  </div>
                  {comisionError?.field === 'seleccioneTipo' && <span style={styles.errorText}>{comisionError.message}</span>}
                </div>
              )}

              {comisionForm.quieresDesglosar && (
                <>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Sub Total</label>
                    <span style={styles.readOnlyField}>{formatMoney(comisionSubTotal)}</span>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>IVA</label>
                    <span style={styles.readOnlyField}>{formatMoney(comisionIva)}</span>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Retención IVA</label>
                    <span style={styles.readOnlyField}>{formatMoney(comisionRetIva)}</span>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Retención ISR</label>
                    <span style={styles.readOnlyField}>{formatMoney(comisionRetIsr)}</span>
                  </div>
                </>
              )}

              <div style={styles.formGroup}>
                <label style={styles.label}>Total Factura</label>
                <span style={styles.readOnlyField}>{formatMoney(comisionTotalFactura)}</span>
              </div>
            </div>

            <div style={styles.editModalFooter}>
              <button style={styles.cancelBtn} onClick={() => setShowComisionModal(false)}>Cancelar</button>
              <button
                style={styles.saveBtn}
                onClick={handleGuardarComision}
                disabled={createComisionMutation.isPending}
              >
                {createComisionMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmComision && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setShowConfirmComision(false)}>
          <div className="modal-content-anim" style={styles.confirmModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <button style={styles.closeBtn} onClick={() => setShowConfirmComision(false)}><X size={18} /></button>
              <h2 style={styles.modalTitle}>Confirmar Comisión</h2>
            </div>
            <div style={styles.confirmBody}>
              <p style={styles.confirmIntro}>¿Deseas agregar esta comisión con los siguientes datos?</p>

              <div style={styles.confirmRow}>
                <span style={styles.confirmLabel}>Remisión</span>
                <span style={styles.confirmValue}>{remision.numRemision || remision.id}</span>
              </div>
              <div style={styles.confirmRow}>
                <span style={styles.confirmLabel}>Tipo</span>
                <span style={styles.confirmValue}>{comisionForm.tipo}</span>
              </div>
              <div style={styles.confirmRow}>
                <span style={styles.confirmLabel}>Categoría</span>
                <span style={styles.confirmValue}>{comisionForm.categoria}</span>
              </div>
              <div style={styles.confirmRow}>
                <span style={styles.confirmLabel}>Contacto</span>
                <span style={styles.confirmValue}>{comisionTecnico?.nombreCompleto}</span>
              </div>
              <div style={styles.confirmRow}>
                <span style={styles.confirmLabel}>Valor Asignación</span>
                <span style={styles.confirmValue}>{formatMoney(comisionVrComision)}</span>
              </div>

              {comisionForm.quieresDesglosar && (
                <>
                  <div style={styles.confirmRow}>
                    <span style={styles.confirmLabel}>Sub Total</span>
                    <span style={styles.confirmValue}>{formatMoney(comisionSubTotal)}</span>
                  </div>
                  <div style={styles.confirmRow}>
                    <span style={styles.confirmLabel}>IVA</span>
                    <span style={styles.confirmValue}>{formatMoney(comisionIva)}</span>
                  </div>
                  <div style={styles.confirmRow}>
                    <span style={styles.confirmLabel}>Retención IVA</span>
                    <span style={styles.confirmValue}>{formatMoney(comisionRetIva)}</span>
                  </div>
                  <div style={styles.confirmRow}>
                    <span style={styles.confirmLabel}>Retención ISR</span>
                    <span style={styles.confirmValue}>{formatMoney(comisionRetIsr)}</span>
                  </div>
                </>
              )}

              <div style={styles.confirmRowTotal}>
                <span style={styles.confirmLabel}>Total Factura</span>
                <span style={styles.confirmValueTotal}>{formatMoney(comisionTotalFactura)}</span>
              </div>
            </div>

            <div style={styles.editModalFooter}>
              <button style={styles.cancelBtn} onClick={() => setShowConfirmComision(false)}>Cancelar</button>
              <button
                style={styles.saveBtn}
                onClick={() => createComisionMutation.mutate()}
                disabled={createComisionMutation.isPending}
              >
                {createComisionMutation.isPending ? 'Guardando...' : 'Sí, agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (() => {
        const editSubtotal = remision.subtotal;
        const round2 = (n: number) => Math.round(n * 100) / 100;
        const editDescuentos = editForm.tieneDcto
          ? editSubtotal * (Number(editForm.porcentajeDcto || 0) / 100) + Number(editForm.vrDctoPesos || 0)
          : 0;
        const editTotalAntesImp = round2(editSubtotal - editDescuentos);
        const editIva = round2((editForm.impuestos === 'I.V.A.' || editForm.impuestos === 'Todos') ? editTotalAntesImp * 0.16 : 0);
        const editRetencion = round2((editForm.impuestos === 'Retención' || editForm.impuestos === 'Todos') ? editTotalAntesImp * 0.106667 : 0);
        const editTotalPagar = round2(editTotalAntesImp + editIva - editRetencion);

        return (
          <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
            <div className="modal-content-anim" style={styles.editModalContent} onClick={e => e.stopPropagation()}>
              <div style={styles.editModalHeader}>
                <button style={styles.closeBtn} onClick={() => setShowEditModal(false)}>
                  <X size={18} />
                </button>
                <h2 style={styles.modalTitle}>Editar Remisión</h2>
              </div>

              <div style={styles.editModalBody}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Sede</label>
                  <span style={styles.readOnlyField}>{remision.programacion?.sede?.nombre ?? '-'}</span>
                </div>

                <div style={styles.formGroup} id="remision-edit-field-usuario">
                  <label style={styles.label}>Usuario *</label>
                  {editUsuario && (
                    <div style={styles.medicoTagsWrap}>
                      <span style={styles.medicoTag}>
                        {editUsuario.nombreCompleto}
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => setEditUsuario(null)} />
                      </span>
                    </div>
                  )}
                  {!editUsuario && (
                    <div style={{ position: 'relative' as const }}>
                      <input
                        style={{ ...styles.input, ...(editError?.field === 'usuario' ? styles.inputError : {}) }}
                        placeholder="Buscar tercero..."
                        value={usuarioSearch}
                        onChange={e => { setUsuarioSearch(e.target.value); setEditError(null); }}
                      />
                      {usuarioSearch.trim() && (
                        <div style={styles.medicoDropdown}>
                          {usuarioResults.length === 0 ? (
                            <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                          ) : (
                            usuarioResults.map(t => (
                              <div
                                key={t.id}
                                style={styles.medicoDropdownItem}
                                onClick={() => { setEditUsuario(t); setUsuarioSearch(''); setEditError(null); }}
                              >
                                <Plus size={14} /> {t.nombreCompleto}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {editError?.field === 'usuario' && <span style={styles.errorText}>{editError.message}</span>}
                </div>

                <div style={styles.formGroup} id="remision-edit-field-paciente">
                  <label style={styles.label}>Paciente *</label>
                  <input
                    style={{ ...styles.input, ...(editError?.field === 'paciente' ? styles.inputError : {}) }}
                    value={editForm.paciente}
                    onChange={e => { setEditForm({ ...editForm, paciente: e.target.value }); setEditError(null); }}
                  />
                  {editError?.field === 'paciente' && <span style={styles.errorText}>{editError.message}</span>}
                </div>

                <div style={styles.formGroup} id="remision-edit-field-cubrimiento">
                  <label style={styles.label}>Cubrimiento *</label>
                  <div style={styles.sedeGrid}>
                    {cubrimientosRemision.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        style={{ ...styles.sedeBtn, ...(editCubrimiento?.id === c.id ? styles.sedeBtnActive : {}), ...(editError?.field === 'cubrimiento' ? styles.inputError : {}) }}
                        onMouseDown={e => e.preventDefault()}
                        onClick={e => {
                          setEditCubrimiento(c);
                          if (editCubrimiento?.id !== c.id) { setEditTarifa(null); setEditEmpresa(null); }
                          setEditError(null);
                          e.currentTarget.blur();
                        }}
                      >
                        {editCubrimiento?.id === c.id ? <CheckCircle size={14} style={{ flexShrink: 0 }} /> : <Circle size={14} style={{ flexShrink: 0 }} />}
                        {c.nombre}
                      </button>
                    ))}
                  </div>
                  {editError?.field === 'cubrimiento' && <span style={styles.errorText}>{editError.message}</span>}
                </div>

                {editCubrimiento && (
                  <div style={styles.formGroup} id="remision-edit-field-empresa">
                    <label style={styles.label}>Empresa *</label>
                    <div style={styles.sedeGrid}>
                      {empresaResults.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          style={{ ...styles.sedeBtn, ...(editEmpresa?.id === t.id ? styles.sedeBtnActive : {}), ...(editError?.field === 'empresa' ? styles.inputError : {}) }}
                          onMouseDown={e => e.preventDefault()}
                          onClick={e => { setEditEmpresa(t); setEditError(null); e.currentTarget.blur(); }}
                        >
                          {editEmpresa?.id === t.id ? <CheckCircle size={14} style={{ flexShrink: 0 }} /> : <Circle size={14} style={{ flexShrink: 0 }} />}
                          {t.nombreCompleto}
                        </button>
                      ))}
                    </div>
                    {editError?.field === 'empresa' && <span style={styles.errorText}>{editError.message}</span>}
                  </div>
                )}

                <div style={styles.formGroup} id="remision-edit-field-responsable">
                  <label style={styles.label}>Responsable Económico *</label>
                  {editResponsable && (
                    <div style={styles.medicoTagsWrap}>
                      <span style={styles.medicoTag}>
                        {editResponsable.nombreCompleto}
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => setEditResponsable(null)} />
                      </span>
                    </div>
                  )}
                  {!editResponsable && (
                    <div style={{ position: 'relative' as const }}>
                      <input
                        style={{ ...styles.input, ...(editError?.field === 'responsable' ? styles.inputError : {}) }}
                        placeholder="Buscar tercero..."
                        value={responsableSearch}
                        onChange={e => { setResponsableSearch(e.target.value); setEditError(null); }}
                      />
                      {responsableSearch.trim() && (
                        <div style={styles.medicoDropdown}>
                          {responsableResults.length === 0 ? (
                            <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                          ) : (
                            responsableResults.map(t => (
                              <div
                                key={t.id}
                                style={styles.medicoDropdownItem}
                                onClick={() => { setEditResponsable(t); setResponsableSearch(''); setEditError(null); }}
                              >
                                <Plus size={14} /> {t.nombreCompleto}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {editError?.field === 'responsable' && <span style={styles.errorText}>{editError.message}</span>}
                </div>

                <div style={styles.formGroup} id="remision-edit-field-tarifa">
                  <label style={styles.label}>Tarifa *</label>
                  {!editCubrimiento ? (
                    <span style={styles.readOnlyField}>Selecciona primero un cubrimiento</span>
                  ) : (
                    <>
                      {editTarifa && (
                        <div style={styles.medicoTagsWrap}>
                          <span style={styles.medicoTag}>
                            {editTarifa.nombre}
                            <X size={12} style={{ cursor: 'pointer' }} onClick={() => setEditTarifa(null)} />
                          </span>
                        </div>
                      )}
                      {!editTarifa && (
                        <div style={styles.sedeGrid}>
                          {tarifaResults.map(t => (
                            <button
                              key={t.id}
                              type="button"
                              style={{ ...styles.sedeBtn, ...(editError?.field === 'tarifa' ? styles.inputError : {}) }}
                              onMouseDown={e => e.preventDefault()}
                              onClick={e => { setEditTarifa(t); setEditError(null); e.currentTarget.blur(); }}
                            >
                              <Circle size={14} style={{ flexShrink: 0 }} />
                              {t.nombre}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {editError?.field === 'tarifa' && <span style={styles.errorText}>{editError.message}</span>}
                </div>

                <div style={styles.formGroup} id="remision-edit-field-anestesiologo">
                  <label style={styles.label}>Anestesiólogo *</label>
                  <input
                    style={{ ...styles.input, ...(editError?.field === 'anestesiologo' ? styles.inputError : {}) }}
                    value={editForm.anestesiologo}
                    onChange={e => { setEditForm({ ...editForm, anestesiologo: e.target.value }); setEditError(null); }}
                  />
                  {editError?.field === 'anestesiologo' && <span style={styles.errorText}>{editError.message}</span>}
                </div>

                <div style={styles.formGroup} id="remision-edit-field-cirugiaRealizada">
                  <label style={styles.label}>Cirugía Realizada *</label>
                  <input
                    style={{ ...styles.input, ...(editError?.field === 'cirugiaRealizada' ? styles.inputError : {}) }}
                    value={editForm.cirugiaRealizada}
                    onChange={e => { setEditForm({ ...editForm, cirugiaRealizada: e.target.value }); setEditError(null); }}
                  />
                  {editError?.field === 'cirugiaRealizada' && <span style={styles.errorText}>{editError.message}</span>}
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Impuestos</label>
                  <div style={styles.sedeGrid}>
                    {IMPUESTOS_REMISION.map(t => (
                      <button
                        key={t}
                        type="button"
                        style={{ ...styles.sedeBtn, ...(editForm.impuestos === t ? styles.sedeBtnActive : {}) }}
                        onMouseDown={e => e.preventDefault()}
                        onClick={e => { setEditForm({ ...editForm, impuestos: t }); e.currentTarget.blur(); }}
                      >
                        {editForm.impuestos === t ? <CheckCircle size={14} style={{ flexShrink: 0 }} /> : <Circle size={14} style={{ flexShrink: 0 }} />}
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>¿Tiene Dcto?</label>
                  <div style={styles.horaGrid}>
                    <button
                      type="button"
                      style={{ ...styles.sedeBtn, ...(!editForm.tieneDcto ? styles.sedeBtnActive : {}) }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => { setEditForm({ ...editForm, tieneDcto: false }); e.currentTarget.blur(); }}
                    >
                      NO
                    </button>
                    <button
                      type="button"
                      style={{ ...styles.sedeBtn, ...(editForm.tieneDcto ? styles.sedeBtnActive : {}) }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => { setEditForm({ ...editForm, tieneDcto: true }); e.currentTarget.blur(); }}
                    >
                      SI
                    </button>
                  </div>
                </div>

                {editForm.tieneDcto && (
                  <>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>% Dto</label>
                      <div style={styles.stepperWrap}>
                        <input
                          type="number"
                          step="0.01"
                          style={{ ...styles.input, paddingRight: '5rem' }}
                          placeholder="0.00"
                          value={editForm.porcentajeDcto}
                          onChange={e => setEditForm({ ...editForm, porcentajeDcto: e.target.value })}
                        />
                        <div style={styles.stepperBtns}>
                          <button type="button" style={styles.stepperBtn} onClick={() => setEditForm({ ...editForm, porcentajeDcto: String((Number(editForm.porcentajeDcto) || 0) - 1) })}>−</button>
                          <button type="button" style={styles.stepperBtn} onClick={() => setEditForm({ ...editForm, porcentajeDcto: String((Number(editForm.porcentajeDcto) || 0) + 1) })}>+</button>
                        </div>
                      </div>
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.label}>V/R Dcto</label>
                      <span style={styles.readOnlyField}>{formatMoney(editDescuentos)}</span>
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.label}>V/R Dcto $</label>
                      <div style={styles.stepperWrap}>
                        <input
                          type="number"
                          step="0.01"
                          style={{ ...styles.input, paddingRight: '5rem' }}
                          placeholder="0.00"
                          value={editForm.vrDctoPesos}
                          onChange={e => setEditForm({ ...editForm, vrDctoPesos: e.target.value })}
                        />
                        <div style={styles.stepperBtns}>
                          <button type="button" style={styles.stepperBtn} onClick={() => setEditForm({ ...editForm, vrDctoPesos: String((Number(editForm.vrDctoPesos) || 0) - 100) })}>−</button>
                          <button type="button" style={styles.stepperBtn} onClick={() => setEditForm({ ...editForm, vrDctoPesos: String((Number(editForm.vrDctoPesos) || 0) + 100) })}>+</button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div style={styles.formGroup}>
                  <label style={styles.label}>Subtotal</label>
                  <span style={styles.readOnlyField}>{formatMoney(editSubtotal)}</span>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Total Antes Imp.</label>
                  <span style={styles.readOnlyField}>{formatMoney(editTotalAntesImp)}</span>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>IVA</label>
                  <span style={styles.readOnlyField}>{formatMoney(editIva)}</span>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Retención</label>
                  <span style={styles.readOnlyField}>{formatMoney(editRetencion)}</span>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Total Pagar</label>
                  <span style={styles.readOnlyField}>{formatMoney(editTotalPagar)}</span>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Saldo</label>
                  <span style={styles.readOnlyField}>{formatMoney(remision.saldo)}</span>
                </div>
              </div>

              <div style={styles.editModalFooter}>
                <button style={styles.cancelBtn} onClick={() => setShowEditModal(false)}>Cancelar</button>
                <button
                  style={styles.saveBtn}
                  onClick={handleGuardarEdit}
                  disabled={updateRemisionMutation.isPending}
                >
                  {updateRemisionMutation.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showDeleteConfirm && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => { if (!deleteRemisionMutation.isPending) setShowDeleteConfirm(false); }}>
          <div className="modal-content-anim" style={styles.confirmModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <h2 style={styles.modalTitle}>Eliminar Remisión</h2>
            </div>
            <div style={styles.confirmBody}>
              {puedeEliminarRemision ? (
                <p style={styles.confirmIntro}>
                  ¿Seguro que quieres eliminar la remisión <strong>{remision.numRemision || remision.id}</strong>? Esta acción no se puede deshacer.
                </p>
              ) : (
                <p style={styles.confirmIntro}>
                  No se puede eliminar la remisión <strong>{remision.numRemision || remision.id}</strong>:
                </p>
              )}
              {!puedeEliminarRemision && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.75rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                  <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span style={{ color: '#b91c1c', fontSize: '0.82rem', fontWeight: 500, lineHeight: 1.4 }}>
                    {bloqueosEliminar.map(b => b.charAt(0).toUpperCase() + b.slice(1)).join('. ')}.
                  </span>
                </div>
              )}
              {puedeEliminarRemision && deleteError && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.75rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                  <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span style={{ color: '#b91c1c', fontSize: '0.82rem', fontWeight: 500, lineHeight: 1.4 }}>{deleteError}</span>
                </div>
              )}
            </div>
            <div style={styles.editModalFooter}>
              <button style={styles.cancelBtn} onClick={() => setShowDeleteConfirm(false)} disabled={deleteRemisionMutation.isPending}>
                {puedeEliminarRemision ? 'Cancelar' : 'Cerrar'}
              </button>
              {puedeEliminarRemision && (
                <button
                  style={styles.deleteConfirmBtn}
                  onClick={() => deleteRemisionMutation.mutate()}
                  disabled={deleteRemisionMutation.isPending}
                >
                  {deleteRemisionMutation.isPending ? 'Eliminando...' : 'Eliminar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <SuccessToast show={showEditSuccess} message="Remisión editada" onClose={() => setShowEditSuccess(false)} />
      <SuccessToast show={showFacturaSuccess} message="Factura generada" onClose={() => setShowFacturaSuccess(false)} />

    </Layout>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding:'0.05rem 1.5rem 1.5rem', maxWidth: '1400px', margin: '0 auto' },
  backLink: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.75rem', padding: '0.25rem 0.1rem', border: 'none', background: 'transparent', color: '#6b7280', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const, transition: 'color 0.15s ease' },
  headerCard: { backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '1.25rem 1.5rem 0', marginBottom: '2rem', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' },
  titleGroup: { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', overflow: 'hidden' },
  titleRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' },
  titleIconBadge: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '66px', height: '66px', borderRadius: '20px', backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#4d7a13', flexShrink: 0 },
  breadcrumbRow: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.95rem', color: '#9a9a90', marginTop: '0.25rem' },
  breadcrumbId: { fontWeight: 500, color: '#4d7a13' },
  headerActions: { display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 },
  btnPill: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #e5e7eb', borderRadius: '12px', color: '#33342a', fontWeight: 600, fontSize: '0.84375rem', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  btnPillPrimary: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #dbe8c2', borderRadius: '12px', color: '#3f6510', fontWeight: 600, fontSize: '0.84375rem', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  headerDivider: { width: '1px', height: '28px', backgroundColor: '#e9ece0', margin: '0 0.15rem', flexShrink: 0 },
  iconMenuBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', border: '1px solid #e5e7eb', borderRadius: '999px', cursor: 'pointer', color: '#33342a', flexShrink: 0 },
  dropdown: { position: 'absolute' as const, top: 'calc(100% + 8px)', right: 0, backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: '230px', overflow: 'hidden', zIndex: 200, padding: '0.35rem' },
  dropdownItem: { display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.6rem 0.75rem', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.84375rem', color: '#33342a', fontWeight: 600, textAlign: 'left' as const },
  dropdownItemDisabled: { opacity: 0.45, cursor: 'not-allowed' as const },
  dropdownItemDanger: { color: '#a8503c' },
  dropdownDivider: { height: '1px', backgroundColor: '#eeeee6', margin: '0.3rem 0' },
  deleteConfirmBtn: { padding: '0.5rem 1.5rem', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
  infoBar: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1.25rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '11px', padding: '1rem 1.25rem', marginBottom: '1.5rem' },
  infoBarItem: { position: 'relative' as const, display: 'flex', flexDirection: 'column' as const, gap: '0.3rem', minWidth: 0 },
  infoBarDividerLine: { position: 'absolute' as const, right: '-0.65rem', top: '15%', bottom: '15%', width: '1px', backgroundColor: '#e5e7eb' },
  infoBarLabel: { fontSize: '0.68rem', fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.04em', flexShrink: 0 },
  infoBarValue: { fontSize: '0.9375rem', fontWeight: 700, color: '#16170f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  title: { fontSize: '2.0625rem', fontWeight: 800, color: '#16170f', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  mainTabBar: { display: 'flex', gap: '0.25rem', borderBottom: '1px solid #eeeee6' },
  mainTabBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.75rem 1rem', border: 'none', background: 'transparent', fontSize: '0.84375rem', fontWeight: 600, cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: '-1px', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const },
  mainTabBtnActive: { color: '#4d7a13', borderBottomColor: '#4d7a13' },
  mainTabBtnInactive: { color: '#6b7280', borderBottomColor: 'transparent' },
  mainTabBadge: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '1.3rem', height: '1.3rem', padding: '0 0.4rem', borderRadius: '999px', backgroundColor: '#e5e7eb', color: '#6b7280', fontSize: '0.7rem', fontWeight: 700, lineHeight: 1 },
  mainTabBadgeActive: { backgroundColor: '#e9f2d8', color: '#3f6510' },
  generalCard: { backgroundColor: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  generalGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1.5rem 2rem' },
  generalItem: { display: 'flex', flexDirection: 'column' as const, gap: '0.35rem', minWidth: 0 },
  generalLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  generalValue: { fontSize: '0.875rem', fontWeight: 600, color: '#333', lineHeight: 1.4, wordBreak: 'break-word' as const },
  compactHeaderPositioner: {
    position: 'fixed' as const, top: '60px', left: 0, right: 0, zIndex: 50,
    maxWidth: '1400px', margin: '0 auto',
    padding: '0 1.5rem',
    pointerEvents: 'none' as const,
  },
  compactHeader: {
    width: 'fit-content', maxWidth: '480px',
    display: 'flex', flexDirection: 'column' as const, gap: '0.2rem',
    backgroundColor: '#fff',
    padding: '0.75rem 1.5rem',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
    border: '1px solid #e5e7eb',
    borderTop: 'none',
    borderRadius: '0 0 12px 12px',
    pointerEvents: 'auto' as const,
  },
  compactTitle: { fontSize: '1rem', fontWeight: 700, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  titleId: { fontSize: '0.8rem', fontWeight: 700, color: '#6b8c1f', fontFamily: 'monospace', flexShrink: 0 },
  estadoBadge: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' },
  estadoDot: { width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0 },
  estadoMenu: { position: 'absolute' as const, top: 'calc(100% + 0.5rem)', left: 0, backgroundColor: '#fff', borderRadius: '10px', border: '1px solid #e5e7eb', boxShadow: '0 10px 25px rgba(0,0,0,0.12)', padding: '0.4rem', minWidth: '160px', zIndex: 20 },
  estadoMenuItem: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.6rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, color: '#333', cursor: 'pointer' },
  estadoMenuItemActive: { backgroundColor: '#f3f4f6' },
  estadoMenuItemHover: { backgroundColor: '#f9fafb' },
  infoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '0.75rem 0', marginBottom: '0.75rem', borderBottom: '1px solid #f3f4f6' },
  label: { fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', flexShrink: 0 },
  value: { fontSize: '0.875rem', fontWeight: 600, color: '#333', textAlign: 'right' as const },
  bonoRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 120px', alignItems: 'center', padding: '0.6rem 1.25rem', gap: '0.5rem', backgroundColor: '#fff' },
  facturaRow: { display: 'grid', gridTemplateColumns: '90px 100px 1fr 1fr 110px', alignItems: 'center', padding: '0.6rem 1.25rem', gap: '0.5rem', backgroundColor: '#fff' },
  tableTotalRow: { display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1.25rem', borderTop: '2px solid #e5e7eb', backgroundColor: '#f9fafb', fontSize: '0.85rem', fontWeight: 700, color: '#333' },
  sectionTitleRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' },
  sectionTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#333', margin: 0 },
  badge: { backgroundColor: '#e5e7eb', color: '#6b7280', fontSize: '0.75rem', fontWeight: 700, minWidth: '1.5rem', height: '1.5rem', padding: '0 0.4rem', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  remList: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #f3f4f6', overflow: 'hidden' },
  emptyState: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #f3f4f6', padding: '2rem', textAlign: 'center' as const, color: '#9ca3af', fontSize: '0.875rem' },
  colHeader: { backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' },
  colHeaderText: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  consumoRow: { display: 'grid', gridTemplateColumns: '40px 85px 1fr 85px 85px 85px', alignItems: 'center', padding: '0.6rem 1rem', gap: '0.4rem', backgroundColor: '#fff' },
  tecnicoRow: { display: 'grid', gridTemplateColumns: '1fr 140px 120px', alignItems: 'center', padding: '0.6rem 1.25rem', gap: '0.5rem', backgroundColor: '#fff' },
  scrollBody: { maxHeight: '320px', overflowY: 'auto' as const },
  rowBorder: { borderTop: '1px solid #f3f4f6' },
  rowHover: { backgroundColor: '#f3f4f6', cursor: 'pointer' },
  cellText: { fontSize: '0.85rem', color: '#374151', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const },
  cellCode: { fontSize: '0.78rem', fontWeight: 700, color: '#6b8c1f', fontFamily: 'monospace', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const },
  tecnicoAvatar: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '50%', backgroundColor: '#e9f2d8', color: '#4d7a13', fontSize: '0.62rem', fontWeight: 700, flexShrink: 0 },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 },
  modalContent: { backgroundColor: '#fff', borderRadius: '12px', width: '90%', maxWidth: '480px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.5rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', borderTopLeftRadius: '12px', borderTopRightRadius: '12px' },
  modalTitle: { fontSize: '1.25rem', fontWeight: 700, color: '#333', margin: 0 },
  closeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', border: 'none', backgroundColor: '#f3f4f6', borderRadius: '8px', cursor: 'pointer', color: '#666' },
  modalBody: { padding: '1.5rem' },
  editModalContent: { backgroundColor: '#fff', borderRadius: '12px', width: '90%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  confirmModalContent: { backgroundColor: '#fff', borderRadius: '12px', width: '90%', maxWidth: '420px', maxHeight: '90vh', overflow: 'auto' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  confirmBody: { padding: '1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '0.85rem' },
  confirmIntro: { fontSize: '0.85rem', color: '#6b7280', margin: '0 0 0.25rem' },
  confirmRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' },
  confirmLabel: { fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  confirmValue: { fontSize: '0.875rem', fontWeight: 700, color: '#333', textAlign: 'right' as const },
  confirmRowTotal: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', borderTop: '1px solid #e5e7eb', paddingTop: '0.85rem', marginTop: '0.25rem' },
  confirmValueTotal: { fontSize: '1.05rem', fontWeight: 700, color: '#6b8c1f', textAlign: 'right' as const },
  editModalHeader: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1.25rem 1.5rem', borderBottom: '1px solid #e5e7eb', position: 'sticky' as const, top: 0, backgroundColor: '#f9fafb', zIndex: 1, borderTopLeftRadius: '12px', borderTopRightRadius: '12px' },
  editModalFooter: { display: 'flex', gap: '1rem', padding: '1.5rem', borderTop: '1px solid #e5e7eb', justifyContent: 'flex-end' as const },
  editModalBody: { padding: '1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '1.25rem' },
  formGroup: { display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' },
  input: { padding: '0.75rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const },
  inputError: { borderColor: '#dc2626' },
  errorText: { fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 },
  cancelBtn: { padding: '0.5rem 1.5rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: '#333' },
  saveBtn: { padding: '0.5rem 1.5rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
  horaGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' },
  sedeGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' },
  sedeBtn: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', color: '#374151', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const },
  sedeBtnActive: { backgroundColor: '#6b8c1f', border: '1px solid #6b8c1f', color: '#fff' },
  medicoTagsWrap: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' },
  medicoTag: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderRadius: '999px', backgroundColor: '#f3f4f6', color: '#333', fontSize: '0.8rem', fontWeight: 600 },
  medicoDropdown: { position: 'absolute' as const, top: 'calc(100% + 0.35rem)', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto' as const, zIndex: 20 },
  medicoDropdownItem: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.75rem', fontSize: '0.85rem', fontWeight: 600, color: '#333', cursor: 'pointer' },
  addComisionBtnBelow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%', marginTop: '0.75rem', padding: '0.6rem', border: '1px dashed #c9dba3', borderRadius: '10px', backgroundColor: '#f9fbf6', color: '#4f6b17', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' },
  tooltipBubble: { position: 'fixed' as const, transform: 'translate(-50%, -100%)', width: '220px', padding: '0.5rem 0.75rem', backgroundColor: '#1f2937', color: '#fff', fontSize: '0.75rem', fontWeight: 500, lineHeight: 1.4, borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 9999, textAlign: 'center' as const, pointerEvents: 'none' as const },
  readOnlyPill: { display: 'inline-flex', alignSelf: 'flex-start' as const, alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem', borderRadius: '999px', border: '1px solid #d9e8c2', backgroundColor: '#f3faec', fontSize: '0.85rem', fontWeight: 700, color: '#4f6b17' },
  readOnlyField: { padding: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', fontSize: '0.875rem', color: '#6b7280' },
  stepperWrap: { position: 'relative' as const },
  stepperBtns: { position: 'absolute' as const, right: '0.5rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '0.35rem' },
  stepperBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1.75rem', height: '1.75rem', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: '#fff', color: '#374151', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', lineHeight: 1 },
  percentSuffix: { position: 'absolute' as const, right: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '0.875rem', fontWeight: 600, pointerEvents: 'none' as const },
};
