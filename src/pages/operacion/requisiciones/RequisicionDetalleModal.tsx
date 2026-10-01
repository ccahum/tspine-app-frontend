import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader, FileText, X, Plus, Pencil, Trash2, AlertCircle, Check } from 'lucide-react';
import { MaterialIcon } from '../../../components/icons/MaterialIcon';
import SuccessToast from '../../../components/SuccessToast';
import DatePicker from '../../../components/DatePicker';
import {
  remisionesService,
  type RequisicionItem,
  type DetRequisicionItem,
  type LoteOption,
  type ProductoOption,
  type CubrimientoOption,
  type TarifaOption,
} from '../../../services/remisiones.service';

const formatProductoLabel = (p: ProductoOption): string =>
  p.referencia ? `${p.referencia} / ${p.nombre}` : p.nombre ?? '-';

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

const PRECIO_POR_CUBRIMIENTO: Record<string, keyof ProductoOption> = {
  PARTICULARES: 'particulares',
  HOSPITALES: 'hospitales',
  DISTRIBUIDOR: 'distribuidor',
  ASEGURADORA: 'aseguradora',
};

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
  const queryClient = useQueryClient();
  const [mainTab, setMainTab] = useState<'general' | 'insumos'>('general');
  const [hoveredPdfBtn, setHoveredPdfBtn] = useState<'pdf' | 'sos' | null>(null);
  const [selectedInsumo, setSelectedInsumo] = useState<DetRequisicionItem | null>(null);
  const [hoveredInsumoId, setHoveredInsumoId] = useState<string | null>(null);
  const [confirmDeleteInsumoId, setConfirmDeleteInsumoId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const bodyContentRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState<number | null>(null);

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
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Anima el alto del contenedor del body al cambiar de pestaña, en vez de saltar de golpe.
  useEffect(() => {
    const el = bodyContentRef.current;
    if (!el) return;
    const resizeObserver = new ResizeObserver(() => {
      setBodyHeight(el.scrollHeight);
    });
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [!!req]);

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
      onClose();
    },
    onError: (err: any) => {
      setDeleteError(err?.response?.data?.message ?? 'No se pudo eliminar la requisición.');
    },
  });

  const deleteDetRequisicionMutation = useMutation({
    mutationFn: (detId: string) => remisionesService.deleteDetRequisicion(detId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisicion-detalles', id] });
      setConfirmDeleteInsumoId(null);
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
    setShowEditModal(true);
  };

  const handleGuardarEdit = () => {
    if (!editFecha) { setEditError({ field: 'fecha', message: 'Selecciona la fecha.' }); return; }
    if (!editCubrimiento) { setEditError({ field: 'cubrimiento', message: 'Selecciona el cubrimiento.' }); return; }
    if (!editTarifaId) { setEditError({ field: 'tarifa', message: 'Selecciona la tarifa.' }); return; }
    setEditError(null);
    updateRequisicionMutation.mutate();
  };

  const [showInsumoModal, setShowInsumoModal] = useState(false);
  const [editingInsumoId, setEditingInsumoId] = useState<string | null>(null);
  const [insumoLote, setInsumoLote] = useState<LoteOption | null>(null);
  const [loteSearch, setLoteSearch] = useState('');
  const [loteFocused, setLoteFocused] = useState(false);
  const [insumoProducto, setInsumoProducto] = useState<ProductoOption | null>(null);
  const [productoSearch, setProductoSearch] = useState('');
  const [productoFocused, setProductoFocused] = useState(false);
  const [productoHighlighted, setProductoHighlighted] = useState(0);
  const productoOptionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [insumoCantidad, setInsumoCantidad] = useState('');
  const [insumoPrecio, setInsumoPrecio] = useState('');
  const [insumoError, setInsumoError] = useState<{ field: string; message: string } | null>(null);

  useEffect(() => {
    if (!editError) return;
    document.getElementById(`edit-requisicion-field-${editError.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [editError]);

  const { data: loteResults = [] } = useQuery<LoteOption[]>({
    queryKey: ['lotes', loteSearch],
    queryFn: () => remisionesService.searchLotes(loteSearch),
    enabled: showInsumoModal,
  });

  // Misma tarifa que ya usa createDetRequisicionMutation para tarifaAsociadaId: la del formulario
  // de edición si está abierto (puede no estar guardada todavía), si no la ya guardada.
  const insumoTarifaId = (showEditModal ? editTarifaId : req?.tarifaId) || undefined;
  const { data: productoResults = [] } = useQuery<ProductoOption[]>({
    queryKey: ['productos', productoSearch, insumoTarifaId],
    queryFn: () => remisionesService.searchProductos(productoSearch, insumoTarifaId),
    enabled: showInsumoModal,
  });
  useEffect(() => { setProductoHighlighted(0); }, [productoResults.length, productoSearch]);
  useEffect(() => { productoOptionRefs.current[productoHighlighted]?.scrollIntoView({ block: 'nearest' }); }, [productoHighlighted]);

  const createDetRequisicionMutation = useMutation({
    mutationFn: () => remisionesService.createDetRequisicion({
      requisicionId: id,
      loteId: insumoLote?.id,
      productoId: insumoProducto?.id,
      tarifaAsociadaId: (showEditModal ? editTarifaId : req?.tarifaId) || undefined,
      cantidad: Number(insumoCantidad),
      precio: Number(insumoPrecio),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisicion-detalles', id] });
      setShowInsumoModal(false);
    },
  });

  const updateDetRequisicionMutation = useMutation({
    mutationFn: () => remisionesService.updateDetRequisicion(editingInsumoId!, {
      loteId: insumoLote?.id,
      productoId: insumoProducto?.id,
      cantidad: Number(insumoCantidad),
      precio: Number(insumoPrecio),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisicion-detalles', id] });
      setShowInsumoModal(false);
    },
  });

  const openInsumoModal = () => {
    setEditingInsumoId(null);
    setInsumoLote(null);
    setLoteSearch('');
    setInsumoProducto(null);
    setProductoSearch('');
    setInsumoCantidad('');
    setInsumoPrecio('');
    setInsumoError(null);
    setShowInsumoModal(true);
  };

  const openEditInsumoModal = (d: DetRequisicionItem) => {
    setEditingInsumoId(d.id);
    setInsumoLote(d.loteId ? { id: d.loteId, lote: d.lote } : null);
    setLoteSearch('');
    setInsumoProducto(d.productoId ? {
      id: d.productoId,
      nombre: d.producto,
      referencia: d.referencia,
      particulares: null,
      hospitales: null,
      distribuidor: null,
      aseguradora: null,
      sistema: d.sistema,
      categoria: d.categoria,
    } : null);
    setProductoSearch('');
    setInsumoCantidad(d.cantidad !== null ? String(d.cantidad) : '');
    setInsumoPrecio(d.precio !== null ? String(d.precio) : '');
    setInsumoError(null);
    setShowInsumoModal(true);
  };

  const handleSelectProducto = (p: ProductoOption) => {
    setInsumoProducto(p);
    setProductoSearch('');
    setInsumoError(null);
    // Precio de la tarifa específica de la requisición (ListaPrecio) si existe; si ese producto no
    // tiene precio cargado para esa tarifa puntual, se cae a la columna genérica por categoría de
    // cubrimiento (mismo respaldo de siempre). Usa el cubrimiento vigente en pantalla (el del
    // formulario de edición si está abierto, aunque no se haya guardado, no el ya guardado).
    const cubrimientoVigente = showEditModal ? editCubrimiento?.nombre : req?.cubrimiento;
    const key = PRECIO_POR_CUBRIMIENTO[(cubrimientoVigente ?? '').trim().toUpperCase()];
    const precio = p.precioSugerido ?? (key ? p[key] : null);
    setInsumoPrecio(precio !== null && precio !== undefined ? String(precio) : '');
  };

  const handleGuardarInsumo = () => {
    if (!insumoLote) { setInsumoError({ field: 'lote', message: 'Selecciona un lote válido de la lista.' }); return; }
    if (!insumoProducto) { setInsumoError({ field: 'producto', message: 'Selecciona un producto válido de la lista.' }); return; }
    if (!insumoCantidad || Number(insumoCantidad) <= 0) { setInsumoError({ field: 'cantidad', message: 'La cantidad debe ser mayor a cero.' }); return; }
    if (!insumoPrecio || Number(insumoPrecio) <= 0) { setInsumoError({ field: 'precio', message: 'El precio debe ser mayor a cero.' }); return; }
    setInsumoError(null);
    if (editingInsumoId) {
      updateDetRequisicionMutation.mutate();
    } else {
      createDetRequisicionMutation.mutate();
    }
  };

  useEffect(() => {
    if (!insumoError) return;
    document.getElementById(`insumo-field-${insumoError.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [insumoError]);

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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0, flex: 1 }}>
                    <div style={styles.titleIconBadge}>
                      <MaterialIcon name="inventory_2" size={20} color="#4d7a13" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', minWidth: 0 }}>
                      <span style={styles.titleLabel}>Requisición</span>
                      <h2 style={styles.title}>{req.id}</h2>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                    <button
                      className="btn-press"
                      style={{ ...styles.btnPill, ...(hoveredPdfBtn === 'pdf' ? styles.btnPillHover : {}) }}
                      onMouseEnter={() => setHoveredPdfBtn('pdf')}
                      onMouseLeave={() => setHoveredPdfBtn(null)}
                    >
                      <FileText size={15} color="#4d7a13" /> Crear PDF
                    </button>
                    <button
                      className="btn-press"
                      style={{ ...styles.btnPill, ...(hoveredPdfBtn === 'sos' ? styles.btnPillHover : {}) }}
                      onMouseEnter={() => setHoveredPdfBtn('sos')}
                      onMouseLeave={() => setHoveredPdfBtn(null)}
                    >
                      <FileText size={15} color="#4d7a13" /> PDF S.O.S
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

                    <button style={styles.closeBtn} onClick={onClose}>
                      <X size={18} />
                    </button>
                  </div>
                </div>

                <div style={styles.summaryBar}>
                  <div style={styles.summaryBarItem}>
                    <span style={styles.detalleLabel}>Fecha</span>
                    <span style={styles.summaryBarValue}>{formatDate(req.fecha)}</span>
                  </div>
                  <div style={styles.summaryBarItem}>
                    <span style={styles.detalleLabel}>Status</span>
                    <span style={styles.summaryBarValue}>{req.status || '-'}</span>
                  </div>
                  <div style={styles.summaryBarItem}>
                    <span style={styles.detalleLabel}>Cubrimiento</span>
                    <span style={styles.summaryBarValue}>{req.cubrimiento || '-'}</span>
                  </div>
                  <div style={styles.summaryBarItem}>
                    <span style={styles.detalleLabel}>Tarifa</span>
                    <span style={{ ...styles.summaryBarValue, fontWeight: 700, color: '#3f6510' }}>{req.tarifa || '-'}</span>
                  </div>
                </div>

                <div style={styles.infoTabBar}>
                  <button type="button" style={{ ...styles.infoTabBtn, ...(mainTab === 'general' ? styles.infoTabBtnActive : styles.infoTabBtnInactive) }} onClick={() => setMainTab('general')}>
                    Información General
                  </button>
                  <button type="button" style={{ ...styles.infoTabBtn, ...(mainTab === 'insumos' ? styles.infoTabBtnActive : styles.infoTabBtnInactive) }} onClick={() => setMainTab('insumos')}>
                    Insumos
                    <span style={{ ...styles.countBadge, ...(mainTab === 'insumos' ? styles.countBadgeActive : {}) }}>{detalles.length}</span>
                  </button>
                </div>
              </div>

              <div style={{ overflow: 'hidden', transition: 'height 0.28s cubic-bezier(0.4, 0, 0.2, 1)', ...(bodyHeight !== null ? { height: `${bodyHeight}px` } : {}) }}>
              <div ref={bodyContentRef} style={styles.modalBody}>
              <div key={mainTab} className="page-fade-in">
                {mainTab === 'general' && (
                  <div style={styles.infoSectionBox}>
                    <div style={styles.detalleGrid}>
                      <DetalleItem label="ID Movimiento" value={req.id} />
                      <DetalleItem label="Marca de Tiempo" value={formatDateTime(req.marcaDeTiempo)} />
                      <TagItem label="Usuario" value={req.usuario || '-'} />
                      <DetalleItem label="Proviene de Programación?" value={req.provieneDeProgramacion === null ? '-' : req.provieneDeProgramacion ? 'SI' : 'NO'} />
                      <DetalleItem label="No Programación" value={req.folio || '-'} />
                      <DetalleItem label="Validación" value={req.validacion || '-'} />
                      <DetalleItem label="Existe Programación?" value={req.existeProgramacion === null ? '-' : req.existeProgramacion ? 'SI' : 'NO'} />
                      <TagItem label="Contacto" value={req.contacto || '-'} />
                      <DetalleItem label="Sede Origen" value={req.sedeOrigen || '-'} />
                      <DetalleItem label="Año" value={req.anio || '-'} />
                      <DetalleItem label="Mes" value={req.mes || '-'} />
                    </div>
                  </div>
                )}

                {mainTab === 'insumos' && (
                  <>
                    {detalles.length === 0 ? (
                      <div style={styles.emptySection}>No hay datos relacionados</div>
                    ) : (
                      <div style={styles.consumosTableWrap}>
                        <table style={styles.consumosTable}>
                          <thead>
                            <tr>
                              <th style={styles.consumosTh}>Producto</th>
                              <th style={styles.consumosTh}>Descripción</th>
                              <th style={styles.consumosTh}>Categoría</th>
                              <th style={styles.consumosTh}>Sistema</th>
                              <th style={styles.consumosTh}>Lote</th>
                              <th style={{ ...styles.consumosTh, textAlign: 'right' as const }}>Cantidad</th>
                              <th style={{ ...styles.consumosTh, textAlign: 'right' as const }}>Precio</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detalles.map(d => (
                              <tr
                                key={d.id}
                                style={{ cursor: 'pointer', ...(hoveredInsumoId === d.id ? { backgroundColor: '#f3faec' } : {}) }}
                                onMouseEnter={() => setHoveredInsumoId(d.id)}
                                onMouseLeave={() => setHoveredInsumoId(null)}
                                onClick={() => setSelectedInsumo(d)}
                              >
                                <td style={{ ...styles.consumosTd, fontWeight: 700, color: '#3f6510' }}>{d.referencia ?? d.producto ?? '-'}</td>
                                <td style={{ ...styles.consumosTd, ...styles.consumosTdTruncate }} title={d.descripcion ?? undefined}>{d.descripcion ?? '-'}</td>
                                <td style={styles.consumosTd}>{d.categoria ?? '-'}</td>
                                <td style={styles.consumosTd}>{d.sistema ?? '-'}</td>
                                <td style={styles.consumosTd}>{d.lote ?? '-'}</td>
                                <td style={{ ...styles.consumosTd, textAlign: 'right' as const }}>{d.cantidad ?? '-'}</td>
                                <td style={{ ...styles.consumosTd, textAlign: 'right' as const, fontWeight: 700 }}>{formatMoney(d.precio)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <button type="button" className="btn-press" style={styles.addInsumoBtn} onClick={openInsumoModal}>
                      <Plus size={14} /> Agregar Insumo
                    </button>
                  </>
                )}
              </div>
              </div>
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
                <div style={styles.detalleGrid}>
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

            <div style={styles.modalBody}>
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
                {detalles.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.5rem', marginBottom: '0.5rem' }}>
                    {detalles.map(d => (
                      <div key={d.id} style={styles.insumoDraftRow}>
                        {confirmDeleteInsumoId === d.id ? (
                          <>
                            <span style={{ ...styles.insumoDraftText, color: '#6b7280' }}>¿Eliminar este insumo?</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                              <button
                                type="button"
                                style={{ ...styles.rowDeleteBtn, color: '#dc2626' }}
                                disabled={deleteDetRequisicionMutation.isPending}
                                onClick={() => deleteDetRequisicionMutation.mutate(d.id)}
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
                          </>
                        ) : (
                          <>
                            <span style={styles.insumoDraftText}>
                              {d.referencia ?? d.producto ?? 'Sin producto'} — {d.cantidad ?? 0} × {formatMoney(d.precio)}
                              {d.lote ? ` (Lote: ${d.lote})` : ''}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                              <Pencil size={14} style={{ cursor: 'pointer', color: '#6b7280' }} onClick={() => openEditInsumoModal(d)} />
                              <Trash2 size={14} style={{ cursor: 'pointer', color: '#dc2626' }} onClick={() => setConfirmDeleteInsumoId(d.id)} />
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" style={styles.addInsumoBtn} onClick={openInsumoModal}>
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
                disabled={updateRequisicionMutation.isPending}
              >
                {updateRequisicionMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <SuccessToast show={showEditSuccess} message="Requisición editada" onClose={() => setShowEditSuccess(false)} />

      {showInsumoModal && (
        <div className="modal-overlay-anim" style={{ ...styles.modalOverlay, zIndex: 10100 }}>
          <div className="modal-content-anim" style={styles.subModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.subModalHeader}>
              <h2 style={styles.modalTitle}>{editingInsumoId ? 'Editar Insumo' : 'Nuevo insumo'}</h2>
              <button style={styles.closeBtn} onClick={() => setShowInsumoModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Movimiento *</label>
                <span style={styles.readOnlyField}>{req?.id}</span>
              </div>

              <div style={styles.formGroup} id="insumo-field-lote">
                <label style={styles.formLabel}>Lote</label>
                {insumoLote ? (
                  <div>
                    <span style={styles.tagPill}>
                      {insumoLote.lote}
                      <X size={12} style={{ cursor: 'pointer', marginLeft: '0.4rem' }} onClick={() => setInsumoLote(null)} />
                    </span>
                  </div>
                ) : (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      style={{ ...styles.formInput, ...(insumoError?.field === 'lote' ? styles.inputError : {}) }}
                      placeholder="Buscar lote..."
                      value={loteSearch}
                      onChange={e => { setLoteSearch(e.target.value); setInsumoError(null); }}
                      onFocus={() => setLoteFocused(true)}
                      onBlur={() => setTimeout(() => setLoteFocused(false), 150)}
                    />
                    {loteFocused && (
                      <div style={styles.medicoDropdown}>
                        {loteResults.length === 0 ? (
                          <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                        ) : (
                          loteResults.map(l => (
                            <div key={l.id} style={styles.medicoDropdownItem} onMouseDown={e => e.preventDefault()} onClick={() => { setInsumoLote(l); setLoteSearch(''); }}>
                              {l.lote}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                {insumoError?.field === 'lote' && <span style={styles.errorText}>{insumoError.message}</span>}
              </div>

              <div style={styles.formGroup} id="insumo-field-producto">
                <label style={styles.formLabel}>Producto</label>
                {!insumoLote ? (
                  <span style={{ ...styles.formInput, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>Selecciona primero un lote</span>
                ) : insumoProducto ? (
                  <div>
                    <span style={styles.tagPill}>
                      {formatProductoLabel(insumoProducto)}
                      <X size={12} style={{ cursor: 'pointer', marginLeft: '0.4rem' }} onClick={() => setInsumoProducto(null)} />
                    </span>
                  </div>
                ) : (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      style={{ ...styles.formInput, ...(insumoError?.field === 'producto' ? styles.inputError : {}) }}
                      placeholder="Buscar por clave, nombre o sistema..."
                      value={productoSearch}
                      onChange={e => { setProductoSearch(e.target.value); setInsumoError(null); }}
                      onFocus={() => setProductoFocused(true)}
                      onBlur={() => setTimeout(() => setProductoFocused(false), 150)}
                      onKeyDown={e => {
                        if (!productoFocused || productoResults.length === 0) return;
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setProductoHighlighted(i => Math.min(i + 1, productoResults.length - 1));
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setProductoHighlighted(i => Math.max(i - 1, 0));
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          const p = productoResults[productoHighlighted];
                          if (p) handleSelectProducto(p);
                        }
                      }}
                    />
                    {productoFocused && (
                      <div style={styles.medicoDropdown}>
                        {productoResults.length === 0 ? (
                          <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                        ) : (
                          productoResults.map((p, i) => (
                            <div
                              key={p.id}
                              ref={el => { productoOptionRefs.current[i] = el; }}
                              style={{ ...styles.medicoDropdownItem, justifyContent: 'space-between' as const, ...(i === productoHighlighted ? { backgroundColor: '#e9f2d8', color: '#3f6510' } : {}) }}
                              onMouseDown={e => e.preventDefault()}
                              onMouseEnter={() => setProductoHighlighted(i)}
                              onClick={() => handleSelectProducto(p)}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                                {p.referencia && <span style={{ color: '#3f6510' }}>{p.referencia}</span>}
                                {p.referencia ? ' / ' : ''}{p.nombre}
                              </span>
                              {p.sistema && <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#9ca3af', whiteSpace: 'nowrap' as const, flexShrink: 0 }}>{p.sistema}</span>}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                {insumoError?.field === 'producto' && <span style={styles.errorText}>{insumoError.message}</span>}
              </div>

              {insumoProducto && (
                <>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Sistema</label>
                    <span style={styles.readOnlyField}>{insumoProducto.sistema || '-'}</span>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Referencia</label>
                    <span style={styles.readOnlyField}>{insumoProducto.referencia || '-'}</span>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Descripción</label>
                    <span style={styles.readOnlyField}>{insumoProducto.nombre || '-'}</span>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Categoría</label>
                    <span style={styles.readOnlyField}>{insumoProducto.categoria || '-'}</span>
                  </div>
                </>
              )}

              <div style={styles.formGroup} id="insumo-field-cantidad">
                <label style={styles.formLabel}>Cantidad *</label>
                {!insumoProducto ? (
                  <span style={{ ...styles.formInput, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>Selecciona primero un producto</span>
                ) : (
                  <div style={styles.stepperWrap}>
                    <input
                      type="number"
                      style={{ ...styles.formInput, paddingRight: '5rem', ...(insumoError?.field === 'cantidad' ? styles.inputError : {}) }}
                      placeholder="0"
                      value={insumoCantidad}
                      onChange={e => { setInsumoCantidad(e.target.value); setInsumoError(null); }}
                    />
                    <div style={styles.stepperBtns}>
                      <button type="button" style={styles.stepperBtn} onClick={() => { setInsumoCantidad(String((Number(insumoCantidad) || 0) - 1)); setInsumoError(null); }}>−</button>
                      <button type="button" style={styles.stepperBtn} onClick={() => { setInsumoCantidad(String((Number(insumoCantidad) || 0) + 1)); setInsumoError(null); }}>+</button>
                    </div>
                  </div>
                )}
                {insumoError?.field === 'cantidad' && <span style={styles.errorText}>{insumoError.message}</span>}
              </div>

              <div style={styles.formGroup} id="insumo-field-precio">
                <label style={styles.formLabel}>Precio *</label>
                <span style={styles.readOnlyField}>{insumoPrecio ? formatMoney(Number(insumoPrecio)) : '-'}</span>
                {insumoError?.field === 'precio' && <span style={styles.errorText}>{insumoError.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Tarifa Asociada</label>
                <span style={styles.readOnlyField}>{showEditModal ? (tarifasCubrimiento.find(t => t.id === editTarifaId)?.nombre ?? req?.tarifa ?? '-') : (req?.tarifa ?? '-')}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Fecha</label>
                <span style={styles.readOnlyField}>{formatDate(showEditModal ? (editFecha || req?.fecha || null) : (req?.fecha ?? null))}</span>
              </div>
            </div>

            <div style={styles.subModalFooter}>
              <button style={styles.cancelBtn} onClick={() => setShowInsumoModal(false)}>Cancelar</button>
              <button
                style={styles.saveBtn}
                onClick={handleGuardarInsumo}
                disabled={createDetRequisicionMutation.isPending || updateDetRequisicionMutation.isPending}
              >
                {(createDetRequisicionMutation.isPending || updateDetRequisicionMutation.isPending) ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '2rem' },
  modalContent: { backgroundColor: '#fff', borderRadius: '16px', width: '90%', maxWidth: '900px', maxHeight: '90dvh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  subModalContent: { backgroundColor: '#fff', borderRadius: '16px', width: '90%', maxWidth: '640px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  subModalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #eeeee6', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', position: 'sticky' as const, top: 0 },
  subModalFooter: { display: 'flex', gap: '0.75rem', padding: '1.25rem 1.5rem', borderTop: '1px solid #eeeee6', justifyContent: 'flex-end' as const },
  modalTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#16170f', margin: 0 },
  modalBody: { padding: '1.5rem' },
  closeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: 'none', backgroundColor: '#f4f4ee', borderRadius: '8px', cursor: 'pointer', color: '#6b6b60', flexShrink: 0 },

  headerCard: { borderBottom: '1px solid #eeeee6', padding: '1.5rem 1.5rem 1.25rem', position: 'sticky' as const, top: 0, backgroundColor: '#fff', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', zIndex: 1 },
  headerTopRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' as const, marginBottom: '1.25rem' },
  titleIconBadge: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', flexShrink: 0 },
  titleLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  title: { fontSize: '1.05rem', fontWeight: 700, color: '#16170f', margin: 0, lineHeight: 1.3 },

  btnPill: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1rem', border: '1px solid #e5e7eb', borderRadius: '12px', backgroundColor: '#fff', color: '#33342a', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0, transition: 'background-color 0.15s' },
  btnPillHover: { backgroundColor: '#f4f4ee' },
  headerDivider: { width: '1px', height: '26px', backgroundColor: '#e9ece0', flexShrink: 0 },
  iconMenuBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: '1px solid #e5e7eb', borderRadius: '999px', cursor: 'pointer', color: '#33342a', flexShrink: 0, backgroundColor: '#fff' },
  moreMenuDropdown: { position: 'absolute' as const, top: 'calc(100% + 8px)', right: 0, backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: '210px', overflow: 'hidden', zIndex: 200, padding: '0.35rem' },
  moreMenuItem: { display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.6rem 0.75rem', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.84375rem', color: '#33342a', fontWeight: 600, textAlign: 'left' as const },
  moreMenuItemDanger: { color: '#a8503c' },
  moreMenuDivider: { height: '1px', backgroundColor: '#eeeee6', margin: '0.3rem 0' },

  summaryBar: { backgroundColor: '#f9fafb', border: '1px solid #eeeee6', borderRadius: '10px', padding: '1rem 1.25rem', display: 'flex', flexWrap: 'wrap' as const, gap: '1.75rem' },
  summaryBarItem: { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem' },
  summaryBarValue: { fontSize: '0.9375rem', fontWeight: 600, color: '#16170f' },

  countBadge: { backgroundColor: '#e5e7eb', color: '#6b7280', fontSize: '0.72rem', fontWeight: 700, minWidth: '1.4rem', height: '1.4rem', padding: '0 0.4rem', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  countBadgeActive: { backgroundColor: '#e9f2d8', color: '#3f6510' },

  infoTabBar: { display: 'flex', gap: '0.25rem', borderBottom: '1px solid #eeeee6', marginTop: '1.25rem' },
  infoTabBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.75rem 1rem', border: 'none', background: 'transparent', fontSize: '0.84375rem', fontWeight: 600, cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: '-1px', outline: 'none', boxShadow: 'none' },
  infoTabBtnActive: { color: '#4d7a13', borderBottomColor: '#4d7a13' },
  infoTabBtnInactive: { color: '#6b7280', borderBottomColor: 'transparent' },

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
