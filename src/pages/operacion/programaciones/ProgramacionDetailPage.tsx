import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader, FileText, CheckCircle, Circle, X, Plus, Lock, AlertCircle, CircleX, DollarSign, Trash2 } from 'lucide-react';
import { SiGmail } from 'react-icons/si';
import { MaterialIcon } from '../../../components/icons/MaterialIcon';
import Layout from '../../../components/layout/Layout';
import SignaturePad from '../../../components/SignaturePad';
import SuccessToast from '../../../components/SuccessToast';
import { programacionesService, type ProgramacionDetail, type SedeOption, type HospitalOption, type MedicoOption } from '../../../services/programaciones.service';
import { api } from '../../../lib/axios';
import { toLocalDateString } from '../../../lib/date.utils';
import { useResponsiveStyles } from '../../../hooks/useResponsiveStyles';
import { useSmoothWheelScroll } from '../../../hooks/useSmoothWheelScroll';
import { remisionesService, CATEGORIAS_COMISION, TIPOS_COMISION, SELECCIONE_TIPO_COMISION, IMPUESTOS_REMISION, type RemisionItem, type RemTecnicoItem, type ConsumoGrupo, type ValidacionConsumoGrupo, type ComisionGrupo, type RequisicionItem, type NotaCreditoItem, type GastoRelacionadoItem, type FuenteRelacionadaItem, type DocumentoProgramacionItem, type TecnicoSugeridoItem, type TecnicoOption, type CubrimientoOption, type TarifaOption, type LoteOption, type ProductoOption } from '../../../services/remisiones.service';

// ID de Tarifa/Cubrimiento "Hospitales" (ver prisma/seed-catalogos.ts) — usado para autoseleccionar
// el Tercero del Hospital de la programación como Responsable Económico en Agregar Remisión.
const HOSPITALES_CUBRIMIENTO_ID = 'Zd5c45';

const formatProductoLabel = (p: ProductoOption): string =>
  p.referencia ? `${p.referencia} / ${p.nombre}` : p.nombre ?? '-';

// Inicial del primer nombre + inicial del apellido paterno (penúltima palabra), como "Osmar Jared Chim Pat" → "OC"
const getTecnicoInitials = (nombreCompleto: string): string => {
  const words = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '-';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 2][0]).toUpperCase();
};

