import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useNavigateWithLoading } from '../../../hooks/useNavigateWithLoading';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader, FileText, CheckCircle, Circle, X, Plus, Lock, AlertCircle, CircleX, DollarSign, Trash2, ChevronDown, Send } from 'lucide-react';
import { SiGmail } from 'react-icons/si';
import { MaterialIcon } from '../../../components/icons/MaterialIcon';
import HeaderBackReveal from '../../../components/HeaderBackReveal';
import { ActividadTimeline } from '../../../components/ActividadTimeline';
import DatePicker from '../../../components/DatePicker';
import OptionDropdown from '../../../components/OptionDropdown';
import SuccessToast from '../../../components/SuccessToast';
import { programacionesService, type ProgramacionDetail, type SedeOption, type HospitalOption, type MedicoOption, type CotizacionOption } from '../../../services/programaciones.service';
import { cotizacionesService } from '../../../services/cotizaciones.service';
import { DetalleModal as CotizacionDetalleModal } from '../cotizaciones/CotizacionesPage';
import { api } from '../../../lib/axios';
import { toLocalDateString } from '../../../lib/date.utils';
import { useResponsiveStyles } from '../../../hooks/useResponsiveStyles';
import { useSmoothWheelScroll } from '../../../hooks/useSmoothWheelScroll';
import { remisionesService, type RemisionItem, type RemTecnicoItem, type ConsumoGrupo, type ValidacionConsumoGrupo, type ValidacionConsumoItem, type ComisionGrupo, type RequisicionItem, type NotaCreditoItem, type GastoRelacionadoItem, type FuenteRelacionadaItem, type DocumentoProgramacionItem, type TecnicoSugeridoItem, type TecnicoOption, type CubrimientoOption, type TarifaOption, type ProductoOption } from '../../../services/remisiones.service';
import AgregarRemisionModal from './AgregarRemisionModal';
import ValidarConsumoModal from './ValidarConsumoModal';
import ConsumoDetalleModal from '../consumos/ConsumoDetalleModal';
import ComisionDetalleModal from '../consumos/ComisionDetalleModal';
import AgregarComisionModal from '../consumos/AgregarComisionModal';
import RequisicionDetalleModal from '../requisiciones/RequisicionDetalleModal';
import InsumoFormModal, { type InsumoFormValues } from '../requisiciones/InsumoFormModal';

// El estado y la lógica de "Agregar remisión" viven en su propio componente
// (AgregarRemisionModal.tsx) para que escribir en ese formulario no re-renderice toda esta página
// (antes vivía todo en este mismo componente gigante) — ver comentario en ese archivo.

const formatProductoLabel = (p: ProductoOption): string =>
  p.referencia ? `${p.referencia} / ${p.nombre}` : p.nombre ?? '-';

// Inicial del primer nombre + inicial del apellido paterno (penúltima palabra), como "Osmar Jared Chim Pat" → "OC"
const getTecnicoInitials = (nombreCompleto: string): string => {
  const words = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '-';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 2][0]).toUpperCase();
};

