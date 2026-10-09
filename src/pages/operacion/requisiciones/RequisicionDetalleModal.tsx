import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader, FileText, X, Plus, Pencil, Trash2, AlertCircle, Check, Search } from 'lucide-react';
import { MaterialIcon } from '../../../components/icons/MaterialIcon';
import SuccessToast from '../../../components/SuccessToast';
import DatePicker from '../../../components/DatePicker';
import { useResponsiveStyles } from '../../../hooks/useResponsiveStyles';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import { useNavigateWithLoading } from '../../../hooks/useNavigateWithLoading';
import InsumoFormModal, { type InsumoFormValues } from './InsumoFormModal';
import {
  remisionesService,
  type RequisicionItem,
  type DetRequisicionItem,
  type LoteOption,
  type ProductoOption,
  type CubrimientoOption,
  type TarifaOption,
} from '../../../services/remisiones.service';

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
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

const formatMoney = (value: number | null): string => {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  return Number.isNaN(num) ? '-' : `$${num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Paleta fija para los puntos de color de categoría/sistema — esos valores vienen de datos libres
// en BD (sin un catálogo de colores propio), así que se asigna un color determinístico por nombre
// (mismo nombre siempre cae en el mismo color) en vez de un mapeo manual que se desactualizaría.
const GROUP_COLORS = ['#6b8c1f', '#2563eb', '#c2730c', '#6d28d9', '#db2777', '#0d9488', '#dc2626', '#4338ca'];
function colorForGroup(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return GROUP_COLORS[hash % GROUP_COLORS.length];
}

// Parte el id en el segundo guion bajo, dejando el guion bajo en la primera línea (ej.
// "REQ_0000005_0000001" → "REQ_0000005_" / "0000001") para que el título del modal se muestre en
// 2 líneas fijas en vez de cortarse en cualquier punto.
function splitIdAtSecondUnderscore(id: string): [string, string | null] {
  const firstUnderscore = id.indexOf('_');
  if (firstUnderscore === -1) return [id, null];
  const secondUnderscore = id.indexOf('_', firstUnderscore + 1);
  if (secondUnderscore === -1) return [id, null];
  return [id.slice(0, secondUnderscore + 1), id.slice(secondUnderscore + 1)];
}

// Par label/valor del mismo tipo que usa el detalle de Cotizaciones (DetalleItem en CotizacionesPage.tsx)
function DetalleItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={styles.detalleItem}>
      <span style={styles.detalleLabel}>{label}</span>
      <span style={styles.detalleValue}>{value}</span>
    </div>
  );
}

function TagItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={styles.detalleItem}>
      <span style={styles.detalleLabel}>{label}</span>
      <span style={styles.tagPill}>{value}</span>
    </div>
  );
}

interface RequisicionDetalleModalProps {
  id: string;
  onClose: () => void;
}

// Mismo formato que el detalle de Cotizaciones (DetalleModal en CotizacionesPage.tsx): modal con
// header + pestañas (Información General / Insumos), en vez de una página de ruta aparte.
export default function RequisicionDetalleModal({ id, onClose }: RequisicionDetalleModalProps) {
  const { isMobile } = useResponsiveStyles();
  const queryClient = useQueryClient();
  const navigate = useNavigateWithLoading();
  const [hoveredPdfBtn, setHoveredPdfBtn] = useState<'pdf' | 'sos' | null>(null);
  const [selectedInsumo, setSelectedInsumo] = useState<DetRequisicionItem | null>(null);
  const [hoveredInsumoId, setHoveredInsumoId] = useState<string | null>(null);
  const [confirmDeleteInsumoId, setConfirmDeleteInsumoId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [agruparPor, setAgruparPor] = useState<'categoria' | 'sistema'>('categoria');
  const [soloSinLote, setSoloSinLote] = useState(false);
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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

  const { data: req, isLoading, error } = useQuery<RequisicionItem | null>({
    queryKey: ['requisicion-detalle', id],
    queryFn: () => remisionesService.getRequisicionDetalle(id),
  });

  const { data: detalles = [] } = useQuery<DetRequisicionItem[]>({
    queryKey: ['requisicion-detalles', id],
    queryFn: () => remisionesService.findDetallesByRequisicion(id),
  });

  // Bloquea el scroll del fondo mientras el modal está montado.
  useBodyScrollLock(true);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editFecha, setEditFecha] = useState('');
  const [editCubrimiento, setEditCubrimiento] = useState<CubrimientoOption | null>(null);
  const [editTarifaId, setEditTarifaId] = useState('');
  // Se guarda aparte del id porque la tarifa propia del hospital puede no pertenecer al
  // cubrimiento actualmente elegido (tarifasCubrimiento), y en ese caso no se podría resolver su
  // nombre solo buscándola en esa lista — así siempre hay un label legible para mostrar en el tag.
  const [editTarifaLabel, setEditTarifaLabel] = useState('');
  const [editTarifaSearch, setEditTarifaSearch] = useState('');
  const [editTarifaFocused, setEditTarifaFocused] = useState(false);
  const [editError, setEditError] = useState<{ field: string; message: string } | null>(null);
  const [showEditSuccess, setShowEditSuccess] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);

  // Borrador local de los insumos dentro de "Editar Requisición": agregar/editar/eliminar un
  // insumo ahí solo modifica este arreglo en memoria — nada llega al backend hasta que se le da
  // clic a "Guardar" (ver guardarInsumosDraftMutation más abajo). `id: null` = insumo nuevo,
  // todavía no existe en el backend. `eliminado` solo aplica a insumos que sí existían (id
  // distinto de null): se quedan en el arreglo pero se filtran al renderizar, para saber al
  // guardar que hay que borrarlos de verdad.
  interface EditInsumoDraft {
    key: string;
    id: string | null;
    loteId?: string;
    lote: string | null;
    productoId?: string;
    producto: string | null;
    referencia: string | null;
    cantidad: number;
    precio: number;
    eliminado: boolean;
  }
  const [editInsumosDraft, setEditInsumosDraft] = useState<EditInsumoDraft[]>([]);
  // Igual que "Agregar insumo"/"Asignar lote" fuera de este modal (botón del header y badge de
  // las tablas agrupadas): esos siguen aplicando el cambio de inmediato contra el backend — solo
  // dentro de "Editar Requisición" se difiere hasta Guardar. Este flag distingue cuál de los dos
  // comportamientos debe usar handleGuardarInsumo.
  const [insumoModalMode, setInsumoModalMode] = useState<'directo' | 'borrador'>('directo');
  const [editingDraftKey, setEditingDraftKey] = useState<string | null>(null);

  const { data: cubrimientos = [] } = useQuery<CubrimientoOption[]>({
    queryKey: ['cubrimientos'],
    queryFn: () => remisionesService.findCubrimientos(),
    enabled: showEditModal,
  });

  const { data: tarifasCubrimiento = [] } = useQuery<TarifaOption[]>({
    queryKey: ['tarifas', editCubrimiento?.id],
    queryFn: () => remisionesService.findTarifasByCubrimiento(editCubrimiento!.id),
    enabled: showEditModal && !!editCubrimiento,
  });

  // Si el contacto (hospital, no editable) tiene tarifa propia asignada, se autocompleta el campo
  // Tarifa con esa — el usuario todavía puede cambiarla a mano desde el buscador de abajo.
  const { data: contactoTarifa } = useQuery({
    queryKey: ['requisicion-contacto-tarifa', req?.contactoId],
    queryFn: () => remisionesService.getTerceroTarifa(req!.contactoId!),
    enabled: showEditModal && !!req?.contactoId,
  });
  useEffect(() => {
    // showEditModal en las dependencias a propósito: si ya se había abierto este modal antes para
    // la misma requisición, React Query devuelve el mismo objeto en caché para contactoTarifa (no
    // "cambia" de referencia), así que sin esto el efecto no volvía a correr en una segunda
    // apertura — mismo bug que ya se encontró en Agregar Requisición.
    if (!showEditModal || !contactoTarifa?.tarifaId) return;
    // Una tarifa propia de hospital solo tiene sentido bajo el cubrimiento "Hospitales" — se
    // preselecciona también, igual que ya hace Cotizaciones. Si el usuario cambia el cubrimiento
    // a mano después, el propio manejador de ese click ya pisa la tarifa con la del cubrimiento
    // nuevo (ver más abajo), así que no hace falta nada extra para que "cambie con él".
    const cubrimientoHospitales = cubrimientos.find(c => c.nombre?.trim().toUpperCase() === 'HOSPITALES');
    if (cubrimientoHospitales) setEditCubrimiento(cubrimientoHospitales);
    setEditTarifaId(contactoTarifa.tarifaId);
    setEditTarifaLabel(contactoTarifa.tarifaNombre ?? '');
  }, [contactoTarifa, cubrimientos, showEditModal]);

  const updateRequisicionMutation = useMutation({
    mutationFn: () => remisionesService.updateRequisicion(id, {
      fecha: editFecha,
      cubrimientoId: editCubrimiento!.id,
      tarifaId: editTarifaId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisicion-detalle', id] });
      queryClient.invalidateQueries({ queryKey: ['remisiones-requisiciones'] });
      setShowEditModal(false);
      setShowEditSuccess(true);
    },
    onError: (err: any) => {
      setEditError({ field: 'general', message: err?.response?.data?.message ?? 'No se pudo editar la requisición.' });
    },
  });

  const deleteRequisicionMutation = useMutation({
    mutationFn: () => remisionesService.deleteRequisicion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisiciones'] });
      // Match parcial a propósito (sin el id de programación): la mini-tarjeta de Requisiciones
      // en ProgramacionDetailPage cachea bajo ['remisiones-requisiciones', programacionId], que
      // este modal no conoce directamente — invalidateQueries con un prefijo matchea cualquier
      // query cuya key empiece así, sin importar el segundo elemento.
      queryClient.invalidateQueries({ queryKey: ['remisiones-requisiciones'] });
      // No se llama onClose() de inmediato — se espera a que el toast termine su animación (ver
      // SuccessToast más abajo, que recibe onClose como su propio callback de cierre) para que el
      // usuario alcance a ver la confirmación antes de que el modal desaparezca.
      setShowDeleteConfirm(false);
      setShowDeleteSuccess(true);
    },
    onError: (err: any) => {
      setDeleteError(err?.response?.data?.message ?? 'No se pudo eliminar la requisición.');
    },
  });

  const openEditModal = () => {
    if (!req) return;
    setEditFecha(req.fecha ? req.fecha.split('T')[0] : '');
    setEditCubrimiento(req.cubrimientoId ? { id: req.cubrimientoId, nombre: req.cubrimiento ?? '' } : null);
    setEditTarifaId(req.tarifaId ?? '');
    setEditTarifaLabel(req.tarifa ?? '');
    setEditTarifaSearch('');
    setEditError(null);
    setConfirmDeleteInsumoId(null);
    // Borrador de insumos partiendo de los ya guardados — ver comentario de editInsumosDraft.
    setEditInsumosDraft(detalles.map(d => ({
      key: d.id,
      id: d.id,
      loteId: d.loteId ?? undefined,
      lote: d.lote,
      productoId: d.productoId ?? undefined,
      producto: d.producto,
      referencia: d.referencia,
      cantidad: d.cantidad ?? 0,
      precio: d.precio ?? 0,
      eliminado: false,
    })));
    setShowEditModal(true);
  };

  // Aplica de verdad contra el backend lo que haya quedado en editInsumosDraft (crear los nuevos,
  // actualizar los modificados, borrar los marcados) — se llama solo al dar clic en "Guardar".
  const guardarInsumosDraftMutation = useMutation({
    mutationFn: async () => {
      const nuevos = editInsumosDraft.filter(d => d.id === null);
      const modificados = editInsumosDraft.filter(d => d.id !== null && !d.eliminado);
      const eliminados = editInsumosDraft.filter(d => d.id !== null && d.eliminado);
      await Promise.all([
        ...nuevos.map(d => remisionesService.createDetRequisicion({
          requisicionId: id,
          loteId: d.loteId,
          productoId: d.productoId,
          tarifaAsociadaId: editTarifaId || undefined,
          cantidad: d.cantidad,
          precio: d.precio,
        })),
        ...modificados.map(d => remisionesService.updateDetRequisicion(d.id!, {
          loteId: d.loteId,
          productoId: d.productoId,
          cantidad: d.cantidad,
          precio: d.precio,
        })),
        ...eliminados.map(d => remisionesService.deleteDetRequisicion(d.id!)),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisicion-detalles', id] });
    },
  });

  const handleGuardarEdit = async () => {
    if (!editFecha) { setEditError({ field: 'fecha', message: 'Selecciona la fecha.' }); return; }
    if (!editCubrimiento) { setEditError({ field: 'cubrimiento', message: 'Selecciona el cubrimiento.' }); return; }
    if (!editTarifaId) { setEditError({ field: 'tarifa', message: 'Selecciona la tarifa.' }); return; }
    setEditError(null);
    try {
      await guardarInsumosDraftMutation.mutateAsync();
    } catch {
      setEditError({ field: 'general', message: 'No se pudieron guardar los insumos.' });
      return;
    }
    updateRequisicionMutation.mutate();
  };

  const [showInsumoModal, setShowInsumoModal] = useState(false);
  const [editingInsumoId, setEditingInsumoId] = useState<string | null>(null);
  const [insumoSeedLote, setInsumoSeedLote] = useState<LoteOption | null>(null);
  const [insumoSeedProducto, setInsumoSeedProducto] = useState<ProductoOption | null>(null);
  const [insumoSeedCantidad, setInsumoSeedCantidad] = useState('');
  const [insumoSeedPrecio, setInsumoSeedPrecio] = useState('');

  useEffect(() => {
    if (!editError) return;
    document.getElementById(`edit-requisicion-field-${editError.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [editError]);

  // Misma tarifa que ya usa createDetRequisicionMutation para tarifaAsociadaId: la del formulario
  // de edición si está abierto (puede no estar guardada todavía), si no la ya guardada.
  const insumoTarifaId = (showEditModal ? editTarifaId : req?.tarifaId) || undefined;
  const insumoCubrimientoNombre = showEditModal ? editCubrimiento?.nombre : req?.cubrimiento;
  const insumoTarifaLabel = showEditModal ? (tarifasCubrimiento.find(t => t.id === editTarifaId)?.nombre ?? req?.tarifa ?? '-') : (req?.tarifa ?? '-');
  const insumoFecha = showEditModal ? (editFecha || req?.fecha || null) : (req?.fecha ?? null);

  const createDetRequisicionMutation = useMutation({
    mutationFn: (vars: { loteId?: string; productoId?: string; cantidad: number; precio: number }) => remisionesService.createDetRequisicion({
      requisicionId: id,
      loteId: vars.loteId,
      productoId: vars.productoId,
      tarifaAsociadaId: (showEditModal ? editTarifaId : req?.tarifaId) || undefined,
      cantidad: vars.cantidad,
      precio: vars.precio,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisicion-detalles', id] });
      setShowInsumoModal(false);
    },
  });

  const updateDetRequisicionMutation = useMutation({
    mutationFn: (vars: { id: string; loteId?: string; productoId?: string; cantidad: number; precio: number }) => remisionesService.updateDetRequisicion(vars.id, vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisicion-detalles', id] });
      setShowInsumoModal(false);
    },
  });

  const openInsumoModal = () => {
    setInsumoModalMode('directo');
    setEditingInsumoId(null);
    setInsumoSeedLote(null);
    setInsumoSeedProducto(null);
    setInsumoSeedCantidad('');
    setInsumoSeedPrecio('');
    setShowInsumoModal(true);
  };

  const openEditInsumoModal = (d: DetRequisicionItem) => {
    setInsumoModalMode('directo');
    setEditingInsumoId(d.id);
    setInsumoSeedLote(d.loteId ? { id: d.loteId, lote: d.lote } : null);
    setInsumoSeedProducto(d.productoId ? {
      id: d.productoId,
      nombre: d.producto,
      referencia: d.referencia,
      particulares: null,
      hospitales: null,
      distribuidor: null,
      aseguradora: null,
      sistema: d.sistema,
      categoria: d.categoria,
      precioSugerido: null,
    } : null);
    setInsumoSeedCantidad(d.cantidad !== null ? String(d.cantidad) : '');
    setInsumoSeedPrecio(d.precio !== null ? String(d.precio) : '');
    setShowInsumoModal(true);
  };

  // Mismos dos abridores que arriba, pero para el borrador de "Editar Requisición" (ver
  // editInsumosDraft) — no tocan editingInsumoId (ese sigue siendo del modo "directo").
  const openInsumoDraftModal = () => {
    setInsumoModalMode('borrador');
    setEditingDraftKey(null);
    setInsumoSeedLote(null);
    setInsumoSeedProducto(null);
    setInsumoSeedCantidad('');
    setInsumoSeedPrecio('');
    setShowInsumoModal(true);
  };

  const openEditInsumoDraftModal = (d: EditInsumoDraft) => {
    setInsumoModalMode('borrador');
    setEditingDraftKey(d.key);
    setInsumoSeedLote(d.loteId ? { id: d.loteId, lote: d.lote } : null);
    setInsumoSeedProducto(d.productoId ? {
      id: d.productoId,
      nombre: d.producto,
      referencia: d.referencia,
      particulares: null,
      hospitales: null,
      distribuidor: null,
      aseguradora: null,
      sistema: null,
      categoria: null,
      precioSugerido: null,
    } : null);
    setInsumoSeedCantidad(String(d.cantidad));
    setInsumoSeedPrecio(String(d.precio));
    setShowInsumoModal(true);
  };

  const handleGuardarInsumo = (values: InsumoFormValues) => {
    const vars = { loteId: values.lote?.id, productoId: values.producto.id, cantidad: values.cantidad, precio: values.precio };

    if (insumoModalMode === 'borrador') {
      if (editingDraftKey) {
        setEditInsumosDraft(prev => prev.map(it => it.key === editingDraftKey ? {
          ...it,
          loteId: vars.loteId,
          lote: values.lote?.lote ?? null,
          productoId: vars.productoId,
          producto: values.producto.nombre,
          referencia: values.producto.referencia,
          cantidad: vars.cantidad,
          precio: vars.precio,
        } : it));
      } else {
        // Mismo producto y mismo lote (o ambos sin lote) que un insumo ya en el borrador: en vez
        // de agregar una fila duplicada, se suma la cantidad a la que ya tenía.
        const existente = editInsumosDraft.find(d => !d.eliminado && d.productoId === vars.productoId && (d.loteId ?? null) === (vars.loteId ?? null));
        if (existente) {
          setEditInsumosDraft(prev => prev.map(it => it.key === existente.key ? { ...it, cantidad: it.cantidad + vars.cantidad } : it));
        } else {
          setEditInsumosDraft(prev => [...prev, {
            key: `new-${Date.now()}-${Math.random()}`,
            id: null,
            loteId: vars.loteId,
            lote: values.lote?.lote ?? null,
            productoId: vars.productoId,
            producto: values.producto.nombre,
            referencia: values.producto.referencia,
            cantidad: vars.cantidad,
            precio: vars.precio,
            eliminado: false,
          }]);
        }
      }
      setShowInsumoModal(false);
      return;
    }

    if (editingInsumoId) {
      updateDetRequisicionMutation.mutate({ id: editingInsumoId, ...vars });
      return;
    }
    // Mismo producto y mismo lote (o ambos sin lote) que un insumo ya agregado: en vez de crear
    // una fila duplicada, se suma la cantidad a la que ya tenía.
    const existente = detalles.find(d => d.productoId === values.producto.id && (d.loteId ?? null) === (values.lote?.id ?? null));
    if (existente) {
      updateDetRequisicionMutation.mutate({ id: existente.id, ...vars, cantidad: (existente.cantidad ?? 0) + values.cantidad });
    } else {
      createDetRequisicionMutation.mutate(vars);
    }
  };

  // Al cambiar el criterio de agrupación el chip activo (que es un valor de categoría o de
  // sistema) deja de tener sentido, así que se limpia.
  useEffect(() => { setActiveChip(null); }, [agruparPor]);

  const groupLabelFallback = agruparPor === 'categoria' ? 'Sin categoría' : 'Sin sistema';

  const searchFiltered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return detalles.filter(d => {
      if (soloSinLote && d.loteId) return false;
      if (!term) return true;
      return (
        d.referencia?.toLowerCase().includes(term) ||
        d.descripcion?.toLowerCase().includes(term) ||
        d.sistema?.toLowerCase().includes(term)
      );
    });
  }, [detalles, search, soloSinLote]);

  const chipCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of searchFiltered) {
      const value = (agruparPor === 'categoria' ? d.categoria : d.sistema) || groupLabelFallback;
      map.set(value, (map.get(value) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'es'));
  }, [searchFiltered, agruparPor, groupLabelFallback]);

  const filteredDetalles = useMemo(() => {
    if (!activeChip) return searchFiltered;
    return searchFiltered.filter(d => ((agruparPor === 'categoria' ? d.categoria : d.sistema) || groupLabelFallback) === activeChip);
  }, [searchFiltered, activeChip, agruparPor, groupLabelFallback]);

  const groups = useMemo(() => {
    const map = new Map<string, DetRequisicionItem[]>();
    for (const d of filteredDetalles) {
      const value = (agruparPor === 'categoria' ? d.categoria : d.sistema) || groupLabelFallback;
      if (!map.has(value)) map.set(value, []);
      map.get(value)!.push(d);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([label, items]) => ({
        label,
        items,
        subtotal: items.reduce((sum, d) => sum + Number(d.cantidad ?? 0) * Number(d.precio ?? 0), 0),
      }));
  }, [filteredDetalles, agruparPor, groupLabelFallback]);

  const totalUnidades = useMemo(() => detalles.reduce((sum, d) => sum + Number(d.cantidad ?? 0), 0), [detalles]);
  const sinLoteCount = useMemo(() => detalles.filter(d => !d.loteId).length, [detalles]);

  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  return (
    <>
      <div className="modal-overlay-anim" style={styles.modalOverlay}>
        <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
          {isLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center' as const }}><Loader className="spinner" size={28} /></div>
          ) : error ? (
            <div style={{ padding: '3rem', textAlign: 'center' as const, color: '#dc2626' }}>Error al cargar: {(error as any)?.message || 'Error desconocido'}</div>
          ) : !req ? (
            <div style={{ padding: '3rem', textAlign: 'center' as const, color: '#999' }}>Requisición no encontrada</div>
          ) : (
            <>
              <div style={styles.headerCard}>
                <div style={styles.headerTopRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0, flex: 1, ...(isMobile ? { paddingRight: '2.75rem', boxSizing: 'border-box' as const } : {}) }}>
                    <div style={styles.titleIconBadge}>
                      <MaterialIcon name="inventory_2" size={20} color="#4d7a13" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', minWidth: 0 }}>
                      <span style={styles.titleLabel}>Requisición</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' as const }}>
                        {isMobile ? (() => {
                          const [primeraLinea, segundaLinea] = splitIdAtSecondUnderscore(req.id);
                          return (
                            <h2 style={{ ...styles.title, whiteSpace: 'nowrap' as const }}>
                              {primeraLinea}
                              {segundaLinea && <><br />{segundaLinea}</>}
                            </h2>
                          );
                        })() : (
                          <h2 style={styles.title}>{req.id}</h2>
                        )}
                        {req.status && <span style={styles.reqStatusBadge}>{req.status}</span>}
                      </div>
                      <span style={styles.reqEditedSub}>Editado {formatDateTime(req.marcaDeTiempo)}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <button
                      className="btn-press"
                      style={{ ...styles.btnPill, ...(hoveredPdfBtn === 'pdf' ? styles.btnPillHover : {}) }}
                      onMouseEnter={() => setHoveredPdfBtn('pdf')}
                      onMouseLeave={() => setHoveredPdfBtn(null)}
                    >
                      <FileText size={15} color="#4d7a13" /> {isMobile ? 'PDF' : 'Crear PDF'}
                    </button>
                    <button
                      className="btn-press"
                      style={{ ...styles.btnPill, ...(hoveredPdfBtn === 'sos' ? styles.btnPillHover : {}) }}
                      onMouseEnter={() => setHoveredPdfBtn('sos')}
                      onMouseLeave={() => setHoveredPdfBtn(null)}
                    >
                      <FileText size={15} color="#4d7a13" /> {isMobile ? 'S.O.S' : 'PDF S.O.S'}
                    </button>

                    <span style={styles.headerDivider} />

                    <div style={{ position: 'relative' as const }} ref={moreMenuRef}>
                      <button className="btn-press" style={styles.iconMenuBtn} onClick={() => setShowMoreMenu(o => !o)}>
                        <MaterialIcon name="more_horiz" size={20} />
                      </button>
                      {showMoreMenu && (
                        <div style={styles.moreMenuDropdown}>
                          <button
                            style={styles.moreMenuItem}
                            onClick={() => { setShowMoreMenu(false); openEditModal(); }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f4f4ee'; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                          >
                            <Pencil size={15} /> Editar Requisición
                          </button>
                          <div style={styles.moreMenuDivider} />
                          <button
                            style={{ ...styles.moreMenuItem, ...styles.moreMenuItemDanger }}
                            onClick={() => { setShowMoreMenu(false); setDeleteError(null); setShowDeleteConfirm(true); }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f7ece8'; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                          >
                            <Trash2 size={15} /> Eliminar Requisición
                          </button>
                        </div>
                      )}
                    </div>

                    {!isMobile && (
                      <button style={styles.closeBtn} onClick={onClose}>
                        <X size={18} />
                      </button>
                    )}
                  </div>

                  {isMobile && (
                    <button style={{ ...styles.closeBtn, position: 'absolute' as const, top: '1.5rem', right: '1.5rem' }} onClick={onClose}>
                      <X size={18} />
                    </button>
                  )}
                </div>
              </div>

              <div style={styles.modalBody}>
                <div style={{ ...styles.reqFlowRow, ...(isMobile ? { flexDirection: 'column' as const } : {}) }}>
                  <div style={styles.reqFlowBox}>
                    <span style={styles.reqFlowIconCircle}><MaterialIcon name="warehouse" size={16} color="#4d7a13" /></span>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', minWidth: 0 }}>
                      <span style={styles.detalleLabel}>Origen</span>
                      <span style={styles.reqFlowValue}>{req.sedeOrigen || '-'}</span>
                    </div>
                  </div>
                  <div style={{ ...styles.reqFlowConnector, ...(isMobile ? { flexDirection: 'column' as const, height: '3rem' } : {}) }}>
                    <span style={styles.reqFlowDotFilled} />
                    <span style={{ ...styles.reqFlowConnectorLine, ...(isMobile ? { width: 0, height: '100%', borderTop: 'none', borderLeft: '2px dashed #6b8c1f' } : {}) }} />
                    <span style={styles.reqFlowIconBadge}><MaterialIcon name="swap_horiz" size={16} color="#4d7a13" /></span>
                    <span style={{ ...styles.reqFlowConnectorLine, ...(isMobile ? { width: 0, height: '100%', borderTop: 'none', borderLeft: '2px dashed #6b8c1f' } : {}) }} />
                    <span style={styles.reqFlowDotHollow} />
                  </div>
                  <div style={{ ...styles.reqFlowBox, ...(isMobile ? {} : { justifyContent: 'flex-end' as const }) }}>
                    <span style={styles.reqFlowIconCircle}><MaterialIcon name="local_hospital" size={16} color="#4d7a13" /></span>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', minWidth: 0 }}>
                      <span style={styles.detalleLabel}>Destino</span>
                      <span style={styles.reqFlowValue}>{req.contacto || '-'}</span>
                    </div>
                  </div>
                </div>

                <div style={styles.reqStatsOuter}>
                <div style={{ ...styles.reqStatsBar, borderBottom: '1px solid #eeeee6', ...(isMobile ? { flexWrap: 'wrap' as const } : {}) }}>
                  <div style={{ ...styles.reqStatsSegment, backgroundColor: '#fff', ...(isMobile ? { flex: '1 1 50%', minWidth: '150px' } : {}) }}>
                    <span style={{ ...styles.detalleLabel, textTransform: 'none' as const, fontSize: '0.75rem' }}>Programación</span>
                    {req.programacionId ? (
                      <span
                        style={{ ...styles.detalleValue, fontSize: '0.82rem', fontWeight: 700, color: '#3f6510', cursor: 'pointer', width: 'fit-content' as const }}
                        onClick={() => navigate(`/operacion/programaciones/${req.programacionId}`, '/operacion/programaciones/:id')}
                      >
                        {req.folio || req.programacionId}
                      </span>
                    ) : (
                      <span style={{ ...styles.detalleValue, fontSize: '0.82rem' }}>{req.folio || '-'}</span>
                    )}
                  </div>
                  <div style={{ ...styles.reqStatsSegment, backgroundColor: '#fff', ...(isMobile ? { flex: '1 1 50%', minWidth: '150px' } : {}) }}>
                    <span style={{ ...styles.detalleLabel, textTransform: 'none' as const, fontSize: '0.75rem' }}>Cubrimiento</span>
                    <span style={{ ...styles.detalleValue, fontSize: '0.82rem' }}>{req.cubrimiento || '-'}</span>
                  </div>
                  <div style={{ ...styles.reqStatsSegment, backgroundColor: '#fff', ...(isMobile ? { flex: '1 1 50%', minWidth: '150px' } : {}) }}>
                    <span style={{ ...styles.detalleLabel, textTransform: 'none' as const, fontSize: '0.75rem' }}>Tarifa</span>
                    <span style={{ ...styles.detalleValue, fontSize: '0.82rem' }}>{req.tarifa || '-'}</span>
                  </div>
                  <div style={{ ...styles.reqStatsSegment, backgroundColor: '#fff', ...(isMobile ? { flex: '1 1 50%', minWidth: '150px' } : {}) }}>
                    <span style={{ ...styles.detalleLabel, textTransform: 'none' as const, fontSize: '0.75rem' }}>Fecha</span>
                    <span style={{ ...styles.detalleValue, fontSize: '0.82rem' }}>{formatDate(req.fecha)}</span>
                  </div>
                  <div style={{ ...styles.reqStatsSegment, backgroundColor: '#fff', ...(isMobile ? { flex: '1 1 50%', minWidth: '150px' } : {}) }}>
                    <span style={{ ...styles.detalleLabel, textTransform: 'none' as const, fontSize: '0.75rem' }}>Creado por</span>
                    <span style={{ ...styles.detalleValue, fontSize: '0.82rem' }}>{req.usuario || '-'}</span>
                  </div>
                  <div style={{ ...styles.reqStatsSegment, backgroundColor: '#fff', borderRight: 'none', ...(isMobile ? { flex: '1 1 50%', minWidth: '150px' } : {}) }}>
                    <span style={{ ...styles.detalleLabel, textTransform: 'none' as const, fontSize: '0.75rem' }}>Validación</span>
                    {req.validacion ? (
                      <span style={{
                        ...styles.reqValidacionBadge,
                        ...(req.validacion.trim().toLowerCase() === 'pendiente' ? styles.reqValidacionBadgePendiente : styles.reqValidacionBadgeOk),
                      }}>
                        {req.validacion}
                      </span>
                    ) : (
                      <span style={{ ...styles.detalleValue, fontSize: '0.82rem' }}>-</span>
                    )}
                  </div>
                </div>

                <div style={styles.reqStatsBar}>
                  <div style={styles.reqStatsSegment}>
                    <span style={styles.detalleLabel}>Insumos</span>
                    <span style={styles.reqStatsValue}>{detalles.length}</span>
                  </div>
                  <div style={styles.reqStatsSegment}>
                    <span style={styles.detalleLabel}>Unidades</span>
                    <span style={styles.reqStatsValue}>{totalUnidades}</span>
                  </div>
                  <div style={styles.reqStatsSegment}>
                    <span style={{ ...styles.detalleLabel, color: '#c2730c' }}>Sin lote</span>
                    <span style={{ ...styles.reqStatsValue, color: '#c2730c' }}>{sinLoteCount}</span>
                  </div>
                  <div style={{ ...styles.reqStatsSegment, ...styles.reqStatsSegmentDark }}>
                    <span style={{ ...styles.detalleLabel, color: '#d1d5db' }}>Total</span>
                    <span style={{ ...styles.reqStatsValue, color: '#fff' }}>{formatMoney(req.total)}</span>
                  </div>
                </div>
                </div>

                <div style={{ ...styles.reqToolbar, ...(isMobile ? { flexDirection: 'column' as const, alignItems: 'stretch' as const } : {}) }}>
                  <div style={styles.reqSearchWrap}>
                    <Search size={15} color="#9ca3af" style={{ position: 'absolute' as const, left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      style={styles.reqSearchInput}
                      placeholder="Buscar por código, descripción o sistema..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                  <div style={{ ...styles.reqToolbarRight, ...(isMobile ? { justifyContent: 'space-between' as const } : {}) }}>
                    <div style={styles.reqGroupToggle}>
                      <button type="button" style={{ ...styles.reqGroupToggleBtn, ...(agruparPor === 'categoria' ? styles.reqGroupToggleBtnActive : {}) }} onClick={() => setAgruparPor('categoria')}>
                        Categoría
                      </button>
                      <button type="button" style={{ ...styles.reqGroupToggleBtn, ...(agruparPor === 'sistema' ? styles.reqGroupToggleBtnActive : {}) }} onClick={() => setAgruparPor('sistema')}>
                        Sistema
                      </button>
                    </div>
                    <label style={styles.reqCheckboxLabel}>
                      <input type="checkbox" checked={soloSinLote} onChange={e => setSoloSinLote(e.target.checked)} />
                      Solo sin lote
                    </label>
                    <button type="button" className="btn-press" style={styles.reqAddInsumoBtn} onClick={openInsumoModal}>
                      <Plus size={14} /> Agregar insumo
                    </button>
                  </div>
                </div>

                <div style={styles.reqChipsRow}>
                  <button type="button" style={{ ...styles.reqChip, ...(activeChip === null ? styles.reqChipActive : {}) }} onClick={() => setActiveChip(null)}>
                    Todas <span style={styles.reqChipCount}>{searchFiltered.length}</span>
                  </button>
                  {chipCounts.map(([label, count]) => (
                    <button
                      key={label}
                      type="button"
                      style={{ ...styles.reqChip, ...(activeChip === label ? styles.reqChipActive : {}) }}
                      onClick={() => setActiveChip(label)}
                    >
                      <span style={{ ...styles.reqChipDot, backgroundColor: colorForGroup(label) }} />
                      {label} <span style={styles.reqChipCount}>{count}</span>
                    </button>
                  ))}
                </div>

                {filteredDetalles.length === 0 ? (
                  <div style={styles.emptySection}>No hay insumos que coincidan con los filtros</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' }}>
                    {groups.map(group => {
                      const collapsed = collapsedGroups.has(group.label);
                      return (
                        <div key={group.label} style={styles.reqGroupCard}>
                          <button type="button" style={styles.reqGroupHeader} onClick={() => toggleGroup(group.label)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                              <MaterialIcon
                                name="expand_more"
                                size={16}
                                color="#6b7280"
                                style={{ transform: collapsed ? 'rotate(-90deg)' : undefined, transition: 'transform 0.15s ease', flexShrink: 0 }}
                              />
                              <span style={{ ...styles.reqChipDot, backgroundColor: colorForGroup(group.label) }} />
                              <span style={styles.reqGroupHeaderLabel}>{group.label}</span>
                              <span style={styles.countBadge}>{group.items.length}</span>
                            </div>
                            <span style={styles.reqGroupHeaderTotal}>{formatMoney(group.subtotal)}</span>
                          </button>
                          <div style={{ display: 'grid', gridTemplateRows: collapsed ? '0fr' : '1fr', transition: 'grid-template-rows 0.25s ease' }}>
                          <div style={{ overflow: 'hidden' as const }}>
                            <div style={styles.consumosTableWrap}>
                              <table style={styles.consumosTable}>
                                <thead>
                                  <tr>
                                    <th style={styles.consumosTh}>Insumo</th>
                                    <th style={styles.consumosTh}>Sistema</th>
                                    <th style={styles.consumosTh}>Lote</th>
                                    <th style={{ ...styles.consumosTh, textAlign: 'right' as const }}>Cant.</th>
                                    <th style={{ ...styles.consumosTh, textAlign: 'right' as const }}>P. unitario</th>
                                    <th style={{ ...styles.consumosTh, textAlign: 'right' as const }}>Importe</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.items.map(d => (
                                    <tr
                                      key={d.id}
                                      style={{ cursor: 'pointer', ...(hoveredInsumoId === d.id ? { backgroundColor: '#f3faec' } : {}) }}
                                      onMouseEnter={() => setHoveredInsumoId(d.id)}
                                      onMouseLeave={() => setHoveredInsumoId(null)}
                                      onClick={() => setSelectedInsumo(d)}
                                    >
                                      <td style={{ ...styles.consumosTd, fontWeight: 700, color: '#16170f' }}>
                                        {d.referencia ? `${d.referencia} / ` : ''}{d.descripcion ?? d.producto ?? '-'}
                                      </td>
                                      <td style={styles.consumosTd}>{d.sistema ?? '-'}</td>
                                      <td style={styles.consumosTd}>
                                        {d.lote ? d.lote : (
                                          <span
                                            style={styles.reqAsignarLoteBadge}
                                            onClick={e => { e.stopPropagation(); openEditInsumoModal(d); }}
                                          >
                                            Asignar lote
                                          </span>
                                        )}
                                      </td>
                                      <td style={{ ...styles.consumosTd, textAlign: 'right' as const }}>{d.cantidad ?? '-'}</td>
                                      <td style={{ ...styles.consumosTd, textAlign: 'right' as const }}>{formatMoney(d.precio)}</td>
                                      <td style={{ ...styles.consumosTd, textAlign: 'right' as const, fontWeight: 700 }}>{formatMoney(Number(d.cantidad ?? 0) * Number(d.precio ?? 0))}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {selectedInsumo && req && (
        <div className="modal-overlay-anim" style={{ ...styles.modalOverlay, zIndex: 10050 }}>
          <div className="modal-content-anim" style={styles.subModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.subModalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={styles.titleIconBadge}>
                  <MaterialIcon name="inventory_2" size={18} color="#4d7a13" />
                </div>
                <h2 style={styles.modalTitle}>Detalle del Insumo</h2>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelectedInsumo(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.infoSectionBox}>
                <div style={{ ...styles.detalleGrid, ...(isMobile ? { gridTemplateColumns: '1fr' } : {}) }}>
                  <DetalleItem label="ID Detalle" value={selectedInsumo.id} />
                  <DetalleItem label="Movimiento" value={req.id} />
                  <TagItem label="Lote" value={selectedInsumo.lote ?? '-'} />
                  <TagItem label="Producto" value={selectedInsumo.producto ?? '-'} />
                  <DetalleItem label="Cantidad" value={selectedInsumo.cantidad ?? '-'} />
                  <DetalleItem label="Precio" value={formatMoney(selectedInsumo.precio)} />
                  <DetalleItem label="Sistema" value={selectedInsumo.sistema ?? '-'} />
                  <DetalleItem label="Referencia" value={selectedInsumo.referencia ?? '-'} />
                  <DetalleItem label="Tarifa Asociada" value={selectedInsumo.tarifaAsociada ?? '-'} />
                  <DetalleItem label="Descripción" value={selectedInsumo.descripcion ?? '-'} />
                  <DetalleItem label="Categoría" value={selectedInsumo.categoria ?? '-'} />
                  <DetalleItem label="Fecha" value={formatDate(selectedInsumo.fecha)} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="modal-overlay-anim" style={{ ...styles.modalOverlay, zIndex: 10050 }}>
          <div className="modal-content-anim" style={{ ...styles.subModalContent, maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div style={styles.subModalHeader}>
              <h2 style={styles.modalTitle}>Eliminar Requisición</h2>
              <button style={styles.closeBtn} onClick={() => setShowDeleteConfirm(false)}>
                <X size={18} />
              </button>
            </div>
            <div style={styles.modalBody}>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0 0 1rem' }}>
                ¿Seguro que quieres eliminar la requisición <strong>{id}</strong>? Se eliminarán también todos sus insumos. Esta acción no se puede deshacer.
              </p>
              {deleteError && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.75rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                  <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span style={{ color: '#b91c1c', fontSize: '0.82rem', fontWeight: 500, lineHeight: 1.4 }}>{deleteError}</span>
                </div>
              )}
            </div>
            <div style={styles.subModalFooter}>
              <button style={styles.cancelBtn} onClick={() => setShowDeleteConfirm(false)} disabled={deleteRequisicionMutation.isPending}>
                Cancelar
              </button>
              <button
                style={styles.deleteConfirmBtn}
                onClick={() => deleteRequisicionMutation.mutate()}
                disabled={deleteRequisicionMutation.isPending}
              >
                {deleteRequisicionMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="modal-overlay-anim" style={{ ...styles.modalOverlay, zIndex: 10050 }}>
          <div className="modal-content-anim" style={styles.subModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.subModalHeader}>
              <h2 style={styles.modalTitle}>Editar Requisición</h2>
              <button style={styles.closeBtn} onClick={() => setShowEditModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ ...styles.modalBody, display: 'flex', flexDirection: 'column' as const, gap: '1.25rem' }}>
              <div style={styles.formGroup} id="edit-requisicion-field-fecha">
                <label style={styles.formLabel}>Fecha *</label>
                <DatePicker
                  error={editError?.field === 'fecha'}
                  value={editFecha}
                  onChange={fecha => { setEditFecha(fecha); setEditError(null); }}
                  style={editFecha ? { backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510', fontWeight: 600 } : undefined}
                  labelStyle={editFecha ? { flex: 1, textAlign: 'center' as const } : undefined}
                />
                {editError?.field === 'fecha' && <span style={styles.errorText}>{editError.message}</span>}
              </div>

              <div style={styles.formGroup} id="edit-requisicion-field-contacto">
                <label style={styles.formLabel}>Contacto</label>
                {/* Preseleccionado al hospital de la requisición — no se puede cambiar desde acá,
                    a diferencia de Fecha/Cubrimiento/Tarifa que sí son editables. */}
                <span style={styles.readOnlyField}>{req?.contacto || '-'}</span>
              </div>

              <div style={styles.formGroup} id="edit-requisicion-field-cubrimiento">
                <label style={styles.formLabel}>Cubrimiento *</label>
                <div style={styles.pickBtnGrid}>
                  {cubrimientos.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      style={{ ...styles.pickBtn, ...(editCubrimiento?.id === c.id ? styles.pickBtnActive : {}), ...(editError?.field === 'cubrimiento' ? styles.inputError : {}) }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => {
                        setEditCubrimiento(c);
                        // Si se vuelve a Hospitales y el contacto tiene tarifa propia, se restaura
                        // esa (no la tarifa "base" genérica del cubrimiento) — así ir y volver
                        // entre cubrimientos no pierde la tarifa personalizada del hospital.
                        const esHospitales = c.nombre?.trim().toUpperCase() === 'HOSPITALES';
                        if (esHospitales && contactoTarifa?.tarifaId) {
                          setEditTarifaId(contactoTarifa.tarifaId);
                          setEditTarifaLabel(contactoTarifa.tarifaNombre ?? '');
                        } else {
                          // Igual que en Agregar requisición: la tarifa "base" de un cubrimiento
                          // tiene el mismo id que el cubrimiento (findTarifasByCubrimiento la
                          // incluye junto con las sub-tarifas más específicas) — se preselecciona
                          // como default, pero se puede cambiar desde el buscador de abajo.
                          setEditTarifaId(c.id);
                          setEditTarifaLabel(c.nombre);
                        }
                        setEditTarifaSearch('');
                        setEditError(null);
                        e.currentTarget.blur();
                      }}
                    >
                      {c.nombre}
                    </button>
                  ))}
                </div>
                {editError?.field === 'cubrimiento' && <span style={styles.errorText}>{editError.message}</span>}
              </div>

              <div style={styles.formGroup} id="edit-requisicion-field-tarifa">
                <label style={styles.formLabel}>Tarifa *</label>
                {editTarifaId ? (
                  <span style={{ ...styles.tagPill, width: 'fit-content' as const }}>
                    {editTarifaLabel || tarifasCubrimiento.find(t => t.id === editTarifaId)?.nombre || editCubrimiento?.nombre || editTarifaId}
                    <X size={12} style={{ cursor: 'pointer', marginLeft: '0.4rem' }} onClick={() => { setEditTarifaId(''); setEditTarifaLabel(''); setEditTarifaSearch(''); }} />
                  </span>
                ) : !editCubrimiento ? (
                  <span style={{ ...styles.formInput, color: '#9ca3af', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center' }}>
                    Selecciona primero un cubrimiento
                  </span>
                ) : (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      style={{ ...styles.formInput, ...(editError?.field === 'tarifa' ? styles.inputError : {}) }}
                      placeholder="Buscar tarifa..."
                      value={editTarifaSearch}
                      onChange={e => setEditTarifaSearch(e.target.value)}
                      onFocus={() => setEditTarifaFocused(true)}
                      onBlur={() => setTimeout(() => setEditTarifaFocused(false), 150)}
                    />
                    {editTarifaFocused && (
                      <div style={styles.medicoDropdown}>
                        {tarifasCubrimiento.filter(t => !editTarifaSearch.trim() || t.nombre.toLowerCase().includes(editTarifaSearch.trim().toLowerCase())).length === 0 ? (
                          <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                        ) : (
                          tarifasCubrimiento
                            .filter(t => !editTarifaSearch.trim() || t.nombre.toLowerCase().includes(editTarifaSearch.trim().toLowerCase()))
                            .map(t => (
                              <div
                                key={t.id}
                                style={styles.medicoDropdownItem}
                                onMouseDown={e => e.preventDefault()}
                                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e9f2d8'; e.currentTarget.style.color = '#3f6510'; }}
                                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#333'; }}
                                onClick={() => { setEditTarifaId(t.id); setEditTarifaLabel(t.nombre); setEditTarifaSearch(''); setEditError(null); }}
                              >
                                {t.nombre}
                              </div>
                            ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                {editError?.field === 'tarifa' && <span style={styles.errorText}>{editError.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Insumos</label>
                {editInsumosDraft.filter(d => !d.eliminado).length > 0 && (
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
                        {editInsumosDraft.filter(d => !d.eliminado).map(d => (
                          <tr key={d.key}>
                            {confirmDeleteInsumoId === d.key ? (
                              <td colSpan={6} style={styles.consumosTd}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <span style={{ color: '#6b7280' }}>¿Eliminar este insumo?</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                    <button
                                      type="button"
                                      style={{ ...styles.rowDeleteBtn, color: '#dc2626' }}
                                      onClick={() => {
                                        setEditInsumosDraft(prev => d.id === null
                                          ? prev.filter(it => it.key !== d.key)
                                          : prev.map(it => it.key === d.key ? { ...it, eliminado: true } : it));
                                        setConfirmDeleteInsumoId(null);
                                      }}
                                    >
                                      <Check size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      style={styles.rowDeleteBtn}
                                      onClick={() => setConfirmDeleteInsumoId(null)}
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                </div>
                              </td>
                            ) : (
                              <>
                                <td style={{ ...styles.consumosTd, whiteSpace: 'normal' as const }}>
                                  {d.referencia ? `${d.referencia} / ` : ''}{d.producto ?? 'Sin producto'}
                                </td>
                                <td style={styles.consumosTd}>{d.lote ?? '-'}</td>
                                <td style={{ ...styles.consumosTd, textAlign: 'right' as const }}>{d.cantidad}</td>
                                <td style={{ ...styles.consumosTd, textAlign: 'right' as const }}>{formatMoney(d.precio)}</td>
                                <td style={{ ...styles.consumosTd, textAlign: 'right' as const, fontWeight: 700 }}>{formatMoney(d.cantidad * d.precio)}</td>
                                <td style={{ ...styles.consumosTd, textAlign: 'center' as const }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem' }}>
                                    <Pencil size={14} style={{ cursor: 'pointer', color: '#6b7280' }} onClick={() => openEditInsumoDraftModal(d)} />
                                    <Trash2 size={14} style={{ cursor: 'pointer', color: '#dc2626' }} onClick={() => setConfirmDeleteInsumoId(d.key)} />
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <button type="button" style={styles.addInsumoBtn} onClick={openInsumoDraftModal}>
                  <Plus size={14} /> Nuevo
                </button>
              </div>

              {editError?.field === 'general' && <span style={styles.errorText}>{editError.message}</span>}
            </div>

            <div style={styles.subModalFooter}>
              <button style={styles.cancelBtn} onClick={() => setShowEditModal(false)}>Cancelar</button>
              <button
                style={styles.saveBtn}
                onClick={handleGuardarEdit}
                disabled={updateRequisicionMutation.isPending || guardarInsumosDraftMutation.isPending}
              >
                {(updateRequisicionMutation.isPending || guardarInsumosDraftMutation.isPending) ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <SuccessToast show={showEditSuccess} message="Requisición editada" onClose={() => setShowEditSuccess(false)} />
      <SuccessToast show={showDeleteSuccess} message="Requisición eliminada" onClose={onClose} />

      {showInsumoModal && (
        <InsumoFormModal
          title={(insumoModalMode === 'borrador' ? !!editingDraftKey : !!editingInsumoId) ? 'Editar Insumo' : 'Nuevo insumo'}
          movimientoId={req?.id}
          tarifaId={insumoTarifaId}
          cubrimientoNombre={insumoCubrimientoNombre}
          tarifaLabel={insumoTarifaLabel}
          fecha={insumoFecha}
          initialLote={insumoSeedLote}
          initialProducto={insumoSeedProducto}
          initialCantidad={insumoSeedCantidad}
          initialPrecio={insumoSeedPrecio}
          isSaving={insumoModalMode === 'directo' && (createDetRequisicionMutation.isPending || updateDetRequisicionMutation.isPending)}
          onSubmit={handleGuardarInsumo}
          onClose={() => setShowInsumoModal(false)}
        />
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '2rem' },
  modalContent: { backgroundColor: '#fff', borderRadius: '16px', width: '90%', maxWidth: '1100px', maxHeight: '90dvh', overflowY: 'auto' as const, overflowX: 'hidden' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  subModalContent: { backgroundColor: '#fff', borderRadius: '16px', width: '90%', maxWidth: '640px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  subModalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #eeeee6', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', position: 'sticky' as const, top: 0 },
  subModalFooter: { display: 'flex', gap: '0.75rem', padding: '1.25rem 1.5rem', borderTop: '1px solid #eeeee6', justifyContent: 'flex-end' as const },
  modalTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#16170f', margin: 0 },
  modalBody: { padding: '1.5rem' },
  closeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: 'none', backgroundColor: '#f4f4ee', borderRadius: '8px', cursor: 'pointer', color: '#6b6b60', flexShrink: 0 },

  headerCard: { borderBottom: '1px solid #eeeee6', padding: '1.25rem 1.5rem', position: 'sticky' as const, top: 0, backgroundColor: '#fff', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', zIndex: 1, display: 'flex', flexDirection: 'column' as const, gap: '1rem' },
  headerTopRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' as const },
  titleIconBadge: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', flexShrink: 0 },
  titleLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  title: { fontSize: '1.05rem', fontWeight: 700, color: '#16170f', margin: 0, lineHeight: 1.3 },
  reqStatusBadge: { display: 'inline-flex', alignItems: 'center', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, backgroundColor: '#f4f4ee', color: '#6b6b60' },
  reqEditedSub: { fontSize: '0.75rem', color: '#9ca3af', fontWeight: 500 },

  btnPill: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1rem', border: '1px solid #e5e7eb', borderRadius: '12px', backgroundColor: '#fff', color: '#33342a', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0, transition: 'background-color 0.15s' },
  btnPillHover: { backgroundColor: '#f4f4ee' },
  headerDivider: { width: '1px', height: '26px', backgroundColor: '#e9ece0', flexShrink: 0 },
  iconMenuBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: '1px solid #e5e7eb', borderRadius: '999px', cursor: 'pointer', color: '#33342a', flexShrink: 0, backgroundColor: '#fff' },
  moreMenuDropdown: { position: 'absolute' as const, top: 'calc(100% + 8px)', right: 0, backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: '210px', overflow: 'hidden', zIndex: 200, padding: '0.35rem' },
  moreMenuItem: { display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.6rem 0.75rem', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.84375rem', color: '#33342a', fontWeight: 600, textAlign: 'left' as const },
  moreMenuItemDanger: { color: '#a8503c' },
  moreMenuDivider: { height: '1px', backgroundColor: '#eeeee6', margin: '0.3rem 0' },

  reqFlowRow: { display: 'flex', alignItems: 'center', gap: '1rem', padding: '0 0 1rem' },
  reqFlowBox: { display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, minWidth: 0 },
  reqFlowIconCircle: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '999px', backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', flexShrink: 0 },
  reqFlowValue: { fontSize: '0.9rem', fontWeight: 700, color: '#16170f', overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const },
  reqFlowConnector: { display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '0 1 220px', minWidth: '120px' },
  reqFlowConnectorLine: { flex: 1, height: 0, borderTop: '2px dashed #6b8c1f' },
  reqFlowDotFilled: { width: '9px', height: '9px', borderRadius: '999px', backgroundColor: '#4d7a13', flexShrink: 0 },
  reqFlowDotHollow: { width: '9px', height: '9px', borderRadius: '999px', border: '2px solid #4d7a13', backgroundColor: '#fff', flexShrink: 0, boxSizing: 'border-box' as const },
  reqFlowIconBadge: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '999px', backgroundColor: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', flexShrink: 0 },

  reqValidacionBadge: { display: 'inline-flex', alignSelf: 'flex-start' as const, padding: '0.3rem 0.65rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700 },
  reqValidacionBadgePendiente: { backgroundColor: '#fef3c7', border: '1px solid #fde68a', color: '#c2730c' },
  reqValidacionBadgeOk: { backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510' },

  reqStatsOuter: { border: '1px solid #eeeee6', borderRadius: '10px', overflow: 'hidden' as const, marginBottom: '1rem' },
  reqStatsBar: { display: 'flex' },
  reqStatsSegment: { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: '0.3rem', padding: '0.9rem 1.1rem', borderRight: '1px solid #eeeee6', backgroundColor: '#f9fafb' },
  reqStatsSegmentDark: { backgroundColor: '#16170f', borderRight: 'none' },
  reqStatsValue: { fontSize: '1.1rem', fontWeight: 700, color: '#16170f' },
  reqStatsLinkBtn: { border: 'none', background: 'transparent', color: '#c2730c', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' as const },

  reqToolbar: { display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0 0.75rem', flexWrap: 'wrap' as const },
  reqSearchWrap: { position: 'relative' as const, flex: 1, minWidth: '220px' },
  reqSearchInput: { width: '100%', padding: '0.6rem 0.75rem 0.6rem 2.1rem', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const },
  reqToolbarRight: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' as const },
  reqGroupToggle: { display: 'flex', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' as const },
  reqGroupToggleBtn: { padding: '0.45rem 0.8rem', border: 'none', background: '#fff', color: '#6b7280', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' },
  reqGroupToggleBtnActive: { backgroundColor: '#e9f2d8', color: '#3f6510' },
  reqCheckboxLabel: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  reqAddInsumoBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem', border: 'none', borderRadius: '10px', backgroundColor: '#6b8c1f', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' as const },

  reqChipsRow: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem', marginBottom: '1rem' },
  reqChip: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '999px', backgroundColor: '#fff', color: '#374151', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' },
  reqChipActive: { backgroundColor: '#f4f4ee', borderColor: '#d4d4c8' },
  reqChipDot: { width: '8px', height: '8px', borderRadius: '999px', flexShrink: 0 },
  reqChipCount: { color: '#9ca3af', fontWeight: 700 },

  reqGroupCard: { border: '1px solid #eeeee6', borderRadius: '10px', overflow: 'hidden' as const },
  reqGroupHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0.7rem 0.9rem', border: 'none', backgroundColor: '#f9fafb', cursor: 'pointer', textAlign: 'left' as const },
  reqGroupHeaderLabel: { fontSize: '0.84rem', fontWeight: 700, color: '#16170f' },
  reqGroupHeaderTotal: { fontSize: '0.84rem', fontWeight: 700, color: '#3f6510' },
  reqAsignarLoteBadge: { display: 'inline-flex', padding: '0.25rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, backgroundColor: '#fef3c7', border: '1px dashed #fde68a', color: '#c2730c', cursor: 'pointer', whiteSpace: 'nowrap' as const },

  reqFooterBar: { position: 'sticky' as const, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '1rem 1.5rem', backgroundColor: '#fff', borderTop: '1px solid #eeeee6', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px', flexWrap: 'wrap' as const },
  reqFooterCount: { fontSize: '0.8rem', fontWeight: 600, color: '#6b7280' },

  countBadge: { backgroundColor: '#e5e7eb', color: '#6b7280', fontSize: '0.72rem', fontWeight: 700, minWidth: '1.4rem', height: '1.4rem', padding: '0 0.4rem', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },

  infoSectionBox: { backgroundColor: '#f9fafb', border: '1px solid #eeeee6', borderRadius: '10px', padding: '1.25rem' },
  detalleGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '1.25rem 1.5rem' },
  detalleItem: { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem' },
  detalleLabel: { fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  detalleValue: { fontSize: '0.9375rem', fontWeight: 400, color: '#16170f', lineHeight: 1.4, wordBreak: 'break-word' as const },
  tagPill: { display: 'inline-flex', alignSelf: 'flex-start' as const, alignItems: 'center', padding: '0.4rem 0.75rem', borderRadius: '999px', fontSize: '0.82rem', fontWeight: 600, lineHeight: 1.3, backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510' },

  emptySection: { textAlign: 'center' as const, padding: '1.5rem', color: '#9ca3af', fontSize: '0.85rem', backgroundColor: '#f9fafb', borderRadius: '10px' },

  consumosTableWrap: { overflow: 'auto' as const, maxHeight: '320px', borderRadius: '10px', border: '1px solid #eeeee6' },
  consumosTable: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.78rem' },
  consumosTh: { padding: '0.55rem 0.75rem', textAlign: 'left' as const, fontWeight: 700, color: '#9ca3af', fontSize: '0.65rem', textTransform: 'uppercase' as const, letterSpacing: '0.03em', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' as const, position: 'sticky' as const, top: 0 },
  consumosTd: { padding: '0.55rem 0.75rem', borderBottom: '1px solid #f3f4f0', color: '#33342a', whiteSpace: 'nowrap' as const },
  consumosTdTruncate: { overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, maxWidth: '220px' },
  addInsumoBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%', marginTop: '0.75rem', padding: '0.6rem', border: '1px dashed #c9dba3', borderRadius: '10px', backgroundColor: '#f9fbf6', color: '#4f6b17', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' },
  insumoDraftRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.6rem 0.85rem', backgroundColor: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '8px' },
  insumoDraftText: { fontSize: '0.8rem', fontWeight: 600, color: '#374151' },

  formGroup: { display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' },
  formLabel: { fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  formInput: { padding: '0.75rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const },
  inputError: { border: '1.5px solid #dc2626' },
  errorText: { fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 },
  readOnlyField: { padding: '0.75rem', border: '1.5px solid #f3f4f6', borderRadius: '8px', fontSize: '0.875rem', backgroundColor: '#f9fafb', color: '#374151', fontWeight: 600 },

  pickBtnGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' },
  pickBtn: { padding: '0.5rem 0.9rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', color: '#6b7280', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', outline: 'none', boxShadow: 'none' },
  pickBtnActive: { backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510' },

  medicoDropdown: { position: 'absolute' as const, top: 'calc(100% + 0.35rem)', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto' as const, zIndex: 20 },
  medicoDropdownItem: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.75rem', fontSize: '0.85rem', fontWeight: 600, color: '#333', cursor: 'pointer' },

  stepperWrap: { position: 'relative' as const },
  stepperBtns: { position: 'absolute' as const, right: '0.5rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '0.35rem' },
  stepperBtn: { width: '1.75rem', height: '1.75rem', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '1rem', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  rowDeleteBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1.6rem', height: '1.6rem', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', color: '#6b7280' },

  cancelBtn: { padding: '0.5rem 1.5rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: '#333' },
  saveBtn: { padding: '0.5rem 1.5rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
  deleteConfirmBtn: { padding: '0.5rem 1.5rem', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
};