const formatMoney = (value: any): string => {
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

const formatDate = (dateString: string | null): string => {
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isMobile } = useResponsiveStyles();
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
  useSmoothWheelScroll(tecnicosAsociadosScrollRef, [mainTab]);
  const remisionesScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(remisionesScrollRef, [mainTab]);
  const requisicionesScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(requisicionesScrollRef, [mainTab]);
  const notasCreditoScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(notasCreditoScrollRef, [mainTab]);
  const documentosScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(documentosScrollRef, [mainTab]);
  const tecnicosSugeridosScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(tecnicosSugeridosScrollRef, [mainTab]);
  const consumosScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(consumosScrollRef, [mainTab]);
  const validacionScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(validacionScrollRef, [mainTab]);
  const comisionesScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(comisionesScrollRef, [mainTab]);
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
  const [hoveredConsumoId, setHoveredConsumoId] = useState<string | null>(null);
  const [hoveredValidacionId, setHoveredValidacionId] = useState<string | null>(null);
  const [hoveredTecnicoId, setHoveredTecnicoId] = useState<string | null>(null);
  const [hoveredComisionId, setHoveredComisionId] = useState<string | null>(null);
  const [hoveredRequisicionId, setHoveredRequisicionId] = useState<string | null>(null);
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
  const [selectedFuente, setSelectedFuente] = useState<FuenteRelacionadaItem | null>(null);
  const [selectedTecnico, setSelectedTecnico] = useState<RemTecnicoItem | null>(null);
  const [cerrarError, setCerrarError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showAgregarMenu, setShowAgregarMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const agregarMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const whatsappFileInputRef = useRef<HTMLInputElement>(null);
  const [showWhatsappConfirm, setShowWhatsappConfirm] = useState(false);
  const [whatsappLink, setWhatsappLink] = useState<string | null>(null);
  const gmailFileInputRef = useRef<HTMLInputElement>(null);
  const [showGmailConfirm, setShowGmailConfirm] = useState(false);
  const [gmailSending, setGmailSending] = useState(false);
  const [gmailProgress, setGmailProgress] = useState(0);
  const [showGmailSuccess, setShowGmailSuccess] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);

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
    gmailFileInputRef.current?.click();
  };

  const handleGmailFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await enviarAGmail(file);
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

  const handleWhatsappSinPdf = () => {
    setShowWhatsappConfirm(false);
    if (!programacion) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(buildWhatsappMessage(programacion, false))}`, '_blank');
  };

  const handleWhatsappConPdf = () => {
    setShowWhatsappConfirm(false);
    whatsappFileInputRef.current?.click();
  };

  const handleWhatsappFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo y que onChange dispare de nuevo
    if (!file || !programacion) return;

    const mensaje = buildWhatsappMessage(programacion, true);

    const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean; share?: (data: ShareData) => Promise<void> };
    if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], text: mensaje, title: file.name });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // Si falla por otro motivo, se sigue con el respaldo abajo.
      }
    }

    // Respaldo: el navegador no soporta compartir archivos directamente (común en escritorio, y
    // el bloqueador de pop-ups de Chrome es demasiado inconsistente para abrir la pestaña por
    // código de forma confiable después del diálogo de archivo) — se muestra un link real para
    // que el usuario le dé clic; un clic genuino en un <a> nunca lo bloquea el navegador.
    setWhatsappLink(`https://wa.me/?text=${encodeURIComponent(mensaje)}`);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (agregarMenuRef.current && !agregarMenuRef.current.contains(e.target as Node)) setShowAgregarMenu(false);
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setShowMoreMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const [comisionTooltipPos, setComisionTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const [remisionBtnTooltipPos, setRemisionBtnTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const queryClient = useQueryClient();
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ fechaQx: '', horaQx: '', sedeId: '', hospitalId: '' });
  const [editObservaciones, setEditObservaciones] = useState('');
  const [editConsumo, setEditConsumo] = useState('');
  const [editMedicos, setEditMedicos] = useState<MedicoOption[]>([]);
  const [medicoSearch, setMedicoSearch] = useState('');
  const [showEditSuccess, setShowEditSuccess] = useState(false);
  const editSnapshotRef = useRef<string | null>(null);

  const [showComisionModal, setShowComisionModal] = useState(false);
  const [comisionForm, setComisionForm] = useState({
    categoria: '',
    tipo: '',
    remisionId: '',
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

  const [showDocumentoModal, setShowDocumentoModal] = useState(false);
  const [documentoNombre, setDocumentoNombre] = useState('');
  const [documentoArchivo, setDocumentoArchivo] = useState<File | null>(null);
  const [documentoCargadoEl, setDocumentoCargadoEl] = useState<Date>(new Date());
  const [documentoError, setDocumentoError] = useState<{ field: string; message: string } | null>(null);
  const [showDocumentoSuccess, setShowDocumentoSuccess] = useState(false);

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
  const [insumoLote, setInsumoLote] = useState<LoteOption | null>(null);
  const [insumoLoteSearch, setInsumoLoteSearch] = useState('');
  const [insumoProducto, setInsumoProducto] = useState<ProductoOption | null>(null);
  const [insumoProductoSearch, setInsumoProductoSearch] = useState('');
  const [insumoCantidad, setInsumoCantidad] = useState('');
  const [insumoPrecio, setInsumoPrecio] = useState('');
  const [insumoSubError, setInsumoSubError] = useState<{ field: string; message: string } | null>(null);

  const [showRemisionModal, setShowRemisionModal] = useState(false);
  const [remisionForm, setRemisionForm] = useState({
    paciente: '',
    cirugiaRealizada: '',
    anestesiologo: '',
    impuestos: '',
    tieneDcto: false,
    porcentajeDcto: '',
    vrDctoPesos: '',
    firma: null as string | null,
  });
  const [remisionCubrimiento, setRemisionCubrimiento] = useState<CubrimientoOption | null>(null);
  const [remisionTarifaId, setRemisionTarifaId] = useState('');
  const [remisionEmpresa, setRemisionEmpresa] = useState<TecnicoOption | null>(null);
  const [remisionResponsable, setRemisionResponsable] = useState<TecnicoOption | null>(null);
  const [responsableSearch, setResponsableSearch] = useState('');
  const [remisionError, setRemisionError] = useState<{ field: string; message: string } | null>(null);
  const [showRemisionSuccess, setShowRemisionSuccess] = useState(false);
  const [remisionCreatedId, setRemisionCreatedId] = useState<string | null>(null);

  const [showTecnicoSugeridoModal, setShowTecnicoSugeridoModal] = useState(false);
  const [tecnicoSugeridoSeleccionado, setTecnicoSugeridoSeleccionado] = useState<TecnicoOption | null>(null);
  const [tecnicoSugeridoSearch, setTecnicoSugeridoSearch] = useState('');
  const [tecnicoSugeridoError, setTecnicoSugeridoError] = useState<{ field: string; message: string } | null>(null);

  useEffect(() => {
    document.body.style.overflow = (selectedTecnico || showEditModal || showComisionModal || showConfirmComision || showDocumentoModal || showRequisicionModal || showInsumoSubModal || showRemisionModal || showTecnicoSugeridoModal) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [selectedTecnico, showEditModal, showComisionModal, showConfirmComision, showDocumentoModal, showRequisicionModal, showInsumoSubModal, showRemisionModal, showTecnicoSugeridoModal]);

  const { data: programacion, isLoading, error } = useQuery<ProgramacionDetail | null>({
    queryKey: ['programacion', id],
    queryFn: () => programacionesService.getById(id!),
    enabled: !!id,
  });

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

  const updateMutation = useMutation({
    mutationFn: () => programacionesService.update(id!, {
      fechaQx: editForm.fechaQx || undefined,
      horaQx: editForm.horaQx || undefined,
      sedeId: editForm.sedeId || undefined,
      hospitalId: editForm.hospitalId || undefined,
      observaciones: editObservaciones,
      consumo: editConsumo,
      medicoIds: editMedicos.map(m => m.id),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programacion', id] });
      setShowEditModal(false);
      setShowEditSuccess(true);
    },
  });

  const buildEditSnapshot = (
    form: { fechaQx: string; horaQx: string; sedeId: string; hospitalId: string },
    observaciones: string,
    consumo: string,
    medicos: MedicoOption[],
  ): string =>
    JSON.stringify({
      fechaQx: form.fechaQx,
      horaQx: form.horaQx,
      sedeId: form.sedeId,
      hospitalId: form.hospitalId,
      observaciones,
      consumo,
      medicoIds: medicos.map(m => m.id).slice().sort(),
    });

  const handleGuardarEdit = () => {
    const currentSnapshot = buildEditSnapshot(editForm, editObservaciones, editConsumo, editMedicos);
    if (currentSnapshot === editSnapshotRef.current) {
      setShowEditModal(false);
      return;
    }
    updateMutation.mutate();
  };

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
    setEditForm(initialForm);
    setEditObservaciones(initialObservaciones);
    setEditConsumo(initialConsumo);
    setEditMedicos(initialMedicos);
    setMedicoSearch('');
    editSnapshotRef.current = buildEditSnapshot(initialForm, initialObservaciones, initialConsumo, initialMedicos);
    setShowEditModal(true);
  };

  const selectedHospitalCiudad = hospitalOptions.find(h => h.id === editForm.hospitalId)?.ciudadCat?.nombre ?? null;

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
  const totalValidacion = validacionGrupos.reduce((sum, g) => sum + g.items.length, 0);

  const { data: comisionGrupos = [] } = useQuery<ComisionGrupo[]>({
    queryKey: ['remisiones-comisiones', id],
    queryFn: () => remisionesService.findComisionesByProgramacion(id!),
    enabled: !!id,
  });
  const totalComisiones = comisionGrupos.reduce((sum, g) => sum + g.items.length, 0);

  const { data: tecnicoResults = [] } = useQuery<TecnicoOption[]>({
    queryKey: ['comisiones-tecnicos', tecnicoSearch],
    queryFn: () => remisionesService.searchTecnicos(tecnicoSearch),
    enabled: showComisionModal,
  });

  const createComisionMutation = useMutation({
    mutationFn: () => remisionesService.createComision({
      programacionId: id!,
      categoria: comisionForm.categoria,
      tipo: comisionForm.tipo || undefined,
      tecnicoId: comisionTecnico?.id,
      remisionId: comisionForm.remisionId || undefined,
      vrComision: Number(comisionForm.vrComision),
      observaciones: comisionForm.observaciones || undefined,
      agregarIva: comisionForm.agregarIva,
      cargarPorcentaje: comisionForm.agregarIva && comisionForm.cargarPorcentaje ? Number(comisionForm.cargarPorcentaje) : undefined,
      quieresDesglosar: comisionForm.quieresDesglosar,
      seleccioneTipo: comisionForm.seleccioneTipo || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remisiones-comisiones', id] });
      queryClient.invalidateQueries({ queryKey: ['programacion', id] });
      setShowConfirmComision(false);
      setShowComisionModal(false);
    },
  });

  const openComisionModal = () => {
    setComisionForm({
      categoria: '',
      tipo: '',
      remisionId: '',
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

  const comisionRemisionSeleccionada = remisiones.find(r => r.id === comisionForm.remisionId);

  const handleGuardarComision = () => {
    if (!comisionForm.remisionId) { setComisionError({ field: 'remisionId', message: 'Selecciona una remisión.' }); return; }
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

  const { data: requisiciones = [] } = useQuery<RequisicionItem[]>({
    queryKey: ['remisiones-requisiciones', id],
    queryFn: () => remisionesService.findRequisicionesByProgramacion(id!),
    enabled: !!id,
  });

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

  const { data: insumoLoteResults = [] } = useQuery<LoteOption[]>({
    queryKey: ['lotes', insumoLoteSearch],
    queryFn: () => remisionesService.searchLotes(insumoLoteSearch),
    enabled: showInsumoSubModal,
  });

  const { data: insumoProductoResults = [] } = useQuery<ProductoOption[]>({
    queryKey: ['productos', insumoProductoSearch],
    queryFn: () => remisionesService.searchProductos(insumoProductoSearch),
    enabled: showInsumoSubModal,
  });

  const PRECIO_POR_CUBRIMIENTO: Record<string, keyof ProductoOption> = {
    PARTICULARES: 'particulares',
    HOSPITALES: 'hospitales',
    DISTRIBUIDOR: 'distribuidor',
    ASEGURADORA: 'aseguradora',
  };

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
    setInsumoLote(null);
    setInsumoLoteSearch('');
    setInsumoProducto(null);
    setInsumoProductoSearch('');
    setInsumoCantidad('');
    setInsumoPrecio('');
    setInsumoSubError(null);
    setShowInsumoSubModal(true);
  };

  const handleSelectInsumoProducto = (p: ProductoOption) => {
    setInsumoProducto(p);
    setInsumoProductoSearch('');
    setInsumoSubError(null);
    const key = PRECIO_POR_CUBRIMIENTO[(requisicionCubrimiento?.nombre ?? '').trim().toUpperCase()];
    const precio = key ? p[key] : null;
    setInsumoPrecio(precio !== null && precio !== undefined ? String(precio) : '');
  };

  const handleAgregarInsumoDraft = () => {
    if (!insumoCantidad || Number(insumoCantidad) <= 0) { setInsumoSubError({ field: 'cantidad', message: 'La cantidad debe ser mayor a cero.' }); return; }
    if (!insumoPrecio || Number(insumoPrecio) <= 0) { setInsumoSubError({ field: 'precio', message: 'El precio debe ser mayor a cero.' }); return; }
    setInsumoSubError(null);
    setRequisicionInsumos([...requisicionInsumos, {
      tempId: `${Date.now()}-${Math.random()}`,
      loteId: insumoLote?.id,
      loteLabel: insumoLote?.lote ?? undefined,
      productoId: insumoProducto?.id,
      productoLabel: insumoProducto ? formatProductoLabel(insumoProducto) : undefined,
      cantidad: Number(insumoCantidad),
      precio: Number(insumoPrecio),
    }]);
    setShowInsumoSubModal(false);
    setRequisicionError(null);
  };

  const handleQuitarInsumoDraft = (tempId: string) => {
    setRequisicionInsumos(requisicionInsumos.filter(ins => ins.tempId !== tempId));
  };

  useEffect(() => {
    if (!insumoSubError) return;
    document.getElementById(`insumo-field-${insumoSubError.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [insumoSubError]);

  const { data: cubrimientosRemision = [] } = useQuery<CubrimientoOption[]>({
    queryKey: ['cubrimientos'],
    queryFn: () => remisionesService.findCubrimientos(),
    enabled: showRemisionModal,
  });

  const { data: responsableResults = [] } = useQuery<TecnicoOption[]>({
    queryKey: ['comisiones-tecnicos', responsableSearch],
    queryFn: () => remisionesService.searchTecnicos(responsableSearch),
    enabled: showRemisionModal,
  });

  const { data: empresaResults = [] } = useQuery<TecnicoOption[]>({
    queryKey: ['empresas'],
    queryFn: () => remisionesService.searchEmpresas(),
    enabled: showRemisionModal && !!remisionCubrimiento,
  });

  const { data: empresaSugerida = null } = useQuery<TecnicoOption | null>({
    queryKey: ['empresa-sugerida', remisionCubrimiento?.id, programacion?.sede?.id],
    queryFn: () => remisionesService.getEmpresaSugerida(remisionCubrimiento!.id, programacion!.sede!.id),
    enabled: showRemisionModal && !!remisionCubrimiento && !!programacion?.sede?.id,
  });

  useEffect(() => {
    if (showRemisionModal && remisionCubrimiento) {
      setRemisionEmpresa(empresaSugerida);
    }
  }, [empresaSugerida, showRemisionModal, remisionCubrimiento]);

  const createRemisionMutation = useMutation({
    mutationFn: () => remisionesService.createRemision({
      programacionId: id!,
      paciente: remisionForm.paciente,
      cirugiaRealizada: remisionForm.cirugiaRealizada,
      cubrimientoId: remisionCubrimiento!.id,
      tarifaId: remisionTarifaId,
      empresaId: remisionEmpresa!.id,
      responsableEconomicoId: remisionResponsable!.id,
      anestesiologo: remisionForm.anestesiologo,
      impuestos: remisionForm.impuestos || undefined,
      tieneDcto: remisionForm.tieneDcto,
      porcentajeDcto: remisionForm.tieneDcto && remisionForm.porcentajeDcto ? Number(remisionForm.porcentajeDcto) : undefined,
      vrDctoPesos: remisionForm.tieneDcto && remisionForm.vrDctoPesos ? Number(remisionForm.vrDctoPesos) : undefined,
      firma: remisionForm.firma!,
    }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['remisiones', id] });
      queryClient.invalidateQueries({ queryKey: ['programacion', id] });
      setShowRemisionModal(false);
      setRemisionCreatedId(created.id);
      setShowRemisionSuccess(true);
    },
  });

  const openRemisionModal = () => {
    setRemisionForm({
      paciente: '',
      cirugiaRealizada: '',
      anestesiologo: '',
      impuestos: '',
      tieneDcto: false,
      porcentajeDcto: '',
      vrDctoPesos: '',
      firma: null,
    });
    setRemisionCubrimiento(null);
    setRemisionTarifaId('');
    setRemisionEmpresa(null);
    setRemisionResponsable(null);
    setResponsableSearch('');
    setRemisionError(null);
    setShowRemisionModal(true);
  };

  // Deep-link desde el selector de programación de Remisiones (?agregarRemision=1). Reacciona a
  // cambios en searchParams (no solo al montar) porque, al llegar navegando desde otra vista de
  // detalle con el mismo componente ya montado, React Router no lo remonta. Espera a que
  // puedeAgregarRemision esté disponible (requiere que carguen las requisiciones) antes de abrir.
  useEffect(() => {
    if (searchParams.get('agregarRemision') === '1' && puedeAgregarRemision) {
      openRemisionModal();
      setSearchParams(params => { params.delete('agregarRemision'); return params; }, { replace: true });
    }
  }, [searchParams, puedeAgregarRemision, setSearchParams]);

  // Preview financiero — misma fórmula que remisiones.repository.service.ts (getById). Al crear,
  // aún no hay Det_Consumo asociados, por lo que Subtotal parte de 0.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const remisionSubtotal = 0;
  const remisionDescuentos = remisionForm.tieneDcto
    ? remisionSubtotal * (Number(remisionForm.porcentajeDcto || 0) / 100) + Number(remisionForm.vrDctoPesos || 0)
    : 0;
  const remisionTotalAntesImp = round2(remisionSubtotal - remisionDescuentos);
  const remisionIva = round2((remisionForm.impuestos === 'I.V.A.' || remisionForm.impuestos === 'Todos') ? remisionTotalAntesImp * 0.16 : 0);
  const remisionRetencion = round2((remisionForm.impuestos === 'Retención' || remisionForm.impuestos === 'Todos') ? remisionTotalAntesImp * 0.106667 : 0);
  const remisionTotalPagar = round2(remisionTotalAntesImp + remisionIva - remisionRetencion);
  const remisionSaldo = remisionTotalPagar;

  const handleGuardarRemision = () => {
    if (!remisionForm.paciente.trim()) { setRemisionError({ field: 'paciente', message: 'Ingresa el nombre del paciente.' }); return; }
    if (!remisionCubrimiento) { setRemisionError({ field: 'cubrimiento', message: 'Selecciona el cubrimiento.' }); return; }
    if (!remisionTarifaId) { setRemisionError({ field: 'tarifa', message: 'Selecciona la tarifa.' }); return; }
    if (!remisionEmpresa) { setRemisionError({ field: 'empresa', message: 'Selecciona la empresa.' }); return; }
    if (!remisionResponsable) { setRemisionError({ field: 'responsable', message: 'Selecciona el responsable económico.' }); return; }
    if (!remisionForm.anestesiologo.trim()) { setRemisionError({ field: 'anestesiologo', message: 'Ingresa el anestesiólogo.' }); return; }
    if (!remisionForm.cirugiaRealizada.trim()) { setRemisionError({ field: 'cirugiaRealizada', message: 'Ingresa la cirugía realizada.' }); return; }
    if (!remisionForm.firma) { setRemisionError({ field: 'firma', message: 'La firma es obligatoria.' }); return; }
    setRemisionError(null);
    createRemisionMutation.mutate();
  };

  useEffect(() => {
    if (!remisionError) return;
    document.getElementById(`remision-field-${remisionError.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [remisionError]);

  const { data: notasCredito = [] } = useQuery<NotaCreditoItem[]>({
    queryKey: ['remisiones-notas-credito', id],
    queryFn: () => remisionesService.findNotasCreditoByProgramacion(id!),
    enabled: !!id,
  });

  const { data: tecnicosSugeridos = [] } = useQuery<TecnicoSugeridoItem[]>({
    queryKey: ['tecnicos-sugeridos', id],
    queryFn: () => remisionesService.findTecnicosSugeridosByProgramacion(id!),
    enabled: !!id,
  });

  const { data: tecnicoComisionistaResults = [] } = useQuery<TecnicoOption[]>({
    queryKey: ['tecnicos-comisionistas', tecnicoSugeridoSearch],
    queryFn: () => remisionesService.searchTecnicosComisionistas(tecnicoSugeridoSearch),
    enabled: showTecnicoSugeridoModal,
  });

  const createTecnicoSugeridoMutation = useMutation({
    mutationFn: () => remisionesService.createTecnicoSugerido({
      programacionId: id!,
      tecnicoId: tecnicoSugeridoSeleccionado!.id,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tecnicos-sugeridos', id] });
      setShowTecnicoSugeridoModal(false);
    },
  });

  const deleteTecnicoSugeridoMutation = useMutation({
    mutationFn: (tecnicoSugeridoId: string) => remisionesService.deleteTecnicoSugerido(tecnicoSugeridoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tecnicos-sugeridos', id] });
    },
  });

  const openTecnicoSugeridoModal = () => {
    setTecnicoSugeridoSeleccionado(null);
    setTecnicoSugeridoSearch('');
    setTecnicoSugeridoError(null);
    setShowTecnicoSugeridoModal(true);
  };

  const handleGuardarTecnicoSugerido = () => {
    if (!tecnicoSugeridoSeleccionado) { setTecnicoSugeridoError({ field: 'tecnico', message: 'Selecciona un técnico.' }); return; }
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

  if (isLoading) return <Layout><div style={{ padding: '2rem', textAlign: 'center' }}><Loader className="spinner" size={32} /></div></Layout>;
  if (error) return <Layout><div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>Error al cargar: {(error as any)?.message || 'Error desconocido'}</div></Layout>;
  if (!programacion) return <Layout><div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>Programación no encontrada</div></Layout>;

  const mainTabItems: { key: string; label: string; count: number | null }[] = [
    { key: 'resumen', label: 'Resumen', count: null },
    { key: 'consumos', label: 'Consumos', count: totalConsumos },
    { key: 'validar-consumos', label: 'Validar Consumos', count: totalValidacion },
    { key: 'comisiones', label: 'Comisiones', count: totalComisiones },
    { key: 'gastos', label: 'Gastos', count: gastosRelacionados.length },
    { key: 'fuentes', label: 'Fuentes', count: fuentesRelacionadas.length },
  ];

  const finBarUtilidad = Math.max(Number(programacion.utilidadBruta) || 0, 0);
  const finBarComisiones = Math.max(Number(programacion.comisiones) || 0, 0);
  const finBarCosto = Math.max(Number(programacion.costoTotal) || 0, 0);
  const finBarTotal = finBarUtilidad + finBarComisiones + finBarCosto;
  const finBarPct = (v: number) => finBarTotal > 0 ? (v / finBarTotal) * 100 : 0;

  return (
    <Layout>
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
        <button
          type="button"
          onClick={() => navigate('/operacion/programaciones')}
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
            <MaterialIcon name="event_note" size={30} color="#4d7a13" />
          </span>
          <div style={styles.titleGroup}>
            <div style={styles.titleRow}>
              <h1 style={styles.title}>{programacion.hospital?.nombre || 'Programación'}</h1>
            </div>
            <div style={styles.breadcrumbRow}>
              <span style={styles.breadcrumbId}>{programacion.id}</span>
            </div>
          </div>

          <div style={styles.headerActions}>
            <input
              ref={whatsappFileInputRef}
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={handleWhatsappFileSelected}
            />
            <button
              className="btn-press header-btn-secondary"
              style={styles.btnPill}
              onClick={() => setShowWhatsappConfirm(true)}
            >
              <i className="fa-brands fa-whatsapp" style={{ fontSize: 16, color: '#4d7a13' }} />
              Enviar por WhatsApp
            </button>
            <input
              ref={gmailFileInputRef}
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={handleGmailFileSelected}
            />
            <button
              className="btn-press header-btn-secondary"
              style={{
                ...styles.btnPill,
                position: 'relative' as const,
                overflow: 'hidden' as const,
                ...(gmailSending ? { pointerEvents: 'none' as const } : {}),
              }}
              onClick={() => setShowGmailConfirm(true)}
              disabled={gmailSending}
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
                <SiGmail size={14} color="#8a8a80" />
                {gmailSending ? 'Enviando...' : 'Enviar por Gmail'}
              </span>
            </button>

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
                    onClick={() => { setShowAgregarMenu(false); openRemisionModal(); }}
                    disabled={!puedeAgregarRemision}
                    title={!puedeAgregarRemision ? 'Necesitas al menos una requisición para poder agregar una remisión.' : undefined}
                    onMouseEnter={e => { if (puedeAgregarRemision) e.currentTarget.style.backgroundColor = '#f4f4ee'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <MaterialIcon name="description" size={17} />
                    Agregar Remisión
                  </button>
                  <button
                    style={styles.dropdownItem}
                    onClick={() => { setShowAgregarMenu(false); openTecnicoSugeridoModal(); }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f4f4ee'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <MaterialIcon name="engineering" size={17} />
                    Agregar Técnico Sugerido
                  </button>
                  <button
                    style={styles.dropdownItem}
                    onClick={() => { setShowAgregarMenu(false); openRequisicionModal(); }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f4f4ee'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <MaterialIcon name="inventory_2" size={17} />
                    Agregar Requisición
                  </button>
                </div>
              )}
            </div>

            <div style={{ position: 'relative' as const }} ref={moreMenuRef}>
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
                    Editar Programación
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
                      {cerrarProgramacionMutation.isPending ? 'Cerrando...' : 'Cerrar Programación'}
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
                    Eliminar Programación
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

        <div style={{ ...styles.infoBar, gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr) 1.7fr' }}>
          <div style={styles.infoBarItem}>
            <span style={styles.infoBarLabel}>Fecha y Hora QX</span>
            <span style={styles.infoBarValueMono}>{formatDate(programacion.fechaQx)} · {programacion.horaQx || '-'}</span>
            <span style={styles.infoBarDividerLine} />
          </div>
          <div style={styles.infoBarItem}>
            <span style={styles.infoBarLabel}>Médico</span>
            <span style={styles.infoBarValue}>{programacion.medicos?.map(m => m.medico.nombreCompleto).join(', ') || '-'}</span>
            <span style={styles.infoBarDividerLine} />
          </div>
          <div style={styles.infoBarItem}>
            <span style={styles.infoBarLabel}>Sede</span>
            <span style={styles.infoBarValue}>{programacion.sede ? programacion.sede.nombre : '-'}</span>
            <span style={styles.infoBarDividerLine} />
          </div>
          <div style={styles.infoBarItem}>
            <span style={styles.infoBarLabel}>Ciudad QX</span>
            <span style={styles.infoBarValue}>{programacion.hospital?.ciudadCat?.nombre || '-'}</span>
            <span style={styles.infoBarDividerLine} />
          </div>
          <div style={styles.infoBarItem}>
            <span style={styles.infoBarLabel}>Estado</span>
            <span style={styles.infoBarBadges}>
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
        <>
        <div style={{ ...styles.desgloseSection, gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr' }}>
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
                <span>SubTotal</span>
                <span style={styles.finValue}><AnimatedMoney value={programacion.total} start={finBarMounted} /></span>
              </div>
              <div style={styles.finRow}>
                <span>Descuentos</span>
                <span style={styles.finValue}><AnimatedMoney value={programacion.descuentos} start={finBarMounted} /></span>
              </div>
              <div style={styles.finRow}>
                <span>Notas Crédito</span>
                <span style={styles.finValue}><AnimatedMoney value={programacion.nc} start={finBarMounted} /></span>
              </div>
              <div style={styles.finRow}>
                <span>Ingreso Base</span>
                <span style={styles.finValue}><AnimatedMoney value={programacion.baseIngreso} start={finBarMounted} /></span>
              </div>
              <div style={styles.divider}></div>
              <div style={styles.finRow}>
                <span>Comisiones/Pus/Invers.</span>
                <span style={styles.finValue}><AnimatedMoney value={programacion.comisiones} start={finBarMounted} /></span>
              </div>
              <div style={styles.finRow}>
                <span>Costo Total</span>
                <span style={styles.finValue}><AnimatedMoney value={programacion.costoTotal} start={finBarMounted} /></span>
              </div>
              <div style={styles.finRow}>
                <span>Utilidad Bruta</span>
                <span style={styles.finValue}><AnimatedMoney value={programacion.utilidadBruta} start={finBarMounted} /></span>
              </div>
            </div>

            <div style={styles.divider}></div>
            <div style={styles.extraField}>
              <span style={styles.extraLabel}>Consumo</span>
              <span style={styles.extraValue}>{programacion.consumo || '-'}</span>
            </div>
            <div style={styles.extraField}>
              <span style={styles.extraLabel}>Observaciones</span>
              <span style={styles.extraValue}>{programacion.observaciones || '-'}</span>
            </div>
          </div>

          {/* Técnicos Asociados + Remisiones */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '2rem' }}>
            <div>
              <div style={styles.remisionesTitleRow}>
                <h2 style={styles.sectionTitle}>Técnicos Asociados</h2>
                <span style={styles.badge}>{totalTecnicos}</span>
              </div>
              {tecnicos.length === 0 ? (
                <div style={styles.emptyState}>No hay datos relacionados</div>
              ) : (
                <div style={styles.remList}>
                  <div style={styles.tecnicoLegendRow}>
                    <MaterialIcon name="link" size={16} color="#9ca3af" />
                    <span style={styles.tecnicoLegendText}>Todos ligados a</span>
                    <span style={styles.tecnicoLegendId}>{programacion.id}</span>
                  </div>
                  <div ref={tecnicosAsociadosScrollRef} style={styles.tecnicoScrollBody}>
                    <div style={styles.tecnicoList}>
                      {tecnicoGrupos.flatMap(grupo => grupo.items).map((t, ii) => {
                        const borderStyle = ii > 0 ? styles.remRowBorder : {};
                        const hoverStyle = hoveredTecnicoId === t.id ? styles.consumoCellHover : {};
                        return (
                          <div
                            key={t.id}
                            style={{ ...styles.tecnicoListRow, ...borderStyle, ...hoverStyle, cursor: 'pointer' }}
                            onMouseEnter={() => setHoveredTecnicoId(t.id)}
                            onMouseLeave={() => setHoveredTecnicoId(null)}
                            onClick={() => setSelectedTecnico(t)}
                          >
                            <span style={styles.tecnicoAvatar}>{getTecnicoInitials(t.tecnico?.nombreCompleto || '-')}</span>
                            <span style={styles.tecnicoNombre}>{t.tecnico?.nombreCompleto || '-'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <div style={styles.remisionesTitleRow}>
                <h2 style={styles.sectionTitle}>Remisiones</h2>
                <span style={styles.badge}>{remisiones.length}</span>
              </div>
              {remisiones.length === 0 ? (
                <div style={styles.emptyState}>No hay datos relacionados</div>
              ) : (
                <div style={styles.remList}>
                  <div style={{ ...styles.remGridRow, ...styles.colHeader }}>
                    <span style={styles.colHeaderText}>N° Remisión</span>
                    <span style={styles.colHeaderText}>Estado</span>
                    <span style={styles.colHeaderText}>CxC</span>
                  </div>
                  <div ref={remisionesScrollRef} style={styles.scrollBody}>
                    {remisiones.map((rem, i) => (
                      <div
                        key={rem.id}
                        style={{ ...styles.remGridRow, ...(i > 0 ? styles.remRowBorder : {}), cursor: 'pointer' }}
                        onClick={() => navigate(`/operacion/remisiones/${rem.id}`)}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}
                      >
                        <div style={styles.remRowLeft}>
                          <FileText size={14} color="#6b8c1f" style={{ flexShrink: 0 }} />
                          <span style={styles.remRowCode}>{rem.numRemision || rem.id}</span>
                        </div>
                        {rem.estado ? (
                          <span style={{ ...styles.estadoBadge, ...(rem.estado === 'Definitiva' ? styles.estadoDefinitiva : styles.estadoOtro) }}>
                            {rem.estado}
                          </span>
                        ) : <span style={{ color: '#9ca3af' }}>-</span>}
                        <div style={styles.cxcLabel}>
                          {rem.cxc
                            ? <><CheckCircle size={13} color="#16a34a" /><span style={{ color: '#16a34a' }}>Enviada</span></>
                            : <><Circle size={13} color="#9ca3af" /><span style={{ color: '#9ca3af' }}>Pendiente</span></>
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ position: 'relative' as const }}>
                <button
                  style={{ ...styles.addComisionBtnBelow, ...(!puedeAgregarRemision ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                  onClick={() => { if (puedeAgregarRemision) openRemisionModal(); }}
                  onMouseEnter={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setRemisionBtnTooltipPos({ top: rect.top, left: rect.left + rect.width / 2 });
                  }}
                  onMouseLeave={() => setRemisionBtnTooltipPos(null)}
                >
                  <Plus size={14} /> Agregar Remisión
                </button>
                {!puedeAgregarRemision && remisionBtnTooltipPos && (
                  <div style={{ ...styles.tooltipBubble, top: remisionBtnTooltipPos.top - 8, left: remisionBtnTooltipPos.left }}>
                    Necesitas al menos una requisición para poder agregar una remisión.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Requisiciones + Notas de Crédito ──────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <div style={{ flex: 1 }}>
            <div style={styles.remisionesTitleRow}>
              <h2 style={styles.sectionTitle}>Requisiciones</h2>
              <span style={styles.badge}>{requisiciones.length}</span>
            </div>
            {requisiciones.length === 0 ? (
              <div style={styles.emptyState}>No hay datos relacionados</div>
            ) : (
              <div style={styles.remList}>
                <div style={{ ...styles.requisicionRow, ...styles.colHeader }}>
                  <span style={styles.colHeaderText}>ID Movimiento</span>
                  <span style={styles.colHeaderText}>Marca de Tiempo</span>
                  <span style={styles.colHeaderText}>Usuario</span>
                  <span style={styles.colHeaderText}>Status</span>
                </div>
                <div ref={requisicionesScrollRef} style={styles.comisionScrollBody}>
                  {requisiciones.map((req, i) => {
                    const hoverStyle = hoveredRequisicionId === req.id ? styles.consumoCellHover : {};
                    return (
                      <div
                        key={req.id}
                        style={{ ...styles.requisicionRow, ...(i > 0 ? styles.remRowBorder : {}), ...hoverStyle, cursor: 'pointer' }}
                        onClick={() => navigate(`/operacion/requisiciones/${req.id}`)}
                        onMouseEnter={() => setHoveredRequisicionId(req.id)}
                        onMouseLeave={() => setHoveredRequisicionId(null)}
                      >
                        <span style={styles.requisicionCodigo}>{req.id}</span>
                        <span style={styles.requisicionCellText}>{formatDateTime(req.marcaDeTiempo)}</span>
                        <span style={styles.requisicionCellText}>{req.usuario ?? '-'}</span>
                        <span style={styles.requisicionCellText}>{req.status ?? '-'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <button style={styles.addComisionBtnBelow} onClick={openRequisicionModal}>
              <Plus size={14} /> Agregar Requisición
            </button>
          </div>

          {/* ── Notas de Crédito ───────────────────────────────────── */}
          <div style={{ flex: 1 }}>
            <div style={styles.remisionesTitleRow}>
              <h2 style={styles.sectionTitle}>Notas de Crédito</h2>
              <span style={styles.badge}>{notasCredito.length}</span>
            </div>
            {notasCredito.length === 0 ? (
              <div style={styles.emptyState}>No hay datos relacionados</div>
            ) : (
              <div style={styles.remList}>
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

        {/* ── Documentos + Técnicos Sugeridos ───────────────────────── */}
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <div style={{ flex: 1 }}>
            <div style={styles.remisionesTitleRow}>
              <h2 style={styles.sectionTitle}>Documentos</h2>
              <span style={styles.badge}>{documentos.length}</span>
            </div>
            {documentos.length === 0 ? (
              <div style={styles.emptyState}>No hay datos relacionados</div>
            ) : (
              <div style={styles.remList}>
                <div style={{ ...styles.documentoRow, ...styles.colHeader }}>
                  <span style={styles.colHeaderText}>ID</span>
                  <span style={styles.colHeaderText}>Nombre</span>
                  <span style={styles.colHeaderText}>Documento</span>
                  <span style={styles.colHeaderText}>Cargado el</span>
                  <span style={styles.colHeaderText}>Cargado por</span>
                </div>
                <div ref={documentosScrollRef} style={styles.tabScrollBody}>
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
                        <span style={styles.requisicionCodigo}>{d.id}</span>
                        <span style={styles.requisicionCellText}>{d.nombre ?? '-'}</span>
                        <span style={{ ...styles.requisicionCellText, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          {d.archivoDisponible ? (<><FileText size={14} color="#6b8c1f" /> PDF</>) : <span style={{ color: '#9ca3af', fontStyle: 'italic' as const }}>No disponible</span>}
                        </span>
                        <span style={styles.requisicionCellText}>{formatDateTime(d.cargadoEl)}</span>
                        <span style={styles.requisicionCellText}>{d.cargadoPor?.nombreCompleto ?? '-'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <button style={styles.addComisionBtnBelow} onClick={openDocumentoModal}>
              <Plus size={14} /> Agregar Documento
            </button>
          </div>

          <div style={{ flex: 1 }}>
            <div style={styles.remisionesTitleRow}>
              <h2 style={styles.sectionTitle}>Técnicos Sugeridos</h2>
              <span style={styles.badge}>{tecnicosSugeridos.length}</span>
            </div>
            {tecnicosSugeridos.length === 0 ? (
              <div style={styles.emptyState}>No hay datos relacionados</div>
            ) : (
              <div style={styles.remList}>
                <div style={{ ...styles.fuenteRow, ...styles.colHeader, gridTemplateColumns: '1fr 1fr 1fr 32px' }}>
                  <span style={styles.colHeaderText}>Técnico</span>
                  <span style={styles.colHeaderText}>Fecha Registro</span>
                  <span style={styles.colHeaderText}>Registrado Por</span>
                  <span />
                </div>
                <div ref={tecnicosSugeridosScrollRef} style={styles.tabScrollBody}>
                  {tecnicosSugeridos.map((t, i) => (
                    <div
                      key={t.id}
                      style={{ ...styles.fuenteRow, gridTemplateColumns: '1fr 1fr 1fr 32px', ...(i > 0 ? styles.remRowBorder : {}) }}
                    >
                      <span style={styles.requisicionCellText}>{t.tecnico ?? '-'}</span>
                      <span style={styles.requisicionCellText}>{formatDateTime(t.fechaRegistro)}</span>
                      <span style={styles.requisicionCellText}>{t.registradoPor ?? '-'}</span>
                      <button
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', padding: '0.25rem' }}
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
            )}
            <button style={styles.addComisionBtnBelow} onClick={openTecnicoSugeridoModal}>
              <Plus size={14} /> Agregar Técnico Sugerido
            </button>
          </div>
        </div>
        </div>

        </>
        )}

        {mainTab === 'consumos' && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={styles.remisionesTitleRow}>
            <h2 style={styles.sectionTitle}>Consumos</h2>
            <span style={styles.badge}>{totalConsumos}</span>
          </div>
          {consumoGrupos.length === 0 ? (
            <div style={styles.emptyState}>No hay datos relacionados</div>
          ) : (
            <div style={styles.remList}>
              <div style={{ ...styles.consumoRow, ...styles.colHeader }}>
                <span style={styles.colHeaderText}>Remisión</span>
                <span style={{ ...styles.colHeaderText, paddingLeft: '0.75rem' }}>Cant.</span>
                <span style={{ ...styles.colHeaderText, paddingLeft: '0.75rem' }}>Referencia</span>
                <span style={{ ...styles.colHeaderText, paddingLeft: '0.75rem' }}>Producto</span>
                <span style={{ ...styles.colHeaderText, textAlign: 'right' }}>Valor Unitario</span>
                <span style={{ ...styles.colHeaderText, textAlign: 'right' }}>Valor</span>
              </div>
              <div ref={consumosScrollRef} style={styles.consumosScrollBody}>
                <div style={styles.consumoGrid}>
                  {consumoGrupos.map((grupo, gi) => {
                    const subtotalGrupo = grupo.items.reduce((sum, it) => sum + it.valor, 0);
                    return (
                    <Fragment key={grupo.remisionId ?? `sin-remision-${gi}`}>
                      <div
                        style={{
                          ...styles.consumoRemisionCell,
                          gridRow: `span ${grupo.items.length}`,
                        }}
                      >
                        {grupo.numRemision ?? 'Sin remisión'}
                      </div>
                      {grupo.items.map((item, ii) => {
                        const borderStyle = ii > 0 ? styles.remRowBorder : {};
                        const hoverStyle = hoveredConsumoId === item.id ? styles.consumoCellHover : {};
                        const cellProps = {
                          onMouseEnter: () => setHoveredConsumoId(item.id),
                          onMouseLeave: () => setHoveredConsumoId(null),
                          onClick: () => navigate(`/operacion/consumos/${item.id}`),
                        };
                        return (
                          <Fragment key={item.id}>
                            <span style={{ ...styles.consumoCellCant, ...borderStyle, ...hoverStyle, cursor: 'pointer' }} {...cellProps}>{item.cantidad}</span>
                            <span style={{ ...styles.consumoCellReferencia, ...borderStyle, ...hoverStyle, cursor: 'pointer' }} {...cellProps}>{item.productoReferencia || item.productoId || '-'}</span>
                            <div style={{ ...styles.consumoProducto, ...borderStyle, ...hoverStyle, cursor: 'pointer' }} {...cellProps}>
                              <span style={styles.consumoNombre}>{item.productoNombre ?? '-'}</span>
                            </div>
                            <span style={{ ...styles.consumoCellValorUnit, ...borderStyle, ...hoverStyle, cursor: 'pointer' }} {...cellProps}>{formatMoney(item.valorUnitario)}</span>
                            <span style={{ ...styles.consumoCellValor, ...borderStyle, ...hoverStyle, cursor: 'pointer' }} {...cellProps}>{formatMoney(item.valor)}</span>
                          </Fragment>
                        );
                      })}
                      <div style={{ ...styles.consumoSubtotalRow, ...(gi < consumoGrupos.length - 1 ? styles.consumoGrupoDivider : {}) }}>
                        <span style={styles.consumoSubtotalLabel}>Subtotal</span>
                        <span style={styles.consumoSubtotalValue}>{formatMoney(subtotalGrupo)}</span>
                      </div>
                    </Fragment>
                    );
                  })}
                </div>
              </div>
              <div style={styles.consumoTotalRow}>
                <span style={styles.consumoTotalLabel}>Total consumos</span>
                <span style={styles.consumoTotalValue}>
                  {formatMoney(consumoGrupos.reduce((sum, g) => sum + g.items.reduce((s, it) => s + it.valor, 0), 0))}
                </span>
              </div>
            </div>
          )}
        </div>
        )}

        {mainTab === 'validar-consumos' && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={styles.remisionesTitleRow}>
            <h2 style={styles.sectionTitle}>Validar Consumos</h2>
            <span style={styles.badge}>{totalValidacion}</span>
          </div>
          {validacionGrupos.length === 0 ? (
            <div style={styles.emptyState}>No hay datos relacionados</div>
          ) : (
            <div style={styles.remList}>
              <div style={{ ...styles.validacionRow, ...styles.colHeader }}>
                <span style={styles.colHeaderText}>Remisión</span>
                <span style={{ ...styles.colHeaderText, paddingLeft: '0.75rem' }}>Can Rem</span>
                <span style={{ ...styles.colHeaderText, paddingLeft: '0.75rem' }}>Real Validada</span>
                <span style={{ ...styles.colHeaderText, paddingLeft: '0.75rem' }}>Referencia</span>
                <span style={{ ...styles.colHeaderText, paddingLeft: '0.75rem' }}>Referencia Validada</span>
                <span style={{ ...styles.colHeaderText, paddingLeft: '0.75rem' }}>Nombre Remisionado</span>
                <span style={{ ...styles.colHeaderText, paddingLeft: '0.75rem' }}>Nombre Validado</span>
              </div>
              <div ref={validacionScrollRef} style={styles.consumosScrollBody}>
                <div style={styles.validacionGrid}>
                  {validacionGrupos.map((grupo, gi) => (
                    <Fragment key={grupo.remisionId ?? `sin-remision-${gi}`}>
                      <div
                        style={{
                          ...styles.consumoRemisionCell,
                          gridRow: `span ${grupo.items.length}`,
                          ...(gi > 0 ? styles.validacionGrupoDivider : {}),
                        }}
                      >
                        {grupo.numRemision ?? 'Sin remisión'}
                      </div>
                      {grupo.items.map((item, ii) => {
                        const borderStyle = ii === 0 ? (gi > 0 ? styles.validacionGrupoDivider : {}) : styles.remRowBorder;
                        const hoverStyle = hoveredValidacionId === item.id ? styles.consumoCellHover : {};
                        const cellProps = {
                          onMouseEnter: () => setHoveredValidacionId(item.id),
                          onMouseLeave: () => setHoveredValidacionId(null),
                          onClick: () => navigate(`/operacion/producto-validado/${item.id}`),
                        };
                        return (
                          <Fragment key={item.id}>
                            <span style={{ ...styles.consumoCellCant, ...borderStyle, ...hoverStyle, cursor: 'pointer' }} {...cellProps}>{item.cantRemisionada}</span>
                            <span style={{ ...styles.consumoCellCant, ...borderStyle, ...hoverStyle, cursor: 'pointer' }} {...cellProps}>{item.cantRealValidada}</span>
                            <span style={{ ...styles.consumoCellReferencia, ...borderStyle, ...hoverStyle, cursor: 'pointer' }} {...cellProps}>{item.referenciaRemisionada ?? '-'}</span>
                            <span style={{ ...styles.consumoCellReferencia, ...borderStyle, ...hoverStyle, cursor: 'pointer' }} {...cellProps}>{item.referenciaValidada ?? '-'}</span>
                            <span style={{ ...styles.consumoNombreCell, ...borderStyle, ...hoverStyle, cursor: 'pointer' }} {...cellProps}>{item.nombreRemisionado ?? '-'}</span>
                            <span style={{ ...styles.consumoNombreCellUltima, ...borderStyle, ...hoverStyle, cursor: 'pointer' }} {...cellProps}>{item.nombreValidado ?? '-'}</span>
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {mainTab === 'comisiones' && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={styles.remisionesTitleRow}>
            <h2 style={styles.sectionTitle}>Asignación de Comisiones</h2>
            <span style={styles.badge}>{totalComisiones}</span>
          </div>
          {comisionGrupos.length === 0 ? (
            <div style={styles.emptyState}>No hay datos relacionados</div>
          ) : (
            <div style={styles.remList}>
              <div style={{ ...styles.comisionRow, ...styles.colHeader }}>
                <span style={styles.colHeaderText}>Categoría</span>
                <span style={{ ...styles.colHeaderText, paddingLeft: '0.75rem' }}>Técnico</span>
                <span style={{ ...styles.colHeaderText, textAlign: 'right' }}>Comisión</span>
              </div>
              <div ref={comisionesScrollRef} style={styles.comisionScrollBody}>
                <div style={styles.comisionGrid}>
                  {comisionGrupos.map((grupo, gi) => {
                    const subtotalGrupo = grupo.items.reduce((sum, it) => sum + it.monto, 0);
                    return (
                      <Fragment key={grupo.categoria}>
                        <div
                          style={{
                            ...styles.comisionCategoriaCell,
                            gridRow: `span ${grupo.items.length}`,
                          }}
                        >
                          {grupo.categoria}
                        </div>
                        {grupo.items.map((item, ii) => {
                          const borderStyle = ii > 0 ? styles.remRowBorder : {};
                          const hoverStyle = hoveredComisionId === item.id ? styles.consumoCellHover : {};
                          const cellProps = {
                            onMouseEnter: () => setHoveredComisionId(item.id),
                            onMouseLeave: () => setHoveredComisionId(null),
                            onClick: () => navigate(`/operacion/comisiones/${item.id}`),
                          };
                          return (
                            <Fragment key={item.id}>
                              <div style={{ ...styles.comisionTecnicoCell, ...borderStyle, ...hoverStyle, cursor: 'pointer' }} {...cellProps}>
                                {item.tecnico && <span style={styles.tecnicoAvatar}>{getTecnicoInitials(item.tecnico)}</span>}
                                <span>{item.tecnico ?? '-'}</span>
                              </div>
                              <span style={{ ...styles.comisionMontoCell, ...borderStyle, ...hoverStyle, cursor: 'pointer' }} {...cellProps}>{formatMoney(item.monto)}</span>
                            </Fragment>
                          );
                        })}
                        <div style={{ ...styles.consumoSubtotalRow, ...(gi < comisionGrupos.length - 1 ? styles.consumoGrupoDivider : {}) }}>
                          <span style={styles.consumoSubtotalLabel}>Subtotal</span>
                          <span style={styles.consumoSubtotalValue}>{formatMoney(subtotalGrupo)}</span>
                        </div>
                      </Fragment>
                    );
                  })}
                </div>
              </div>
              <div style={styles.consumoTotalRow}>
                <span style={styles.consumoTotalLabel}>Total comisiones</span>
                <span style={styles.consumoTotalValue}>
                  {formatMoney(comisionGrupos.reduce((sum, g) => sum + g.items.reduce((s, it) => s + it.monto, 0), 0))}
                </span>
              </div>
            </div>
          )}
          <div style={{ position: 'relative' as const }}>
            <button
              style={{ ...styles.addComisionBtnBelow, ...(programacion.consumoNoValidado ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
              onClick={() => { if (!programacion.consumoNoValidado) openComisionModal(); }}
              onMouseEnter={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                setComisionTooltipPos({ top: rect.top, left: rect.left + rect.width / 2 });
              }}
              onMouseLeave={() => setComisionTooltipPos(null)}
            >
              <Plus size={14} /> Agregar Comisión
            </button>
            {programacion.consumoNoValidado && comisionTooltipPos && (
              <div style={{ ...styles.tooltipBubble, top: comisionTooltipPos.top - 8, left: comisionTooltipPos.left }}>
                La programación debe tener todos sus consumos validados para poder agregar comisiones.
              </div>
            )}
          </div>
        </div>
        )}

        {mainTab === 'gastos' && (
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
        )}

        {mainTab === 'fuentes' && (
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
              <div style={styles.infoRow}>
                <span style={styles.label}>N° Programación</span>
                <span style={styles.value}>{selectedTecnico.programacion?.numProgram || selectedTecnico.programacion?.id || '-'}</span>
              </div>
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

      {selectedDocumento && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setSelectedDocumento(null)}>
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
                  onClick={() => selectedDocumento.programacion && navigate(`/operacion/programaciones/${selectedDocumento.programacion.id}`)}
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
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setSelectedNotaCredito(null)}>
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
                  onClick={() => selectedNotaCredito.factura?.remision && navigate(`/operacion/remisiones/${selectedNotaCredito.factura.remision.id}`)}
                >
                  {selectedNotaCredito.factura?.remision?.numRemision || selectedNotaCredito.factura?.remision?.id || '-'}
                </span>
              </div>
              <div style={{ ...styles.infoRow, borderBottom: 'none' }}>
                <span style={styles.label}>Programación No</span>
                <span
                  style={{ ...styles.value, color: '#db2777', cursor: selectedNotaCredito.factura?.remision?.programacion ? 'pointer' : 'default' }}
                  onClick={() => selectedNotaCredito.factura?.remision?.programacion && navigate(`/operacion/programaciones/${selectedNotaCredito.factura.remision.programacion.id}`)}
                >
                  {selectedNotaCredito.factura?.remision?.programacion?.numProgram || selectedNotaCredito.factura?.remision?.programacion?.id || '-'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedFuente && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setSelectedFuente(null)}>
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
                  onClick={() => selectedFuente.programacion && navigate(`/operacion/programaciones/${selectedFuente.programacion.id}`)}
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
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
          <div className="modal-content-anim" style={styles.editModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <button style={styles.closeBtn} onClick={() => setShowEditModal(false)}>
                <X size={18} />
              </button>
              <h2 style={styles.modalTitle}>Editar Programación</h2>
            </div>

            <div style={styles.editModalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Fecha QX *</label>
                <input type="date" style={styles.input} value={editForm.fechaQx} onChange={e => setEditForm({ ...editForm, fechaQx: e.target.value })} />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Hora QX *</label>
                <div style={styles.horaGrid}>
                  <select
                    style={styles.input}
                    value={editForm.horaQx.split(':')[0] ?? ''}
                    onChange={e => {
                      const minuto = editForm.horaQx.split(':')[1] ?? '00';
                      setEditForm({ ...editForm, horaQx: `${e.target.value}:${minuto}` });
                    }}
                  >
                    <option value="">HH</option>
                    {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <select
                    style={styles.input}
                    value={editForm.horaQx.split(':')[1] ?? ''}
                    onChange={e => {
                      const hora = editForm.horaQx.split(':')[0] ?? '00';
                      setEditForm({ ...editForm, horaQx: `${hora}:${e.target.value}` });
                    }}
                  >
                    <option value="">MM</option>
                    {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Sede *</label>
                <div style={styles.sedeGrid}>
                  {sedeOptions.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      style={{ ...styles.sedeBtn, ...(editForm.sedeId === s.id ? styles.sedeBtnActive : {}) }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => { setEditForm({ ...editForm, sedeId: s.id }); e.currentTarget.blur(); }}
                    >
                      {editForm.sedeId === s.id ? <CheckCircle size={14} style={{ flexShrink: 0 }} /> : <Circle size={14} style={{ flexShrink: 0 }} />}
                      {s.nombre}
                    </button>
                  ))}
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Hospital *</label>
                <select style={styles.input} value={editForm.hospitalId} onChange={e => setEditForm({ ...editForm, hospitalId: e.target.value })}>
                  <option value="">Seleccionar hospital</option>
                  {hospitalOptions.map(h => <option key={h.id} value={h.id}>{h.nombre}</option>)}
                </select>
              </div>

              {selectedHospitalCiudad && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Ciudad QX</label>
                  <span style={styles.ciudadPill}>{selectedHospitalCiudad}</span>
                </div>
              )}

              <div style={styles.formGroup}>
                <label style={styles.label}>Médico *</label>
                {editMedicos.length > 0 && (
                  <div style={styles.medicoTagsWrap}>
                    {editMedicos.map(m => (
                      <span key={m.id} style={styles.medicoTag}>
                        {m.nombreCompleto}
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => setEditMedicos(editMedicos.filter(x => x.id !== m.id))} />
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ position: 'relative' as const }}>
                  <input
                    style={styles.input}
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
                            onClick={() => { setEditMedicos([...editMedicos, m]); setMedicoSearch(''); }}
                          >
                            <Plus size={14} /> {m.nombreCompleto}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Consumo *</label>
                <textarea
                  ref={autoResizeTextarea}
                  style={{ ...styles.input, minHeight: '44px', resize: 'none' as const, overflow: 'hidden' as const }}
                  value={editConsumo}
                  onChange={e => { setEditConsumo(e.target.value); autoResizeTextarea(e.target); }}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Observaciones *</label>
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
              <button style={styles.saveBtn} onClick={handleGuardarEdit} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
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
                <span style={styles.readOnlyPill}>{programacion?.id}</span>
              </div>

              <div style={styles.formGroup} id="comision-field-remisionId">
                <label style={styles.label}>No Remisión *</label>
                <select
                  style={{ ...styles.input, ...(comisionError?.field === 'remisionId' ? styles.inputError : {}) }}
                  value={comisionForm.remisionId}
                  onChange={e => { setComisionForm({ ...comisionForm, remisionId: e.target.value }); setComisionError(null); }}
                >
                  <option value="">Seleccionar remisión</option>
                  {remisiones.map(r => (
                    <option key={r.id} value={r.id}>{r.numRemision || r.id}</option>
                  ))}
                </select>
                {comisionError?.field === 'remisionId' && <span style={styles.errorText}>{comisionError.message}</span>}
              </div>

              {comisionForm.remisionId && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Paciente</label>
                  <span style={styles.readOnlyField}>{comisionRemisionSeleccionada?.paciente || '-'}</span>
                </div>
              )}

              <div style={styles.formGroup}>
                <label style={styles.label}>Fecha QX *</label>
                <span style={styles.readOnlyField}>{formatDate(programacion?.fechaQx ?? null)}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Doctor *</label>
                <div style={styles.medicoTagsWrap}>
                  {programacion?.medicos.length ? programacion.medicos.map(m => (
                    <span key={m.medico.id} style={styles.medicoTag}>{m.medico.nombreCompleto}</span>
                  )) : <span style={styles.readOnlyField}>-</span>}
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Hospital *</label>
                <span style={styles.medicoTag}>{programacion?.hospital?.nombre ?? '-'}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Consumo *</label>
                <span style={{ ...styles.readOnlyField, whiteSpace: 'pre-wrap' as const, minHeight: '44px', display: 'block' }}>
                  {programacion?.consumo || '-'}
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

              <div style={styles.formGroup}>
                <label style={styles.label}>Base Ingreso</label>
                <span style={styles.readOnlyField}>{formatMoney(programacion?.baseIngreso ?? null)}</span>
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
                <span style={styles.confirmValue}>{comisionRemisionSeleccionada?.numRemision || comisionRemisionSeleccionada?.id}</span>
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

      {showDocumentoModal && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setShowDocumentoModal(false)}>
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
                <span style={styles.readOnlyField}>
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
                <span style={styles.medicoTag}>{usuarioActual?.nombreCompleto ?? '-'}</span>
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
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setShowRequisicionModal(false)}>
          <div className="modal-content-anim" style={styles.editModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <button style={styles.closeBtn} onClick={() => setShowRequisicionModal(false)}>
                <X size={18} />
              </button>
              <h2 style={styles.modalTitle}>Agregar Requisición</h2>
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
                <input
                  type="date"
                  style={{ ...styles.input, ...(requisicionError?.field === 'fecha' ? styles.inputError : {}) }}
                  value={requisicionFecha}
                  onChange={e => { setRequisicionFecha(e.target.value); setRequisicionError(null); }}
                />
                {requisicionError?.field === 'fecha' && <span style={styles.errorText}>{requisicionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="requisicion-field-cubrimiento">
                <label style={styles.label}>Cubrimiento *</label>
                <div style={styles.sedeGrid}>
                  {cubrimientos.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      style={{ ...styles.sedeBtn, ...(requisicionCubrimiento?.id === c.id ? styles.sedeBtnActive : {}), ...(requisicionError?.field === 'cubrimiento' ? styles.inputError : {}) }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => {
                        setRequisicionCubrimiento(c);
                        setRequisicionTarifaId('');
                        setRequisicionError(null);
                        e.currentTarget.blur();
                      }}
                    >
                      {requisicionCubrimiento?.id === c.id ? <CheckCircle size={14} style={{ flexShrink: 0 }} /> : <Circle size={14} style={{ flexShrink: 0 }} />}
                      {c.nombre}
                    </button>
                  ))}
                </div>
                {requisicionError?.field === 'cubrimiento' && <span style={styles.errorText}>{requisicionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="requisicion-field-tarifa">
                <label style={styles.label}>Tarifa *</label>
                <select
                  style={{ ...styles.input, ...(requisicionError?.field === 'tarifa' ? styles.inputError : {}) }}
                  value={requisicionTarifaId}
                  disabled={!requisicionCubrimiento}
                  onChange={e => { setRequisicionTarifaId(e.target.value); setRequisicionError(null); }}
                >
                  <option value="" disabled>{requisicionCubrimiento ? 'Seleccionar tarifa' : 'Selecciona primero un cubrimiento'}</option>
                  {tarifasCubrimiento.map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
                {requisicionError?.field === 'tarifa' && <span style={styles.errorText}>{requisicionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="requisicion-field-insumos">
                <label style={styles.label}>Seleccione los insumos *</label>
                {requisicionInsumos.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.5rem', marginBottom: '0.5rem' }}>
                    {requisicionInsumos.map(ins => (
                      <div key={ins.tempId} style={styles.insumoDraftRow}>
                        <span style={styles.insumoDraftText}>
                          {ins.productoLabel ?? 'Sin producto'} — {ins.cantidad} × {formatMoney(ins.precio)}
                          {ins.loteLabel ? ` (Lote: ${ins.loteLabel})` : ''}
                        </span>
                        <X size={14} style={{ cursor: 'pointer' }} onClick={() => handleQuitarInsumoDraft(ins.tempId)} />
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  style={{ ...styles.addComisionBtnBelow, ...(requisicionError?.field === 'insumos' ? styles.inputError : {}) }}
                  onClick={openInsumoSubModal}
                >
                  <Plus size={14} /> Nuevo
                </button>
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
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setShowInsumoSubModal(false)}>
          <div className="modal-content-anim" style={styles.editModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <button style={styles.closeBtn} onClick={() => setShowInsumoSubModal(false)}>
                <X size={18} />
              </button>
              <h2 style={styles.modalTitle}>Nuevo Insumo</h2>
            </div>

            <div style={styles.editModalBody}>

              <div style={styles.formGroup}>
                <label style={styles.label}>Lote</label>
                {insumoLote ? (
                  <div style={styles.medicoTagsWrap}>
                    <span style={styles.medicoTag}>
                      {insumoLote.lote}
                      <X size={12} style={{ cursor: 'pointer' }} onClick={() => setInsumoLote(null)} />
                    </span>
                  </div>
                ) : (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      style={styles.input}
                      placeholder="Buscar lote..."
                      value={insumoLoteSearch}
                      onChange={e => setInsumoLoteSearch(e.target.value)}
                    />
                    {insumoLoteSearch.trim() && (
                      <div style={styles.medicoDropdown}>
                        {insumoLoteResults.length === 0 ? (
                          <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                        ) : (
                          insumoLoteResults.map(l => (
                            <div key={l.id} style={styles.medicoDropdownItem} onClick={() => { setInsumoLote(l); setInsumoLoteSearch(''); }}>
                              <Plus size={14} /> {l.lote}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Producto</label>
                {insumoProducto ? (
                  <div style={styles.medicoTagsWrap}>
                    <span style={styles.medicoTag}>
                      {formatProductoLabel(insumoProducto)}
                      <X size={12} style={{ cursor: 'pointer' }} onClick={() => setInsumoProducto(null)} />
                    </span>
                  </div>
                ) : (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      style={styles.input}
                      placeholder="Buscar producto..."
                      value={insumoProductoSearch}
                      onChange={e => setInsumoProductoSearch(e.target.value)}
                    />
                    {insumoProductoSearch.trim() && (
                      <div style={styles.medicoDropdown}>
                        {insumoProductoResults.length === 0 ? (
                          <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                        ) : (
                          insumoProductoResults.map(p => (
                            <div key={p.id} style={styles.medicoDropdownItem} onClick={() => handleSelectInsumoProducto(p)}>
                              <Plus size={14} /> {formatProductoLabel(p)}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {insumoProducto && (
                <>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Sistema</label>
                    <span style={styles.readOnlyField}>{insumoProducto.sistema || '-'}</span>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Referencia</label>
                    <span style={styles.readOnlyField}>{insumoProducto.referencia || '-'}</span>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Descripción</label>
                    <span style={styles.readOnlyField}>{insumoProducto.nombre || '-'}</span>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Categoría</label>
                    <span style={styles.readOnlyField}>{insumoProducto.categoria || '-'}</span>
                  </div>
                </>
              )}

              <div style={styles.formGroup} id="insumo-field-cantidad">
                <label style={styles.label}>Cantidad *</label>
                <div style={styles.stepperWrap}>
                  <input
                    type="number"
                    style={{ ...styles.input, paddingRight: '5rem', ...(insumoSubError?.field === 'cantidad' ? styles.inputError : {}) }}
                    placeholder="0"
                    value={insumoCantidad}
                    onChange={e => { setInsumoCantidad(e.target.value); setInsumoSubError(null); }}
                  />
                  <div style={styles.stepperBtns}>
                    <button type="button" style={styles.stepperBtn} onClick={() => { setInsumoCantidad(String((Number(insumoCantidad) || 0) - 1)); setInsumoSubError(null); }}>−</button>
                    <button type="button" style={styles.stepperBtn} onClick={() => { setInsumoCantidad(String((Number(insumoCantidad) || 0) + 1)); setInsumoSubError(null); }}>+</button>
                  </div>
                </div>
                {insumoSubError?.field === 'cantidad' && <span style={styles.errorText}>{insumoSubError.message}</span>}
              </div>

              <div style={styles.formGroup} id="insumo-field-precio">
                <label style={styles.label}>Precio *</label>
                <div style={styles.stepperWrap}>
                  <input
                    type="number"
                    step="0.01"
                    style={{ ...styles.input, paddingRight: '5rem', ...(insumoSubError?.field === 'precio' ? styles.inputError : {}) }}
                    placeholder="$ 0.00"
                    value={insumoPrecio}
                    onChange={e => { setInsumoPrecio(e.target.value); setInsumoSubError(null); }}
                  />
                  <div style={styles.stepperBtns}>
                    <button type="button" style={styles.stepperBtn} onClick={() => { setInsumoPrecio(String((Number(insumoPrecio) || 0) - 100)); setInsumoSubError(null); }}>−</button>
                    <button type="button" style={styles.stepperBtn} onClick={() => { setInsumoPrecio(String((Number(insumoPrecio) || 0) + 100)); setInsumoSubError(null); }}>+</button>
                  </div>
                </div>
                {insumoSubError?.field === 'precio' && <span style={styles.errorText}>{insumoSubError.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Tarifa Asociada</label>
                <span style={styles.medicoTag}>
                  {tarifasCubrimiento.find(t => t.id === requisicionTarifaId)?.nombre ?? requisicionCubrimiento?.nombre ?? '-'}
                </span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Fecha</label>
                <span style={styles.readOnlyField}>{formatDate(requisicionFecha)}</span>
              </div>
            </div>

            <div style={styles.editModalFooter}>
              <button style={styles.cancelBtn} onClick={() => setShowInsumoSubModal(false)}>Cancelar</button>
              <button style={styles.saveBtn} onClick={handleAgregarInsumoDraft}>Agregar</button>
            </div>
          </div>
        </div>
      )}

      {showRemisionModal && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setShowRemisionModal(false)}>
          <div className="modal-content-anim" style={styles.editModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <button style={styles.closeBtn} onClick={() => setShowRemisionModal(false)}>
                <X size={18} />
              </button>
              <h2 style={styles.modalTitle}>Agregar Remisión</h2>
            </div>

            <div style={styles.editModalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Programación *</label>
                <span style={styles.readOnlyPill}>{programacion?.id}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Sede</label>
                <span style={styles.readOnlyField}>{programacion?.sede?.nombre ?? '-'}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Usuario *</label>
                <span style={styles.medicoTag}>{usuarioActual?.nombreCompleto ?? '-'}</span>
              </div>

              <div style={styles.formGroup} id="remision-field-paciente">
                <label style={styles.label}>Paciente *</label>
                <input
                  style={{ ...styles.input, ...(remisionError?.field === 'paciente' ? styles.inputError : {}) }}
                  value={remisionForm.paciente}
                  onChange={e => { setRemisionForm({ ...remisionForm, paciente: e.target.value }); setRemisionError(null); }}
                />
                {remisionError?.field === 'paciente' && <span style={styles.errorText}>{remisionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="remision-field-cubrimiento">
                <label style={styles.label}>Cubrimiento *</label>
                <div style={styles.sedeGrid}>
                  {cubrimientosRemision.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      style={{ ...styles.sedeBtn, ...(remisionCubrimiento?.id === c.id ? styles.sedeBtnActive : {}), ...(remisionError?.field === 'cubrimiento' ? styles.inputError : {}) }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => {
                        setRemisionCubrimiento(c);
                        setRemisionTarifaId(c.id);
                        setRemisionResponsable(c.id === HOSPITALES_CUBRIMIENTO_ID && programacion?.hospital?.tercero ? programacion.hospital.tercero : null);
                        setRemisionError(null);
                        e.currentTarget.blur();
                      }}
                    >
                      {remisionCubrimiento?.id === c.id ? <CheckCircle size={14} style={{ flexShrink: 0 }} /> : <Circle size={14} style={{ flexShrink: 0 }} />}
                      {c.nombre}
                    </button>
                  ))}
                </div>
                {remisionError?.field === 'cubrimiento' && <span style={styles.errorText}>{remisionError.message}</span>}
              </div>

              {remisionCubrimiento && (
                <div style={styles.formGroup} id="remision-field-empresa">
                  <label style={styles.label}>Empresa *</label>
                  {remisionEmpresa && empresaSugerida?.id === remisionEmpresa.id ? (
                    <span style={styles.readOnlyField}>{remisionEmpresa.nombreCompleto}</span>
                  ) : (
                    <div style={styles.sedeGrid}>
                      {empresaResults.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          style={{ ...styles.sedeBtn, ...(remisionEmpresa?.id === t.id ? styles.sedeBtnActive : {}), ...(remisionError?.field === 'empresa' ? styles.inputError : {}) }}
                          onMouseDown={e => e.preventDefault()}
                          onClick={e => { setRemisionEmpresa(t); setRemisionError(null); e.currentTarget.blur(); }}
                        >
                          {remisionEmpresa?.id === t.id ? <CheckCircle size={14} style={{ flexShrink: 0 }} /> : <Circle size={14} style={{ flexShrink: 0 }} />}
                          {t.nombreCompleto}
                        </button>
                      ))}
                    </div>
                  )}
                  {remisionError?.field === 'empresa' && <span style={styles.errorText}>{remisionError.message}</span>}
                </div>
              )}

              <div style={styles.formGroup} id="remision-field-responsable">
                <label style={styles.label}>Responsable Económico *</label>
                {remisionResponsable && (
                  <div style={styles.medicoTagsWrap}>
                    <span style={styles.medicoTag}>
                      {remisionResponsable.nombreCompleto}
                      <X size={12} style={{ cursor: 'pointer' }} onClick={() => setRemisionResponsable(null)} />
                    </span>
                  </div>
                )}
                {!remisionResponsable && (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      style={{ ...styles.input, ...(remisionError?.field === 'responsable' ? styles.inputError : {}) }}
                      placeholder="Buscar tercero..."
                      value={responsableSearch}
                      onChange={e => { setResponsableSearch(e.target.value); setRemisionError(null); }}
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
                              onClick={() => { setRemisionResponsable(t); setResponsableSearch(''); setRemisionError(null); }}
                            >
                              <Plus size={14} /> {t.nombreCompleto}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                {remisionError?.field === 'responsable' && <span style={styles.errorText}>{remisionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="remision-field-tarifa">
                <label style={styles.label}>Tarifa *</label>
                {remisionCubrimiento ? (
                  <span style={styles.readOnlyPill}>{remisionCubrimiento.nombre}</span>
                ) : (
                  <span style={styles.readOnlyField}>Selecciona primero un cubrimiento</span>
                )}
                {remisionError?.field === 'tarifa' && <span style={styles.errorText}>{remisionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="remision-field-anestesiologo">
                <label style={styles.label}>Anestesiólogo *</label>
                <input
                  style={{ ...styles.input, ...(remisionError?.field === 'anestesiologo' ? styles.inputError : {}) }}
                  value={remisionForm.anestesiologo}
                  onChange={e => { setRemisionForm({ ...remisionForm, anestesiologo: e.target.value }); setRemisionError(null); }}
                />
                {remisionError?.field === 'anestesiologo' && <span style={styles.errorText}>{remisionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="remision-field-cirugiaRealizada">
                <label style={styles.label}>Cirugía Realizada *</label>
                <input
                  style={{ ...styles.input, ...(remisionError?.field === 'cirugiaRealizada' ? styles.inputError : {}) }}
                  value={remisionForm.cirugiaRealizada}
                  onChange={e => { setRemisionForm({ ...remisionForm, cirugiaRealizada: e.target.value }); setRemisionError(null); }}
                />
                {remisionError?.field === 'cirugiaRealizada' && <span style={styles.errorText}>{remisionError.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Impuestos</label>
                <div style={styles.sedeGrid}>
                  <button
                    type="button"
                    style={{ ...styles.sedeBtn, ...(!remisionForm.impuestos ? styles.sedeBtnActive : {}) }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => { setRemisionForm({ ...remisionForm, impuestos: '' }); e.currentTarget.blur(); }}
                  >
                    {!remisionForm.impuestos ? <CheckCircle size={14} style={{ flexShrink: 0 }} /> : <Circle size={14} style={{ flexShrink: 0 }} />}
                    Ninguno
                  </button>
                  {IMPUESTOS_REMISION.map(t => (
                    <button
                      key={t}
                      type="button"
                      style={{ ...styles.sedeBtn, ...(remisionForm.impuestos === t ? styles.sedeBtnActive : {}) }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => { setRemisionForm({ ...remisionForm, impuestos: t }); e.currentTarget.blur(); }}
                    >
                      {remisionForm.impuestos === t ? <CheckCircle size={14} style={{ flexShrink: 0 }} /> : <Circle size={14} style={{ flexShrink: 0 }} />}
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
                    style={{ ...styles.sedeBtn, ...(!remisionForm.tieneDcto ? styles.sedeBtnActive : {}) }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => { setRemisionForm({ ...remisionForm, tieneDcto: false }); e.currentTarget.blur(); }}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    style={{ ...styles.sedeBtn, ...(remisionForm.tieneDcto ? styles.sedeBtnActive : {}) }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => { setRemisionForm({ ...remisionForm, tieneDcto: true }); e.currentTarget.blur(); }}
                  >
                    Sí
                  </button>
                </div>
              </div>

              {remisionForm.tieneDcto && (
                <>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>% Dto</label>
                    <div style={styles.stepperWrap}>
                      <input
                        type="number"
                        step="0.01"
                        style={{ ...styles.input, paddingRight: '5rem' }}
                        placeholder="0.00"
                        value={remisionForm.porcentajeDcto}
                        onChange={e => setRemisionForm({ ...remisionForm, porcentajeDcto: e.target.value })}
                      />
                      <div style={styles.stepperBtns}>
                        <button type="button" style={styles.stepperBtn} onClick={() => setRemisionForm({ ...remisionForm, porcentajeDcto: String((Number(remisionForm.porcentajeDcto) || 0) - 1) })}>−</button>
                        <button type="button" style={styles.stepperBtn} onClick={() => setRemisionForm({ ...remisionForm, porcentajeDcto: String((Number(remisionForm.porcentajeDcto) || 0) + 1) })}>+</button>
                      </div>
                    </div>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>V/R Dcto</label>
                    <span style={styles.readOnlyField}>{formatMoney(remisionDescuentos)}</span>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>V/R Dcto $</label>
                    <div style={styles.stepperWrap}>
                      <input
                        type="number"
                        step="0.01"
                        style={{ ...styles.input, paddingRight: '5rem' }}
                        placeholder="0.00"
                        value={remisionForm.vrDctoPesos}
                        onChange={e => setRemisionForm({ ...remisionForm, vrDctoPesos: e.target.value })}
                      />
                      <div style={styles.stepperBtns}>
                        <button type="button" style={styles.stepperBtn} onClick={() => setRemisionForm({ ...remisionForm, vrDctoPesos: String((Number(remisionForm.vrDctoPesos) || 0) - 100) })}>−</button>
                        <button type="button" style={styles.stepperBtn} onClick={() => setRemisionForm({ ...remisionForm, vrDctoPesos: String((Number(remisionForm.vrDctoPesos) || 0) + 100) })}>+</button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div style={styles.formGroup} id="remision-field-firma">
                <label style={styles.label}>Firma *</label>
                <SignaturePad
                  value={remisionForm.firma}
                  onChange={dataUrl => { setRemisionForm({ ...remisionForm, firma: dataUrl }); setRemisionError(null); }}
                  error={remisionError?.field === 'firma'}
                />
                {remisionError?.field === 'firma' && <span style={styles.errorText}>{remisionError.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Subtotal</label>
                <span style={styles.readOnlyField}>{formatMoney(remisionSubtotal)}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Total Antes Imp.</label>
                <span style={styles.readOnlyField}>{formatMoney(remisionTotalAntesImp)}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>IVA</label>
                <span style={styles.readOnlyField}>{formatMoney(remisionIva)}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Retención</label>
                <span style={styles.readOnlyField}>{formatMoney(remisionRetencion)}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Total Pagar</label>
                <span style={styles.readOnlyField}>{formatMoney(remisionTotalPagar)}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Saldo</label>
                <span style={styles.readOnlyField}>{formatMoney(remisionSaldo)}</span>
              </div>
            </div>

            <div style={styles.editModalFooter}>
              <button style={styles.cancelBtn} onClick={() => setShowRemisionModal(false)}>Cancelar</button>
              <button
                style={styles.saveBtn}
                onClick={handleGuardarRemision}
                disabled={createRemisionMutation.isPending}
              >
                {createRemisionMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWhatsappConfirm && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setShowWhatsappConfirm(false)}>
          <div className="modal-content-anim" style={styles.confirmModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <h2 style={styles.modalTitle}>Enviar por WhatsApp</h2>
            </div>
            <div style={styles.confirmBody}>
              <p style={styles.confirmIntro}>¿Quieres adjuntar una cotización en PDF, o solo enviar la información general de la programación?</p>
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
            <div style={styles.editModalHeader}>
              <h2 style={styles.modalTitle}>Enviar por Gmail</h2>
            </div>
            <div style={styles.confirmBody}>
              <p style={styles.confirmIntro}>¿Quieres adjuntar una cotización en PDF, o solo enviar la información general de la programación?</p>
            </div>
            <div style={styles.editModalFooter}>
              <button className="btn-press" style={styles.cancelBtn} onClick={handleGmailSinArchivo}>
                Solo información
              </button>
              <button className="btn-press" style={styles.saveBtn} onClick={handleGmailConArchivo}>
                Adjuntar cotización
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => { if (!deleteProgramacionMutation.isPending) setShowDeleteConfirm(false); }}>
          <div className="modal-content-anim" style={styles.confirmModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <h2 style={styles.modalTitle}>Eliminar Programación</h2>
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
      {whatsappLink && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setWhatsappLink(null)}>
          <div className="modal-content-anim" style={styles.confirmModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <h2 style={styles.modalTitle}>Listo para enviar</h2>
            </div>
            <div style={styles.confirmBody}>
              <p style={styles.confirmIntro}>
                El mensaje ya está armado. Al abrir WhatsApp, adjunta el PDF manualmente en el chat.
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
      <SuccessToast show={showGmailSuccess} message="PDF enviado al chat de Google" onClose={() => setShowGmailSuccess(false)} />
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
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setShowTecnicoSugeridoModal(false)}>
          <div className="modal-content-anim" style={styles.editModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <button style={styles.closeBtn} onClick={() => setShowTecnicoSugeridoModal(false)}>
                <X size={18} />
              </button>
              <h2 style={styles.modalTitle}>Agregar Técnico Sugerido</h2>
            </div>

            <div style={styles.editModalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Programación *</label>
                <span style={styles.readOnlyPill}>{programacion?.id}</span>
              </div>

              <div style={styles.formGroup} id="tecnico-sugerido-field-tecnico">
                <label style={styles.label}>Técnico *</label>
                {tecnicoSugeridoSeleccionado && (
                  <div style={styles.medicoTagsWrap}>
                    <span style={styles.medicoTag}>
                      {tecnicoSugeridoSeleccionado.nombreCompleto}
                      <X size={12} style={{ cursor: 'pointer' }} onClick={() => setTecnicoSugeridoSeleccionado(null)} />
                    </span>
                  </div>
                )}
                {!tecnicoSugeridoSeleccionado && (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      style={{ ...styles.input, ...(tecnicoSugeridoError?.field === 'tecnico' ? styles.inputError : {}) }}
                      placeholder="Buscar técnico..."
                      value={tecnicoSugeridoSearch}
                      onChange={e => { setTecnicoSugeridoSearch(e.target.value); setTecnicoSugeridoError(null); }}
                    />
                    {tecnicoSugeridoSearch.trim() && (
                      <div style={styles.medicoDropdown}>
                        {tecnicoComisionistaResults.length === 0 ? (
                          <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                        ) : (
                          tecnicoComisionistaResults.map(t => (
                            <div
                              key={t.id}
                              style={styles.medicoDropdownItem}
                              onClick={() => { setTecnicoSugeridoSeleccionado(t); setTecnicoSugeridoSearch(''); setTecnicoSugeridoError(null); }}
                            >
                              <Plus size={14} /> {t.nombreCompleto}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
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

    </Layout>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: '0.05rem 1.5rem 1.5rem', maxWidth: '1400px', margin: '0 auto' },
  backLink: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.75rem', padding: '0.25rem 0.1rem', border: 'none', background: 'transparent', color: '#6b7280', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const, transition: 'color 0.15s ease' },
  headerCard: { backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '1.25rem 1.5rem 0', marginBottom: '2rem', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' },
  titleGroup: { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', overflow: 'hidden' },
  titleLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  title: { fontSize: '2.0625rem', fontWeight: 800, color: '#16170f', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  titleId: { fontSize: '0.8rem', fontWeight: 500, color: '#4d7a13', flexShrink: 0 },
  titleRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' },
  titleIconBadge: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '66px', height: '66px', borderRadius: '20px', backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#4d7a13', flexShrink: 0 },
  statusPill: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.75rem', borderRadius: '999px', border: '1px solid transparent', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 },
  statusPillAbierta: { backgroundColor: '#e9f2d8', color: '#3f6510', borderColor: '#dbe8c2' },
  statusPillCerrada: { backgroundColor: '#f4f4ee', color: '#6b6b60', borderColor: '#e9ece0' },
  statusDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },
  breadcrumbRow: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.95rem', color: '#9a9a90', marginTop: '0.25rem' },
  breadcrumbId: { fontWeight: 500, color: '#4d7a13' },
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
  infoBar: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) 1.7fr', gap: '1.25rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '11px', padding: '1rem 1.25rem', marginBottom: '1.5rem' },
  infoBarItem: { position: 'relative' as const, display: 'flex', flexDirection: 'column' as const, gap: '0.3rem', minWidth: 0 },
  infoBarDividerLine: { position: 'absolute' as const, right: '-0.65rem', top: '15%', bottom: '15%', width: '1px', backgroundColor: '#e5e7eb' },
  infoBarLabel: { fontSize: '0.68rem', fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.04em', flexShrink: 0 },
  infoBarValue: { fontSize: '0.9375rem', fontWeight: 700, color: '#16170f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  infoBarBadges: { display: 'flex', flexWrap: 'nowrap' as const, gap: '0.3rem' },
  estadoFlagBadge: { display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.45rem', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 700, whiteSpace: 'nowrap' as const },
  infoBarValueMono: { fontSize: '0.9375rem', fontWeight: 700, color: '#16170f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  mainTabBar: { display: 'flex', gap: '0.25rem', borderBottom: '1px solid #eeeee6' },
  mainTabBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.75rem 1rem', border: 'none', background: 'transparent', fontSize: '0.84375rem', fontWeight: 600, cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: '-1px', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const },
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
  topSection: { display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1.5rem', marginBottom: '2rem' },
  infoCard: { backgroundColor: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', minWidth: 0 },
  infoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid #f3f4f6' },
  label: { fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' },
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
  remList: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #f3f4f6', overflowX: 'auto' as const, overflowY: 'hidden' as const },
  emptyState: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #f3f4f6', padding: '2rem', textAlign: 'center' as const, color: '#9ca3af', fontSize: '0.875rem' },
  scrollBody: { height: '135px', overflowY: 'auto' as const, backgroundColor: '#f9fafb' },
  tecnicoScrollBody: { height: '135px', overflowY: 'auto' as const, backgroundColor: '#f9fafb' },
  remRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.25rem', backgroundColor: '#fff' },
  remGridRow: { display: 'grid', gridTemplateColumns: '1fr 110px 130px', alignItems: 'center', padding: '0.75rem 1.25rem', gap: '0.5rem', backgroundColor: '#fff', minWidth: '420px' },
  remRowBorder: { borderTop: '1px solid #f3f4f6' },
  remRowLeft: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  remRowCode: { fontSize: '0.875rem', fontWeight: 700, color: '#374151' },
  remRowRight: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  estadoBadge: { fontSize: '0.65rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '999px', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  estadoDefinitiva: { backgroundColor: '#dcfce7', color: '#15803d' },
  estadoOtro: { backgroundColor: '#fef9c3', color: '#a16207' },
  cxcLabel: { display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 600 },
  tecnicoLegendRow: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.75rem 1.25rem', backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' },
  tecnicoLegendText: { fontSize: '0.8rem', fontWeight: 500, color: '#9ca3af' },
  tecnicoLegendId: { fontSize: '0.8rem', fontWeight: 700, color: '#4d7a13' },
  tecnicoList: { backgroundColor: '#fff' },
  tecnicoListRow: { display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.45rem 1.25rem' },
  tecnicoAvatar: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#e9f2d8', color: '#4d7a13', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0 },
  colHeader: { backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' },
  colHeaderText: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  consumoRow: { display: 'grid', gridTemplateColumns: '120px 55px 110px 1fr 130px 110px', alignItems: 'center', padding: '0.6rem 1.25rem', backgroundColor: '#fff', minWidth: '700px' },
  consumoGrid: { display: 'grid', gridTemplateColumns: '120px 55px 110px 1fr 130px 110px', padding: '0 1.25rem', backgroundColor: '#fff', minWidth: '700px' },
  consumoGrupoDivider: { borderBottom: '2px solid #e5e7eb' },
  validacionGrupoDivider: { borderTop: '2px solid #e5e7eb' },
  consumoRemisionCell: { position: 'sticky' as const, top: 0, zIndex: 1, alignSelf: 'start', display: 'flex', alignItems: 'center', padding: '0.6rem 0', backgroundColor: '#fff', boxShadow: '0 1px 0 #f3f4f6', fontSize: '0.8rem', fontWeight: 700, color: '#374151', fontFamily: 'monospace' },
  consumoSubtotalRow: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 -1.25rem', padding: '0.5rem 1.25rem', backgroundColor: '#f9fafb', borderTop: '1px dashed #e5e7eb' },
  consumoSubtotalLabel: { fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  consumoSubtotalValue: { fontSize: '0.85rem', fontWeight: 700, color: '#6b8c1f' },
  consumoCellCant: { display: 'flex', alignItems: 'center', padding: '0.6rem 0 0.6rem 0.75rem', color: '#666', fontSize: '0.85rem' },
  consumoCellReferencia: { display: 'flex', alignItems: 'center', minWidth: 0, padding: '0.6rem 0 0.6rem 0.75rem', overflow: 'hidden', textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const, fontSize: '0.78rem', fontWeight: 700, color: '#6b8c1f', fontFamily: 'monospace' },
  validacionRow: { display: 'grid', gridTemplateColumns: '120px 70px 100px 100px 100px 1fr 1fr', alignItems: 'center', padding: '0.6rem 1.25rem', backgroundColor: '#fff', minWidth: '850px' },
  validacionGrid: { display: 'grid', gridTemplateColumns: '120px 70px 100px 100px 100px 1fr 1fr', padding: '0 1.25rem', backgroundColor: '#fff', minWidth: '850px' },
  consumoNombreCell: { display: 'flex', alignItems: 'center', minWidth: 0, padding: '0.6rem 0 0.6rem 0.75rem', overflow: 'hidden', textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const, fontSize: '0.85rem', color: '#374151' },
  consumoNombreCellUltima: { display: 'flex', alignItems: 'center', minWidth: 0, padding: '0.6rem 1.25rem 0.6rem 0.75rem', margin: '0 -1.25rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const, fontSize: '0.85rem', color: '#374151' },
  comisionRow: { display: 'grid', gridTemplateColumns: '140px 1fr 130px', alignItems: 'center', padding: '0.6rem 1.25rem', backgroundColor: '#fff', minWidth: '480px' },
  comisionGrid: { display: 'grid', gridTemplateColumns: '140px 1fr 130px', padding: '0 1.25rem', backgroundColor: '#fff', minWidth: '480px' },
  comisionCategoriaCell: { position: 'sticky' as const, top: 0, zIndex: 1, alignSelf: 'start', display: 'flex', alignItems: 'center', padding: '0.6rem 0', backgroundColor: '#fff', boxShadow: '0 1px 0 #f3f4f6', fontSize: '0.85rem', fontWeight: 700, color: '#374151' },
  comisionTecnicoCell: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0 0.6rem 0.75rem', overflow: 'hidden', fontSize: '0.85rem', color: '#374151' },
  comisionMontoCell: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0.6rem 1.25rem 0.6rem 0', margin: '0 -1.25rem 0 0', fontSize: '0.85rem', fontWeight: 600, color: '#333' },
  comisionScrollBody: { minHeight: '110px', maxHeight: '220px', overflowY: 'auto' as const, backgroundColor: '#f9fafb' },
  requisicionRow: { display: 'grid', gridTemplateColumns: '110px 145px 1fr 90px', alignItems: 'center', padding: '0.6rem 1.25rem', gap: '0.75rem', backgroundColor: '#fff', minWidth: '620px' },
  notaCreditoRow: { display: 'grid', gridTemplateColumns: '140px 130px 1fr 130px', alignItems: 'center', padding: '0.6rem 1.25rem', gap: '0.75rem', backgroundColor: '#fff', minWidth: '680px' },
  gastoRow: { display: 'grid', gridTemplateColumns: '110px 100px 1fr 180px 110px', alignItems: 'center', padding: '0.6rem 1.25rem', gap: '0.75rem', backgroundColor: '#fff', minWidth: '780px' },
  fuenteRow: { display: 'grid', gridTemplateColumns: '140px 120px 1fr 150px', alignItems: 'center', padding: '0.6rem 1.25rem', gap: '0.75rem', backgroundColor: '#fff', minWidth: '680px' },
  documentoRow: { display: 'grid', gridTemplateColumns: '100px 1fr 1fr 150px 180px', alignItems: 'center', padding: '0.6rem 1.25rem', gap: '0.75rem', backgroundColor: '#fff', minWidth: '900px' },
  tabScrollBody: { maxHeight: '320px', overflowY: 'auto' as const },
  requisicionCodigo: { fontSize: '0.78rem', fontWeight: 700, color: '#6b8c1f', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  requisicionCellText: { fontSize: '0.85rem', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  consumoCellValorUnit: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0.6rem 0', fontSize: '0.85rem', color: '#555' },
  consumoCellValor: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0.6rem 1.25rem 0.6rem 0', margin: '0 -1.25rem 0 0', fontSize: '0.85rem', fontWeight: 600, color: '#333' },
  consumoProducto: { display: 'flex', flexDirection: 'column' as const, justifyContent: 'center', minWidth: 0, gap: '0.1rem', overflow: 'hidden', padding: '0.6rem 0 0.6rem 0.75rem' },
  consumoNombre: { fontSize: '0.85rem', color: '#374151', lineHeight: '1.3', overflow: 'hidden', textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const },
  consumoCellHover: { backgroundColor: '#f3f4f6', cursor: 'pointer' },
  consumosScrollBody: { height: '320px', overflowY: 'auto' as const, backgroundColor: '#f9fafb' },
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
  inputError: { borderColor: '#dc2626' },
  errorText: { fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 },
  insumoDraftRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.6rem 0.85rem', backgroundColor: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '8px' },
  insumoDraftText: { fontSize: '0.8rem', fontWeight: 600, color: '#374151' },
  fileUploadBox: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '90px', padding: '0.75rem', border: '1.5px dashed #d1d5db', borderRadius: '8px', backgroundColor: '#fafafa', cursor: 'pointer' },
  fileUploadedText: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: '#374151' },
  cancelBtn: { padding: '0.5rem 1.5rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: '#333' },
  deleteConfirmBtn: { padding: '0.5rem 1.5rem', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
  saveBtn: { padding: '0.5rem 1.5rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
  horaGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' },
  sedeGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' },
  sedeBtn: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', color: '#374151', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const },
  sedeBtnActive: { backgroundColor: '#6b8c1f', border: '1px solid #6b8c1f', color: '#fff' },
  ciudadPill: { display: 'inline-flex', alignSelf: 'flex-start' as const, padding: '0.4rem 0.85rem', borderRadius: '999px', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb', fontSize: '0.85rem', fontWeight: 600, color: '#374151' },
  medicoTagsWrap: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' },
  medicoTag: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderRadius: '999px', backgroundColor: '#f3f4f6', color: '#333', fontSize: '0.8rem', fontWeight: 600 },
  medicoDropdown: { position: 'absolute' as const, top: 'calc(100% + 0.35rem)', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto' as const, zIndex: 20 },
  medicoDropdownItem: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.75rem', fontSize: '0.85rem', fontWeight: 600, color: '#333', cursor: 'pointer' },
  addComisionBtn: { display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto', padding: '0.4rem 0.85rem', border: 'none', borderRadius: '8px', backgroundColor: '#6b8c1f', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' },
  addComisionBtnBelow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%', marginTop: '0.75rem', padding: '0.6rem', border: '1px dashed #c9dba3', borderRadius: '10px', backgroundColor: '#f9fbf6', color: '#4f6b17', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' },
  readOnlyPill: { display: 'inline-flex', alignSelf: 'flex-start' as const, alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem', borderRadius: '999px', border: '1px solid #d9e8c2', backgroundColor: '#f3faec', fontSize: '0.85rem', fontWeight: 700, color: '#4f6b17' },
  readOnlyField: { padding: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', fontSize: '0.875rem', color: '#6b7280' },
  stepperWrap: { position: 'relative' as const },
  stepperBtns: { position: 'absolute' as const, right: '0.5rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '0.35rem' },
  stepperBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1.75rem', height: '1.75rem', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: '#fff', color: '#374151', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', lineHeight: 1 },
  percentSuffix: { position: 'absolute' as const, right: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '0.875rem', fontWeight: 600, pointerEvents: 'none' as const },
};