// Categorías fijas de comisión (mismas que CATEGORIAS_COMISION en remisiones.service.ts, usadas
// en el formulario "Agregar Comisión") — se muestran siempre en este orden en la franja de
// estadísticas de "Asignación de Comisiones", tengan datos o no.
const COMISION_CATEGORIAS = ['TÉCNICOS', 'INVERSIONISTAS', 'PLUS'] as const;
const COMISION_CATEGORIA_LABEL: Record<string, string> = { 'TÉCNICOS': 'Técnicos', 'INVERSIONISTAS': 'Inversionistas', 'PLUS': 'Plus' };
const COMISION_CATEGORIA_LABEL_SINGULAR: Record<string, string> = { 'TÉCNICOS': 'Técnico', 'INVERSIONISTAS': 'Inversionista', 'PLUS': 'Plus' };
const COMISION_CATEGORIA_COLOR: Record<string, { text: string; bg: string; border: string }> = {
  'TÉCNICOS': { text: '#2563eb', bg: '#dbeafe', border: '#bfdbfe' },
  'INVERSIONISTAS': { text: '#c2730c', bg: '#fef3c7', border: '#fde68a' },
  'PLUS': { text: '#6d28d9', bg: '#ede9fe', border: '#ddd6fe' },
};
const comisionCategoriaColor = (categoria: string) => COMISION_CATEGORIA_COLOR[categoria] ?? { text: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb' };

export const formatMoney = (value: any): string => {
  if (value === null || value === undefined) return '-';
  const num = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isNaN(num) ? '-' : `$${num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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


export const formatDate = (dateString: string | null): string => {
  if (!dateString) return '-';
  try {
    // Si es ISO timestamp (2026-12-01T00:00:00.000Z)
    if (dateString.includes('T')) {
      const date = new Date(dateString);
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${day}/${month}/${year}`;
    }
    // Si es ISO date (2026-12-01)
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

// Para un Date real del navegador (ej. "ahora" al abrir un formulario) — a diferencia de
// formatDateTime, que lee componentes UTC porque las fechas que vienen del backend son
// timestamps "naive" guardados como si fueran UTC. Aquí sí queremos la hora local real.
const formatDateTimeLocal = (date: Date): string => {
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day   = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const mins  = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${mins}`;
};

// Mismos íconos/colores que la lista de Programaciones (ProgramacionesPage.tsx)
const PROGRAMACION_FLAGS: { key: 'sinRemision' | 'consumoNoValidado' | 'sinComision' | 'cerrada'; icon: React.ReactNode; color: string; label: string }[] = [
  { key: 'sinRemision', icon: <AlertCircle size={12} />, color: '#dc2626', label: 'Sin Remisión' },
  { key: 'consumoNoValidado', icon: <CircleX size={12} />, color: '#7c3aed', label: 'Sin Validar Consumo' },
  {
    key: 'sinComision',
    icon: (
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 12, height: 12 }}>
        <DollarSign size={12} />
        <span style={{ position: 'absolute', top: '50%', left: '50%', width: '16px', height: '1.5px', backgroundColor: 'currentColor', transform: 'translate(-50%, -50%) rotate(-45deg)', borderRadius: '1px' }} />
      </span>
    ),
    color: '#2563eb',
    label: 'Sin Comisión',
  },
  { key: 'cerrada', icon: <Lock size={12} />, color: '#6b7280', label: 'Cerrada' },
];

export default function ProgramacionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigateWithLoading();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isMobile, isNarrow } = useResponsiveStyles();
  const [mainTab, setMainTab] = useState('resumen');
  const [isScrolled, setIsScrolled] = useState(false);
  const [showCompactHeader, setShowCompactHeader] = useState(false);
  const [compactHeaderClosing, setCompactHeaderClosing] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 80);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Todas las tablas con scroll interno de esta página usan la misma rueda "amortiguada" (ver
  // useSmoothWheelScroll) — cada ref solo existe en el DOM cuando su pestaña/sección está activa
  // (montaje condicional), así que el hook reintenta engancharse cada vez que cambia mainTab.
  const tecnicosAsociadosScrollRef = useRef<HTMLDivElement>(null);
  const cotizacionesScrollRef = useRef<HTMLDivElement>(null);
  const remisionesScrollRef = useRef<HTMLDivElement>(null);
  const requisicionesScrollRef = useRef<HTMLDivElement>(null);
  const notasCreditoScrollRef = useRef<HTMLDivElement>(null);
  const documentosScrollRef = useRef<HTMLDivElement>(null);
  const tecnicosSugeridosScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(tecnicosSugeridosScrollRef, [mainTab]);
  const consumosScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(consumosScrollRef, [mainTab], 6);
  const validacionScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(validacionScrollRef, [mainTab]);
  const comisionesScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(comisionesScrollRef, [mainTab], 3);
  const gastosScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(gastosScrollRef, [mainTab]);
  const fuentesScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(fuentesScrollRef, [mainTab]);

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
  const [hoveredTecnicoId, setHoveredTecnicoId] = useState<string | null>(null);
  const [hoveredComisionId, setHoveredComisionId] = useState<string | null>(null);
  const [comisionFiltro, setComisionFiltro] = useState<string>('todas');
  const [hoveredNotaCreditoId, setHoveredNotaCreditoId] = useState<string | null>(null);
  const [hoveredGastoId, setHoveredGastoId] = useState<string | null>(null);
  const [hoveredFuenteId, setHoveredFuenteId] = useState<string | null>(null);
  const [hoveredDocumentoId, setHoveredDocumentoId] = useState<string | null>(null);
  const [selectedDocumento, setSelectedDocumento] = useState<DocumentoProgramacionItem | null>(null);
  const [documentoArchivoError, setDocumentoArchivoError] = useState(false);
  const [documentoArchivoAbriendo, setDocumentoArchivoAbriendo] = useState(false);
  useEffect(() => {
    setDocumentoArchivoError(false);
    setDocumentoArchivoAbriendo(false);
  }, [selectedDocumento]);
  const [selectedNotaCredito, setSelectedNotaCredito] = useState<NotaCreditoItem | null>(null);
  const [selectedCotizacionId, setSelectedCotizacionId] = useState<string | null>(null);
  const [cotizacionToastMsg, setCotizacionToastMsg] = useState<string | null>(null);
  const [selectedFuente, setSelectedFuente] = useState<FuenteRelacionadaItem | null>(null);
  const [selectedTecnico, setSelectedTecnico] = useState<RemTecnicoItem | null>(null);
  const [cerrarError, setCerrarError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showAgregarMenu, setShowAgregarMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showEnviarMenu, setShowEnviarMenu] = useState(false);
  const agregarMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const enviarMenuRef = useRef<HTMLDivElement>(null);
  const [showWhatsappConfirm, setShowWhatsappConfirm] = useState(false);
  // Modal con un link real a WhatsApp Web (nunca window.open programático — con WhatsApp Desktop
  // instalado, un <a target="_blank"> real sí lo entrega a la app en vez de abrir una pestaña;
  // window.open programático no es confiable para eso). Mismo modal para "con PDF" y "sin PDF" —
  // whatsappLinkIncluyePdf solo cambia el texto para mencionar o no el PDF descargado.
  const [whatsappLink, setWhatsappLink] = useState<string | null>(null);
  const [whatsappLinkIncluyePdf, setWhatsappLinkIncluyePdf] = useState(false);
  const [whatsappDownloadedFileName, setWhatsappDownloadedFileName] = useState<string | null>(null);
  // Respaldo del caso en que sí se pudo compartir el PDF directo (ver handleConfirmarWhatsappConArchivo):
  // WhatsApp a veces ignora el texto del mensaje y solo adjunta el archivo.
  const [whatsappCopiedToast, setWhatsappCopiedToast] = useState(false);
  // Confirmado con el error real del navegador (NotAllowedError: "Must be handling a user
  // gesture to perform a share request"): el diálogo nativo de "elegir archivo" SIEMPRE le quita
  // a Chrome el gesto de usuario que navigator.share() exige — no es opcional evitarlo, así que
  // se pide un clic más, ya sin diálogo nativo de por medio, justo antes de llamar a share().
  const [pendingWhatsappShare, setPendingWhatsappShare] = useState<{ file: File; mensaje: string } | null>(null);
  // Mismo comportamiento que "Adjuntar cotización" de Gmail (ver showGmailCotizacionPicker más
  // abajo): en vez de subir un PDF cualquiera desde el dispositivo, se elige una cotización ya
  // guardada y se genera su PDF al vuelo.
  const [showWhatsappCotizacionPicker, setShowWhatsappCotizacionPicker] = useState(false);
  const [whatsappCotizacionSearch, setWhatsappCotizacionSearch] = useState('');
  const [generandoPdfWhatsapp, setGenerandoPdfWhatsapp] = useState(false);
  const [showGmailConfirm, setShowGmailConfirm] = useState(false);
  const [gmailSending, setGmailSending] = useState(false);
  const [gmailProgress, setGmailProgress] = useState(0);
  const [showGmailSuccess, setShowGmailSuccess] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  // En vez de subir un PDF cualquiera desde el dispositivo, se elige una cotización ya guardada en
  // el sistema (mismo buscador que ya usa Editar) y se genera su PDF al vuelo, igual que "Generar
  // PDF"/"Enviar por Gmail" en Cotizaciones — reutiliza esas mismas funciones con import() dinámico
  // para no meter CotizacionesPage.tsx entero en el bundle de Programaciones sin necesidad.
  const [showGmailCotizacionPicker, setShowGmailCotizacionPicker] = useState(false);
  const [gmailCotizacionSearch, setGmailCotizacionSearch] = useState('');
  const [generandoPdfGmail, setGenerandoPdfGmail] = useState(false);

  const enviarAGmail = async (file?: File) => {
    if (!id) return;

    setGmailSending(true);
    setGmailProgress(0);
    setGmailError(null);
    try {
      const formData = new FormData();
      formData.append('programacionId', id);
      if (file) formData.append('file', file);
      await api.post('/integraciones/google-chat/send-programacion', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (evt) => {
          if (!evt.total) return;
          setGmailProgress(Math.round((evt.loaded / evt.total) * 100));
        },
      });
      setShowGmailSuccess(true);
    } catch (err: any) {
      setGmailError(err?.response?.data?.message ?? 'No se pudo enviar la información al chat');
      setTimeout(() => setGmailError(null), 4000);
    } finally {
      setGmailSending(false);
      setGmailProgress(0);
    }
  };

  const handleGmailSinArchivo = () => {
    setShowGmailConfirm(false);
    enviarAGmail();
  };

  const handleGmailConArchivo = () => {
    setShowGmailConfirm(false);
    setShowGmailCotizacionPicker(true);
  };

  const handleSeleccionarCotizacionGmail = async (cotizacionId: string) => {
    setShowGmailCotizacionPicker(false);
    setGmailCotizacionSearch('');
    setGenerandoPdfGmail(true);
    try {
      const [{ buildCotizacionPdf, cotizacionPdfFileName }, detalle] = await Promise.all([
        import('../cotizaciones/CotizacionesPage'),
        cotizacionesService.getById(cotizacionId),
      ]);
      const doc = await buildCotizacionPdf(detalle);
      const fileName = cotizacionPdfFileName(detalle);
      const blob: Blob = doc.output('blob');
      const file = new File([blob], fileName, { type: 'application/pdf' });
      await enviarAGmail(file);
    } catch {
      setGmailError('No se pudo generar el PDF de esa cotización');
      setTimeout(() => setGmailError(null), 4000);
    } finally {
      setGenerandoPdfGmail(false);
    }
  };

  // Mismos datos que se usan para la card de Google Chat, en texto plano con el formato ligero
  // que WhatsApp sí soporta (*negrita*, saltos de línea) — no hay cards ni botones ahí.
  const buildWhatsappMessage = (prog: NonNullable<typeof programacion>, incluyePdf: boolean): string => {
    const medicos = prog.medicos.map(m => m.medico.nombreCompleto).join(', ') || '-';
    const tecnicos = prog.tecnicos.map(t => t.tecnico.nombreCompleto).join(', ') || '-';
    const lines = [
      '*NUEVA PROGRAMACIÓN QUIRÚRGICA*',
      '',
      `*N° Programa:* ${prog.id}`,
      `*Hospital:* ${prog.hospital?.nombre ?? '-'}`,
      `*Fecha y hora Qx:* ${formatDate(prog.fechaQx)} · ${prog.horaQx ?? '-'}`,
      `*Ciudad Qx:* ${prog.hospital?.ciudadCat?.nombre ?? prog.ciudad ?? '-'}`,
      `*Médico:* ${medicos}`,
      `*Técnicos:* ${tecnicos}`,
      '',
      '*Consumo:*',
      prog.consumo || '-',
      '',
      '*Observaciones:*',
      prog.observaciones || '-',
    ];
    if (incluyePdf) lines.push('', '*Se adjunta la cotización en PDF.*');
    return lines.join('\n');
  };

  const handleWhatsappSinPdf = async () => {
    setShowWhatsappConfirm(false);
    if (!programacion) return;
    const mensaje = buildWhatsappMessage(programacion, false);

    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ text: mensaje, title: 'Programación quirúrgica' });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // Si falla por otro motivo, se sigue con el respaldo abajo.
      }
    }

    // Respaldo (típicamente escritorio, sin soporte de compartir nativo): un link wa.me sin
    // número de destinatario no funciona en escritorio — WhatsApp no sabe a qué chat mandarlo y
    // se queda en una pantalla genérica sin avanzar. Se deja que el usuario abra WhatsApp con un
    // clic real en el modal de abajo (mismo <a> que ya usa el respaldo "con PDF") en vez de
    // window.open programático, que no entrega el link a WhatsApp Desktop de forma confiable.
    try {
      await navigator.clipboard.writeText(mensaje);
    } catch {
      // Sin permiso de portapapeles — el modal de abajo igual deja abrir WhatsApp.
    }
    setWhatsappLinkIncluyePdf(false);
    setWhatsappDownloadedFileName(null);
    setWhatsappLink('https://web.whatsapp.com/');
  };

  const handleWhatsappConPdf = () => {
    setShowWhatsappConfirm(false);
    setShowWhatsappCotizacionPicker(true);
  };

  const handleSeleccionarCotizacionWhatsapp = async (cotizacionId: string) => {
    setShowWhatsappCotizacionPicker(false);
    setWhatsappCotizacionSearch('');
    if (!programacion) return;
    setGenerandoPdfWhatsapp(true);
    try {
      const [{ buildCotizacionPdf, cotizacionPdfFileName }, detalle] = await Promise.all([
        import('../cotizaciones/CotizacionesPage'),
        cotizacionesService.getById(cotizacionId),
      ]);
      const doc = await buildCotizacionPdf(detalle);
      const fileName = cotizacionPdfFileName(detalle);
      const blob: Blob = doc.output('blob');
      const file = new File([blob], fileName, { type: 'application/pdf' });
      const mensaje = buildWhatsappMessage(programacion, true);

      // El PDF se genera de forma asíncrona (import dinámico + llamada a la API), así que para
      // cuando termina ya se perdió el gesto de usuario fresco que navigator.share() exige en
      // cualquier dispositivo (no solo escritorio, a diferencia del selector de archivo nativo
      // que sí lo conservaba) — siempre se pide un clic más antes de compartir.
      setPendingWhatsappShare({ file, mensaje });
    } catch {
      // Reutiliza el mismo mecanismo de error visible que ya tiene el envío a Gmail (un toast
      // genérico, sin nada específico de Gmail en su render) — no hay uno propio para WhatsApp
      // porque hasta ahora nunca podía fallar la generación del archivo.
      setGmailError('No se pudo generar el PDF de esa cotización');
      setTimeout(() => setGmailError(null), 4000);
    } finally {
      setGenerandoPdfWhatsapp(false);
    }
  };

  // Clic de confirmación en escritorio (ver pendingWhatsappShare): es el gesto de usuario fresco
  // (sin diálogo nativo de por medio) que navigator.share() exige — sin este paso, share()
  // siempre falla con NotAllowedError.
  const handleConfirmarWhatsappConArchivo = async () => {
    if (!pendingWhatsappShare) return;
    const { file, mensaje } = pendingWhatsappShare;
    setPendingWhatsappShare(null);

    const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean; share?: (data: ShareData) => Promise<void> };
    if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: file.name, text: mensaje });
        // WhatsApp (como varias apps que reciben archivos vía Web Share API) a veces ignora el
        // campo "text" y solo adjunta el PDF, sin el mensaje — se copia igual al portapapeles
        // como respaldo para que el mensaje quede a un "pegar" de distancia si no llegó solo.
        try {
          await navigator.clipboard.writeText(mensaje);
          setWhatsappCopiedToast(true);
        } catch {
          // Sin permiso de portapapeles — no hay nada más que hacer en este caso.
        }
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // Si falla por otro motivo, se sigue con el respaldo abajo.
      }
    }

    // Respaldo: el navegador no soporta compartir archivos directamente (el caso típico es
    // escritorio — Web Share API con archivos casi no tiene soporte fuera de Android/ChromeOS).
    // El PDF ahora se genera al vuelo desde la cotización (ya no se elige un archivo del disco
    // del usuario), así que sin esta descarga el aviso de "adjunta el PDF manualmente" no tendría
    // ningún archivo real al cual apuntar.
    const downloadUrl = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(downloadUrl);

    try {
      await navigator.clipboard.writeText(mensaje);
    } catch {
      // Sin permiso de portapapeles — el modal de abajo igual deja abrir WhatsApp.
    }
    setWhatsappLinkIncluyePdf(true);
    setWhatsappDownloadedFileName(file.name);
    setWhatsappLink('https://web.whatsapp.com/');
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (agregarMenuRef.current && !agregarMenuRef.current.contains(e.target as Node)) setShowAgregarMenu(false);
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setShowMoreMenu(false);
      if (enviarMenuRef.current && !enviarMenuRef.current.contains(e.target as Node)) setShowEnviarMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const [comisionTooltipPos, setComisionTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const queryClient = useQueryClient();
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ fechaQx: '', horaQx: '', sedeId: '', hospitalId: '' });
  const [editObservaciones, setEditObservaciones] = useState('');
  const [editConsumo, setEditConsumo] = useState('');
  const [editConsumoPanelOpen, setEditConsumoPanelOpen] = useState(false);
  const [editConsumoProductoSearch, setEditConsumoProductoSearch] = useState('');
  const [editConsumoProductoFocused, setEditConsumoProductoFocused] = useState(false);
  const editConsumoPanelRef = useRef<HTMLDivElement>(null);

  // Al cerrar el panel (clic afuera, X, o volver a pulsar el botón) se limpia la búsqueda a medias.
  const closeEditConsumoPanel = () => {
    setEditConsumoPanelOpen(false);
    setEditConsumoProductoSearch('');
  };

  // Cierra el panel "Agregar del catálogo" al hacer clic afuera (mismo patrón que DatePicker).
  useEffect(() => {
    if (!editConsumoPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (editConsumoPanelRef.current?.contains(e.target as Node)) return;
      closeEditConsumoPanel();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editConsumoPanelOpen]);

  const [editMedicos, setEditMedicos] = useState<MedicoOption[]>([]);
  const [medicoSearch, setMedicoSearch] = useState('');
  const [editHospitalSearch, setEditHospitalSearch] = useState('');
  const [editHospitalFocused, setEditHospitalFocused] = useState(false);
  const [editCotizaciones, setEditCotizaciones] = useState<CotizacionOption[]>([]);
  const [editCotizacionFocused, setEditCotizacionFocused] = useState(false);
  const [editCotizacionFilterText, setEditCotizacionFilterText] = useState('');
  const [importandoEditConsumos, setImportandoEditConsumos] = useState(false);
  const [showAgregarCotizacionModal, setShowAgregarCotizacionModal] = useState(false);
  const [nuevasCotizaciones, setNuevasCotizaciones] = useState<CotizacionOption[]>([]);
  const [nuevaCotizacionSearch, setNuevaCotizacionSearch] = useState('');
  const [nuevaCotizacionFocused, setNuevaCotizacionFocused] = useState(false);
  const [editTecnicosSugeridos, setEditTecnicosSugeridos] = useState<TecnicoOption[]>([]);
  const [editTecnicoSugeridoSearch, setEditTecnicoSugeridoSearch] = useState('');
  const [editTecnicoSugeridoFocused, setEditTecnicoSugeridoFocused] = useState(false);
  // Estado original de técnicos sugeridos al abrir el modal — al guardar se compara contra
  // editTecnicosSugeridos para saber cuáles crear y cuáles eliminar (no hay un endpoint de
  // "reemplazar todos" como sí existe para médicos/cotizaciones).
  const editTecnicosSugeridosSnapshotRef = useRef<TecnicoSugeridoItem[]>([]);
  const [showEditSuccess, setShowEditSuccess] = useState(false);
  const [editProgramacionError, setEditProgramacionError] = useState<{ field: string; message: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const editSnapshotRef = useRef<string | null>(null);

  // El formulario de "Agregar Comisión" vive en AgregarComisionModal.tsx (componente compartido
  // con RemisionDetailPage) — aquí solo queda abrirlo/cerrarlo, para no mantener dos copias del
  // mismo formulario que terminan divergiendo.
  const [showComisionModal, setShowComisionModal] = useState(false);
  const [showComisionSuccess, setShowComisionSuccess] = useState(false);
  const [expandedComisionKeys, setExpandedComisionKeys] = useState<Set<string>>(new Set());
  const [hoveredComisionLineaKey, setHoveredComisionLineaKey] = useState<string | null>(null);
  const [selectedComisionId, setSelectedComisionId] = useState<string | null>(null);
  const [finConsumoExpanded, setFinConsumoExpanded] = useState(false);
  const [finObservacionesExpanded, setFinObservacionesExpanded] = useState(false);

  const [showDocumentoModal, setShowDocumentoModal] = useState(false);
  const [documentoNombre, setDocumentoNombre] = useState('');
  const [documentoArchivo, setDocumentoArchivo] = useState<File | null>(null);
  const [documentoCargadoEl, setDocumentoCargadoEl] = useState<Date>(new Date());
  const [documentoError, setDocumentoError] = useState<{ field: string; message: string } | null>(null);
  const [showDocumentoSuccess, setShowDocumentoSuccess] = useState(false);
  const [showInsumoSuccess, setShowInsumoSuccess] = useState(false);

  const usuarioActual = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('usuario') ?? '{}');
    } catch {
      return {};
    }
  }, []);

  const [showRequisicionModal, setShowRequisicionModal] = useState(false);
  const [requisicionFecha, setRequisicionFecha] = useState('');
  const [requisicionCubrimiento, setRequisicionCubrimiento] = useState<CubrimientoOption | null>(null);
  const [requisicionTarifaId, setRequisicionTarifaId] = useState('');
  // Aparte del id por lo mismo que en Editar Requisición: la tarifa propia del hospital puede no
  // pertenecer al cubrimiento elegido, así que no siempre se puede resolver su nombre buscándola
  // en tarifasCubrimiento.
  const [requisicionTarifaLabel, setRequisicionTarifaLabel] = useState('');
  const [requisicionTarifaSearch, setRequisicionTarifaSearch] = useState('');
  const [requisicionTarifaFocused, setRequisicionTarifaFocused] = useState(false);
  const [requisicionError, setRequisicionError] = useState<{ field: string; message: string } | null>(null);
  const [showRequisicionSuccess, setShowRequisicionSuccess] = useState(false);
  const [requisicionCreatedId, setRequisicionCreatedId] = useState<string | null>(null);

  interface InsumoDraft {
    tempId: string;
    loteId?: string;
    loteLabel?: string;
    productoId?: string;
    productoLabel?: string;
    cantidad: number;
    precio: number;
  }
  const [requisicionInsumos, setRequisicionInsumos] = useState<InsumoDraft[]>([]);
  const [showInsumoSubModal, setShowInsumoSubModal] = useState(false);

  const [showRemisionModal, setShowRemisionModal] = useState(false);
  const [showRemisionSuccess, setShowRemisionSuccess] = useState(false);
  const [remisionCreatedId, setRemisionCreatedId] = useState<string | null>(null);

  const [validarConsumoId, setValidarConsumoId] = useState<string | null>(null);
  const [showValidarConsumoSuccess, setShowValidarConsumoSuccess] = useState(false);
  const [selectedConsumoId, setSelectedConsumoId] = useState<string | null>(null);
  const [selectedValConsumoId, setSelectedValConsumoId] = useState<string | null>(null);
  const [selectedRequisicionId, setSelectedRequisicionId] = useState<string | null>(null);
  const [hoveredConsumoRowId, setHoveredConsumoRowId] = useState<string | null>(null);
  const [hoveredValidacionRowId, setHoveredValidacionRowId] = useState<string | null>(null);

  const [showTecnicoSugeridoModal, setShowTecnicoSugeridoModal] = useState(false);
  const [tecnicoSugeridoSeleccionados, setTecnicoSugeridoSeleccionados] = useState<TecnicoOption[]>([]);
  const [tecnicoSugeridoSearch, setTecnicoSugeridoSearch] = useState('');
  const [tecnicoSugeridoFocused, setTecnicoSugeridoFocused] = useState(false);
  const [tecnicoSugeridoError, setTecnicoSugeridoError] = useState<{ field: string; message: string } | null>(null);
  const [showTecnicoSugeridoSuccess, setShowTecnicoSugeridoSuccess] = useState(false);

  useBodyScrollLock(!!(selectedTecnico || showEditModal || showDocumentoModal || showRequisicionModal || showInsumoSubModal || showRemisionModal || showTecnicoSugeridoModal || showAgregarCotizacionModal || selectedCotizacionId || validarConsumoId));

  const { data: programacion, isLoading, error } = useQuery<ProgramacionDetail | null>({
    queryKey: ['programacion', id],
    queryFn: () => programacionesService.getById(id!),
    enabled: !!id,
  });
  useSmoothWheelScroll(cotizacionesScrollRef, [mainTab, programacion?.cotizaciones?.length]);
  // Cotizaciones/Requisiciones/Remisiones van de la más antigua a la más reciente — al abrir (o
  // al agregar un registro nuevo) el scroll arranca mostrando el final de la lista, no el inicio.
  useEffect(() => {
    const el = cotizacionesScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mainTab, programacion?.cotizaciones?.length]);

  const [finBarMounted, setFinBarMounted] = useState(false);
  useEffect(() => {
    if (!programacion) return;
    const raf = requestAnimationFrame(() => setFinBarMounted(true));
    return () => cancelAnimationFrame(raf);
  }, [programacion]);

  const { data: remisiones = [] } = useQuery<RemisionItem[]>({
    queryKey: ['remisiones', id],
    queryFn: () => remisionesService.findByProgramacion(id!),
    enabled: !!id,
  });
  useSmoothWheelScroll(remisionesScrollRef, [mainTab, remisiones.length]);
  useEffect(() => {
    const el = remisionesScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mainTab, remisiones.length]);

  const { data: sedeOptions = [] } = useQuery<SedeOption[]>({
    queryKey: ['programaciones-sedes'],
    queryFn: () => programacionesService.getSedes(),
    enabled: showEditModal,
  });

  const { data: hospitalOptions = [] } = useQuery<HospitalOption[]>({
    queryKey: ['programaciones-hospitales'],
    queryFn: () => programacionesService.getHospitales(),
    enabled: showEditModal,
  });

  const { data: medicoResults = [] } = useQuery<MedicoOption[]>({
    queryKey: ['programaciones-medicos', medicoSearch],
    queryFn: () => programacionesService.searchMedicos(medicoSearch),
    enabled: showEditModal,
  });

  const { data: editConsumoProductoResults = [] } = useQuery<ProductoOption[]>({
    queryKey: ['programaciones-edit-consumo-productos', editConsumoProductoSearch],
    queryFn: () => remisionesService.searchProductos(editConsumoProductoSearch),
    enabled: showEditModal && editConsumoProductoFocused,
  });

  const editMedicoNombres = editMedicos.map(m => m.nombreCompleto);
  const { data: editCotizacionResults = [] } = useQuery<CotizacionOption[]>({
    queryKey: ['programaciones-cotizaciones', editMedicoNombres, editForm.hospitalId],
    queryFn: () => programacionesService.searchCotizaciones(undefined, editMedicoNombres, editForm.hospitalId || undefined),
    enabled: showEditModal && editCotizacionFocused && editMedicoNombres.length > 0 && !!editForm.hospitalId,
  });
  // El servidor ya acota a las cotizaciones de los médicos seleccionados — esto solo afina esa
  // lista en el navegador por folio/cirugía/fecha/total, sin volver a pedirle nada al backend.
  const editCotizacionFilterQuery = editCotizacionFilterText.trim().toLowerCase();
  const editCotizacionResultsFiltradas = editCotizacionFilterQuery
    ? editCotizacionResults.filter(c => {
        const folio = (c.numCotizacion ?? c.id).toLowerCase();
        const cirugia = (c.cirugia ?? '').toLowerCase();
        const fecha = formatDate(c.fecha).toLowerCase();
        const total = formatMoney(c.total).toLowerCase();
        return folio.includes(editCotizacionFilterQuery)
          || cirugia.includes(editCotizacionFilterQuery)
          || fecha.includes(editCotizacionFilterQuery)
          || total.includes(editCotizacionFilterQuery);
      })
    : editCotizacionResults;

  const { data: editTecnicoComisionistaResults = [] } = useQuery<TecnicoOption[]>({
    queryKey: ['tecnicos-sugeridos-busqueda', editTecnicoSugeridoSearch],
    queryFn: () => remisionesService.searchTecnicosSugeridos(editTecnicoSugeridoSearch),
    enabled: showEditModal && editTecnicoSugeridoFocused,
  });

  // Cotizaciones para los pickers de "Enviar por Gmail"/"Enviar por WhatsApp" — solo las que ya
  // están asociadas a ESTA programación (programacion.cotizaciones, ya viene cargado con el
  // detalle, sin pedirle nada más al backend), no una búsqueda abierta por médico: lo que se
  // adjunta ahí es el PDF de una cotización de esta cirugía en concreto, no cualquiera del mismo
  // médico.
  const gmailCotizacionResults = programacion?.cotizaciones ?? [];
  const gmailCotizacionFilterQuery = gmailCotizacionSearch.trim().toLowerCase();
  const gmailCotizacionResultsFiltradas = gmailCotizacionFilterQuery
    ? gmailCotizacionResults.filter(c => {
        const folio = (c.numCotizacion ?? c.id).toLowerCase();
        const cirugia = (c.cirugia ?? '').toLowerCase();
        const fecha = formatDate(c.fecha).toLowerCase();
        const total = formatMoney(c.total).toLowerCase();
        return folio.includes(gmailCotizacionFilterQuery)
          || cirugia.includes(gmailCotizacionFilterQuery)
          || fecha.includes(gmailCotizacionFilterQuery)
          || total.includes(gmailCotizacionFilterQuery);
      })
    : gmailCotizacionResults;

  const whatsappCotizacionResults = programacion?.cotizaciones ?? [];
  const whatsappCotizacionFilterQuery = whatsappCotizacionSearch.trim().toLowerCase();
  const whatsappCotizacionResultsFiltradas = whatsappCotizacionFilterQuery
    ? whatsappCotizacionResults.filter(c => {
        const folio = (c.numCotizacion ?? c.id).toLowerCase();
        const cirugia = (c.cirugia ?? '').toLowerCase();
        const fecha = formatDate(c.fecha).toLowerCase();
        const total = formatMoney(c.total).toLowerCase();
        return folio.includes(whatsappCotizacionFilterQuery)
          || cirugia.includes(whatsappCotizacionFilterQuery)
          || fecha.includes(whatsappCotizacionFilterQuery)
          || total.includes(whatsappCotizacionFilterQuery);
      })
    : whatsappCotizacionResults;

  const handleImportarEditConsumosCotizacion = async () => {
    if (editCotizaciones.length === 0 || importandoEditConsumos) return;
    setImportandoEditConsumos(true);
    try {
      const nombres = await programacionesService.getConsumosDeCotizaciones(editCotizaciones.map(c => c.id));
      if (nombres.length > 0) {
        setEditConsumo(prev => (prev.trim() ? `${prev.trim()}, ${nombres.join(', ')}` : nombres.join(', ')));
        setEditProgramacionError(null);
      }
    } finally {
      setImportandoEditConsumos(false);
    }
  };

  const updateMutation = useMutation({
    mutationFn: () => programacionesService.update(id!, {
      fechaQx: editForm.fechaQx || undefined,
      horaQx: editForm.horaQx || undefined,
      sedeId: editForm.sedeId || undefined,
      hospitalId: editForm.hospitalId || undefined,
      observaciones: editObservaciones,
      consumo: editConsumo,
      medicoIds: editMedicos.map(m => m.id),
      cotizacionIds: editCotizaciones.map(c => c.id),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programacion', id] });
    },
  });

  // Modal dedicado para "+ Agregar cotización" en la mini-tarjeta de Resumen — a diferencia del
  // picker de Cotizaciones dentro de Editar Programación (que reemplaza la lista completa), este
  // solo agrega: al guardar, envía la lista actual + las nuevas (cotizacionIds hace `set`, por
  // eso hay que mandar la unión completa, no solo las nuevas).
  const agregarCotizacionMutation = useMutation({
    mutationFn: () => programacionesService.update(id!, {
      cotizacionIds: [...(programacion?.cotizaciones.map(c => c.id) ?? []), ...nuevasCotizaciones.map(c => c.id)],
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programacion', id] });
      setShowAgregarCotizacionModal(false);
      setNuevasCotizaciones([]);
      setNuevaCotizacionSearch('');
    },
  });

  const nuevaCotizacionMedicoNombres = (programacion?.medicos ?? []).map(m => m.medico.nombreCompleto);
  const { data: nuevaCotizacionResults = [] } = useQuery<CotizacionOption[]>({
    queryKey: ['programaciones-cotizaciones', nuevaCotizacionMedicoNombres, nuevaCotizacionSearch],
    queryFn: () => programacionesService.searchCotizaciones(nuevaCotizacionSearch, nuevaCotizacionMedicoNombres),
    enabled: showAgregarCotizacionModal && nuevaCotizacionFocused && nuevaCotizacionMedicoNombres.length > 0,
  });
  const cotizacionesYaVinculadasIds = new Set((programacion?.cotizaciones ?? []).map(c => c.id));

  const buildEditSnapshot = (
    form: { fechaQx: string; horaQx: string; sedeId: string; hospitalId: string },
    observaciones: string,
    consumo: string,
    medicos: MedicoOption[],
    cotizaciones: CotizacionOption[],
  ): string =>
    JSON.stringify({
      fechaQx: form.fechaQx,
      horaQx: form.horaQx,
      sedeId: form.sedeId,
      hospitalId: form.hospitalId,
      observaciones,
      consumo,
      medicoIds: medicos.map(m => m.id).slice().sort(),
      cotizacionIds: cotizaciones.map(c => c.id).slice().sort(),
    });

  const handleGuardarEdit = async () => {
    if (!editForm.fechaQx) { setEditProgramacionError({ field: 'fechaQx', message: 'Selecciona la fecha.' }); return; }
    if (!editForm.horaQx || editForm.horaQx.split(':').some(p => !p)) { setEditProgramacionError({ field: 'horaQx', message: 'Selecciona la hora.' }); return; }
    if (!editForm.sedeId) { setEditProgramacionError({ field: 'sedeId', message: 'Selecciona la sede.' }); return; }
    if (!editForm.hospitalId) { setEditProgramacionError({ field: 'hospitalId', message: 'Selecciona el hospital.' }); return; }
    if (editMedicos.length === 0) { setEditProgramacionError({ field: 'medicos', message: 'Agrega al menos un médico.' }); return; }
    if (!editConsumo.trim()) { setEditProgramacionError({ field: 'consumo', message: 'Ingresa el consumo.' }); return; }
    setEditProgramacionError(null);

    // Técnicos sugeridos no tiene un endpoint de "reemplazar todos" (a diferencia de médicos y
    // cotizaciones) — se compara contra el snapshot tomado al abrir el modal para saber a
    // cuáles crear y a cuáles eliminar.
    const tecnicosOriginal = editTecnicosSugeridosSnapshotRef.current;
    const tecnicosOriginalIds = new Set(tecnicosOriginal.map(t => t.tecnicoId));
    const tecnicosNuevoIds = new Set(editTecnicosSugeridos.map(t => t.id));
    const tecnicosAEliminar = tecnicosOriginal.filter(t => !tecnicosNuevoIds.has(t.tecnicoId));
    const tecnicosAAgregar = editTecnicosSugeridos.filter(t => !tecnicosOriginalIds.has(t.id));
    const huboCambiosTecnicos = tecnicosAEliminar.length > 0 || tecnicosAAgregar.length > 0;

    const currentSnapshot = buildEditSnapshot(editForm, editObservaciones, editConsumo, editMedicos, editCotizaciones);
    const huboCambiosPrincipales = currentSnapshot !== editSnapshotRef.current;

    if (!huboCambiosPrincipales && !huboCambiosTecnicos) {
      setShowEditModal(false);
      return;
    }

    setSavingEdit(true);
    try {
      if (huboCambiosTecnicos) {
        await Promise.all([
          ...tecnicosAEliminar.map(t => remisionesService.deleteTecnicoSugerido(t.id)),
          ...tecnicosAAgregar.map(t => remisionesService.createTecnicoSugerido({ programacionId: id!, tecnicoId: t.id })),
        ]);
        queryClient.invalidateQueries({ queryKey: ['tecnicos-sugeridos', id] });
      }
      if (huboCambiosPrincipales) {
        await updateMutation.mutateAsync();
      }
      setShowEditModal(false);
      setShowEditSuccess(true);
    } finally {
      setSavingEdit(false);
    }
  };

  useEffect(() => {
    if (!editProgramacionError) return;
    document.getElementById(`programacion-edit-field-${editProgramacionError.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [editProgramacionError]);

  const cerrarProgramacionMutation = useMutation({
    mutationFn: () => programacionesService.updateFlags(id!, { cerrada: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programacion', id] });
      setCerrarError(null);
    },
    onError: (err: any) => {
      setCerrarError(err?.response?.data?.message ?? 'No se pudo cerrar la programación.');
    },
  });

  const abrirProgramacionMutation = useMutation({
    mutationFn: () => programacionesService.updateFlags(id!, { cerrada: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programacion', id] });
      setCerrarError(null);
    },
    onError: (err: any) => {
      setCerrarError(err?.response?.data?.message ?? 'No se pudo reabrir la programación.');
    },
  });

  const deleteProgramacionMutation = useMutation({
    mutationFn: () => programacionesService.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programaciones'] });
      navigate('/operacion/programaciones');
    },
    onError: (err: any) => {
      setDeleteError(err?.response?.data?.message ?? 'No se pudo eliminar la programación.');
    },
  });

  const normalizeHora = (hora: string | null): string => {
    if (!hora) return '';
    const match = hora.trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match) return '';
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  };

  const openEditModal = () => {
    if (!programacion) return;
    const initialForm = {
      fechaQx: programacion.fechaQx ? programacion.fechaQx.split('T')[0] : '',
      horaQx: normalizeHora(programacion.horaQx),
      sedeId: programacion.sede?.id ?? '',
      hospitalId: programacion.hospital?.id ?? '',
    };
    const initialObservaciones = programacion.observaciones ?? '';
    const initialConsumo = programacion.consumo ?? '';
    const initialMedicos = programacion.medicos.map(m => m.medico);
    const initialCotizaciones = programacion.cotizaciones;
    setEditForm(initialForm);
    setEditObservaciones(initialObservaciones);
    setEditConsumo(initialConsumo);
    setEditMedicos(initialMedicos);
    setMedicoSearch('');
    setEditHospitalSearch('');
    setEditCotizaciones(initialCotizaciones);
    setEditCotizacionFilterText('');
    setEditConsumoPanelOpen(false);
    setEditConsumoProductoSearch('');
    setEditTecnicosSugeridos(tecnicosSugeridos.map(t => ({ id: t.tecnicoId, nombreCompleto: t.tecnico ?? '' })));
    editTecnicosSugeridosSnapshotRef.current = tecnicosSugeridos;
    setEditTecnicoSugeridoSearch('');
    setEditProgramacionError(null);
    editSnapshotRef.current = buildEditSnapshot(initialForm, initialObservaciones, initialConsumo, initialMedicos, initialCotizaciones);
    setShowEditModal(true);
  };

  const selectedEditHospital = hospitalOptions.find(h => h.id === editForm.hospitalId) ?? null;
  const editHospitalResults = editHospitalSearch.trim()
    ? hospitalOptions.filter(h => h.nombre.toLowerCase().includes(editHospitalSearch.trim().toLowerCase()))
    : hospitalOptions;

  const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const { data: tecnicos = [] } = useQuery<RemTecnicoItem[]>({
    queryKey: ['remisiones-tecnicos', id],
    queryFn: () => remisionesService.findTecnicosByProgramacion(id!),
    enabled: !!id,
  });
  // tecnicos.length en deps: la tabla con scroll solo existe en el DOM una vez que llegan los
  // datos (antes se muestra el emptyState) — sin esto el listener de la rueda nunca se engancha
  // si la consulta resuelve después del primer render.
  useSmoothWheelScroll(tecnicosAsociadosScrollRef, [mainTab, tecnicos.length]);

  const tecnicoGrupos = useMemo(() => {
    const grupos: { programacionId: string | null; numProgram: string | null; items: RemTecnicoItem[] }[] = [];
    for (const t of tecnicos) {
      const key = t.programacion?.id ?? null;
      let grupo = grupos.find(g => g.programacionId === key);
      if (!grupo) {
        grupo = { programacionId: key, numProgram: t.programacion?.numProgram ?? t.programacion?.id ?? null, items: [] };
        grupos.push(grupo);
      }
      const nombre = t.tecnico?.nombreCompleto ?? null;
      const yaExiste = nombre !== null && grupo.items.some(it => it.tecnico?.nombreCompleto === nombre);
      if (!yaExiste) grupo.items.push(t);
    }
    return grupos;
  }, [tecnicos]);
  const totalTecnicos = tecnicoGrupos.reduce((sum, g) => sum + g.items.length, 0);

  const { data: consumoGrupos = [] } = useQuery<ConsumoGrupo[]>({
    queryKey: ['remisiones-consumos', id],
    queryFn: () => remisionesService.findConsumosByProgramacion(id!),
    enabled: !!id,
  });
  const totalConsumos = consumoGrupos.reduce((sum, g) => sum + g.items.length, 0);

  const { data: validacionGrupos = [] } = useQuery<ValidacionConsumoGrupo[]>({
    queryKey: ['remisiones-validacion-consumos', id],
    queryFn: () => remisionesService.findValidacionConsumosByProgramacion(id!),
    enabled: !!id,
  });
  // Si un producto ya validado recibe más cantidad y se vuelve a validar, no aparecen como filas
  // separadas — se agrupan en una sola fila con un "×N" que avisa que hubo varias validaciones,
  // desplegable para ver (y abrir) cada validación individual. Mismo criterio que en RemisionDetailPage.
  type ValidacionGrupoProducto = { key: string; referenciaRemisionada: string | null; nombreRemisionado: string | null; referenciaValidada: string | null; nombreValidado: string | null; cantRemisionada: number; cantRealValidada: number; items: ValidacionConsumoItem[] };
  const validacionGruposAgrupados = validacionGrupos.map(grupo => {
    const porProducto = new Map<string, ValidacionGrupoProducto>();
    for (const v of grupo.items) {
      const key = v.detConsumoId ?? v.id;
      const existente = porProducto.get(key);
      if (existente) { existente.cantRealValidada += v.cantRealValidada; existente.items.push(v); }
      else porProducto.set(key, { key, referenciaRemisionada: v.referenciaRemisionada, nombreRemisionado: v.nombreRemisionado, referenciaValidada: v.referenciaValidada, nombreValidado: v.nombreValidado, cantRemisionada: v.cantRemisionada, cantRealValidada: v.cantRealValidada, items: [v] });
    }
    return { ...grupo, productos: [...porProducto.values()] };
  });
  const [expandedValidacionGroupKeys, setExpandedValidacionGroupKeys] = useState<Set<string>>(new Set());
  const totalValidacion = validacionGruposAgrupados.reduce((sum, g) => sum + g.productos.length, 0);

  const { data: comisionGrupos = [] } = useQuery<ComisionGrupo[]>({
    queryKey: ['remisiones-comisiones', id],
    queryFn: () => remisionesService.findComisionesByProgramacion(id!),
    enabled: !!id,
  });
  const totalComisiones = comisionGrupos.reduce((sum, g) => sum + g.items.length, 0);
  const comisionTotalGeneral = comisionGrupos.reduce((sum, g) => sum + g.items.reduce((s, it) => s + it.monto, 0), 0);
  const comisionCategoriaStats = COMISION_CATEGORIAS.map(cat => {
    const grupo = comisionGrupos.find(g => g.categoria === cat);
    const monto = grupo ? grupo.items.reduce((s, it) => s + it.monto, 0) : 0;
    const count = grupo ? grupo.items.length : 0;
    const pct = comisionTotalGeneral > 0 ? (monto / comisionTotalGeneral) * 100 : 0;
    return { categoria: cat, monto, count, pct };
  });
  const comisionTodosItems = comisionGrupos.flatMap(g => g.items.map(it => ({ ...it, categoria: g.categoria })));
  const comisionCategoriasPresentes = comisionGrupos.map(g => g.categoria);
  const comisionItemsFiltrados = comisionFiltro === 'todas'
    ? comisionTodosItems
    : comisionTodosItems.filter(it => it.categoria === comisionFiltro);

  const openComisionModal = () => setShowComisionModal(true);

  const { data: requisiciones = [] } = useQuery<RequisicionItem[]>({
    queryKey: ['remisiones-requisiciones', id],
    queryFn: () => remisionesService.findRequisicionesByProgramacion(id!),
    enabled: !!id,
  });
  useSmoothWheelScroll(requisicionesScrollRef, [mainTab, requisiciones.length]);
  useEffect(() => {
    const el = requisicionesScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mainTab, requisiciones.length]);

  const puedeCerrarProgramacion = remisiones.length > 0 && requisiciones.length > 0;
  const puedeAgregarRemision = requisiciones.length > 0;

  const { data: cubrimientos = [] } = useQuery<CubrimientoOption[]>({
    queryKey: ['cubrimientos'],
    queryFn: () => remisionesService.findCubrimientos(),
    enabled: showRequisicionModal,
  });

  const { data: tarifasCubrimiento = [] } = useQuery<TarifaOption[]>({
    queryKey: ['tarifas-cubrimiento', requisicionCubrimiento?.id],
    queryFn: () => remisionesService.findTarifasByCubrimiento(requisicionCubrimiento!.id),
    enabled: !!requisicionCubrimiento,
  });

  // Si el hospital de la programación (mismo Tercero que el backend usa como "contacto" al crear
  // la requisición, ver createRequisicion) tiene tarifa propia asignada, se autocompleta el campo
  // Tarifa — el usuario todavía puede cambiarla a mano desde el buscador de abajo.
  const requisicionContactoTerceroId = programacion?.hospital?.tercero?.id;
  const { data: requisicionContactoTarifa } = useQuery({
    queryKey: ['requisicion-contacto-tarifa', requisicionContactoTerceroId],
    queryFn: () => remisionesService.getTerceroTarifa(requisicionContactoTerceroId!),
    enabled: showRequisicionModal && !!requisicionContactoTerceroId,
  });
  useEffect(() => {
    // showRequisicionModal en las dependencias a propósito: si ya se había abierto este modal
    // antes para la misma programación, React Query devuelve el mismo objeto en caché para
    // requisicionContactoTarifa (no "cambia" de referencia), así que sin esto el efecto no volvía
    // a correr en una segunda apertura — dejaba los campos en blanco que openRequisicionModal
    // acababa de resetear, en vez de autocompletarlos de nuevo.
    if (!showRequisicionModal || !requisicionContactoTarifa?.tarifaId) return;
    // Una tarifa propia de hospital solo tiene sentido bajo el cubrimiento "Hospitales" — se
    // preselecciona también, igual que ya hace Cotizaciones. Si el usuario cambia el cubrimiento
    // a mano después, el propio manejador de ese click ya pisa la tarifa con la del cubrimiento
    // nuevo, así que no hace falta nada extra para que "cambie con él".
    const cubrimientoHospitales = cubrimientos.find(c => c.nombre?.trim().toUpperCase() === 'HOSPITALES');
    if (cubrimientoHospitales) setRequisicionCubrimiento(cubrimientoHospitales);
    setRequisicionTarifaId(requisicionContactoTarifa.tarifaId);
    setRequisicionTarifaLabel(requisicionContactoTarifa.tarifaNombre ?? '');
  }, [requisicionContactoTarifa, cubrimientos, showRequisicionModal]);
  // Sin texto se muestran todas las opciones (normalmente pocas por cubrimiento) — mismo criterio
  // que los demás buscadores de este formulario.
  const requisicionTarifaResults = requisicionTarifaSearch.trim()
    ? tarifasCubrimiento.filter(t => (t.nombre ?? '').toLowerCase().includes(requisicionTarifaSearch.trim().toLowerCase()))
    : tarifasCubrimiento;

  // Búsqueda de productos para "Agregar consumo" en Remisión (reutiliza AddStagedItemForm/
  // StagedItemDetailModal de Cotizaciones, ver más abajo) — a propósito usa la búsqueda REAL de
  // Cotizaciones (mismas 5 categorías "cotizables"), no la de Requisición (todas las categorías):
  // productos como Instrumental (reutilizable, nunca se factura) no tienen precio cargado en
  // ningún lado y no deben poder agregarse como consumo de una remisión.
  const createRequisicionMutation = useMutation({
    mutationFn: () => remisionesService.createRequisicion({
      programacionId: id!,
      fecha: requisicionFecha,
      cubrimientoId: requisicionCubrimiento!.id,
      tarifaId: requisicionTarifaId,
      insumos: requisicionInsumos.map(ins => ({
        loteId: ins.loteId,
        productoId: ins.productoId,
        cantidad: ins.cantidad,
        precio: ins.precio,
      })),
    }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['remisiones-requisiciones', id] });
      setShowRequisicionModal(false);
      setRequisicionCreatedId(created.id);
      setShowRequisicionSuccess(true);
    },
  });

  const openRequisicionModal = () => {
    setRequisicionFecha(toLocalDateString(new Date()));
    setRequisicionCubrimiento(null);
    setRequisicionTarifaId('');
    setRequisicionTarifaLabel('');
    setRequisicionTarifaSearch('');
    setRequisicionError(null);
    setRequisicionInsumos([]);
    setShowRequisicionModal(true);
  };

  const handleGuardarRequisicion = () => {
    if (!requisicionFecha) { setRequisicionError({ field: 'fecha', message: 'Selecciona la fecha.' }); return; }
    if (!requisicionCubrimiento) { setRequisicionError({ field: 'cubrimiento', message: 'Selecciona el cubrimiento.' }); return; }
    if (!requisicionTarifaId) { setRequisicionError({ field: 'tarifa', message: 'Selecciona la tarifa.' }); return; }
    if (requisicionInsumos.length === 0) { setRequisicionError({ field: 'insumos', message: 'Agrega al menos un insumo.' }); return; }
    setRequisicionError(null);
    createRequisicionMutation.mutate();
  };

  useEffect(() => {
    if (!requisicionError) return;
    document.getElementById(`requisicion-field-${requisicionError.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [requisicionError]);

  const openInsumoSubModal = () => {
    setShowInsumoSubModal(true);
  };

  const handleAgregarInsumoDraft = (values: InsumoFormValues) => {
    // Mismo producto y mismo lote (o ambos sin lote) que uno ya agregado: en vez de duplicar la
    // fila, solo se suma la cantidad a la que ya tenía.
    const existente = requisicionInsumos.find(ins => ins.productoId === values.producto.id && (ins.loteId ?? null) === (values.lote?.id ?? null));
    if (existente) {
      setRequisicionInsumos(requisicionInsumos.map(ins => ins === existente ? { ...ins, cantidad: ins.cantidad + values.cantidad } : ins));
    } else {
      setRequisicionInsumos([...requisicionInsumos, {
        tempId: `${Date.now()}-${Math.random()}`,
        loteId: values.lote?.id,
        loteLabel: values.lote?.lote ?? undefined,
        productoId: values.producto.id,
        productoLabel: formatProductoLabel(values.producto),
        cantidad: values.cantidad,
        precio: values.precio,
      }]);
    }
    setShowInsumoSubModal(false);
    setRequisicionError(null);
    setShowInsumoSuccess(true);
  };

  const handleQuitarInsumoDraft = (tempId: string) => {
    setRequisicionInsumos(requisicionInsumos.filter(ins => ins.tempId !== tempId));
  };

  // Deep-link desde el selector de programación de Remisiones (?agregarRemision=1). Reacciona a
  // cambios en searchParams (no solo al montar) porque, al llegar navegando desde otra vista de
  // detalle con el mismo componente ya montado, React Router no lo remonta. Espera a que
  // puedeAgregarRemision esté disponible (requiere que carguen las requisiciones) antes de abrir.
  useEffect(() => {
    if (searchParams.get('agregarRemision') === '1' && puedeAgregarRemision) {
      setShowRemisionModal(true);
      setSearchParams(params => { params.delete('agregarRemision'); return params; }, { replace: true });
    }
  }, [searchParams, puedeAgregarRemision, setSearchParams]);

  const { data: notasCredito = [] } = useQuery<NotaCreditoItem[]>({
    queryKey: ['remisiones-notas-credito', id],
    queryFn: () => remisionesService.findNotasCreditoByProgramacion(id!),
    enabled: !!id,
  });
  useSmoothWheelScroll(notasCreditoScrollRef, [mainTab, notasCredito.length]);

  const { data: tecnicosSugeridos = [] } = useQuery<TecnicoSugeridoItem[]>({
    queryKey: ['tecnicos-sugeridos', id],
    queryFn: () => remisionesService.findTecnicosSugeridosByProgramacion(id!),
    enabled: !!id,
  });

  const { data: tecnicoComisionistaResults = [] } = useQuery<TecnicoOption[]>({
    queryKey: ['tecnicos-sugeridos-busqueda', tecnicoSugeridoSearch],
    queryFn: () => remisionesService.searchTecnicosSugeridos(tecnicoSugeridoSearch),
    enabled: showTecnicoSugeridoModal,
  });

  const createTecnicoSugeridoMutation = useMutation({
    mutationFn: () => Promise.all(
      tecnicoSugeridoSeleccionados.map(t => remisionesService.createTecnicoSugerido({ programacionId: id!, tecnicoId: t.id })),
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tecnicos-sugeridos', id] });
      setShowTecnicoSugeridoModal(false);
      setShowTecnicoSugeridoSuccess(true);
    },
  });

  const deleteTecnicoSugeridoMutation = useMutation({
    mutationFn: (tecnicoSugeridoId: string) => remisionesService.deleteTecnicoSugerido(tecnicoSugeridoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tecnicos-sugeridos', id] });
    },
  });

  const openTecnicoSugeridoModal = () => {
    setTecnicoSugeridoSeleccionados([]);
    setTecnicoSugeridoSearch('');
    setTecnicoSugeridoFocused(false);
    setTecnicoSugeridoError(null);
    setShowTecnicoSugeridoSuccess(false);
    setShowTecnicoSugeridoModal(true);
  };

  const handleGuardarTecnicoSugerido = () => {
    if (tecnicoSugeridoSeleccionados.length === 0) { setTecnicoSugeridoError({ field: 'tecnico', message: 'Selecciona al menos un técnico.' }); return; }
    setTecnicoSugeridoError(null);
    createTecnicoSugeridoMutation.mutate();
  };

  useEffect(() => {
    if (!tecnicoSugeridoError) return;
    document.getElementById(`tecnico-sugerido-field-${tecnicoSugeridoError.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [tecnicoSugeridoError]);

  const { data: gastosRelacionados = [] } = useQuery<GastoRelacionadoItem[]>({
    queryKey: ['remisiones-gastos', id],
    queryFn: () => remisionesService.findGastosByProgramacion(id!),
    enabled: !!id,
  });

  const { data: fuentesRelacionadas = [] } = useQuery<FuenteRelacionadaItem[]>({
    queryKey: ['remisiones-fuentes', id],
    queryFn: () => remisionesService.findFuentesByProgramacion(id!),
    enabled: !!id,
  });

  const { data: documentos = [] } = useQuery<DocumentoProgramacionItem[]>({
    queryKey: ['remisiones-documentos', id],
    queryFn: () => remisionesService.findDocumentosByProgramacion(id!),
    enabled: !!id,
  });
  useSmoothWheelScroll(documentosScrollRef, [mainTab, documentos.length]);

  const deleteDocumentoMutation = useMutation({
    mutationFn: (documentoId: string) => remisionesService.deleteDocumentoProgramacion(documentoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remisiones-documentos', id] });
    },
  });

  const openDocumentoModal = () => {
    setDocumentoNombre('');
    setDocumentoArchivo(null);
    setDocumentoCargadoEl(new Date());
    setDocumentoError(null);
    setShowDocumentoModal(true);
  };

  const MAX_DOCUMENTO_BYTES = 8 * 1024 * 1024;

  const handleDocumentoFileChange = (file: File | null) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setDocumentoError({ field: 'documento', message: 'Solo se permiten archivos PDF.' });
      return;
    }
    if (file.size > MAX_DOCUMENTO_BYTES) {
      setDocumentoError({ field: 'documento', message: 'El archivo es demasiado grande (máximo 8MB).' });
      return;
    }
    setDocumentoArchivo(file);
    setDocumentoError(null);
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const createDocumentoMutation = useMutation({
    mutationFn: async () => {
      const documento = await readFileAsDataUrl(documentoArchivo!);
      return remisionesService.createDocumentoProgramacion({
        programacionId: id!,
        nombre: documentoNombre.trim(),
        documento,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remisiones-documentos', id] });
      setShowDocumentoModal(false);
      setShowDocumentoSuccess(true);
    },
    onError: (err: any) => {
      setDocumentoError({ field: 'documento', message: err?.response?.data?.message ?? 'No se pudo guardar el documento.' });
    },
  });

  const handleGuardarDocumento = () => {
    if (!documentoNombre.trim()) { setDocumentoError({ field: 'nombre', message: 'Ingresa el nombre del documento.' }); return; }
    if (!documentoArchivo) { setDocumentoError({ field: 'documento', message: 'Selecciona un archivo PDF.' }); return; }
    setDocumentoError(null);
    createDocumentoMutation.mutate();
  };

  useEffect(() => {
    if (!documentoError) return;
    document.getElementById(`documento-field-${documentoError.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [documentoError]);

  if (isLoading) return <div style={{ padding: '2rem', textAlign: 'center' }}><Loader className="spinner" size={32} /></div>;
  if (error) return <div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>Error al cargar: {(error as any)?.message || 'Error desconocido'}</div>;
  if (!programacion) return <div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>Programación no encontrada</div>;

  const mainTabItems: { key: string; label: string; count: number | null }[] = [
    { key: 'resumen', label: 'Resumen', count: null },
    { key: 'consumos', label: 'Consumos', count: totalConsumos },
    { key: 'validar-consumos', label: 'Validar consumos', count: totalValidacion },
    { key: 'comisiones', label: 'Comisiones', count: totalComisiones },
    { key: 'gastos-fuentes', label: 'Gastos y fuentes relacionadas', count: gastosRelacionados.length + fuentesRelacionadas.length },
  ];

  const MESES_ABREV = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  const fechaQxDate = programacion.fechaQx ? new Date(programacion.fechaQx) : null;
  const fechaQxMes = fechaQxDate ? MESES_ABREV[fechaQxDate.getUTCMonth()] : '';
  const fechaQxDia = fechaQxDate ? String(fechaQxDate.getUTCDate()).padStart(2, '0') : '';
  const fechaQxLarga = fechaQxDate
    ? `${fechaQxDia} de ${fechaQxMes.charAt(0)}${fechaQxMes.slice(1).toLowerCase()} del ${fechaQxDate.getUTCFullYear()}`
    : '-';

  // Reutilizados por los 3 primeros pasos del stepper (Programada/Requisición/Remisión): fecha
  // corta "D mmm" y "primer nombre + primer apellido" de quien registró cada uno.
  const fechaCorta = (dateStr: string | null | undefined): string | null => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return `${date.getUTCDate()} ${MESES_ABREV[date.getUTCMonth()].toLowerCase()}`;
  };
  const nombreCorto = (nombreCompleto: string | null | undefined): string | null => {
    const tokens = nombreCompleto?.trim().split(/\s+/).filter(Boolean) ?? [];
    if (tokens.length === 0) return null;
    // Convención mexicana: nombre(s) + apellido paterno + apellido materno — se asume que los
    // últimos 2 tokens son los apellidos (o el último, si solo hay 2 tokens en total), para que
    // "Laura Peña Gómez" dé "Laura Peña" y no "Laura Gómez".
    const apellidosCount = tokens.length >= 3 ? 2 : tokens.length === 2 ? 1 : 0;
    const primerNombre = tokens[0];
    const primerApellido = apellidosCount > 0 ? tokens[tokens.length - apellidosCount] : undefined;
    return primerApellido ? `${primerNombre} ${primerApellido}` : primerNombre;
  };
  const fechaPersonaSubLabel = (dateStr: string | null | undefined, nombreCompleto: string | null | undefined): string | null => {
    const fecha = fechaCorta(dateStr);
    if (!fecha) return null;
    const nombre = nombreCorto(nombreCompleto);
    return `${fecha}${nombre ? ` · ${nombre}` : ''}`;
  };

  const creadoEnCorto = fechaCorta(programacion.createdAt);
  const creadoPorCorto = nombreCorto(programacion.creadoPorTercero?.nombreCompleto);

  // Si hay varios registros (de distintas personas), el stepper siempre muestra el de la fecha
  // más reciente — no el primero.
  const ultimaRequisicion = requisiciones.length > 0
    ? requisiciones.reduce((latest, r) => (new Date(r.marcaDeTiempo ?? 0) > new Date(latest.marcaDeTiempo ?? 0) ? r : latest))
    : null;
  const ultimaRemision = remisiones.length > 0
    ? remisiones.reduce((latest, r) => (new Date(r.creadoEn ?? 0) > new Date(latest.creadoEn ?? 0) ? r : latest))
    : null;
  const todasLasValidaciones = validacionGrupos.flatMap(g => g.items);
  const ultimaValidacion = todasLasValidaciones.length > 0
    ? todasLasValidaciones.reduce((latest, v) => (new Date(v.marcaTiempo ?? 0) > new Date(latest.marcaTiempo ?? 0) ? v : latest))
    : null;
  const todasLasComisionLineas = comisionGrupos.flatMap(g => g.items).flatMap(i => i.detalle);
  const ultimaComision = todasLasComisionLineas.length > 0
    ? todasLasComisionLineas.reduce((latest, d) => (new Date(d.marcaTiempo ?? 0) > new Date(latest.marcaTiempo ?? 0) ? d : latest))
    : null;

  const stepperSteps = [
    { key: 'programada', label: 'Programada', done: true, subLabel: `${creadoEnCorto}${creadoPorCorto ? ` · ${creadoPorCorto}` : ''}` as string | null },
    { key: 'requisicion', label: 'Requisición', done: requisiciones.length > 0, subLabel: (ultimaRequisicion && fechaPersonaSubLabel(ultimaRequisicion.marcaDeTiempo, ultimaRequisicion.usuario)) ?? 'Pendiente de generar' },
    { key: 'remision', label: 'Remisión', done: !programacion.sinRemision, subLabel: (ultimaRemision && fechaPersonaSubLabel(ultimaRemision.creadoEn, ultimaRemision.usuario)) ?? 'Pendiente de generar' },
    { key: 'validar', label: 'Validar consumo', done: !programacion.consumoNoValidado, subLabel: (!programacion.consumoNoValidado && ultimaValidacion && fechaPersonaSubLabel(ultimaValidacion.marcaTiempo, ultimaValidacion.usuario)) || (!programacion.consumoNoValidado ? 'Validado' : 'Tras la cirugía') },
    { key: 'comision', label: 'Comisión', done: !programacion.sinComision, subLabel: (!programacion.sinComision && ultimaComision && fechaPersonaSubLabel(ultimaComision.marcaTiempo, ultimaComision.registradoPor)) || (!programacion.sinComision ? 'Asignada' : 'Tras validar consumo') },
  ];
  const stepperCurrentIdx = stepperSteps.findIndex(s => !s.done);

  const finBarUtilidad = Math.max(Number(programacion.utilidadBruta) || 0, 0);
  const finBarComisiones = Math.max(Number(programacion.comisiones) || 0, 0);
  const finBarCosto = Math.max(Number(programacion.costoTotal) || 0, 0);
  const finBarTotal = finBarUtilidad + finBarComisiones + finBarCosto;
  const finBarPct = (v: number) => finBarTotal > 0 ? (v / finBarTotal) * 100 : 0;

  // 34px ≈ alto real de una fila de Cotizaciones/Requisiciones/Remisiones (cotizacionCardMobile:
  // padding 0.4rem arriba/abajo + una sola línea de texto, desde que se quitó la segunda línea de
  // cada fila). Antes eran 160/3≈53.3px, calibrado para filas de dos líneas — con ese valor viejo
  // quedaba un hueco en blanco debajo de las filas antes del Total.
  const miniCardMaxRows = Math.min(3, Math.max(programacion.cotizaciones.length, requisiciones.length, remisiones.length));
  const miniCardSyncedHeight = miniCardMaxRows > 0 ? `${miniCardMaxRows * 34}px` : undefined;

  // Secciones de la pestaña Resumen armadas como variables (no inline) porque en pantallas anchas
  // viven repartidas entre la columna principal y la barra lateral, pero en pantallas angostas
  // (isNarrow) se apilan en el mismo orden de siempre — antes de que existiera la barra lateral —
  // con Actividad agregada al final. Evita duplicar el JSX de cada tarjeta en los dos layouts.
  const desgloseFinancieroCard = (
    <div style={styles.financialCard}>
      <h3 style={styles.cardTitle}>Desglose Financiero</h3>

      <div style={styles.finBar}>
        <div style={{ ...styles.finBarSegment, width: finBarMounted ? `${finBarPct(finBarUtilidad)}%` : '0%', transitionDelay: '0s', backgroundColor: '#4d7a13' }} />
        <div style={{ ...styles.finBarSegment, width: finBarMounted ? `${finBarPct(finBarComisiones)}%` : '0%', transitionDelay: '0.08s', backgroundColor: '#8ab04a' }} />
        <div style={{ ...styles.finBarSegment, width: finBarMounted ? `${finBarPct(finBarCosto)}%` : '0%', transitionDelay: '0.16s', backgroundColor: '#dbe8c2' }} />
      </div>
      <div style={styles.finBarLegend}>
        <span style={styles.finBarLegendItem}>
          <span style={{ ...styles.finBarLegendDot, backgroundColor: '#4d7a13' }} />
          Utilidad
        </span>
        <span style={styles.finBarLegendItem}>
          <span style={{ ...styles.finBarLegendDot, backgroundColor: '#8ab04a' }} />
          Comisiones
        </span>
        <span style={styles.finBarLegendItem}>
          <span style={{ ...styles.finBarLegendDot, backgroundColor: '#dbe8c2' }} />
          Costo
        </span>
      </div>

      <div style={styles.financialGrid}>
        <div style={styles.finRow}>
          <span style={{ ...styles.extraLabel, marginBottom: 0 }}>SubTotal</span>
          <span style={styles.finValue}><AnimatedMoney value={programacion.total} start={finBarMounted} /></span>
        </div>
        <div style={styles.finRow}>
          <span style={{ ...styles.extraLabel, marginBottom: 0 }}>Descuentos</span>
          <span style={styles.finValue}><AnimatedMoney value={programacion.descuentos} start={finBarMounted} /></span>
        </div>
        <div style={styles.finRow}>
          <span style={{ ...styles.extraLabel, marginBottom: 0 }}>Descuentos de notas crédito</span>
          <span style={styles.finValue}><AnimatedMoney value={programacion.nc} start={finBarMounted} /></span>
        </div>
        <div style={styles.finRow}>
          <span style={{ ...styles.extraLabel, marginBottom: 0 }}>Ingreso Base</span>
          <span style={styles.finValue}><AnimatedMoney value={programacion.baseIngreso} start={finBarMounted} /></span>
        </div>
        <div style={styles.divider}></div>
        <div style={styles.finRow}>
          <span style={{ ...styles.extraLabel, marginBottom: 0 }}>Comisiones/Pus/Invers.</span>
          <span style={styles.finValue}><AnimatedMoney value={programacion.comisiones} start={finBarMounted} /></span>
        </div>
        <div style={styles.finRow}>
          <span style={{ ...styles.extraLabel, marginBottom: 0 }}>Costo Total</span>
          <span style={styles.finValue}><AnimatedMoney value={programacion.costoTotal} start={finBarMounted} /></span>
        </div>
        <div style={styles.finRow}>
          <span style={{ ...styles.extraLabel, marginBottom: 0 }}>Utilidad Bruta</span>
          <span style={styles.finValue}><AnimatedMoney value={programacion.utilidadBruta} start={finBarMounted} /></span>
        </div>
      </div>

      <div style={styles.divider}></div>
      <div style={styles.extraField}>
        <span style={styles.extraLabel}>Consumo</span>
        <span style={{ ...styles.extraValue, ...(finConsumoExpanded ? {} : styles.consumoClamp) }}>{programacion.consumo || '-'}</span>
        {(programacion.consumo?.length ?? 0) > 180 && (
          <button type="button" style={styles.verMasBtn} onClick={() => setFinConsumoExpanded(v => !v)}>
            {finConsumoExpanded ? 'Ver menos' : 'Ver más'}
          </button>
        )}
      </div>
      <div style={styles.extraField}>
        <span style={styles.extraLabel}>Observaciones</span>
        <span style={{ ...styles.extraValue, ...(finObservacionesExpanded ? {} : styles.consumoClamp) }}>{programacion.observaciones || '-'}</span>
        {(programacion.observaciones?.length ?? 0) > 180 && (
          <button type="button" style={styles.verMasBtn} onClick={() => setFinObservacionesExpanded(v => !v)}>
            {finObservacionesExpanded ? 'Ver menos' : 'Ver más'}
          </button>
        )}
      </div>
    </div>
  );

  const tecnicosAsociadosCard = (
    <div style={styles.miniCard}>
      <div style={styles.miniCardHeader}>
        <div style={styles.miniCardHeaderLeft}>
          <span style={{ ...styles.miniCardIconBadge, border: 'none' }}><MaterialIcon name="engineering" size={15} color="#6b8c1f" /></span>
          <h3 style={styles.miniCardTitle}>Técnicos asociados</h3>
          <span style={{ ...styles.miniCardBadge, backgroundColor: '#e5e7eb' }}>{totalTecnicos}</span>
        </div>
      </div>
      <div style={styles.miniCardBody}>
        {tecnicos.length === 0 ? (
          <div style={styles.miniCardEmpty}>
            <MaterialIcon name="engineering" size={22} color="#d1d5db" />
            No hay datos relacionados
          </div>
        ) : (
          <div style={styles.miniCardListInner}>
            <div ref={tecnicosAsociadosScrollRef} style={styles.tecnicoScrollBody}>
              <div style={styles.tecnicoList}>
                {tecnicoGrupos.flatMap(grupo => grupo.items).map((t, ii) => {
                  const borderStyle = ii > 0 ? styles.remRowBorder : {};
                  const hoverStyle = hoveredTecnicoId === t.id ? styles.consumoCellHover : {};
                  return (
                    <div
                      key={t.id}
                      style={{ ...styles.tecnicoListRow, justifyContent: 'space-between', ...borderStyle, ...hoverStyle, cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredTecnicoId(t.id)}
                      onMouseLeave={() => setHoveredTecnicoId(null)}
                      onClick={() => setSelectedTecnico(t)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                        <span style={styles.tecnicoAvatar}>{getTecnicoInitials(t.tecnico?.nombreCompleto || '-')}</span>
                        <span style={styles.tecnicoNombre}>{t.tecnico?.nombreCompleto || '-'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const documentosCard = (
    <div style={styles.miniCard}>
      <div style={styles.miniCardHeader}>
        <div style={styles.miniCardHeaderLeft}>
          <span style={{ ...styles.miniCardIconBadge, border: 'none' }}><MaterialIcon name="attach_file" size={15} color="#6b8c1f" /></span>
          <h3 style={styles.miniCardTitle}>Documentos</h3>
          <span style={{ ...styles.miniCardBadge, backgroundColor: '#e5e7eb' }}>{documentos.length}</span>
        </div>
        <button type="button" style={styles.miniCardAddLink} onClick={openDocumentoModal}>
          <Plus size={13} /> Agregar
        </button>
      </div>
      <div style={{ ...styles.miniCardBody, ...(documentos.length > 0 ? { padding: '0.25rem 0 0' } : {}) }}>
        {documentos.length === 0 ? (
          <div style={styles.miniCardEmpty}>
            <FileText size={22} color="#d1d5db" />
            No hay datos relacionados
          </div>
        ) : (
          <div style={styles.miniCardListInner}>
            <div style={{ ...styles.documentoRow, ...styles.colHeader }}>
              <span style={styles.colHeaderText}>Nombre</span>
              <span style={styles.colHeaderText}>Documento</span>
              <span style={styles.colHeaderText}>Cargado el</span>
              <span style={styles.colHeaderText}>Cargado por</span>
              <span style={styles.colHeaderText}></span>
            </div>
            <div ref={documentosScrollRef} style={{ ...styles.tabScrollBody, maxHeight: '200px' }}>
              {documentos.map((d, i) => {
                const hoverStyle = hoveredDocumentoId === d.id ? styles.consumoCellHover : {};
                return (
                  <div
                    key={d.id}
                    style={{ ...styles.documentoRow, ...(i > 0 ? styles.remRowBorder : {}), ...hoverStyle, cursor: 'pointer' }}
                    onClick={() => setSelectedDocumento(d)}
                    onMouseEnter={() => setHoveredDocumentoId(d.id)}
                    onMouseLeave={() => setHoveredDocumentoId(null)}
                  >
                    <span style={{ ...styles.requisicionCellText, fontWeight: 700, color: '#333' }}>{d.nombre ?? '-'}</span>
                    <span style={{ ...styles.requisicionCellText, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      {d.archivoDisponible ? (<><FileText size={14} color="#6b8c1f" /> PDF</>) : <span style={{ color: '#9ca3af', fontStyle: 'italic' as const }}>No disponible</span>}
                    </span>
                    <span style={{ ...styles.requisicionCellText, fontSize: '0.8rem' }}>{formatDateTime(d.cargadoEl)}</span>
                    <span style={{ ...styles.requisicionCellText, fontSize: '0.8rem' }}>{d.cargadoPor?.nombreCompleto ?? '-'}</span>
                    <button
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', padding: '0.25rem', flexShrink: 0 }}
                      onClick={e => { e.stopPropagation(); deleteDocumentoMutation.mutate(d.id); }}
                      disabled={deleteDocumentoMutation.isPending}
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const tecnicosSugeridosCard = (
    <div style={styles.miniCard}>
      <div style={styles.miniCardHeader}>
        <div style={styles.miniCardHeaderLeft}>
          <span style={{ ...styles.miniCardIconBadge, border: 'none' }}><MaterialIcon name="group_add" size={15} color="#6b8c1f" /></span>
          <h3 style={styles.miniCardTitle}>Técnicos sugeridos</h3>
          <span style={{ ...styles.miniCardBadge, backgroundColor: '#e5e7eb' }}>{tecnicosSugeridos.length}</span>
        </div>
      </div>
      <div style={styles.miniCardBody}>
        {tecnicosSugeridos.length === 0 ? (
          <div style={styles.miniCardEmpty}>
            <MaterialIcon name="group_add" size={22} color="#d1d5db" />
            No hay datos relacionados
          </div>
        ) : (
          <div style={styles.miniCardListInner}>
            <div ref={tecnicosSugeridosScrollRef} style={styles.tecnicoScrollBody}>
              <div style={styles.tecnicoList}>
                {tecnicosSugeridos.map((t, i) => (
                  <div
                    key={t.id}
                    style={{ ...styles.tecnicoListRow, justifyContent: 'space-between', ...(i > 0 ? styles.remRowBorder : {}) }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                      <span style={styles.tecnicoAvatar}>{getTecnicoInitials(t.tecnico || '-')}</span>
                      <span style={styles.tecnicoNombre}>{t.tecnico ?? '-'}</span>
                    </div>
                    <button
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', padding: '0.25rem', flexShrink: 0 }}
                      onClick={() => deleteTecnicoSugeridoMutation.mutate(t.id)}
                      disabled={deleteTecnicoSugeridoMutation.isPending}
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <div style={styles.miniCardFooter}>
        <span />
        <button type="button" style={styles.miniCardAddLink} onClick={openTecnicoSugeridoModal}>
          <Plus size={13} /> Agregar
        </button>
      </div>
    </div>
  );

  const notasCreditoCard = (
    <div style={styles.miniCard}>
      <div style={styles.miniCardHeader}>
        <div style={styles.miniCardHeaderLeft}>
          <span style={{ ...styles.miniCardIconBadge, border: 'none' }}><MaterialIcon name="assignment_return" size={15} color="#6b8c1f" /></span>
          <h3 style={styles.miniCardTitle}>Notas de crédito</h3>
          <span style={{ ...styles.miniCardBadge, backgroundColor: '#e5e7eb' }}>{notasCredito.length}</span>
        </div>
      </div>
      <div style={styles.miniCardBody}>
        {notasCredito.length === 0 ? (
          <div style={styles.miniCardEmpty}>
            <MaterialIcon name="assignment_return" size={22} color="#d1d5db" />
            No hay datos relacionados
          </div>
        ) : (
          <div style={styles.miniCardListInner}>
            <div style={{ ...styles.notaCreditoRow, ...styles.colHeader }}>
              <span style={styles.colHeaderText}>Fecha Nota Crédito</span>
              <span style={styles.colHeaderText}>Remisión</span>
              <span style={styles.colHeaderText}>Aplicada Por</span>
              <span style={{ ...styles.colHeaderText, textAlign: 'right' }}>Total</span>
            </div>
            <div ref={notasCreditoScrollRef} style={styles.comisionScrollBody}>
              {notasCredito.map((nc, i) => {
                const hoverStyle = hoveredNotaCreditoId === nc.id ? styles.consumoCellHover : {};
                return (
                  <div
                    key={nc.id}
                    style={{ ...styles.notaCreditoRow, ...(i > 0 ? styles.remRowBorder : {}), ...hoverStyle, cursor: 'pointer' }}
                    onClick={() => setSelectedNotaCredito(nc)}
                    onMouseEnter={() => setHoveredNotaCreditoId(nc.id)}
                    onMouseLeave={() => setHoveredNotaCreditoId(null)}
                  >
                    <span style={styles.requisicionCellText}>{formatDate(nc.fechaNotaCredito)}</span>
                    <span style={styles.requisicionCellText}>{nc.factura?.remision?.numRemision || nc.factura?.remision?.id || '-'}</span>
                    <span style={styles.requisicionCellText}>{nc.aplicadaPor?.nombreCompleto ?? '-'}</span>
                    <span style={{ ...styles.requisicionCellText, textAlign: 'right', fontWeight: 600, color: '#333' }}>{formatMoney(nc.total)}</span>
                  </div>
                );
              })}
            </div>
            <div style={styles.consumoTotalRow}>
              <span style={styles.consumoTotalLabel}>Total notas de crédito</span>
              <span style={styles.consumoTotalValue}>
                {formatMoney(notasCredito.reduce((sum, nc) => sum + Number(nc.total ?? 0), 0))}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const actividadCard = (
    <div style={styles.miniCard}>
      <div style={styles.miniCardHeader}>
        <div style={styles.miniCardHeaderLeft}>
          <span style={{ ...styles.miniCardIconBadge, border: 'none' }}><MaterialIcon name="history" size={15} color="#6b8c1f" /></span>
          <h3 style={styles.miniCardTitle}>Actividad</h3>
        </div>
      </div>
      <div style={styles.miniCardBody}>
        <ActividadTimeline eventos={[
          { key: 'creada', label: 'Programación creada', sub: `${programacion.creadoPorTercero?.nombreCompleto ?? '-'} · ${formatDateTime(programacion.createdAt)}`, fecha: programacion.createdAt },
          ...programacion.ediciones.map((e, i) => ({ key: `editada-${i}`, label: 'Programación editada', sub: `${e.editadoPor ?? '-'} · ${formatDateTime(e.editadoEn)}`, fecha: e.editadoEn })),
        ]} />
      </div>
    </div>
  );

  return (
    <>
      {showCompactHeader && (
        <div style={{ ...styles.compactHeaderPositioner, left: isMobile ? 0 : '60px' }}>
          <div
            className={compactHeaderClosing ? 'compact-header-slide-out' : 'compact-header-slide-in'}
            style={styles.compactHeader}
          >
            <span style={styles.compactTitle}>{programacion.hospital?.nombre || 'Programación'}</span>
            <span style={styles.titleId}>{programacion.id}</span>
          </div>
        </div>
      )}
      <div className="page-fade-in" style={styles.container}>
        <div style={{ ...styles.pageSplitRow, ...(isMobile || isNarrow ? { flexDirection: 'column' as const } : {}) }}>
        <div style={styles.mainColumn}>
        <div style={styles.headerCard}>
        <div style={{ ...styles.header, ...(isMobile ? { flexWrap: 'wrap' as const } : {}) }}>
          <HeaderBackReveal
            onBack={() => navigate(-1)}
            icon={
              <div style={{ display: 'flex', flexDirection: 'column' as const, width: 'calc(100% + 2px)', height: 'calc(100% + 2px)', margin: '-1px', borderRadius: 20, overflow: 'hidden', backgroundColor: '#fff', border: '1px solid #6b8c1f', boxSizing: 'border-box' as const }}>
                <div style={{ backgroundColor: '#6b8c1f', color: '#fff', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.05em', textAlign: 'center' as const, padding: '0.15rem 0', borderTopLeftRadius: 19, borderTopRightRadius: 19 }}>
                  {fechaQxMes}
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', fontWeight: 800, color: '#1f2937' }}>
                  {fechaQxDia}
                </div>
                <div style={{ textAlign: 'center' as const, fontSize: '0.55rem', color: '#9ca3af', paddingBottom: '0.2rem' }}>
                  {programacion.horaQx || '-'}
                </div>
              </div>
            }
            size={66}
            badgeRadius={20}
            mobileIconAsBack={isMobile}
          >
            <div style={{ ...styles.titleGroup, ...(isMobile ? { gap: '0.1rem' } : {}) }}>
              <span style={styles.titleLabel}>Programación</span>
              <div style={styles.titleRow}>
                <h1 style={{ ...styles.title, ...(isMobile ? { fontSize: '1.15rem' } : {}) }}>{programacion.hospital?.nombre || 'Programación'}</h1>
              </div>
              <div style={{ ...styles.breadcrumbRow, ...(isMobile ? { fontSize: '0.8rem' } : {}) }}>
                <span style={styles.breadcrumbId}>{programacion.id}</span>
              </div>
            </div>
          </HeaderBackReveal>

          <div style={{ ...styles.headerActions, ...(isMobile ? { flexWrap: 'wrap' as const, width: '100%' } : {}) }}>
            {/* Enviar + divisor + Agregar van agrupados en un mismo contenedor flex para que, al
                envolver en móvil, siempre queden juntos en la misma línea (nunca "Agregar" solo,
                separado de "Enviar"). */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', ...(isMobile ? { order: 1 } : {}) }}>
              <div style={{ position: 'relative' as const }} ref={enviarMenuRef}>
                <button
                  className="btn-press header-btn-secondary"
                  style={{
                    ...styles.btnPill,
                    position: 'relative' as const,
                    overflow: 'hidden' as const,
                    ...((gmailSending || generandoPdfGmail || generandoPdfWhatsapp) ? { pointerEvents: 'none' as const } : {}),
                  }}
                  onClick={() => { setShowEnviarMenu(o => !o); setShowAgregarMenu(false); setShowMoreMenu(false); }}
                  disabled={gmailSending || generandoPdfGmail || generandoPdfWhatsapp}
                >
                  {gmailSending && (
                    <span
                      style={{
                        position: 'absolute' as const,
                        inset: 0,
                        width: `${gmailProgress}%`,
                        backgroundColor: '#e9f2d8',
                        transition: 'width 0.15s ease',
                        zIndex: 0,
                      }}
                    />
                  )}
                  <span style={{ position: 'relative' as const, zIndex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Send size={15} style={{ color: '#4d7a13' }} />
                    {(generandoPdfGmail || generandoPdfWhatsapp) ? 'Generando PDF...' : gmailSending ? 'Enviando...' : 'Enviar'}
                  </span>
                </button>
                {showEnviarMenu && (
                  <div style={{ ...styles.dropdown, right: 'auto' as const, left: 0 }}>
                    <button
                      style={styles.dropdownItem}
                      onClick={() => { setShowEnviarMenu(false); setShowWhatsappConfirm(true); }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f4f4ee'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <i className="fa-brands fa-whatsapp" style={{ fontSize: 15, color: '#4d7a13', width: 15, textAlign: 'center' as const }} />
                      WhatsApp
                    </button>
                    <button
                      style={styles.dropdownItem}
                      onClick={() => { setShowEnviarMenu(false); setShowGmailConfirm(true); }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f4f4ee'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <SiGmail size={14} color="#8a8a80" style={{ width: 15, textAlign: 'center' as const }} />
                      Gmail
                    </button>
                  </div>
                )}
              </div>

              <span style={styles.headerDivider} />

              <div style={{ position: 'relative' as const }} ref={agregarMenuRef}>
                <button
                  className="btn-press header-btn-primary"
                  style={styles.btnPillPrimary}
                  onClick={() => { setShowAgregarMenu(o => !o); setShowMoreMenu(false); }}
                >
                  Agregar
                  <MaterialIcon name="expand_more" size={18} style={{ transform: showAgregarMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
                </button>
                {showAgregarMenu && (
                  <div style={styles.dropdown}>
                    <button
                      style={{ ...styles.dropdownItem, ...(!puedeAgregarRemision ? styles.dropdownItemDisabled : {}) }}
                      onClick={() => { setShowAgregarMenu(false); setShowRemisionModal(true); }}
                      disabled={!puedeAgregarRemision}
                      title={!puedeAgregarRemision ? 'Necesitas al menos una requisición para poder agregar una remisión.' : undefined}
                      onMouseEnter={e => { if (puedeAgregarRemision) e.currentTarget.style.backgroundColor = '#f4f4ee'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <MaterialIcon name="description" size={17} />
                      Agregar remisión
                    </button>
                    <button
                      style={styles.dropdownItem}
                      onClick={() => { setShowAgregarMenu(false); openTecnicoSugeridoModal(); }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f4f4ee'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <MaterialIcon name="engineering" size={17} />
                      Agregar técnico sugerido
                    </button>
                    <button
                      style={styles.dropdownItem}
                      onClick={() => { setShowAgregarMenu(false); openRequisicionModal(); }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f4f4ee'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <MaterialIcon name="inventory_2" size={17} />
                      Agregar requisición
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div style={{ position: 'relative' as const, ...(isMobile ? { order: 3 } : {}) }} ref={moreMenuRef}>
              <button
                className="btn-press header-btn-secondary"
                style={styles.iconMenuBtn}
                onClick={() => { setShowMoreMenu(o => !o); setShowAgregarMenu(false); }}
              >
                <MaterialIcon name="more_horiz" size={20} />
              </button>
              {showMoreMenu && (
                <div style={styles.dropdown}>
                  <button
                    style={styles.dropdownItem}
                    onClick={() => { setShowMoreMenu(false); openEditModal(); }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f4f4ee'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <MaterialIcon name="edit" size={17} />
                    Editar programación
                  </button>
                  {!programacion.cerrada ? (
                    <button
                      style={{ ...styles.dropdownItem, ...(!puedeCerrarProgramacion ? styles.dropdownItemDisabled : {}) }}
                      onClick={() => { setShowMoreMenu(false); cerrarProgramacionMutation.mutate(); }}
                      disabled={!puedeCerrarProgramacion || cerrarProgramacionMutation.isPending}
                      title={!puedeCerrarProgramacion ? 'Necesitas al menos una remisión y una requisición para poder cerrar la programación.' : undefined}
                      onMouseEnter={e => { if (puedeCerrarProgramacion) e.currentTarget.style.backgroundColor = '#f4f4ee'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <MaterialIcon name="lock" size={17} />
                      {cerrarProgramacionMutation.isPending ? 'Cerrando...' : 'Cerrar programación'}
                    </button>
                  ) : (
                    <button
                      style={styles.dropdownItem}
                      onClick={() => { setShowMoreMenu(false); abrirProgramacionMutation.mutate(); }}
                      disabled={abrirProgramacionMutation.isPending}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f4f4ee'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <MaterialIcon name="lock_open" size={17} />
                      {abrirProgramacionMutation.isPending ? 'Abriendo...' : 'Reabrir Programación'}
                    </button>
                  )}
                  <div style={styles.dropdownDivider} />
                  <button
                    style={{ ...styles.dropdownItem, ...styles.dropdownItemDanger }}
                    onClick={() => { setShowMoreMenu(false); setDeleteError(null); setShowDeleteConfirm(true); }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f7ece8'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <MaterialIcon name="delete" size={17} />
                    Eliminar programación
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {cerrarError && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '1.25rem', padding: '0.75rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
            <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: '1px' }} />
            <span style={{ color: '#b91c1c', fontSize: '0.82rem', fontWeight: 500, lineHeight: 1.4 }}>{cerrarError}</span>
          </div>
        )}

        <div style={styles.infoStepperCard}>
        <div style={{ ...styles.infoBar, gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr) 1.7fr' }}>
          <div style={styles.infoBarItem}>
            <span style={styles.infoBarLabelRow}>
              <MaterialIcon name="calendar_today" size={14} color="#8b93a1" />
              <span style={styles.infoBarLabel}>Fecha y hora QX</span>
            </span>
            <span style={styles.infoBarValueMono}>{fechaQxLarga} · {programacion.horaQx || '-'}</span>
            <span style={styles.infoBarDividerLine} />
          </div>
          <div style={styles.infoBarItem}>
            <span style={styles.infoBarLabelRow}>
              <MaterialIcon name="stethoscope" size={14} color="#8b93a1" />
              <span style={styles.infoBarLabel}>Médico</span>
            </span>
            <span style={styles.infoBarValue}>{programacion.medicos?.map(m => m.medico.nombreCompleto).join(', ') || '-'}</span>
            <span style={styles.infoBarDividerLine} />
          </div>
          <div style={styles.infoBarItem}>
            <span style={styles.infoBarLabelRow}>
              <MaterialIcon name="apartment" size={14} color="#8b93a1" />
              <span style={styles.infoBarLabel}>Sede</span>
            </span>
            <span style={styles.infoBarValue}>{programacion.sede ? programacion.sede.nombre : '-'}</span>
            <span style={styles.infoBarDividerLine} />
          </div>
          <div style={styles.infoBarItem}>
            <span style={styles.infoBarLabelRow}>
              <MaterialIcon name="location_on" size={14} color="#8b93a1" />
              <span style={styles.infoBarLabel}>Ciudad QX</span>
            </span>
            <span style={styles.infoBarValue}>{programacion.hospital?.ciudadCat?.nombre || '-'}</span>
            <span style={styles.infoBarDividerLine} />
          </div>
          <div style={styles.infoBarItem}>
            <span style={styles.infoBarLabel}>Estado</span>
            <span style={{ ...styles.infoBarBadges, ...(isMobile ? { display: 'grid' as const, gridTemplateColumns: 'repeat(2, 1fr)' } : {}) }}>
              {PROGRAMACION_FLAGS.filter(f => programacion[f.key]).length === 0 ? (
                <span style={styles.infoBarValue}>-</span>
              ) : (
                PROGRAMACION_FLAGS.filter(f => programacion[f.key]).map(({ key, icon, color, label }) => (
                  <span key={key} style={{ ...styles.estadoFlagBadge, backgroundColor: `${color}26`, border: `1px solid ${color}55`, color }}>
                    {icon}
                    {label}
                  </span>
                ))
              )}
            </span>
          </div>
        </div>

        <div style={styles.infoStepperDivider} />

        <div style={styles.stepperBar}>
          <div style={styles.stepperSteps}>
            {stepperSteps.map((step, idx) => {
              const isCurrent = idx === stepperCurrentIdx;
              const circleStyle = step.done ? styles.stepperCircleDone : isCurrent ? styles.stepperCircleCurrent : styles.stepperCirclePending;
              return (
                <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: idx < stepperSteps.length - 1 ? 1 : undefined, minWidth: 0 }}>
                  <div style={styles.stepperStep}>
                    <span style={{ ...styles.stepperCircle, ...circleStyle }}>
                      {step.done ? <MaterialIcon name="check" size={14} /> : idx + 1}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.1rem' }}>
                      <span style={{ ...styles.stepperLabel, ...(!step.done && !isCurrent ? styles.stepperLabelPending : {}) }}>{step.label}</span>
                      {step.subLabel && <span style={styles.stepperSubLabel}>{step.subLabel}</span>}
                    </div>
                  </div>
                  {idx < stepperSteps.length - 1 && (
                    <span style={{ ...styles.stepperConnector, backgroundColor: step.done ? '#6b8c1f' : '#e5e7eb' }} />
                  )}
                </div>
              );
            })}
          </div>
          {requisiciones.length === 0 ? (
            <button
              type="button"
              className="btn-press"
              style={{ ...styles.saveBtn, display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
              onClick={openRequisicionModal}
            >
              Generar requisición <MaterialIcon name="arrow_forward" size={16} />
            </button>
          ) : programacion.sinRemision && (
            <button
              type="button"
              className="btn-press"
              style={{ ...styles.saveBtn, display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0, ...(!puedeAgregarRemision ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
              onClick={() => { if (puedeAgregarRemision) setShowRemisionModal(true); }}
              title={!puedeAgregarRemision ? 'Necesitas al menos una requisición para poder agregar una remisión.' : undefined}
            >
              Generar remisión <MaterialIcon name="arrow_forward" size={16} />
            </button>
          )}
        </div>
        </div>

        <div style={{ ...styles.mainTabBar, ...(isMobile ? { overflowX: 'auto' as const, overflowY: 'hidden' as const, WebkitOverflowScrolling: 'touch' as const, touchAction: 'pan-x' as const } : {}) }}>
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
        <>
        {/* Cotizaciones / Requisiciones / Remisiones — fila horizontal, antes del Desglose Financiero */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(3, minmax(0, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            {/* Cotizaciones */}
            <div style={styles.miniCard}>
              <div style={styles.miniCardHeader}>
                <div style={styles.miniCardHeaderLeft}>
                  <span style={styles.miniCardIconBadge}><FileText size={15} color="#6b8c1f" /></span>
                  <h3 style={styles.miniCardTitle}>Cotizaciones</h3>
                  <span style={{ ...styles.miniCardBadge, backgroundColor: '#e5e7eb' }}>{programacion.cotizaciones.length}</span>
                </div>
                <button type="button" style={styles.miniCardAddLink} onClick={() => setShowAgregarCotizacionModal(true)}>
                  <Plus size={13} /> Agregar
                </button>
              </div>
              <div style={{ ...styles.miniCardBody, ...(programacion.cotizaciones.length > 0 ? { padding: '0.25rem 0 0' } : {}) }}>
                {programacion.cotizaciones.length === 0 ? (
                  <div style={styles.miniCardEmpty}>
                    <Circle size={22} color="#d1d5db" />
                    No hay cotizaciones vinculadas
                  </div>
                ) : (
                  <div style={styles.miniCardListInner}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 1rem', fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                      <span>Id</span>
                      <span style={{ flex: 1, textAlign: 'center' as const }}>Cirugía</span>
                      <span>Total</span>
                    </div>
                    <div ref={cotizacionesScrollRef} style={{ ...styles.tabScrollBody, maxHeight: '160px', ...(miniCardSyncedHeight ? { height: miniCardSyncedHeight } : {}) }}>
                      {programacion.cotizaciones.map((c, i) => (
                        <div
                          key={c.id}
                          style={{ ...styles.cotizacionCardMobile, width: '100%', boxSizing: 'border-box' as const, ...(i > 0 ? styles.remRowBorder : {}), cursor: 'pointer' }}
                          onClick={() => setSelectedCotizacionId(c.id)}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#6b8c1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, minWidth: 0 }}>
                              {c.numCotizacion ?? c.id}
                            </span>
                            <span style={{ flex: 1, textAlign: 'center' as const, fontSize: '0.78rem', color: '#6b6b60', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, minWidth: 0 }}>
                              {c.cirugia || '-'}
                            </span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#333', flexShrink: 0 }}>{formatMoney(c.total)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ ...styles.consumoTotalRow, backgroundColor: '#fff', borderTop: '1px solid #e5e7eb' }}>
                      <span style={{ ...styles.consumoTotalLabel, textTransform: 'none' as const }}>Total</span>
                      <span style={styles.consumoTotalValue}>{formatMoney(programacion.cotizaciones.reduce((sum, c) => sum + Number(c.total ?? 0), 0))}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Requisiciones */}
            <div style={styles.miniCard}>
              <div style={styles.miniCardHeader}>
                <div style={styles.miniCardHeaderLeft}>
                  <span style={styles.miniCardIconBadge}><MaterialIcon name="inventory_2" size={15} color="#6b8c1f" /></span>
                  <h3 style={styles.miniCardTitle}>Requisiciones</h3>
                  <span style={{ ...styles.miniCardBadge, backgroundColor: '#e5e7eb' }}>{requisiciones.length}</span>
                </div>
                <button type="button" style={styles.miniCardAddLink} onClick={openRequisicionModal}>
                  <Plus size={13} /> Agregar
                </button>
              </div>
              <div style={{ ...styles.miniCardBody, ...(requisiciones.length > 0 ? { padding: '0.25rem 0 0' } : {}) }}>
                {requisiciones.length === 0 ? (
                  <div style={styles.miniCardEmpty}>
                    <Circle size={22} color="#d1d5db" />
                    No hay datos relacionados
                  </div>
                ) : (
                  <div style={styles.miniCardListInner}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 1rem', fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                      <span>Id</span>
                      <span style={{ flex: 1, textAlign: 'center' as const }}>Usuario</span>
                      <span>Total</span>
                    </div>
                    <div ref={requisicionesScrollRef} style={{ ...styles.tabScrollBody, maxHeight: '160px', ...(miniCardSyncedHeight ? { height: miniCardSyncedHeight } : {}) }}>
                      {requisiciones.map((req, i) => (
                          <div
                            key={req.id}
                            style={{ ...styles.cotizacionCardMobile, width: '100%', boxSizing: 'border-box' as const, ...(i > 0 ? styles.remRowBorder : {}), cursor: 'pointer' }}
                            onClick={() => setSelectedRequisicionId(req.id)}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#6b8c1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, minWidth: 0 }}>
                                {req.id}
                              </span>
                              <span style={{ flex: 1, textAlign: 'center' as const, fontSize: '0.78rem', color: '#6b6b60', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, minWidth: 0 }}>
                                {req.usuario ?? '-'}
                              </span>
                              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#333', flexShrink: 0 }}>{formatMoney(req.total)}</span>
                            </div>
                          </div>
                      ))}
                    </div>
                    <div style={{ ...styles.consumoTotalRow, backgroundColor: '#fff', borderTop: '1px solid #e5e7eb' }}>
                      <span style={{ ...styles.consumoTotalLabel, textTransform: 'none' as const }}>Total</span>
                      <span style={styles.consumoTotalValue}>{formatMoney(requisiciones.reduce((sum, req) => sum + Number(req.total ?? 0), 0))}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Remisiones */}
            <div style={styles.miniCard}>
              <div style={styles.miniCardHeader}>
                <div style={styles.miniCardHeaderLeft}>
                  <span style={styles.miniCardIconBadge}><MaterialIcon name="receipt_long" size={15} color="#6b8c1f" /></span>
                  <h3 style={styles.miniCardTitle}>Remisiones</h3>
                  <span style={{ ...styles.miniCardBadge, backgroundColor: '#e5e7eb' }}>{remisiones.length}</span>
                </div>
                <button
                  type="button"
                  style={{ ...styles.miniCardAddLink, ...(!puedeAgregarRemision ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                  onClick={() => { if (puedeAgregarRemision) setShowRemisionModal(true); }}
                  title={!puedeAgregarRemision ? 'Necesitas al menos una requisición para poder agregar una remisión.' : undefined}
                >
                  <Plus size={13} /> Agregar
                </button>
              </div>
              <div style={{ ...styles.miniCardBody, ...(remisiones.length > 0 ? { padding: '0.25rem 0 0' } : {}) }}>
                {remisiones.length === 0 ? (
                  <div style={styles.miniCardEmpty}>
                    <Circle size={22} color="#d1d5db" />
                    No hay datos relacionados
                  </div>
                ) : (
                  <div style={styles.miniCardListInner}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 1rem', fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                      <span>N° Remisión</span>
                      <span style={{ flex: 1, textAlign: 'center' as const }}>Estado</span>
                      <span>Total</span>
                    </div>
                    <div ref={remisionesScrollRef} style={{ ...styles.tabScrollBody, maxHeight: '160px', ...(miniCardSyncedHeight ? { height: miniCardSyncedHeight } : {}) }}>
                      {remisiones.map((rem, i) => (
                        <div
                          key={rem.id}
                          style={{ ...styles.cotizacionCardMobile, width: '100%', boxSizing: 'border-box' as const, ...(i > 0 ? styles.remRowBorder : {}), cursor: 'pointer' }}
                          onClick={() => navigate(`/operacion/remisiones/${rem.id}`, '/operacion/remisiones/:id')}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#6b8c1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, minWidth: 0 }}>
                              {rem.numRemision || rem.id}
                            </span>
                            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0 }}>
                              {rem.estado && (
                                <span style={{ ...styles.estadoBadge, ...(rem.estado === 'Definitiva' ? styles.estadoDefinitiva : styles.estadoOtro), flexShrink: 0 }}>
                                  {rem.estado}
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#333', flexShrink: 0 }}>{formatMoney(rem.total)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ ...styles.consumoTotalRow, backgroundColor: '#fff', borderTop: '1px solid #e5e7eb' }}>
                      <span style={{ ...styles.consumoTotalLabel, textTransform: 'none' as const }}>Total</span>
                      <span style={styles.consumoTotalValue}>{formatMoney(remisiones.reduce((sum, rem) => sum + Number(rem.total ?? 0), 0))}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
        </div>

        {isNarrow ? (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: '1.5rem', marginBottom: '2rem', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '1.5rem' }}>
              {desgloseFinancieroCard}
              {notasCreditoCard}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '1rem' }}>
              {tecnicosAsociadosCard}
              {tecnicosSugeridosCard}
              {documentosCard}
              {actividadCard}
            </div>
          </div>
        ) : (
          <div style={styles.desgloseSection}>
            {desgloseFinancieroCard}
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '1rem' }}>
              {tecnicosAsociadosCard}
              {documentosCard}
            </div>
          </div>
        )}

        </>
        )}

        {mainTab === 'consumos' && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', padding: '1.75rem' }}>
          <div style={styles.remisionesTitleRow}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#e9f2d8', flexShrink: 0 }}><MaterialIcon name="inventory_2" size={16} color="#4d7a13" /></span>
            <h2 style={styles.sectionTitle}>Consumos</h2>
            <span style={styles.badge}>{totalConsumos}</span>
          </div>
          {consumoGrupos.length === 0 ? (
            <div style={styles.emptySection}>No hay consumos</div>
          ) : (
            <div style={{ border: '1px solid #eeeee6', borderRadius: '10px', overflow: 'hidden' as const }}>
              <div ref={consumosScrollRef} style={{ overflow: 'auto' as const, maxHeight: '320px', overflowAnchor: 'none' as const }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'max-content 50px 1.1rem 1fr 110px 110px 140px', fontSize: '0.72rem' }}>
                  {['Remisión', 'Cant.', '', 'Producto', 'Valor Unit.', 'Valor', ''].map((h, i) => (
                    <div key={i} style={{ ...styles.consumosTh, backgroundColor: '#eef6e3', zIndex: 2, textAlign: (i >= 4 && i < 6 ? 'right' as const : 'left' as const), ...(i === 0 ? { borderRight: '1px solid #e5e7eb' } : {}) }}>{h}</div>
                  ))}
                  {consumoGrupos.map((grupo, gi) => (
                    <Fragment key={grupo.remisionId ?? `sin-remision-${gi}`}>
                      <div
                        style={{
                          ...styles.consumosTd,
                          gridRow: `span ${grupo.items.length}`,
                          backgroundColor: '#fff',
                          borderRight: '1px solid #e5e7eb',
                        }}
                      >
                        <div
                          style={{
                            position: 'sticky' as const,
                            top: '25px',
                            fontWeight: 700,
                            color: '#6b8c1f',
                          }}
                        >
                          {grupo.numRemision ?? 'Sin remisión'}
                        </div>
                      </div>
                      {grupo.items.map(item => {
                        const producto = `${item.productoReferencia ? `${item.productoReferencia} / ` : ''}${item.productoNombre ?? '-'}`;
                        const rowHover = hoveredConsumoRowId === item.id ? { backgroundColor: '#f3faec' } : {};
                        const cellHandlers = {
                          onClick: () => { setSelectedValConsumoId(null); setSelectedConsumoId(item.id); },
                          onMouseEnter: () => setHoveredConsumoRowId(item.id),
                          onMouseLeave: () => setHoveredConsumoRowId(null),
                        };
                        return (
                          <Fragment key={item.id}>
                            <div style={{ ...styles.consumosTd, ...rowHover, cursor: 'pointer' as const }} {...cellHandlers}>{item.cantidad}</div>
                            <div style={{ ...styles.consumosTd, ...rowHover, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as const }} {...cellHandlers}>
                              {item.productoCambiado && (
                                <span className="app-tooltip" data-tooltip="Se validó con un producto distinto al remisionado" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '1.1rem', height: '1.1rem', borderRadius: '50%', backgroundColor: '#e0e7ff', color: '#4338ca', flexShrink: 0 }}>
                                  <MaterialIcon name="swap_horiz" size={11} />
                                </span>
                              )}
                            </div>
                            <div style={{ ...styles.consumosTd, ...rowHover, display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0, cursor: 'pointer' as const }} title={producto} {...cellHandlers}>
                              <span style={{ overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, minWidth: 0 }}>{producto}</span>
                            </div>
                            <div style={{ ...styles.consumosTd, ...rowHover, textAlign: 'right' as const, cursor: 'pointer' as const }} {...cellHandlers}>{formatMoney(item.valorUnitario)}</div>
                            <div style={{ ...styles.consumosTd, ...rowHover, textAlign: 'right' as const, fontWeight: 700, color: '#3f6510', cursor: 'pointer' as const }} {...cellHandlers}>{formatMoney(item.valor)}</div>
                            <div style={{ ...styles.consumosTd, ...rowHover }} onMouseEnter={() => setHoveredConsumoRowId(item.id)} onMouseLeave={() => setHoveredConsumoRowId(null)}>
                              <button
                                type="button"
                                className={item.validado ? undefined : 'btn-press'}
                                disabled={item.validado}
                                style={{ ...styles.pickBtn, fontSize: '0.72rem', padding: '0.2rem 0.6rem', width: '116px', justifyContent: 'center', ...(item.validado ? {} : styles.pickBtnActive), ...(item.validado ? { cursor: 'not-allowed' as const } : {}) }}
                                onClick={e => { e.stopPropagation(); if (!item.validado) setValidarConsumoId(item.id); }}
                              >
                                {item.validado ? <><CheckCircle size={13} /> Validado</> : 'Validar consumo'}
                              </button>
                            </div>
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>
              <div style={{ ...styles.consumoTotalRow, borderRadius: 0, backgroundColor: '#eef6e3' }}>
                <span style={styles.consumoTotalLabel}>Total consumos</span>
                <span style={styles.consumoTotalValue}>
                  {formatMoney(consumoGrupos.reduce((sum, g) => sum + g.items.reduce((s, it) => s + it.valor, 0), 0))}
                </span>
              </div>
            </div>
          )}
          </div>
        </div>
        )}

        {mainTab === 'validar-consumos' && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', padding: '1.75rem' }}>
          <div style={styles.remisionesTitleRow}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#e9f2d8', flexShrink: 0 }}><MaterialIcon name="fact_check" size={16} color="#4d7a13" /></span>
            <h2 style={styles.sectionTitle}>Validar consumos</h2>
            <span style={styles.badge}>{totalValidacion}</span>
          </div>
          {validacionGrupos.length === 0 ? (
            <div style={styles.emptySection}>No hay datos relacionados</div>
          ) : (
            <div style={{ border: '1px solid #eeeee6', borderRadius: '10px', overflow: 'hidden' as const }}>
              <div ref={validacionScrollRef} style={{ overflow: 'auto' as const, maxHeight: '320px', overflowAnchor: 'none' as const }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'max-content 90px 110px 110px 130px 1fr 1.1rem 1fr', fontSize: '0.72rem', minWidth: '850px' }}>
                  {['Remisión', 'Can Rem', 'Real Validada', 'Referencia', 'Referencia Validada', 'Nombre Remisionado', '', 'Nombre Validado'].map((h, i) => (
                    <div key={i} style={{ ...styles.consumosTh, backgroundColor: '#eef6e3', zIndex: 2, textAlign: (i === 1 || i === 2 ? 'right' as const : 'left' as const), ...(i === 0 ? { borderRight: '1px solid #e5e7eb' } : {}) }}>{h}</div>
                  ))}
                  {validacionGruposAgrupados.map((grupo, gi) => {
                    const totalFilasGrupo = grupo.productos.reduce((sum, p) => sum + 1 + ((p.items.length > 1 && expandedValidacionGroupKeys.has(p.key)) ? p.items.length : 0), 0);
                    return (
                    <Fragment key={grupo.remisionId ?? `sin-remision-${gi}`}>
                      <div
                        style={{
                          ...styles.consumosTd,
                          gridRow: `span ${totalFilasGrupo}`,
                          backgroundColor: '#fff',
                          borderRight: '1px solid #e5e7eb',
                        }}
                      >
                        <div
                          style={{
                            position: 'sticky' as const,
                            top: '25px',
                            fontWeight: 700,
                            color: '#6b8c1f',
                          }}
                        >
                          {grupo.numRemision ?? 'Sin remisión'}
                        </div>
                      </div>
                      {grupo.productos.map(producto => {
                        const esGrupo = producto.items.length > 1;
                        const expandido = esGrupo && expandedValidacionGroupKeys.has(producto.key);
                        const algunoCambiado = producto.items.some(it => it.productoCambiado);
                        const single = producto.items[0];
                        const rowHover = hoveredValidacionRowId === producto.key ? { backgroundColor: '#f3faec' } : {};
                        const cellHandlers = {
                          onClick: () => {
                            if (esGrupo) {
                              setExpandedValidacionGroupKeys(prev => {
                                const next = new Set(prev);
                                if (next.has(producto.key)) next.delete(producto.key); else next.add(producto.key);
                                return next;
                              });
                              return;
                            }
                            if (single.detConsumoId) { setSelectedValConsumoId(single.id); setSelectedConsumoId(single.detConsumoId); }
                          },
                          onMouseEnter: () => setHoveredValidacionRowId(producto.key),
                          onMouseLeave: () => setHoveredValidacionRowId(null),
                        };
                        return (
                          <Fragment key={producto.key}>
                            <div style={{ ...styles.consumosTd, ...rowHover, textAlign: 'right' as const, cursor: 'pointer' as const }} {...cellHandlers}>{producto.cantRemisionada}</div>
                            <div style={{ ...styles.consumosTd, ...rowHover, textAlign: 'right' as const, cursor: 'pointer' as const }} {...cellHandlers}>{producto.cantRealValidada}</div>
                            <div style={{ ...styles.consumosTd, ...rowHover, overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, cursor: 'pointer' as const }} title={producto.referenciaRemisionada ?? '-'} {...cellHandlers}>{producto.referenciaRemisionada ?? '-'}</div>
                            <div style={{ ...styles.consumosTd, ...rowHover, overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, cursor: 'pointer' as const }} title={producto.referenciaValidada ?? '-'} {...cellHandlers}>{producto.referenciaValidada ?? '-'}</div>
                            <div style={{ ...styles.consumosTd, ...rowHover, overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, cursor: 'pointer' as const }} title={producto.nombreRemisionado ?? '-'} {...cellHandlers}>{producto.nombreRemisionado ?? '-'}</div>
                            <div style={{ ...styles.consumosTd, ...rowHover, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as const }} {...cellHandlers}>
                              {algunoCambiado && (
                                <span
                                  className="app-tooltip"
                                  data-tooltip="Se validó con un producto distinto al remisionado"
                                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '1.1rem', height: '1.1rem', borderRadius: '50%', backgroundColor: '#e0e7ff', color: '#4338ca', flexShrink: 0 }}
                                >
                                  <MaterialIcon name="swap_horiz" size={11} />
                                </span>
                              )}
                            </div>
                            <div style={{ ...styles.consumosTd, ...rowHover, overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, cursor: 'pointer' as const, display: 'flex', alignItems: 'center', gap: '0.35rem' }} {...cellHandlers}>
                              <span style={{ overflow: 'hidden' as const, textOverflow: 'ellipsis' as const }} title={producto.nombreValidado ?? '-'}>{producto.nombreValidado ?? '-'}</span>
                              {esGrupo && (
                                <span style={{ backgroundColor: '#e9f2d8', color: '#4d7a13', fontSize: '0.65rem', fontWeight: 700, minWidth: '1.2rem', height: '1.2rem', padding: '0 0.3rem', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.1rem', flexShrink: 0 }}>
                                  ×{producto.items.length}
                                  <MaterialIcon name="expand_more" size={11} style={{ transform: expandido ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }} />
                                </span>
                              )}
                            </div>
                            {expandido && producto.items.map((sub, si) => {
                              const subHover = hoveredValidacionRowId === sub.id ? { backgroundColor: '#f3faec' } : {};
                              const subHandlers = {
                                onClick: () => { if (sub.detConsumoId) { setSelectedValConsumoId(sub.id); setSelectedConsumoId(sub.detConsumoId); } },
                                onMouseEnter: () => setHoveredValidacionRowId(sub.id),
                                onMouseLeave: () => setHoveredValidacionRowId(null),
                              };
                              return (
                                <Fragment key={sub.id}>
                                  <div style={{ ...styles.consumosTd, backgroundColor: '#f9fafb', ...subHover, cursor: 'pointer' as const }} {...subHandlers} />
                                  <div style={{ ...styles.consumosTd, backgroundColor: '#f9fafb', ...subHover, textAlign: 'right' as const, color: '#9ca3af', cursor: 'pointer' as const }} {...subHandlers}>{sub.cantRealValidada}</div>
                                  <div style={{ ...styles.consumosTd, backgroundColor: '#f9fafb', ...subHover, cursor: 'pointer' as const }} {...subHandlers} />
                                  <div style={{ ...styles.consumosTd, backgroundColor: '#f9fafb', ...subHover, color: '#9ca3af', overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, cursor: 'pointer' as const }} title={sub.referenciaValidada ?? '-'} {...subHandlers}>{sub.referenciaValidada ?? '-'}</div>
                                  <div style={{ ...styles.consumosTd, backgroundColor: '#f9fafb', ...subHover, cursor: 'pointer' as const }} {...subHandlers} />
                                  <div style={{ ...styles.consumosTd, backgroundColor: '#f9fafb', ...subHover, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as const }} {...subHandlers}>
                                    {sub.productoCambiado && (
                                      <span
                                        className="app-tooltip"
                                        data-tooltip="Se validó con un producto distinto al remisionado"
                                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '1.1rem', height: '1.1rem', borderRadius: '50%', backgroundColor: '#e0e7ff', color: '#4338ca', flexShrink: 0 }}
                                      >
                                        <MaterialIcon name="swap_horiz" size={11} />
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ ...styles.consumosTd, backgroundColor: '#f9fafb', ...subHover, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' as const, paddingLeft: '1.5rem' }} title={sub.nombreValidado ?? undefined} {...subHandlers}>
                                    <span style={{ overflow: 'hidden' as const, textOverflow: 'ellipsis' as const }}>
                                      {sub.marcaTiempo ? formatDateTime(sub.marcaTiempo) : `Validación ${si + 1}`}{sub.usuario ? ` · ${sub.usuario}` : ''}
                                    </span>
                                  </div>
                                </Fragment>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                    );
                  })}
                </div>
              </div>
              <div style={{ ...styles.consumoTotalRow, borderRadius: 0, backgroundColor: '#eef6e3' }}>
                <span style={styles.consumoTotalLabel}>Total consumos validados</span>
                <span style={styles.consumoTotalValue}>
                  {formatMoney(validacionGrupos.reduce((sum, g) => sum + g.items.reduce((s, it) => s + it.valor, 0), 0))}
                </span>
              </div>
            </div>
          )}
          </div>
        </div>
        )}

        {mainTab === 'comisiones' && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', overflow: 'hidden' as const }}>
          <div style={{ ...styles.remisionesTitleRow, flexWrap: 'wrap' as const, rowGap: '0.6rem', padding: '1.75rem 1.75rem 0' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#e9f2d8', flexShrink: 0 }}><MaterialIcon name="payments" size={16} color="#4d7a13" /></span>
            <h2 style={styles.sectionTitle}>Asignación de Comisiones</h2>
            <span style={styles.badge}>{totalComisiones}</span>
            {comisionGrupos.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginLeft: 'auto', flexWrap: 'wrap' as const }}>
                <div style={styles.comisionTabGroup}>
                  <button type="button" style={{ ...styles.comisionTabBtn, ...(comisionFiltro === 'todas' ? styles.comisionTabBtnActive : {}) }} onClick={() => setComisionFiltro('todas')}>
                    Todas · {comisionTodosItems.length}
                  </button>
                  {comisionCategoriasPresentes.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      style={{ ...styles.comisionTabBtn, ...(comisionFiltro === cat ? styles.comisionTabBtnActive : {}) }}
                      onClick={() => setComisionFiltro(cat)}
                    >
                      {COMISION_CATEGORIA_LABEL[cat] ?? cat} · {comisionGrupos.find(g => g.categoria === cat)?.items.length ?? 0}
                    </button>
                  ))}
                </div>
                <div style={{ position: 'relative' as const }}>
                  <button
                    type="button"
                    className="btn-press"
                    style={{ ...styles.comisionAddBtn, ...(programacion.consumoNoValidado ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                    onClick={() => { if (!programacion.consumoNoValidado) openComisionModal(); }}
                    onMouseEnter={e => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setComisionTooltipPos({ top: rect.top, left: rect.left + rect.width / 2 });
                    }}
                    onMouseLeave={() => setComisionTooltipPos(null)}
                  >
                    <Plus size={14} /> Agregar comisión
                  </button>
                  {programacion.consumoNoValidado && comisionTooltipPos && (
                    <div style={{ ...styles.tooltipBubble, top: comisionTooltipPos.top - 8, left: comisionTooltipPos.left }}>
                      La programación debe tener todos sus consumos validados para poder agregar comisiones.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {comisionGrupos.length === 0 ? (
            <div style={{ ...styles.emptyState, border: 'none', boxShadow: 'none', borderRadius: 0, margin: '0 1.75rem 1.75rem' }}>No hay datos relacionados</div>
          ) : (
            <>
              <div style={styles.comisionStatsBar}>
                <div style={{ ...styles.comisionStatsSegment, paddingLeft: '1.75rem' }}>
                  <span style={styles.colHeaderText}>Total comisiones</span>
                  <span style={styles.comisionStatsValue}>{formatMoney(comisionTotalGeneral)}</span>
                  <span style={styles.comisionStatsSub}>Suma de {comisionGrupos.length} categoría{comisionGrupos.length === 1 ? '' : 's'}</span>
                </div>
                {comisionCategoriaStats.map(stat => {
                  const color = comisionCategoriaColor(stat.categoria);
                  return (
                    <div key={stat.categoria} style={styles.comisionStatsSegment}>
                      <span style={{ ...styles.colHeaderText, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: color.text, flexShrink: 0 }} />
                        {COMISION_CATEGORIA_LABEL[stat.categoria]}
                      </span>
                      <span style={styles.comisionStatsValue}>{formatMoney(stat.monto)}</span>
                      <div style={styles.comisionStatsBarTrack}>
                        <div style={{ ...styles.comisionStatsBarFill, width: `${Math.min(stat.pct, 100)}%`, backgroundColor: color.text }} />
                      </div>
                      <span style={styles.comisionStatsSub}>{stat.pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
                <div style={{ ...styles.comisionStatsSegment, borderRight: 'none', paddingRight: '1.75rem' }}>
                  <span style={styles.colHeaderText}>Personas asignadas</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ display: 'flex' }}>
                      {comisionTodosItems.slice(0, 3).map((it, i) => (
                        <span key={it.id} style={{ ...styles.tecnicoAvatar, ...(i > 0 ? { marginLeft: '-0.5rem' } : {}), border: '2px solid #fff' }}>
                          {it.tecnico ? getTecnicoInitials(it.tecnico) : '-'}
                        </span>
                      ))}
                      {comisionTodosItems.length > 3 && (
                        <span style={{ ...styles.tecnicoAvatar, marginLeft: '-0.5rem', border: '2px solid #fff', backgroundColor: '#e5e7eb', color: '#6b7280' }}>
                          +{comisionTodosItems.length - 3}
                        </span>
                      )}
                    </div>
                    <span style={styles.comisionStatsValue}>{comisionTodosItems.length}</span>
                  </div>
                  <span style={styles.comisionStatsSub}>
                    {comisionCategoriaStats.filter(s => s.count > 0).map(s => `${s.count} ${s.count > 1 ? COMISION_CATEGORIA_LABEL[s.categoria] : COMISION_CATEGORIA_LABEL_SINGULAR[s.categoria]}`.toLowerCase()).join(' · ') || 'Sin asignar'}
                  </span>
                </div>
              </div>

              <div style={{ ...styles.remList, borderRadius: 0, border: 'none', boxShadow: 'none' }}>
                <div ref={comisionesScrollRef} style={styles.comisionListBody}>
                  {comisionItemsFiltrados.map((item, ii) => {
                    const key = `${item.categoria}__${item.id}`;
                    const esMultiple = item.detalle.length > 1;
                    const expandido = esMultiple && expandedComisionKeys.has(key);
                    const hoverStyle = hoveredComisionId === item.id ? styles.comisionRowHover : {};
                    const color = comisionCategoriaColor(item.categoria);
                    const cellProps = esMultiple
                      ? {
                          onMouseEnter: () => setHoveredComisionId(item.id),
                          onMouseLeave: () => setHoveredComisionId(null),
                          onClick: () => setExpandedComisionKeys(prev => {
                            const next = new Set(prev);
                            if (next.has(key)) next.delete(key); else next.add(key);
                            return next;
                          }),
                        }
                      : {
                          onMouseEnter: () => setHoveredComisionId(item.id),
                          onMouseLeave: () => setHoveredComisionId(null),
                          onClick: () => setSelectedComisionId(item.detalle[0]?.comisionId ?? item.id),
                        };
                    return (
                      <Fragment key={key}>
                        <div style={{ ...styles.comisionRow, ...(ii > 0 ? styles.remRowBorder : {}), ...hoverStyle, cursor: 'pointer' }} {...cellProps}>
                          <span style={{ ...styles.tecnicoAvatar, width: '24px', height: '24px', fontSize: '0.6rem' }}>
                            {item.tecnico ? getTecnicoInitials(item.tecnico) : '-'}
                          </span>
                          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.1rem', minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.tecnico ?? '-'}</span>
                              <span style={{ ...styles.comisionRolBadge, backgroundColor: color.bg, color: color.text }}>{COMISION_CATEGORIA_LABEL_SINGULAR[item.categoria] ?? item.categoria}</span>
                              {esMultiple && (
                                <span style={{ ...styles.comisionRolBadge, backgroundColor: '#e9f2d8', color: '#4d7a13', display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}>
                                  ×{item.detalle.length}
                                  <ChevronDown size={11} style={{ transform: expandido ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }} />
                                </span>
                              )}
                            </div>
                            {!esMultiple && (
                              <span style={{ fontSize: '0.7rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                                {[item.detalle[0]?.tipo, item.detalle[0]?.remisionLabel, item.detalle[0]?.productoLabel].filter(Boolean).join(' | ') || 'Comisión por la cirugía'}
                              </span>
                            )}
                          </div>
                          <span style={styles.comisionRowMonto}>{formatMoney(item.monto)}</span>
                          <button
                            type="button"
                            className="btn-press"
                            style={styles.comisionRowBtn}
                            onClick={e => { e.stopPropagation(); setSelectedComisionId(item.detalle[0]?.comisionId ?? item.id); }}
                          >
                            {item.categoria === 'TÉCNICOS' ? 'Cambiar' : 'Editar'}
                          </button>
                        </div>
                        {expandido && item.detalle.map(linea => {
                          const lineaKey = linea.comisionId + (linea.remisionLabel ?? '') + linea.valor;
                          const lineaHoverStyle = hoveredComisionLineaKey === lineaKey ? styles.comisionRowHover : {};
                          return (
                            <div
                              key={lineaKey}
                              style={{ ...styles.comisionRow, ...styles.remRowBorder, backgroundColor: '#f9fafb', paddingLeft: '3.25rem', cursor: 'pointer', ...lineaHoverStyle }}
                              onMouseEnter={() => setHoveredComisionLineaKey(lineaKey)}
                              onMouseLeave={() => setHoveredComisionLineaKey(null)}
                              onClick={() => setSelectedComisionId(linea.comisionId)}
                            >
                              <span style={{ fontSize: '0.78rem', color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                                {[linea.tipo, linea.remisionLabel, linea.productoLabel].filter(Boolean).join(' | ') || '-'}
                              </span>
                              <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6b7280' }}>{formatMoney(linea.valor)}</span>
                            </div>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            </>
          )}
          </div>
        </div>
        )}

        {mainTab === 'gastos-fuentes' && (
        <>
        <div style={{ marginBottom: '2rem' }}>
          <div style={styles.remisionesTitleRow}>
            <h2 style={styles.sectionTitle}>Gastos</h2>
            <span style={styles.badge}>{gastosRelacionados.length}</span>
          </div>
          {gastosRelacionados.length === 0 ? (
            <div style={styles.emptyState}>No hay datos relacionados</div>
          ) : (
            <div style={styles.remList}>
              <div style={{ ...styles.gastoRow, ...styles.colHeader }}>
                <span style={styles.colHeaderText}>N° Gasto</span>
                <span style={styles.colHeaderText}>Fecha</span>
                <span style={styles.colHeaderText}>Descripción</span>
                <span style={styles.colHeaderText}>Beneficiario</span>
                <span style={{ ...styles.colHeaderText, textAlign: 'right' }}>Valor</span>
              </div>
              <div ref={gastosScrollRef} style={styles.tabScrollBody}>
                {gastosRelacionados.map((g, i) => {
                  const hoverStyle = hoveredGastoId === g.id ? styles.consumoCellHover : {};
                  return (
                    <div
                      key={g.id}
                      style={{ ...styles.gastoRow, ...(i > 0 ? styles.remRowBorder : {}), ...hoverStyle }}
                      onMouseEnter={() => setHoveredGastoId(g.id)}
                      onMouseLeave={() => setHoveredGastoId(null)}
                    >
                      <span style={styles.requisicionCodigo}>{g.numGasto ?? g.id}</span>
                      <span style={styles.requisicionCellText}>{formatDate(g.fechaGasto)}</span>
                      <span style={styles.requisicionCellText}>{g.descripcion ?? '-'}</span>
                      <span style={styles.requisicionCellText}>{g.beneficiarioGasto?.nombreCompleto ?? '-'}</span>
                      <span style={{ ...styles.requisicionCellText, textAlign: 'right', fontWeight: 600, color: '#333' }}>{formatMoney(g.valor)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <div style={styles.remisionesTitleRow}>
            <h2 style={styles.sectionTitle}>Fuentes</h2>
            <span style={styles.badge}>{fuentesRelacionadas.length}</span>
          </div>
          {fuentesRelacionadas.length === 0 ? (
            <div style={styles.emptyState}>No hay datos relacionados</div>
          ) : (
            <div style={styles.remList}>
              <div style={{ ...styles.fuenteRow, ...styles.colHeader }}>
                <span style={styles.colHeaderText}>No de Programación</span>
                <span style={{ ...styles.colHeaderText, textAlign: 'right' }}>Monto</span>
                <span style={styles.colHeaderText}>Registrado por</span>
                <span style={styles.colHeaderText}>Marca de Tiempo</span>
              </div>
              <div ref={fuentesScrollRef} style={styles.tabScrollBody}>
                {fuentesRelacionadas.map((f, i) => {
                  const hoverStyle = hoveredFuenteId === f.id ? styles.consumoCellHover : {};
                  return (
                    <div
                      key={f.id}
                      style={{ ...styles.fuenteRow, ...(i > 0 ? styles.remRowBorder : {}), ...hoverStyle, cursor: 'pointer' }}
                      onClick={() => setSelectedFuente(f)}
                      onMouseEnter={() => setHoveredFuenteId(f.id)}
                      onMouseLeave={() => setHoveredFuenteId(null)}
                    >
                      <span style={styles.requisicionCodigo}>{programacion.id}</span>
                      <span style={{ ...styles.requisicionCellText, textAlign: 'right', fontWeight: 600, color: '#333' }}>{formatMoney(f.monto)}</span>
                      <span style={styles.requisicionCellText}>{f.registradoPor?.nombreCompleto ?? '-'}</span>
                      <span style={styles.requisicionCellText}>{formatDateTime(f.marcaTiempo)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        </>
        )}

        </div>

        {!isNarrow && (
        <aside style={styles.sidebarColumn}>
          {tecnicosSugeridosCard}
          {notasCreditoCard}
          {actividadCard}
        </aside>
        )}
        </div>

      </div>

      {selectedTecnico && (
        <div className="modal-overlay-anim" style={styles.modalOverlay}>
          <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Técnico Asociado</h2>
              <button style={styles.closeBtn} onClick={() => setSelectedTecnico(null)}>
                <X size={20} />
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.infoRow}><span style={styles.label}>Nombre Técnico</span><span style={styles.value}>{selectedTecnico.tecnico?.nombreCompleto || '-'}</span></div>
              <div style={styles.infoRow}>
                <span style={styles.label}>N° Programación</span>
                <span style={styles.value}>{selectedTecnico.programacion?.numProgram || selectedTecnico.programacion?.id || '-'}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.label}>Remisión</span>
                <span
                  style={{ ...styles.value, color: '#4d7a13', cursor: selectedTecnico.remision ? 'pointer' : 'default' }}
                  onClick={() => selectedTecnico.remision && navigate(`/operacion/remisiones/${selectedTecnico.remision.id}`, '/operacion/remisiones/:id')}
                >
                  {selectedTecnico.remision?.numRemision || selectedTecnico.remision?.id || '-'}
                </span>
              </div>
              <div style={styles.infoRow}><span style={styles.label}>Fecha de Registro</span><span style={styles.value}>{formatDateTime(selectedTecnico.fechaRegistro)}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Registrado Por</span><span style={styles.greenTag}>{selectedTecnico.registradoPor?.nombreCompleto || '-'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Última Edición</span><span style={styles.value}>{formatDateTime(selectedTecnico.ultimaEdicion)}</span></div>
              <div style={{ ...styles.infoRow, borderBottom: 'none' }}><span style={styles.label}>Editado Por</span><span style={styles.value}>{selectedTecnico.editadoPor?.nombreCompleto || '-'}</span></div>
            </div>
          </div>
        </div>
      )}

      {selectedDocumento && (
        <div className="modal-overlay-anim" style={styles.modalOverlay}>
          <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Documento</h2>
              <button style={styles.closeBtn} onClick={() => setSelectedDocumento(null)}>
                <X size={20} />
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.infoRow}><span style={styles.label}>Nombre</span><span style={styles.value}>{selectedDocumento.nombre || '-'}</span></div>
              <div style={styles.infoRow}>
                <span style={styles.label}>Programación</span>
                <span
                  style={{ ...styles.value, color: '#db2777', cursor: selectedDocumento.programacion ? 'pointer' : 'default' }}
                  onClick={() => selectedDocumento.programacion && navigate(`/operacion/programaciones/${selectedDocumento.programacion.id}`, '/operacion/programaciones/:id')}
                >
                  {selectedDocumento.programacion?.numProgram || selectedDocumento.programacion?.id || '-'}
                </span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.label}>Documento</span>
                {selectedDocumento.archivoDisponible ? (
                  <button
                    type="button"
                    disabled={documentoArchivoAbriendo}
                    onClick={async () => {
                      setDocumentoArchivoError(false);
                      setDocumentoArchivoAbriendo(true);
                      try {
                        await remisionesService.abrirDocumentoArchivo(selectedDocumento.id);
                      } catch {
                        setDocumentoArchivoError(true);
                      } finally {
                        setDocumentoArchivoAbriendo(false);
                      }
                    }}
                    style={{ ...styles.value, color: '#6b8c1f', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                  >
                    <FileText size={14} /> {documentoArchivoAbriendo ? 'Abriendo...' : 'Ver / Descargar'}
                  </button>
                ) : selectedDocumento.documento ? (
                  <span style={{ ...styles.value, color: '#9ca3af', fontStyle: 'italic' as const, fontSize: '0.8rem' }} title={selectedDocumento.documento}>
                    No disponible (documento migrado de AppSheet, sin archivo)
                  </span>
                ) : (
                  <span style={styles.value}>-</span>
                )}
              </div>
              {documentoArchivoError && (
                <div style={{ padding: '0.4rem 0', color: '#dc2626', fontSize: '0.8rem', textAlign: 'right' as const }}>
                  No se pudo abrir el documento. Intenta de nuevo.
                </div>
              )}
              <div style={styles.infoRow}><span style={styles.label}>Cargado el</span><span style={styles.value}>{formatDateTime(selectedDocumento.cargadoEl)}</span></div>
              <div style={{ ...styles.infoRow, borderBottom: 'none' }}><span style={styles.label}>Cargado por</span><span style={styles.value}>{selectedDocumento.cargadoPor?.nombreCompleto || '-'}</span></div>
            </div>
          </div>
        </div>
      )}

      {selectedNotaCredito && (
        <div className="modal-overlay-anim" style={styles.modalOverlay}>
          <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Nota de Crédito</h2>
              <button style={styles.closeBtn} onClick={() => setSelectedNotaCredito(null)}>
                <X size={20} />
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.infoRow}><span style={styles.label}>ID</span><span style={styles.value}>{selectedNotaCredito.id}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>MarcaTiempo</span><span style={styles.value}>{formatDateTime(selectedNotaCredito.marcaTiempo)}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Fecha Remisión</span><span style={styles.value}>{formatDate(selectedNotaCredito.fechaRemision)}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Fecha Nota Crédito</span><span style={styles.value}>{formatDate(selectedNotaCredito.fechaNotaCredito)}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Remisión</span><span style={styles.value}>{selectedNotaCredito.factura?.id || '-'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Total</span><span style={styles.value}>{formatMoney(selectedNotaCredito.total)}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Forma de Descuento</span><span style={styles.value}>{selectedNotaCredito.formaDescuento || '-'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Valor</span><span style={styles.value}>{formatMoney(selectedNotaCredito.valor)}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Porcentaje</span><span style={styles.value}>{Number(selectedNotaCredito.porcentaje ?? 0).toFixed(2)}%</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Aplicada Por</span><span style={styles.value}>{selectedNotaCredito.aplicadaPor?.nombreCompleto || '-'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Notas</span><span style={{ ...styles.value, textAlign: 'right' as const, maxWidth: '45%' }}>{selectedNotaCredito.notas || '-'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Valor NC</span><span style={styles.value}>{formatMoney(selectedNotaCredito.valorNc)}</span></div>
              <div style={styles.infoRow}>
                <span style={styles.label}>Remisión No</span>
                <span
                  style={{ ...styles.value, color: '#db2777', cursor: selectedNotaCredito.factura?.remision ? 'pointer' : 'default' }}
                  onClick={() => selectedNotaCredito.factura?.remision && navigate(`/operacion/remisiones/${selectedNotaCredito.factura.remision.id}`, '/operacion/remisiones/:id')}
                >
                  {selectedNotaCredito.factura?.remision?.numRemision || selectedNotaCredito.factura?.remision?.id || '-'}
                </span>
              </div>
              <div style={{ ...styles.infoRow, borderBottom: 'none' }}>
                <span style={styles.label}>Programación No</span>
                <span
                  style={{ ...styles.value, color: '#db2777', cursor: selectedNotaCredito.factura?.remision?.programacion ? 'pointer' : 'default' }}
                  onClick={() => selectedNotaCredito.factura?.remision?.programacion && navigate(`/operacion/programaciones/${selectedNotaCredito.factura.remision.programacion.id}`, '/operacion/programaciones/:id')}
                >
                  {selectedNotaCredito.factura?.remision?.programacion?.numProgram || selectedNotaCredito.factura?.remision?.programacion?.id || '-'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedFuente && (
        <div className="modal-overlay-anim" style={styles.modalOverlay}>
          <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Fuente</h2>
              <button style={styles.closeBtn} onClick={() => setSelectedFuente(null)}>
                <X size={20} />
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.infoRow}><span style={styles.label}>Marca de Tiempo</span><span style={styles.value}>{formatDateTime(selectedFuente.marcaTiempo)}</span></div>
              <div style={styles.infoRow}>
                <span style={styles.label}>No de Programación</span>
                <span
                  style={{ ...styles.value, color: '#db2777', cursor: selectedFuente.programacion ? 'pointer' : 'default' }}
                  onClick={() => selectedFuente.programacion && navigate(`/operacion/programaciones/${selectedFuente.programacion.id}`, '/operacion/programaciones/:id')}
                >
                  {selectedFuente.programacion?.numProgram || selectedFuente.programacion?.id || '-'}
                </span>
              </div>
              <div style={styles.infoRow}><span style={styles.label}>Programación</span><span style={styles.value}>{selectedFuente.gasto?.id || '-'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Monto</span><span style={styles.value}>{formatMoney(selectedFuente.monto)}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Registrado por</span><span style={styles.value}>{selectedFuente.registradoPor?.nombreCompleto || '-'}</span></div>
              <div style={{ ...styles.infoRow, borderBottom: 'none' }}><span style={styles.label}>Concepto</span><span style={{ ...styles.value, textAlign: 'right' as const, maxWidth: '45%' }}>{selectedFuente.gasto?.descripcion || '-'}</span></div>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="modal-overlay-anim" style={styles.modalOverlay}>
          <div className="modal-content-anim" style={styles.editModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <button style={styles.closeBtn} onClick={() => setShowEditModal(false)}>
                <X size={18} />
              </button>
              <h2 style={styles.modalTitle}>Editar programación</h2>
            </div>

            <div style={styles.editModalBody}>
              <div style={styles.formGroup} id="programacion-edit-field-fechaQx">
                <label style={styles.label}>Fecha QX *</label>
                <DatePicker
                  error={editProgramacionError?.field === 'fechaQx'}
                  value={editForm.fechaQx}
                  onChange={fechaQx => { setEditForm({ ...editForm, fechaQx }); setEditProgramacionError(null); }}
                />
                {editProgramacionError?.field === 'fechaQx' && <span style={styles.errorText}>{editProgramacionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="programacion-edit-field-horaQx">
                <label style={styles.label}>Hora QX *</label>
                <div style={styles.horaGrid}>
                  <OptionDropdown
                    error={editProgramacionError?.field === 'horaQx'}
                    placeholder="HH"
                    value={editForm.horaQx.split(':')[0] ?? ''}
                    options={Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => ({ id: h, label: h }))}
                    onChange={h => {
                      const minuto = editForm.horaQx.split(':')[1] ?? '00';
                      setEditForm({ ...editForm, horaQx: `${h}:${minuto}` });
                      setEditProgramacionError(null);
                    }}
                  />
                  <OptionDropdown
                    error={editProgramacionError?.field === 'horaQx'}
                    placeholder="MM"
                    value={editForm.horaQx.split(':')[1] ?? ''}
                    options={Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => ({ id: m, label: m }))}
                    onChange={m => {
                      const hora = editForm.horaQx.split(':')[0] ?? '00';
                      setEditForm({ ...editForm, horaQx: `${hora}:${m}` });
                      setEditProgramacionError(null);
                    }}
                  />
                </div>
                {editProgramacionError?.field === 'horaQx' && <span style={styles.errorText}>{editProgramacionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="programacion-edit-field-sedeId">
                <label style={styles.label}>Sede *</label>
                <div style={styles.sedeGrid}>
                  {sedeOptions.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      style={{ ...styles.sedeBtn, ...(editForm.sedeId === s.id ? styles.editSedeBtnActive : {}), ...(editProgramacionError?.field === 'sedeId' ? styles.inputError : {}) }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => { setEditForm({ ...editForm, sedeId: s.id }); setEditProgramacionError(null); e.currentTarget.blur(); }}
                    >
                      {s.nombre}
                    </button>
                  ))}
                </div>
                {editProgramacionError?.field === 'sedeId' && <span style={styles.errorText}>{editProgramacionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="programacion-edit-field-hospitalId">
                <label style={styles.label}>Hospital *</label>
                {selectedEditHospital && (
                  <div style={styles.medicoTagsWrap}>
                    <span style={styles.editMedicoTag}>
                      {selectedEditHospital.nombre}
                      <X size={12} style={{ cursor: 'pointer' }} onClick={() => setEditForm({ ...editForm, hospitalId: '' })} />
                    </span>
                  </div>
                )}
                {!selectedEditHospital && (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      style={{ ...styles.input, ...(editProgramacionError?.field === 'hospitalId' ? styles.inputError : {}) }}
                      placeholder="Buscar hospital..."
                      value={editHospitalSearch}
                      onChange={e => { setEditHospitalSearch(e.target.value); setEditProgramacionError(null); }}
                      onFocus={() => setEditHospitalFocused(true)}
                      onBlur={() => setTimeout(() => setEditHospitalFocused(false), 150)}
                    />
                    {editHospitalFocused && (
                      <div style={styles.medicoDropdown}>
                        {editHospitalResults.length === 0 ? (
                          <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                        ) : (
                          editHospitalResults.map(h => (
                            <div
                              key={h.id}
                              className="dropdown-item-hover"
                              style={styles.medicoDropdownItem}
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => { setEditForm({ ...editForm, hospitalId: h.id }); setEditHospitalSearch(''); setEditProgramacionError(null); }}
                            >
                              {h.nombre}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                {editProgramacionError?.field === 'hospitalId' && <span style={styles.errorText}>{editProgramacionError.message}</span>}
              </div>

              {selectedEditHospital?.ciudadCat?.nombre && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Ciudad QX</label>
                  <span style={styles.ciudadPill}>{selectedEditHospital?.ciudadCat?.nombre}</span>
                </div>
              )}

              <div style={styles.formGroup} id="programacion-edit-field-medicos">
                <label style={styles.label}>Médico *</label>
                {editMedicos.length > 0 && (
                  <div style={styles.medicoTagsWrap}>
                    {editMedicos.map(m => (
                      <span key={m.id} style={styles.editMedicoTag}>
                        {m.nombreCompleto}
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => setEditMedicos(editMedicos.filter(x => x.id !== m.id))} />
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ position: 'relative' as const }}>
                  <input
                    style={{ ...styles.input, ...(editProgramacionError?.field === 'medicos' ? styles.inputError : {}) }}
                    placeholder="Buscar médico..."
                    value={medicoSearch}
                    onChange={e => setMedicoSearch(e.target.value)}
                  />
                  {medicoSearch.trim() && (
                    <div style={styles.medicoDropdown}>
                      {medicoResults.filter(m => !editMedicos.some(x => x.id === m.id)).length === 0 ? (
                        <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                      ) : (
                        medicoResults.filter(m => !editMedicos.some(x => x.id === m.id)).map(m => (
                          <div
                            key={m.id}
                            style={styles.medicoDropdownItem}
                            onClick={() => { setEditMedicos([...editMedicos, m]); setMedicoSearch(''); setEditProgramacionError(null); }}
                          >
                            <Plus size={14} /> {m.nombreCompleto}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {editProgramacionError?.field === 'medicos' && <span style={styles.errorText}>{editProgramacionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="programacion-edit-field-cotizaciones">
                <label style={styles.label}>Cotización</label>
                {editCotizaciones.length > 0 && (
                  <div style={styles.medicoTagsWrap}>
                    {editCotizaciones.map(c => (
                      <span key={c.id} style={styles.cotizacionChip}>
                        <FileText size={13} />
                        {c.numCotizacion ?? c.id}
                        <span style={{ color: '#7a9146' }}>· {formatMoney(c.total)}</span>
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => setEditCotizaciones(editCotizaciones.filter(x => x.id !== c.id))} />
                      </span>
                    ))}
                  </div>
                )}
                {editMedicos.length === 0 || !selectedEditHospital ? (
                  <span style={{ ...styles.input, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>
                    {editMedicos.length === 0 && !selectedEditHospital
                      ? 'Selecciona primero un médico y un hospital'
                      : editMedicos.length === 0
                        ? 'Selecciona primero un médico'
                        : 'Selecciona primero un hospital'}
                  </span>
                ) : (
                  <div style={{ position: 'relative' as const }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.4rem' }}>
                      <MaterialIcon name="filter_alt" size={13} />
                      Mostrando solo cotizaciones de {editMedicos.map(m => m.nombreCompleto).join(', ')} en {selectedEditHospital.nombre}
                    </div>
                    <input
                      style={styles.input}
                      placeholder={`Buscar por folio, cirugía, fecha o total entre las cotizaciones de ${editMedicos.map(m => m.nombreCompleto).join(', ')}...`}
                      value={editCotizacionFilterText}
                      onChange={e => setEditCotizacionFilterText(e.target.value)}
                      onFocus={() => setEditCotizacionFocused(true)}
                      onBlur={() => setTimeout(() => setEditCotizacionFocused(false), 150)}
                    />
                    {editCotizacionFocused && (
                      <div style={styles.medicoDropdown}>
                        {editCotizacionResultsFiltradas.filter(c => !editCotizaciones.some(x => x.id === c.id)).length === 0 ? (
                          <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin cotizaciones que coincidan</div>
                        ) : (
                          editCotizacionResultsFiltradas.filter(c => !editCotizaciones.some(x => x.id === c.id)).map(c => (
                            <div
                              key={c.id}
                              className="dropdown-item-hover"
                              style={styles.medicoDropdownItem}
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => { setEditCotizaciones([...editCotizaciones, c]); setEditCotizacionFilterText(''); }}
                            >
                              <span style={{ flexShrink: 0, color: '#4d7a13', fontWeight: 700 }}>{c.numCotizacion ?? c.id}</span>
                              <span style={{ flexShrink: 0, color: '#9ca3af', fontWeight: 400 }}>·</span>
                              <span style={{ flexShrink: 0, fontWeight: 400 }}>{formatDate(c.fecha)}</span>
                              <span style={{ flexShrink: 0, color: '#9ca3af', fontWeight: 400 }}>·</span>
                              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, fontWeight: 400 }} title={c.cirugia || undefined}>
                                {c.cirugia || 'Sin cirugía'}
                              </span>
                              <span style={{ flexShrink: 0, color: '#9ca3af', fontWeight: 400 }}>·</span>
                              <span style={{ flexShrink: 0, fontWeight: 700 }}>{formatMoney(c.total)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={styles.formGroup} id="programacion-edit-field-tecnicos-sugeridos">
                <label style={styles.label}>Técnicos Sugeridos</label>
                {editTecnicosSugeridos.length > 0 && (
                  <div style={styles.medicoTagsWrap}>
                    {editTecnicosSugeridos.map(t => (
                      <span key={t.id} style={styles.editMedicoTag}>
                        {t.nombreCompleto}
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => setEditTecnicosSugeridos(editTecnicosSugeridos.filter(x => x.id !== t.id))} />
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ position: 'relative' as const }}>
                  <input
                    style={styles.input}
                    placeholder="Buscar técnico..."
                    value={editTecnicoSugeridoSearch}
                    onChange={e => setEditTecnicoSugeridoSearch(e.target.value)}
                    onFocus={() => setEditTecnicoSugeridoFocused(true)}
                    onBlur={() => setTimeout(() => setEditTecnicoSugeridoFocused(false), 150)}
                  />
                  {editTecnicoSugeridoFocused && (
                    <div style={styles.medicoDropdown}>
                      {editTecnicoComisionistaResults.filter(t => !editTecnicosSugeridos.some(x => x.id === t.id)).length === 0 ? (
                        <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                      ) : (
                        editTecnicoComisionistaResults.filter(t => !editTecnicosSugeridos.some(x => x.id === t.id)).map(t => (
                          <div
                            key={t.id}
                            style={styles.medicoDropdownItem}
                            onClick={() => { setEditTecnicosSugeridos([...editTecnicosSugeridos, t]); setEditTecnicoSugeridoSearch(''); }}
                          >
                            <Plus size={14} /> {t.nombreCompleto}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div style={styles.formGroup} id="programacion-edit-field-consumo">
                <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', flexDirection: isMobile ? 'column' as const : 'row' as const, gap: isMobile ? '0.5rem' : 0 }}>
                  <label style={styles.label}>Consumo *</label>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' as const, width: isMobile ? '100%' : 'auto' }}>
                    {editCotizaciones.length > 0 && (
                      <button
                        type="button"
                        className="btn-press"
                        style={styles.addFromCatalogBtn}
                        onClick={handleImportarEditConsumosCotizacion}
                        disabled={importandoEditConsumos}
                      >
                        <FileText size={12} /> {importandoEditConsumos ? 'Importando...' : `Importar de ${editCotizaciones.length > 1 ? 'las cotizaciones' : 'la cotización'}`}
                      </button>
                    )}
                    <div style={{ position: 'relative' as const }} ref={editConsumoPanelRef}>
                      <button
                        type="button"
                        className="btn-press"
                        style={styles.addFromCatalogBtn}
                        onClick={() => (editConsumoPanelOpen ? closeEditConsumoPanel() : setEditConsumoPanelOpen(true))}
                      >
                        <Plus size={12} /> Agregar del catálogo
                      </button>
                      {editConsumoPanelOpen && (
                        <div style={{ ...styles.consumoPanel, ...(isMobile ? { right: 'auto' as const, left: 0 } : {}) }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={styles.consumoPanelTitle}>Agregar producto</span>
                            <X size={14} style={{ cursor: 'pointer', color: '#9ca3af' }} onClick={closeEditConsumoPanel} />
                          </div>
                          <div style={{ position: 'relative' as const }}>
                            <input
                              style={{ ...styles.input, width: '100%' }}
                              placeholder="Buscar producto..."
                              value={editConsumoProductoSearch}
                              onChange={e => setEditConsumoProductoSearch(e.target.value)}
                              onFocus={() => setEditConsumoProductoFocused(true)}
                              onBlur={() => setTimeout(() => setEditConsumoProductoFocused(false), 150)}
                              autoFocus
                            />
                            {editConsumoProductoFocused && (
                              <div style={{ ...styles.medicoDropdown, left: 0, right: 0 }}>
                                {editConsumoProductoResults.length === 0 ? (
                                  <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                                ) : (
                                  editConsumoProductoResults.map(p => (
                                    <div
                                      key={p.id}
                                      className="dropdown-item-hover"
                                      style={styles.medicoDropdownItem}
                                      onMouseDown={e => e.preventDefault()}
                                      onClick={() => {
                                        const texto = p.nombre ?? '';
                                        setEditConsumo(prev => (prev.trim() ? `${prev.trim()}, ${texto}` : texto));
                                        setEditConsumoProductoSearch('');
                                        setEditProgramacionError(null);
                                      }}
                                    >
                                      {p.nombre}
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <textarea
                  ref={autoResizeTextarea}
                  style={{ ...styles.input, minHeight: '44px', resize: 'none' as const, overflow: 'hidden' as const, ...(editProgramacionError?.field === 'consumo' ? styles.inputError : {}) }}
                  value={editConsumo}
                  onChange={e => { setEditConsumo(e.target.value); autoResizeTextarea(e.target); setEditProgramacionError(null); }}
                />
                {editProgramacionError?.field === 'consumo' && <span style={styles.errorText}>{editProgramacionError.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Observaciones</label>
                <textarea
                  ref={autoResizeTextarea}
                  style={{ ...styles.input, minHeight: '44px', resize: 'none' as const, overflow: 'hidden' as const }}
                  value={editObservaciones}
                  onChange={e => { setEditObservaciones(e.target.value); autoResizeTextarea(e.target); }}
                />
              </div>
            </div>

            <div style={styles.editModalFooter}>
              <button style={styles.cancelBtn} onClick={() => setShowEditModal(false)}>Cancelar</button>
              <button style={styles.saveBtn} onClick={handleGuardarEdit} disabled={savingEdit}>
                {savingEdit ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showComisionModal && (
        <AgregarComisionModal
          programacionId={id!}
          onClose={() => setShowComisionModal(false)}
          onCreated={() => {
            setShowComisionModal(false);
            queryClient.invalidateQueries({ queryKey: ['remisiones-comisiones', id] });
            queryClient.invalidateQueries({ queryKey: ['programacion', id] });
            setShowComisionSuccess(true);
          }}
        />
      )}

      {showAgregarCotizacionModal && (
        <div className="modal-overlay-anim" style={styles.modalOverlay}>
          <div className="modal-content-anim" style={styles.editModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <button style={styles.closeBtn} onClick={() => { setShowAgregarCotizacionModal(false); setNuevasCotizaciones([]); setNuevaCotizacionSearch(''); }}>
                <X size={18} />
              </button>
              <h2 style={styles.modalTitle}>Agregar cotización</h2>
            </div>

            <div style={styles.editModalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Programación *</label>
                <span style={styles.readOnlyPill}>{programacion?.id}</span>
              </div>

              <div style={styles.formGroup} id="agregar-cotizacion-field-cotizacion">
                <label style={styles.label}>Cotización *</label>
                {nuevasCotizaciones.length > 0 && (
                  <div style={styles.medicoTagsWrap}>
                    {nuevasCotizaciones.map(c => (
                      <span key={c.id} style={styles.cotizacionChip}>
                        <FileText size={13} />
                        {c.numCotizacion ?? c.id}
                        <span style={{ color: '#7a9146' }}>· {formatMoney(c.total)}</span>
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => setNuevasCotizaciones(nuevasCotizaciones.filter(x => x.id !== c.id))} />
                      </span>
                    ))}
                  </div>
                )}
                {nuevaCotizacionMedicoNombres.length === 0 ? (
                  <span style={{ ...styles.input, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>
                    Esta programación no tiene médicos asignados
                  </span>
                ) : (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      style={styles.input}
                      placeholder={`Buscar por folio, cirugía, fecha o total entre las cotizaciones de ${nuevaCotizacionMedicoNombres.join(', ')}...`}
                      value={nuevaCotizacionSearch}
                      onChange={e => setNuevaCotizacionSearch(e.target.value)}
                      onFocus={() => setNuevaCotizacionFocused(true)}
                      onBlur={() => setTimeout(() => setNuevaCotizacionFocused(false), 150)}
                    />
                    {nuevaCotizacionFocused && (
                      <div style={styles.medicoDropdown}>
                        {nuevaCotizacionResults.filter(c => !nuevasCotizaciones.some(x => x.id === c.id) && !cotizacionesYaVinculadasIds.has(c.id)).length === 0 ? (
                          <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin cotizaciones que coincidan</div>
                        ) : (
                          nuevaCotizacionResults.filter(c => !nuevasCotizaciones.some(x => x.id === c.id) && !cotizacionesYaVinculadasIds.has(c.id)).map(c => (
                            <div
                              key={c.id}
                              className="dropdown-item-hover"
                              style={styles.medicoDropdownItem}
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => { setNuevasCotizaciones([...nuevasCotizaciones, c]); setNuevaCotizacionSearch(''); }}
                            >
                              <span style={{ flexShrink: 0, color: '#4d7a13', fontWeight: 700 }}>{c.numCotizacion ?? c.id}</span>
                              <span style={{ flexShrink: 0, color: '#9ca3af', fontWeight: 400 }}>·</span>
                              <span style={{ flexShrink: 0, fontWeight: 400 }}>{formatDate(c.fecha)}</span>
                              <span style={{ flexShrink: 0, color: '#9ca3af', fontWeight: 400 }}>·</span>
                              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, fontWeight: 400 }} title={c.cirugia || undefined}>
                                {c.cirugia || 'Sin cirugía'}
                              </span>
                              <span style={{ flexShrink: 0, color: '#9ca3af', fontWeight: 400 }}>·</span>
                              <span style={{ flexShrink: 0, fontWeight: 700 }}>{formatMoney(c.total)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div style={styles.editModalFooter}>
              <button style={styles.cancelBtn} onClick={() => { setShowAgregarCotizacionModal(false); setNuevasCotizaciones([]); setNuevaCotizacionSearch(''); }}>Cancelar</button>
              <button
                style={styles.saveBtn}
                onClick={() => agregarCotizacionMutation.mutate()}
                disabled={nuevasCotizaciones.length === 0 || agregarCotizacionMutation.isPending}
              >
                {agregarCotizacionMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDocumentoModal && (
        <div className="modal-overlay-anim" style={styles.modalOverlay}>
          <div className="modal-content-anim" style={styles.editModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <button style={styles.closeBtn} onClick={() => setShowDocumentoModal(false)}>
                <X size={18} />
              </button>
              <h2 style={styles.modalTitle}>Agregar Documento</h2>
            </div>

            <div style={styles.editModalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Programación *</label>
                <span style={styles.readOnlyPill}>
                  {programacion?.id}
                </span>
              </div>

              <div style={styles.formGroup} id="documento-field-nombre">
                <label style={styles.label}>Nombre *</label>
                <input
                  style={{ ...styles.input, ...(documentoError?.field === 'nombre' ? styles.inputError : {}) }}
                  value={documentoNombre}
                  onChange={e => { setDocumentoNombre(e.target.value); setDocumentoError(null); }}
                />
                {documentoError?.field === 'nombre' && <span style={styles.errorText}>{documentoError.message}</span>}
              </div>

              <div style={styles.formGroup} id="documento-field-documento">
                <label style={styles.label}>Documento *</label>
                <label style={{ ...styles.fileUploadBox, ...(documentoError?.field === 'documento' ? styles.inputError : {}) }}>
                  <input
                    type="file"
                    accept="application/pdf"
                    style={{ display: 'none' }}
                    onChange={e => handleDocumentoFileChange(e.target.files?.[0] ?? null)}
                  />
                  {documentoArchivo ? (
                    <span style={styles.fileUploadedText}>
                      <FileText size={16} /> {documentoArchivo.name}
                    </span>
                  ) : (
                    <FileText size={22} color="#9ca3af" />
                  )}
                </label>
                {documentoError?.field === 'documento' && <span style={styles.errorText}>{documentoError.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Cargado el *</label>
                <span style={styles.readOnlyField}>{formatDateTimeLocal(documentoCargadoEl)}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Cargado por *</label>
                <span style={styles.readOnlyPill}>{usuarioActual?.nombreCompleto ?? '-'}</span>
              </div>
            </div>

            <div style={styles.editModalFooter}>
              <button style={styles.cancelBtn} onClick={() => setShowDocumentoModal(false)}>Cancelar</button>
              <button
                style={styles.saveBtn}
                onClick={handleGuardarDocumento}
                disabled={createDocumentoMutation.isPending}
              >
                {createDocumentoMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRequisicionModal && (
        <div className="modal-overlay-anim" style={styles.modalOverlay}>
          <div className="modal-content-anim" style={{ ...styles.editModalContent, maxHeight: '80dvh' }} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <button style={styles.closeBtn} onClick={() => setShowRequisicionModal(false)}>
                <X size={18} />
              </button>
              <h2 style={styles.modalTitle}>Agregar requisición</h2>
            </div>

            <div style={styles.editModalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Programación *</label>
                <span style={styles.readOnlyField}>
                  {programacion?.id}
                </span>
              </div>

              <div style={styles.formGroup} id="requisicion-field-fecha">
                <label style={styles.label}>Fecha *</label>
                <DatePicker
                  error={requisicionError?.field === 'fecha'}
                  value={requisicionFecha}
                  onChange={fecha => { setRequisicionFecha(fecha); setRequisicionError(null); }}
                  style={requisicionFecha ? { backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510', fontWeight: 600 } : undefined}
                  labelStyle={requisicionFecha ? { flex: 1, textAlign: 'center' as const } : undefined}
                />
                {requisicionError?.field === 'fecha' && <span style={styles.errorText}>{requisicionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="requisicion-field-contacto">
                <label style={styles.label}>Contacto</label>
                {/* Preseleccionado al hospital de la programación — no se puede cambiar desde acá,
                    igual que en Editar Requisición. El backend ya usa este mismo Tercero como
                    contacto de la requisición al crearla (ver createRequisicion). */}
                <span style={styles.readOnlyField}>
                  {programacion?.hospital?.tercero?.nombreCompleto ?? programacion?.hospital?.nombre ?? '-'}
                </span>
              </div>

              <div style={styles.formGroup} id="requisicion-field-cubrimiento">
                <label style={styles.label}>Cubrimiento *</label>
                <div style={styles.pickBtnGrid}>
                  {cubrimientos.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      style={{ ...styles.pickBtn, ...(requisicionCubrimiento?.id === c.id ? styles.pickBtnActive : {}), ...(requisicionError?.field === 'cubrimiento' ? styles.inputError : {}) }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => {
                        setRequisicionCubrimiento(c);
                        // Si se vuelve a Hospitales y el contacto tiene tarifa propia, se restaura
                        // esa (no la tarifa "base" genérica del cubrimiento) — así ir y volver
                        // entre cubrimientos no pierde la tarifa personalizada del hospital.
                        const esHospitales = c.nombre?.trim().toUpperCase() === 'HOSPITALES';
                        if (esHospitales && requisicionContactoTarifa?.tarifaId) {
                          setRequisicionTarifaId(requisicionContactoTarifa.tarifaId);
                          setRequisicionTarifaLabel(requisicionContactoTarifa.tarifaNombre ?? '');
                        } else {
                          // La tarifa "base" de un cubrimiento tiene el mismo id que el cubrimiento
                          // (findTarifasByCubrimiento la incluye a ella misma junto con las
                          // sub-tarifas más específicas) — se preselecciona como default razonable,
                          // pero el usuario sigue pudiendo cambiarla desde el select de abajo, que
                          // ya solo lista las tarifas válidas para este cubrimiento.
                          setRequisicionTarifaId(c.id);
                          setRequisicionTarifaLabel(c.nombre);
                        }
                        setRequisicionError(null);
                        e.currentTarget.blur();
                      }}
                    >
                      {c.nombre}
                    </button>
                  ))}
                </div>
                {requisicionError?.field === 'cubrimiento' && <span style={styles.errorText}>{requisicionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="requisicion-field-tarifa">
                <label style={styles.label}>Tarifa *</label>
                {requisicionTarifaId ? (
                  // width:fit-content porque este span es hijo directo de formGroup (flex-column,
                  // align-items:stretch por default) — sin eso, la píldora se estiraba a casi todo
                  // el ancho del modal en vez de ajustarse al texto. editMedicoTag (verde) en vez
                  // de medicoTag (gris): es el color que ya usamos para un valor elegido en un
                  // campo editable con X para quitarlo, en vez del gris genérico.
                  <span style={{ ...styles.editMedicoTag, width: 'fit-content' as const }}>
                    {/* Mientras tarifasCubrimiento todavía está cargando tras elegir el cubrimiento
                        (requisicionTarifaId ya quedó en c.id, pero la lista aún no llega), se
                        muestra el nombre del cubrimiento en vez del id crudo (ej. "1A1") — la
                        tarifa raíz de un cubrimiento siempre se llama igual que él, así que no se
                        alcanza a notar el cambio cuando la lista sí carga. */}
                    {requisicionTarifaLabel || tarifasCubrimiento.find(t => t.id === requisicionTarifaId)?.nombre || requisicionCubrimiento?.nombre || requisicionTarifaId}
                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => { setRequisicionTarifaId(''); setRequisicionTarifaLabel(''); setRequisicionTarifaSearch(''); }} />
                  </span>
                ) : !requisicionCubrimiento ? (
                  <span style={{ ...styles.input, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>
                    Selecciona primero un cubrimiento
                  </span>
                ) : (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      style={{ ...styles.input, ...(requisicionError?.field === 'tarifa' ? styles.inputError : {}) }}
                      placeholder="Buscar tarifa..."
                      value={requisicionTarifaSearch}
                      onChange={e => setRequisicionTarifaSearch(e.target.value)}
                      onFocus={() => setRequisicionTarifaFocused(true)}
                      onBlur={() => setTimeout(() => setRequisicionTarifaFocused(false), 150)}
                    />
                    {requisicionTarifaFocused && (
                      <div style={styles.medicoDropdown}>
                        {requisicionTarifaResults.length === 0 ? (
                          <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                        ) : (
                          requisicionTarifaResults.map(t => (
                            <div
                              key={t.id}
                              className="dropdown-item-hover"
                              style={styles.medicoDropdownItem}
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => {
                                setRequisicionTarifaId(t.id);
                                setRequisicionTarifaLabel(t.nombre);
                                setRequisicionTarifaSearch('');
                                setRequisicionError(null);
                              }}
                            >
                              {t.nombre}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                {requisicionError?.field === 'tarifa' && <span style={styles.errorText}>{requisicionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="requisicion-field-insumos">
                <label style={styles.label}>Seleccione los insumos *</label>
                {requisicionInsumos.length > 0 && (
                  <div style={{ ...styles.consumosTableWrap, maxHeight: '260px', marginBottom: '0.5rem' }}>
                    <table style={styles.consumosTable}>
                      <thead>
                        <tr>
                          <th style={styles.consumosTh}>Producto</th>
                          <th style={styles.consumosTh}>Lote</th>
                          <th style={{ ...styles.consumosTh, textAlign: 'right' as const }}>Cant.</th>
                          <th style={{ ...styles.consumosTh, textAlign: 'right' as const }}>Precio</th>
                          <th style={{ ...styles.consumosTh, textAlign: 'right' as const }}>Importe</th>
                          <th style={styles.consumosTh} />
                        </tr>
                      </thead>
                      <tbody>
                        {requisicionInsumos.map(ins => (
                          <tr key={ins.tempId}>
                            <td style={{ ...styles.consumosTd, whiteSpace: 'normal' as const }}>{ins.productoLabel ?? 'Sin producto'}</td>
                            <td style={styles.consumosTd}>{ins.loteLabel ?? '-'}</td>
                            <td style={{ ...styles.consumosTd, textAlign: 'right' as const }}>{ins.cantidad}</td>
                            <td style={{ ...styles.consumosTd, textAlign: 'right' as const }}>{formatMoney(ins.precio)}</td>
                            <td style={{ ...styles.consumosTd, textAlign: 'right' as const, fontWeight: 700 }}>{formatMoney(ins.cantidad * ins.precio)}</td>
                            <td style={{ ...styles.consumosTd, textAlign: 'center' as const }}>
                              <X size={14} style={{ cursor: 'pointer' }} onClick={() => handleQuitarInsumoDraft(ins.tempId)} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <button
                  type="button"
                  className="btn-press"
                  style={{
                    ...styles.addComisionBtnBelow,
                    ...(requisicionError?.field === 'insumos' ? styles.inputError : {}),
                    ...(!requisicionTarifaId ? { opacity: 0.5, cursor: 'not-allowed' as const } : {}),
                  }}
                  disabled={!requisicionTarifaId}
                  onClick={openInsumoSubModal}
                >
                  <Plus size={14} /> Nuevo
                </button>
                {!requisicionTarifaId && (
                  <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Selecciona primero el cubrimiento y la tarifa</span>
                )}
                {requisicionError?.field === 'insumos' && <span style={styles.errorText}>{requisicionError.message}</span>}
              </div>
            </div>

            <div style={styles.editModalFooter}>
              <button style={styles.cancelBtn} onClick={() => setShowRequisicionModal(false)}>Cancelar</button>
              <button
                style={styles.saveBtn}
                onClick={handleGuardarRequisicion}
                disabled={createRequisicionMutation.isPending}
              >
                {createRequisicionMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showInsumoSubModal && (
        <InsumoFormModal
          title="Nuevo insumo"
          tarifaId={requisicionTarifaId || undefined}
          cubrimientoNombre={requisicionCubrimiento?.nombre}
          tarifaLabel={requisicionTarifaLabel || tarifasCubrimiento.find(t => t.id === requisicionTarifaId)?.nombre || requisicionCubrimiento?.nombre || '-'}
          fecha={requisicionFecha}
          saveLabel="Agregar"
          onSubmit={handleAgregarInsumoDraft}
          onClose={() => setShowInsumoSubModal(false)}
        />
      )}

      {showRemisionModal && programacion && (
        <AgregarRemisionModal
          programacion={programacion}
          programacionId={id!}
          onClose={() => setShowRemisionModal(false)}
          onCreated={createdId => { setRemisionCreatedId(createdId); setShowRemisionSuccess(true); }}
        />
      )}

      {validarConsumoId && (
        <ValidarConsumoModal
          consumoId={validarConsumoId}
          programacionId={id!}
          onClose={() => setValidarConsumoId(null)}
          onValidated={() => { setValidarConsumoId(null); setShowValidarConsumoSuccess(true); }}
        />
      )}

      {selectedConsumoId && (
        <ConsumoDetalleModal
          id={selectedConsumoId}
          valConsumoId={selectedValConsumoId ?? undefined}
          onClose={() => { setSelectedConsumoId(null); setSelectedValConsumoId(null); }}
        />
      )}

      {selectedRequisicionId && (
        <RequisicionDetalleModal
          id={selectedRequisicionId}
          onClose={() => setSelectedRequisicionId(null)}
        />
      )}

      {selectedComisionId && (
        <ComisionDetalleModal
          id={selectedComisionId}
          onClose={() => setSelectedComisionId(null)}
        />
      )}
      {showWhatsappConfirm && (
        <div className="modal-overlay-anim" style={styles.modalOverlay}>
          <div className="modal-content-anim" style={styles.confirmModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <h2 style={styles.modalTitle}>Enviar por WhatsApp</h2>
            </div>
            <div style={styles.confirmBody}>
              <p style={styles.confirmIntro}>¿Quieres agregar una cotización en PDF, o solo enviar la información general de la programación?</p>
            </div>
            <div style={styles.editModalFooter}>
              <button className="btn-press" style={styles.cancelBtn} onClick={handleWhatsappSinPdf}>
                Solo información
              </button>
              <button className="btn-press" style={styles.saveBtn} onClick={handleWhatsappConPdf}>
                Adjuntar cotización
              </button>
            </div>
          </div>
        </div>
      )}

      {showGmailConfirm && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setShowGmailConfirm(false)}>
          <div className="modal-content-anim" style={styles.confirmModalContent} onClick={e => e.stopPropagation()}>
            <div style={{ ...styles.editModalHeader, justifyContent: 'space-between' }}>
              <h2 style={styles.modalTitle}>Enviar por Gmail</h2>
              <button style={styles.closeBtn} onClick={() => setShowGmailConfirm(false)}>
                <X size={18} />
              </button>
            </div>
            <div style={styles.confirmBody}>
              <p style={styles.confirmIntro}>¿Quieres agregar una cotización en PDF, o solo enviar la información general de la programación?</p>
            </div>
            <div style={styles.editModalFooter}>
              <button className="btn-press" style={styles.cancelBtn} onClick={handleGmailSinArchivo}>
                Solo información
              </button>
              <button className="btn-press header-btn-primary" style={styles.btnPillPrimary} onClick={handleGmailConArchivo}>
                Agregar cotización
              </button>
            </div>
          </div>
        </div>
      )}

      {showGmailCotizacionPicker && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => { setShowGmailCotizacionPicker(false); setGmailCotizacionSearch(''); }}>
          <div className="modal-content-anim" style={styles.confirmModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <h2 style={styles.modalTitle}>Elegir cotización</h2>
              <X size={18} style={{ cursor: 'pointer' }} onClick={() => { setShowGmailCotizacionPicker(false); setGmailCotizacionSearch(''); }} />
            </div>
            <div style={styles.confirmBody}>
              {gmailCotizacionResults.length === 0 ? (
                <p style={styles.confirmIntro}>Esta programación no tiene cotizaciones asociadas.</p>
              ) : (
                <>
                  <input
                    autoFocus
                    style={styles.input}
                    placeholder="Buscar por folio, cirugía, fecha o total..."
                    value={gmailCotizacionSearch}
                    onChange={e => setGmailCotizacionSearch(e.target.value)}
                  />
                  <div style={{ maxHeight: '280px', overflowY: 'auto' as const, marginTop: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                    {gmailCotizacionResultsFiltradas.length === 0 ? (
                      <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin cotizaciones que coincidan</div>
                    ) : (
                      gmailCotizacionResultsFiltradas.map(c => (
                        <div
                          key={c.id}
                          className="dropdown-item-hover"
                          style={styles.medicoDropdownItem}
                          onClick={() => handleSeleccionarCotizacionGmail(c.id)}
                        >
                          <span style={{ flexShrink: 0, color: '#4d7a13', fontWeight: 700 }}>{c.numCotizacion ?? c.id}</span>
                          <span style={{ flexShrink: 0, color: '#9ca3af', fontWeight: 400 }}>·</span>
                          <span style={{ flexShrink: 0, fontWeight: 400 }}>{formatDate(c.fecha)}</span>
                          <span style={{ flexShrink: 0, color: '#9ca3af', fontWeight: 400 }}>·</span>
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, fontWeight: 400 }} title={c.cirugia || undefined}>
                            {c.cirugia || 'Sin cirugía'}
                          </span>
                          <span style={{ flexShrink: 0, color: '#9ca3af', fontWeight: 400 }}>·</span>
                          <span style={{ flexShrink: 0, fontWeight: 700 }}>{formatMoney(c.total)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showWhatsappCotizacionPicker && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => { setShowWhatsappCotizacionPicker(false); setWhatsappCotizacionSearch(''); }}>
          <div className="modal-content-anim" style={styles.confirmModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <h2 style={styles.modalTitle}>Elegir cotización</h2>
              <X size={18} style={{ cursor: 'pointer' }} onClick={() => { setShowWhatsappCotizacionPicker(false); setWhatsappCotizacionSearch(''); }} />
            </div>
            <div style={styles.confirmBody}>
              {whatsappCotizacionResults.length === 0 ? (
                <p style={styles.confirmIntro}>Esta programación no tiene cotizaciones asociadas.</p>
              ) : (
                <>
                  <input
                    autoFocus
                    style={styles.input}
                    placeholder="Buscar por folio, cirugía, fecha o total..."
                    value={whatsappCotizacionSearch}
                    onChange={e => setWhatsappCotizacionSearch(e.target.value)}
                  />
                  <div style={{ maxHeight: '280px', overflowY: 'auto' as const, marginTop: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                    {whatsappCotizacionResultsFiltradas.length === 0 ? (
                      <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin cotizaciones que coincidan</div>
                    ) : (
                      whatsappCotizacionResultsFiltradas.map(c => (
                        <div
                          key={c.id}
                          className="dropdown-item-hover"
                          style={styles.medicoDropdownItem}
                          onClick={() => handleSeleccionarCotizacionWhatsapp(c.id)}
                        >
                          <span style={{ flexShrink: 0, color: '#4d7a13', fontWeight: 700 }}>{c.numCotizacion ?? c.id}</span>
                          <span style={{ flexShrink: 0, color: '#9ca3af', fontWeight: 400 }}>·</span>
                          <span style={{ flexShrink: 0, fontWeight: 400 }}>{formatDate(c.fecha)}</span>
                          <span style={{ flexShrink: 0, color: '#9ca3af', fontWeight: 400 }}>·</span>
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, fontWeight: 400 }} title={c.cirugia || undefined}>
                            {c.cirugia || 'Sin cirugía'}
                          </span>
                          <span style={{ flexShrink: 0, color: '#9ca3af', fontWeight: 400 }}>·</span>
                          <span style={{ flexShrink: 0, fontWeight: 700 }}>{formatMoney(c.total)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="modal-overlay-anim" style={styles.modalOverlay}>
          <div className="modal-content-anim" style={styles.confirmModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <h2 style={styles.modalTitle}>Eliminar programación</h2>
            </div>
            <div style={styles.confirmBody}>
              <p style={styles.confirmIntro}>
                ¿Seguro que quieres eliminar la programación <strong>{id}</strong>? Esta acción no se puede deshacer.
              </p>
              {deleteError && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.75rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                  <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span style={{ color: '#b91c1c', fontSize: '0.82rem', fontWeight: 500, lineHeight: 1.4 }}>{deleteError}</span>
                </div>
              )}
            </div>
            <div style={styles.editModalFooter}>
              <button style={styles.cancelBtn} onClick={() => setShowDeleteConfirm(false)} disabled={deleteProgramacionMutation.isPending}>
                Cancelar
              </button>
              <button
                style={styles.deleteConfirmBtn}
                onClick={() => deleteProgramacionMutation.mutate()}
                disabled={deleteProgramacionMutation.isPending}
              >
                {deleteProgramacionMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <SuccessToast show={showEditSuccess} message="Programación editada" onClose={() => setShowEditSuccess(false)} />
      <SuccessToast show={showRemisionSuccess} message={`Remisión ${remisionCreatedId ?? ''} creada`} onClose={() => setShowRemisionSuccess(false)} />
      <SuccessToast show={showRequisicionSuccess} message={`Requisición ${requisicionCreatedId ?? ''} creada`} onClose={() => setShowRequisicionSuccess(false)} />
      <SuccessToast show={showValidarConsumoSuccess} message="Consumo validado" onClose={() => setShowValidarConsumoSuccess(false)} />
      <SuccessToast show={showTecnicoSugeridoSuccess} message="Técnico sugerido agregado" onClose={() => setShowTecnicoSugeridoSuccess(false)} />
      <SuccessToast show={showComisionSuccess} message="Comisión agregada" onClose={() => setShowComisionSuccess(false)} />
      {pendingWhatsappShare && (
        <div className="modal-overlay-anim" style={styles.modalOverlay}>
          <div className="modal-content-anim" style={styles.confirmModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <h2 style={styles.modalTitle}>Enviar por WhatsApp</h2>
            </div>
            <div style={styles.confirmBody}>
              <p style={styles.confirmIntro}>
                Archivo listo: <strong>{pendingWhatsappShare.file.name}</strong>. Dale clic para abrir WhatsApp con el mensaje y el PDF adjuntos.
              </p>
            </div>
            <div style={styles.editModalFooter}>
              <button style={styles.cancelBtn} onClick={() => setPendingWhatsappShare(null)}>
                Cancelar
              </button>
              <button className="btn-press" style={styles.saveBtn} onClick={handleConfirmarWhatsappConArchivo}>
                Compartir por WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
      {whatsappLink && (
        <div className="modal-overlay-anim" style={styles.modalOverlay}>
          <div className="modal-content-anim" style={styles.confirmModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <h2 style={styles.modalTitle}>Completa el envío manualmente</h2>
            </div>
            <div style={styles.confirmBody}>
              <p style={styles.confirmIntro}>
                {whatsappLinkIncluyePdf
                  ? `Tu navegador no permite compartir archivos directamente, así que el mensaje ya se copió al portapapeles y el PDF se descargó a tu equipo como "${whatsappDownloadedFileName}". Al abrir WhatsApp, pégalo en el chat y adjunta ese archivo manualmente.`
                  : 'Tu navegador no permite compartir directamente, así que el mensaje ya se copió al portapapeles. Al abrir WhatsApp, pégalo en el chat.'}
              </p>
            </div>
            <div style={styles.editModalFooter}>
              <button style={styles.cancelBtn} onClick={() => setWhatsappLink(null)}>
                Cancelar
              </button>
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                // target="_blank" + noopener normal (no un nombre fijo): es la única combinación
                // que Chrome respeta para mandar el link a WhatsApp instalado como app de
                // escritorio en vez de abrir una pestaña — un target con nombre o sin noopener
                // rompía esa integración y el botón dejaba de abrir cualquier cosa. Evitar
                // pestañas duplicadas no es posible de forma confiable en este caso; se prioriza
                // que siempre abra.
                style={{ ...styles.saveBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                onClick={() => setWhatsappLink(null)}
              >
                Abrir WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}
      <SuccessToast show={showDocumentoSuccess} message="Documento agregado" onClose={() => setShowDocumentoSuccess(false)} />
      <SuccessToast show={showInsumoSuccess} message="Insumo agregado" onClose={() => setShowInsumoSuccess(false)} />
      <SuccessToast show={showGmailSuccess} message="PDF enviado al chat de Google" onClose={() => setShowGmailSuccess(false)} />
      <SuccessToast show={whatsappCopiedToast} message="Mensaje copiado — pégalo como siguiente mensaje en el chat." onClose={() => setWhatsappCopiedToast(false)} />
      {selectedCotizacionId && (
        <CotizacionDetalleModal
          id={selectedCotizacionId}
          onClose={() => setSelectedCotizacionId(null)}
          onNotify={msg => setCotizacionToastMsg(msg)}
          onDeleted={() => {
            setSelectedCotizacionId(null);
            queryClient.invalidateQueries({ queryKey: ['programacion', id] });
            setCotizacionToastMsg('Cotización eliminada');
          }}
        />
      )}
      <SuccessToast show={!!cotizacionToastMsg} message={cotizacionToastMsg ?? ''} onClose={() => setCotizacionToastMsg(null)} />
      {gmailError && (
        <div
          style={{
            position: 'fixed', top: '76px', left: '50%', transform: 'translateX(-50%)', zIndex: 10000,
            display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.9rem 1.25rem',
            backgroundColor: '#fff', borderRadius: '14px', borderLeft: '4px solid #b91c1c',
            boxShadow: '0 10px 30px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)', minWidth: '280px',
          }}
        >
          <AlertCircle size={20} color="#b91c1c" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1f2937' }}>{gmailError}</span>
        </div>
      )}

      {showTecnicoSugeridoModal && (
        <div className="modal-overlay-anim" style={styles.modalOverlay}>
          <div className="modal-content-anim" style={styles.editModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <button style={styles.closeBtn} onClick={() => setShowTecnicoSugeridoModal(false)}>
                <X size={18} />
              </button>
              <h2 style={styles.modalTitle}>Agregar técnico sugerido</h2>
            </div>

            <div style={styles.editModalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Programación *</label>
                <span style={styles.readOnlyPill}>{programacion?.id}</span>
              </div>

              <div style={styles.formGroup} id="tecnico-sugerido-field-tecnico">
                <label style={styles.label}>Técnico *</label>
                {tecnicoSugeridoSeleccionados.length > 0 && (
                  <div style={styles.medicoTagsWrap}>
                    {tecnicoSugeridoSeleccionados.map(t => (
                      <span key={t.id} style={styles.editMedicoTag}>
                        {t.nombreCompleto}
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => setTecnicoSugeridoSeleccionados(tecnicoSugeridoSeleccionados.filter(x => x.id !== t.id))} />
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ position: 'relative' as const }}>
                  <input
                    style={{ ...styles.input, ...(tecnicoSugeridoError?.field === 'tecnico' ? styles.inputError : {}) }}
                    placeholder="Buscar técnico..."
                    value={tecnicoSugeridoSearch}
                    onChange={e => { setTecnicoSugeridoSearch(e.target.value); setTecnicoSugeridoError(null); }}
                    onFocus={() => setTecnicoSugeridoFocused(true)}
                    onBlur={() => setTimeout(() => setTecnicoSugeridoFocused(false), 150)}
                  />
                  {tecnicoSugeridoFocused && (
                    <div style={styles.medicoDropdown}>
                      {tecnicoComisionistaResults.filter(t => !tecnicoSugeridoSeleccionados.some(x => x.id === t.id) && !tecnicosSugeridos.some(x => x.tecnicoId === t.id)).length === 0 ? (
                        <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                      ) : (
                        tecnicoComisionistaResults.filter(t => !tecnicoSugeridoSeleccionados.some(x => x.id === t.id) && !tecnicosSugeridos.some(x => x.tecnicoId === t.id)).map(t => (
                          <div
                            key={t.id}
                            style={styles.medicoDropdownItem}
                            onClick={() => { setTecnicoSugeridoSeleccionados([...tecnicoSugeridoSeleccionados, t]); setTecnicoSugeridoSearch(''); setTecnicoSugeridoError(null); }}
                          >
                            <Plus size={14} /> {t.nombreCompleto}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {tecnicoSugeridoError?.field === 'tecnico' && <span style={styles.errorText}>{tecnicoSugeridoError.message}</span>}
              </div>
            </div>

            <div style={styles.editModalFooter}>
              <button style={styles.cancelBtn} onClick={() => setShowTecnicoSugeridoModal(false)}>Cancelar</button>
              <button
                style={styles.saveBtn}
                onClick={handleGuardarTecnicoSugerido}
                disabled={createTecnicoSugeridoMutation.isPending}
              >
                {createTecnicoSugeridoMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}

export const styles: Record<string, React.CSSProperties> = {
  container: { padding: '0.05rem 1.5rem 1.5rem', maxWidth: '1720px', margin: '0 auto' },
  pageSplitRow: { display: 'flex', gap: '1.5rem', alignItems: 'flex-start' as const },
  mainColumn: { flex: 1, minWidth: 0 },
  sidebarColumn: { width: '320px', flexShrink: 0, display: 'flex', flexDirection: 'column' as const, gap: '1rem' },
  headerCard: { backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '1.25rem 1.5rem 0', marginBottom: '2rem' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' },
  titleGroup: { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', overflow: 'hidden' },
  titleLabel: { fontSize: '0.65rem', fontWeight: 400, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  title: { fontSize: '1.7rem', fontWeight: 800, color: '#16170f', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  titleId: { fontSize: '0.8rem', fontWeight: 500, color: '#6b8c1f', flexShrink: 0 },
  titleRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' },
  statusPill: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.75rem', borderRadius: '999px', border: '1px solid transparent', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 },
  statusPillAbierta: { backgroundColor: '#e9f2d8', color: '#3f6510', borderColor: '#dbe8c2' },
  statusPillCerrada: { backgroundColor: '#f4f4ee', color: '#6b6b60', borderColor: '#e9ece0' },
  statusDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },
  breadcrumbRow: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: '#9a9a90' },
  breadcrumbId: { fontWeight: 500, color: '#6b8c1f' },
  headerActions: { display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 },
  btnPill: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #e5e7eb', borderRadius: '12px', color: '#33342a', fontWeight: 600, fontSize: '0.84375rem', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  btnPillPrimary: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #dbe8c2', borderRadius: '12px', color: '#3f6510', fontWeight: 600, fontSize: '0.84375rem', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  iconMenuBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', border: '1px solid #e5e7eb', borderRadius: '999px', cursor: 'pointer', color: '#33342a', flexShrink: 0 },
  headerDivider: { width: '1px', height: '28px', backgroundColor: '#e9ece0', margin: '0 0.15rem', flexShrink: 0 },
  dropdown: { position: 'absolute' as const, top: 'calc(100% + 8px)', right: 0, backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: '230px', overflow: 'hidden', zIndex: 200, padding: '0.35rem' },
  dropdownItem: { display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.6rem 0.75rem', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.84375rem', color: '#33342a', fontWeight: 600, textAlign: 'left' as const },
  dropdownItemDisabled: { opacity: 0.45, cursor: 'not-allowed' as const },
  dropdownItemDanger: { color: '#a8503c' },
  dropdownDivider: { height: '1px', backgroundColor: '#eeeee6', margin: '0.3rem 0' },
  infoStepperCard: { backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', borderRadius: 0, marginBottom: '1.5rem', overflow: 'hidden', marginLeft: '-1.5rem', marginRight: '-1.5rem', width: 'calc(100% + 3rem)' },
  infoStepperDivider: { height: '1px', backgroundColor: '#e5e7eb' },
  infoBar: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) 1.7fr', gap: '1.25rem', padding: '1rem 1.25rem', backgroundColor: '#fff' },
  infoBarItem: { position: 'relative' as const, display: 'flex', flexDirection: 'column' as const, gap: '0.3rem', minWidth: 0 },
  infoBarDividerLine: { position: 'absolute' as const, right: '-0.65rem', top: '15%', bottom: '15%', width: '1px', backgroundColor: '#e5e7eb' },
  infoBarLabelRow: { display: 'flex', alignItems: 'center', gap: '0.35rem' },
  infoBarLabel: { fontSize: '0.72rem', fontWeight: 500, color: '#8b93a1', flexShrink: 0 },
  infoBarValue: { fontSize: '0.9375rem', fontWeight: 700, color: '#16170f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  infoBarBadges: { display: 'flex', flexWrap: 'nowrap' as const, gap: '0.3rem' },
  estadoFlagBadge: { display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.45rem', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 700, whiteSpace: 'nowrap' as const },
  infoBarValueMono: { fontSize: '0.9375rem', fontWeight: 700, color: '#16170f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  stepperBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '1rem 1.25rem', overflowX: 'auto' as const },
  stepperSteps: { display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 },
  stepperStep: { display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 },
  stepperCircle: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0, fontSize: '0.78rem', fontWeight: 700 },
  stepperCircleDone: { backgroundColor: '#6b8c1f', color: '#fff' },
  stepperCircleCurrent: { backgroundColor: '#fff', border: '2px solid #6b8c1f', color: '#6b8c1f' },
  stepperCirclePending: { backgroundColor: '#fff', border: '1px solid #e5e7eb', color: '#9ca3af' },
  stepperLabel: { fontSize: '0.84375rem', fontWeight: 700, color: '#16170f', whiteSpace: 'nowrap' as const },
  stepperLabelPending: { color: '#9ca3af' },
  stepperSubLabel: { fontSize: '0.72rem', color: '#9ca3af', whiteSpace: 'nowrap' as const },
  stepperConnector: { height: '2px', flex: 1, minWidth: '24px', margin: '0 0.5rem' },
  mainTabBar: { display: 'flex', gap: '0.25rem', borderBottom: '1px solid #eeeee6' },
  mainTabBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.75rem 1rem', border: 'none', background: 'transparent', fontSize: '0.84375rem', fontWeight: 600, cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: '-1px', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const, whiteSpace: 'nowrap' as const, flexShrink: 0 },
  mainTabBtnActive: { color: '#4d7a13', borderBottomColor: '#4d7a13' },
  mainTabBtnInactive: { color: '#6b7280', borderBottomColor: 'transparent' },
  mainTabBadge: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '1.3rem', height: '1.3rem', padding: '0 0.4rem', borderRadius: '999px', backgroundColor: '#e5e7eb', color: '#6b7280', fontSize: '0.7rem', fontWeight: 700, lineHeight: 1 },
  mainTabBadgeActive: { backgroundColor: '#e9f2d8', color: '#3f6510' },
  mainTabBtnDisabled: { color: '#c7c7ba', cursor: 'not-allowed' as const },
  desgloseSection: { display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', marginBottom: '2rem', alignItems: 'start' },
  infoActionsRow: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.75rem', marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #f3f4f6' },
  btnPrimary: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: 'none', borderRadius: '8px', backgroundColor: '#6b8c1f', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  btnPrimaryHover: { backgroundColor: '#5a7519' },
  btnOutline: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', color: '#333', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  tooltipBubble: { position: 'fixed' as const, transform: 'translate(-50%, -100%)', width: '220px', padding: '0.5rem 0.75rem', backgroundColor: '#1f2937', color: '#fff', fontSize: '0.75rem', fontWeight: 500, lineHeight: 1.4, borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 9999, textAlign: 'center' as const, pointerEvents: 'none' as const },
  btnOutlineHover: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db' },
  btnDanger: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #fecaca', borderRadius: '8px', backgroundColor: '#fff', color: '#dc2626', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  btnDangerHover: { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  compactHeaderPositioner: {
    // top: '62px' (en vez de pegado a los 60px del header fijo) para que se note que esta
    // tarjeta flota, ahora que sus 4 esquinas están redondeadas en vez de solo las de abajo.
    position: 'fixed' as const, top: '62px', left: 0, right: 0, zIndex: 50,
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
    borderRadius: '12px',
    pointerEvents: 'auto' as const,
  },
  compactTitle: { fontSize: '1rem', fontWeight: 700, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  topSection: { display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1.5rem', marginBottom: '2rem' },
  infoCard: { backgroundColor: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', minWidth: 0 },
  infoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid #f3f4f6' },
  label: { fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' },
  // Mismo tono que formLabel en Cotizaciones (#374151, más oscuro que el label gris genérico de
  // arriba) — se usa solo en Agregar Remisión, para que se sienta del mismo sistema de diseño.
  remisionLabel: { fontSize: '0.75rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  value: { fontSize: '0.875rem', fontWeight: 600, color: '#333' },
  financialCard: { backgroundColor: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  cardTitle: { fontSize: '1rem', fontWeight: 700, color: '#333', marginBottom: '1rem' },
  finBar: { display: 'flex', width: '100%', height: '10px', borderRadius: '999px', overflow: 'hidden', backgroundColor: '#f4f4ee' },
  finBarSegment: { height: '100%', transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)' },
  finBarLegend: { display: 'flex', flexWrap: 'wrap' as const, gap: '1.25rem', marginTop: '0.65rem', marginBottom: '1.25rem' },
  finBarLegendItem: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 600, color: '#33342a' },
  finBarLegendDot: { width: '9px', height: '9px', borderRadius: '2px', flexShrink: 0 },
  financialGrid: { marginBottom: '1.5rem' },
  finRow: { display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', fontSize: '0.875rem', color: '#555' },
  finValue: { fontWeight: 700, color: '#16170f' },
  divider: { height: '1px', backgroundColor: '#e5e7eb', margin: '0.5rem 0' },
  highlight: { fontWeight: 700, color: '#6b8c1f' },
  extraField: { paddingTop: '0.75rem' },
  extraLabel: { display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.25rem' },
  extraValue: { display: 'block', fontSize: '0.875rem', color: '#555', lineHeight: '1.5', whiteSpace: 'pre-wrap' as const },
  // Remisiones
  relatedGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' },
  remisionesTitleRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' },
  sectionTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#333', margin: 0 },
  badge: { backgroundColor: '#e5e7eb', color: '#6b7280', fontSize: '0.75rem', fontWeight: 700, minWidth: '1.5rem', height: '1.5rem', padding: '0 0.4rem', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  remisionesGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' },
  remList: { width: '100%', maxWidth: '100%', boxSizing: 'border-box' as const, backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #f3f4f6', overflow: 'hidden' as const },
  emptyState: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #f3f4f6', padding: '2rem', textAlign: 'center' as const, color: '#9ca3af', fontSize: '0.875rem' },
  // overflowX explícito porque dejar overflow-x en su valor por defecto ("visible") mientras
  // overflow-y es "auto" hace que el navegador lo compute también como "auto" (así lo pide el
  // spec de CSS) — esto creaba una SEGUNDA barra de scroll horizontal propia de este contenedor,
  // además de la que ya pone remList por fuera (header + body juntos). Con overflowX:'hidden' acá,
  // solo queda la barra externa de remList.
  tecnicoScrollBody: { maxHeight: '135px', overflowY: 'auto' as const, overflowX: 'hidden' as const, overscrollBehavior: 'contain' as const },
  remRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.25rem', backgroundColor: '#fff' },
  remRowBorder: { borderTop: '1px solid #f3f4f6' },
  remRowRight: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  estadoBadge: { fontSize: '0.65rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '999px', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  estadoDefinitiva: { backgroundColor: '#dcfce7', color: '#15803d' },
  estadoOtro: { backgroundColor: '#fef9c3', color: '#a16207' },
  tecnicoList: { backgroundColor: '#fff' },
  tecnicoListRow: { display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.45rem 1.25rem' },
  tecnicoAvatar: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#e9f2d8', color: '#4d7a13', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0 },
  colHeader: { backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' },
  colHeaderText: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', whiteSpace: 'nowrap' as const },
  consumoRow: { display: 'grid', gridTemplateColumns: '120px 55px 110px 1fr 130px 110px', alignItems: 'center', padding: '0.6rem 1.25rem', backgroundColor: '#fff', minWidth: '700px' },
  consumoGrid: { display: 'grid', gridTemplateColumns: '120px 55px 110px 1fr 130px 110px', padding: '0 1.25rem', backgroundColor: '#fff', minWidth: '700px' },
  consumoGrupoDivider: { borderBottom: '2px solid #e5e7eb' },
  consumoSubtotalRow: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 -1.25rem', padding: '0.5rem 1.25rem', backgroundColor: '#f9fafb', borderTop: '1px dashed #e5e7eb' },
  consumoSubtotalLabel: { fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  consumoSubtotalValue: { fontSize: '0.85rem', fontWeight: 700, color: '#6b8c1f' },
  comisionTabGroup: { display: 'flex', alignItems: 'center', gap: '0.25rem', backgroundColor: '#f4f4ee', borderRadius: '10px', padding: '0.2rem' },
  comisionTabBtn: { padding: '0.4rem 0.75rem', border: 'none', borderRadius: '8px', backgroundColor: 'transparent', color: '#6b7280', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  comisionTabBtnActive: { backgroundColor: '#fff', color: '#16170f', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' },
  comisionAddBtn: { display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 0.9rem', border: 'none', borderRadius: '10px', backgroundColor: '#6b8c1f', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  comisionStatsBar: { display: 'flex', flexWrap: 'wrap' as const, borderTop: '1px solid #eeeee6', borderBottom: '1px solid #eeeee6', overflow: 'hidden' as const },
  comisionStatsSegment: { flex: '1 1 150px', minWidth: '150px', display: 'flex', flexDirection: 'column' as const, gap: '0.3rem', padding: '0.85rem 1.1rem', borderRight: '1px solid #eeeee6', borderBottom: '1px solid #eeeee6', backgroundColor: '#fff' },
  comisionStatsValue: { fontSize: '1.05rem', fontWeight: 700, color: '#16170f' },
  comisionStatsSub: { fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600 },
  comisionStatsBarTrack: { width: '100%', height: '4px', borderRadius: '999px', backgroundColor: '#e5e7eb', overflow: 'hidden' as const },
  comisionStatsBarFill: { height: '100%', borderRadius: '999px' },
  comisionListBody: { maxHeight: '420px', overflowY: 'auto' as const, overscrollBehavior: 'contain' as const },
  comisionRow: { display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.4rem 1.75rem', backgroundColor: '#fff' },
  comisionRolBadge: { display: 'inline-flex', alignItems: 'center', padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.64rem', fontWeight: 700, flexShrink: 0 },
  comisionRowMonto: { fontSize: '0.82rem', fontWeight: 700, color: '#16170f', flexShrink: 0 },
  comisionRowBtn: { padding: '0.3rem 0.7rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', color: '#374151', fontWeight: 600, fontSize: '0.74rem', cursor: 'pointer', flexShrink: 0 },
  notaCreditoRow: { display: 'grid', gridTemplateColumns: '140px 130px 1fr 130px', alignItems: 'center', padding: '0.6rem 1.25rem', gap: '0.75rem', backgroundColor: '#fff', minWidth: '680px' },
  // Tarjeta apilada en 2 líneas (en vez de un grid de columnas fijas, que desbordaba en las
  // mini-tarjetas angostas de Cotizaciones/Requisiciones/Remisiones): línea 1 identificador+monto
  // o estado, línea 2 los datos secundarios con truncado.
  cotizacionCardMobile: { display: 'flex', flexDirection: 'column' as const, padding: '0.4rem 1rem', backgroundColor: '#fff' },
  gastoRow: { display: 'grid', gridTemplateColumns: '110px 100px 1fr 180px 110px', alignItems: 'center', padding: '0.6rem 1.25rem', gap: '0.75rem', backgroundColor: '#fff', minWidth: '780px' },
  fuenteRow: { display: 'grid', gridTemplateColumns: '140px 120px 1fr 150px', alignItems: 'center', padding: '0.6rem 1.25rem', gap: '0.75rem', backgroundColor: '#fff', minWidth: '680px' },
  // Antes eran 5 columnas (900px de minWidth) porque "Cargado el" y "Cargado por" iban cada una en
  // su propia columna — se combinan en una sola celda apilada (fecha arriba, usuario chico abajo,
  // mismo patrón que mobileCardFechaHora) para que la tarjeta quepa en el ancho normal de media
  // pantalla sin necesitar scroll horizontal.
  documentoRow: { display: 'grid', gridTemplateColumns: '1fr 100px 130px 130px 28px', alignItems: 'center', padding: '0.4rem 1.25rem', gap: '0.75rem', backgroundColor: '#fff', width: '100%', boxSizing: 'border-box' as const },
  tabScrollBody: { maxHeight: '320px', overflowY: 'auto' as const, overflowX: 'hidden' as const, overscrollBehavior: 'contain' as const },
  requisicionCodigo: { fontSize: '0.78rem', fontWeight: 700, color: '#6b8c1f', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  requisicionCellText: { fontSize: '0.85rem', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  consumoCellValorUnit: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0.6rem 0', fontSize: '0.85rem', color: '#555' },
  consumoCellValor: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0.6rem 1.25rem 0.6rem 0', margin: '0 -1.25rem 0 0', fontSize: '0.85rem', fontWeight: 600, color: '#333' },
  consumoProducto: { display: 'flex', flexDirection: 'column' as const, justifyContent: 'center', minWidth: 0, gap: '0.1rem', overflow: 'hidden', padding: '0.6rem 0 0.6rem 0.75rem' },
  consumoNombre: { fontSize: '0.85rem', color: '#374151', lineHeight: '1.3', overflow: 'hidden', textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const },
  consumoCellHover: { backgroundColor: '#f3f4f6', cursor: 'pointer' },
  comisionRowHover: { backgroundColor: '#f3faec', cursor: 'pointer' },
  consumoTotalRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.25rem', backgroundColor: '#f3f4f6', borderTop: '2px solid #e5e7eb' },
  consumoTotalLabel: { fontSize: '0.8rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  consumoTotalValue: { fontSize: '1rem', fontWeight: 700, color: '#333' },
  tecnicoNombre: { fontSize: '0.85rem', fontWeight: 600, color: '#374151' },
  categoriaBadge: { fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', backgroundColor: '#f3f4f6', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  tabBar: { display: 'flex', gap: '0.5rem', borderBottom: '2px solid #e5e7eb', marginBottom: '1.5rem' },
  tabBtn: { padding: '0.75rem 1rem', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, color: '#9ca3af', borderBottom: '2px solid transparent', transition: 'all 0.2s' },
  tabBtnActive: { color: '#6b8c1f', borderBottom: '2px solid #6b8c1f' },
  tabContent: { backgroundColor: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  section: { minHeight: '200px' },
  sectionText: { fontSize: '0.875rem', color: '#555', lineHeight: '1.6', whiteSpace: 'pre-wrap' },
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
  inputError: { border: '1.5px solid #dc2626' },
  errorText: { fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 },
  insumoDraftRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.6rem 0.85rem', backgroundColor: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '8px' },
  insumoDraftText: { fontSize: '0.8rem', fontWeight: 600, color: '#374151' },
  fileUploadBox: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '90px', padding: '0.75rem', border: '1.5px dashed #d1d5db', borderRadius: '8px', backgroundColor: '#fafafa', cursor: 'pointer' },
  fileUploadedText: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: '#374151' },
  cancelBtn: { padding: '0.5rem 1.5rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: '#333' },
  deleteConfirmBtn: { padding: '0.5rem 1.5rem', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
  saveBtn: { padding: '0.5rem 1.5rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
  nuevoDetalleBtn: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.65rem 1rem', backgroundColor: '#e9f2d8', color: '#3f6510', border: '1px solid #dbe8c2', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.84375rem' },
  horaGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' },
  sedeGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' },
  // Mismo estilo que Cubrimiento en Cotizaciones (pickBtnGrid/pickBtn/pickBtnActive): fila que
  // envuelve (flex-wrap) en vez de una cuadrícula rígida de 3 columnas — esa cuadrícula (sedeGrid,
  // reusada por muchos otros campos de este archivo, no se toca) no se adapta bien en móvil, las
  // opciones de Cubrimiento quedaban muy angostas/apretadas.
  pickBtnGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' },
  pickBtn: { padding: '0.5rem 0.9rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', color: '#6b7280', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const, display: 'flex', alignItems: 'center', gap: '0.5rem' },
  pickBtnActive: { backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510' },
  sedeBtn: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', color: '#374151', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const },
  sedeBtnActive: { backgroundColor: '#6b8c1f', border: '1px solid #6b8c1f', color: '#fff' },
  // Variante usada solo en el modal Editar Programación, para que coincida con el verde suave
  // de Nueva Programación (ProgramacionesPage.tsx) sin tocar sedeBtnActive/medicoTag, que
  // comparten los demás modales de esta página (Comisión, Requisición, Remisión, etc.).
  editSedeBtnActive: { backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510' },
  editMedicoTag: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderRadius: '999px', backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510', fontSize: '0.8rem', fontWeight: 600 },
  // Mismo verde que usa Nueva Programación para "Ciudad QX" — antes era gris acá.
  ciudadPill: { display: 'inline-flex', alignSelf: 'flex-start' as const, padding: '0.4rem 0.85rem', borderRadius: '999px', border: '1px solid #dbe8c2', backgroundColor: '#e9f2d8', fontSize: '0.85rem', fontWeight: 600, color: '#3f6510' },
  medicoTagsWrap: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' },
  medicoTag: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderRadius: '999px', backgroundColor: '#f3f4f6', color: '#333', fontSize: '0.8rem', fontWeight: 600 },
  greenTag: { display: 'inline-flex', alignSelf: 'flex-start' as const, alignItems: 'center', padding: '0.3rem 0.65rem', borderRadius: '999px', border: '1px solid #dbe8c2', backgroundColor: '#e9f2d8', color: '#3f6510', fontSize: '0.85rem', fontWeight: 600 },
  // Mismo chip/botón que usa el campo Cotización en Nueva Programación (ProgramacionesPage.tsx).
  cotizacionChip: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderRadius: '8px', backgroundColor: '#f4f8ea', border: '1px solid #dbe8c2', color: '#3f6510', fontSize: '0.8rem', fontWeight: 700 },
  addFromCatalogBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.65rem', border: '1.5px solid #dbe8c2', borderRadius: '999px', backgroundColor: '#f4f8ea', color: '#3f6510', fontSize: '0.75rem', fontWeight: 400, cursor: 'pointer' },
  consumoPanel: { position: 'absolute' as const, bottom: 'calc(100% + 0.4rem)', right: 0, width: '280px', maxWidth: '90vw', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', boxShadow: '0 12px 30px rgba(0,0,0,0.15)', padding: '0.85rem', zIndex: 25, display: 'flex', flexDirection: 'column' as const, gap: '0.6rem' },
  consumoPanelTitle: { fontSize: '0.75rem', fontWeight: 700, color: '#555', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  medicoDropdown: { position: 'absolute' as const, top: 'calc(100% + 0.35rem)', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto' as const, zIndex: 20 },
  medicoDropdownItem: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.75rem', fontSize: '0.85rem', fontWeight: 600, color: '#333', cursor: 'pointer' },
  medicoDropdownItemHighlighted: { backgroundColor: '#e9f2d8' },
  pillBtnPrimary: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #dbe8c2', borderRadius: '12px', color: '#3f6510', fontWeight: 600, fontSize: '0.84375rem', cursor: 'pointer', whiteSpace: 'nowrap' as const, backgroundColor: '#f4f8ea' },
  pickBtnDisabled: { backgroundColor: '#f4f4ee', border: '1px solid #eeeee6', color: '#c4c4bc', cursor: 'not-allowed' as const },
  consumoSectionHeader: { display: 'flex', alignItems: 'center', gap: '0.6rem' },
  consumoCountBadge: { backgroundColor: '#e5e7eb', color: '#6b7280', fontSize: '0.72rem', fontWeight: 700, minWidth: '1.4rem', height: '1.4rem', padding: '0 0.4rem', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  emptySection: { textAlign: 'center' as const, padding: '1.5rem', color: '#9ca3af', fontSize: '0.85rem', backgroundColor: '#f9fafb', borderRadius: '10px' },
  tarifaHint: { padding: '0.65rem 0.9rem', backgroundColor: '#f4f4ee', borderRadius: '10px', fontSize: '0.82rem', color: '#6b6b60', lineHeight: 1.4, marginBottom: '0.9rem' },
  consumosTableWrap: { overflow: 'auto' as const, maxHeight: '320px', borderRadius: '10px', border: '1px solid #eeeee6' },
  consumosTable: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.72rem' },
  consumosTh: { padding: '0.3rem 0.6rem', textAlign: 'left' as const, fontWeight: 700, color: '#9ca3af', fontSize: '0.6rem', textTransform: 'uppercase' as const, letterSpacing: '0.03em', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' as const, position: 'sticky' as const, top: 0 },
  consumosTd: { padding: '0.25rem 0.6rem', borderBottom: '1px solid #e5e7eb', color: '#33342a', whiteSpace: 'nowrap' as const },
  consumosTdTruncate: { overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, maxWidth: '130px' },
  rowDeleteBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', border: 'none', backgroundColor: 'transparent', borderRadius: '6px', cursor: 'pointer', color: '#dc2626' },
  addComisionBtn: { display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto', padding: '0.4rem 0.85rem', border: 'none', borderRadius: '8px', backgroundColor: '#6b8c1f', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' },
  addComisionBtnBelow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%', marginTop: '0.75rem', padding: '0.6rem', border: '1px dashed #c9dba3', borderRadius: '10px', backgroundColor: '#f9fbf6', color: '#4f6b17', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' },
  miniCard: { backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' },
  miniCardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.75rem 1rem' },
  miniCardHeaderLeft: { display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 },
  miniCardIconBadge: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#fff', border: 'none', flexShrink: 0 },
  miniCardTitle: { fontSize: '0.9rem', fontWeight: 700, color: '#33342a', margin: 0 },
  miniCardBadge: { backgroundColor: '#fff', color: '#33342a', fontSize: '0.7rem', fontWeight: 700, minWidth: '1.35rem', height: '1.35rem', padding: '0 0.35rem', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  miniCardBody: { padding: '0.85rem 1rem' },
  miniCardEmpty: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem 0', color: '#9ca3af', fontSize: '0.8rem' },
  miniCardLabel: { fontSize: '0.65rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  miniCardValueRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.2rem' },
  miniCardValue: { display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.9rem', fontWeight: 700, color: '#4d7a13', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  miniCardSub: { fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.35rem' },
  miniCardTotal: { fontSize: '0.8rem', color: '#6b6b60', marginTop: '0.35rem' },
  miniCardFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.6rem 1rem', borderTop: '1px solid #f3f4f6' },
  // Igual que remList, pero sin su propio fondo/borde/sombra de tarjeta — para usar dentro de
  // miniCardBody, que ya aporta esa tarjeta; evita el efecto "tarjeta dentro de tarjeta".
  miniCardListInner: { width: '100%', maxWidth: '100%', boxSizing: 'border-box' as const, borderRadius: 0, overflow: 'hidden' as const },
  miniCardLink: { background: 'none', border: 'none', padding: 0, color: '#6b7280', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' },
  miniCardAddLink: { display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'none', border: 'none', padding: 0, color: '#6b8c1f', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' },
  readOnlyPill: { display: 'inline-flex', alignSelf: 'flex-start' as const, alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem', borderRadius: '999px', border: '1px solid #d9e8c2', backgroundColor: '#f3faec', fontSize: '0.85rem', fontWeight: 700, color: '#4f6b17' },
  readOnlyField: { padding: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', fontSize: '0.875rem', color: '#6b7280' },
  consumoClamp: { display: '-webkit-box' as const, WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' as const },
  verMasBtn: { alignSelf: 'flex-start' as const, background: 'transparent', border: 'none', padding: 0, color: '#4d7a13', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', marginTop: '0.2rem' },
  stepperWrap: { position: 'relative' as const },
  stepperBtns: { position: 'absolute' as const, right: '0.5rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '0.35rem' },
  stepperBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1.75rem', height: '1.75rem', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: '#fff', color: '#374151', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', lineHeight: 1 },
  percentSuffix: { position: 'absolute' as const, right: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '0.875rem', fontWeight: 600, pointerEvents: 'none' as const },
};
