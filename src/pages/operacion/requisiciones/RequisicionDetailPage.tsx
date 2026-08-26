import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader, FileText, X, Plus, Pencil, CheckCircle, Circle, Trash2, AlertCircle } from 'lucide-react';
import Layout from '../../../components/layout/Layout';
import SuccessToast from '../../../components/SuccessToast';
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

export default function RequisicionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [hoveredPdfBtn, setHoveredPdfBtn] = useState<'pdf' | 'sos' | null>(null);
  const [hoveredEditBtn, setHoveredEditBtn] = useState(false);
  const [hoveredDeleteBtn, setHoveredDeleteBtn] = useState(false);
  const [selectedInsumo, setSelectedInsumo] = useState<DetRequisicionItem | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: req, isLoading, error } = useQuery<RequisicionItem | null>({
    queryKey: ['requisicion-detalle', id],
    queryFn: () => remisionesService.getRequisicionDetalle(id!),
    enabled: !!id,
  });

  const { data: detalles = [] } = useQuery<DetRequisicionItem[]>({
    queryKey: ['requisicion-detalles', id],
    queryFn: () => remisionesService.findDetallesByRequisicion(id!),
    enabled: !!id,
  });

  const [showEditModal, setShowEditModal] = useState(false);
  const [editFecha, setEditFecha] = useState('');
  const [editCubrimiento, setEditCubrimiento] = useState<CubrimientoOption | null>(null);
  const [editTarifaId, setEditTarifaId] = useState('');
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

  const updateRequisicionMutation = useMutation({
    mutationFn: () => remisionesService.updateRequisicion(id!, {
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
    mutationFn: () => remisionesService.deleteRequisicion(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisiciones'] });
      navigate(-1);
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
    setEditError(null);
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
  const [insumoProducto, setInsumoProducto] = useState<ProductoOption | null>(null);
  const [productoSearch, setProductoSearch] = useState('');
  const [insumoCantidad, setInsumoCantidad] = useState('');
  const [insumoPrecio, setInsumoPrecio] = useState('');
  const [insumoError, setInsumoError] = useState<{ field: string; message: string } | null>(null);

  useEffect(() => {
    document.body.style.overflow = (showInsumoModal || showEditModal || !!selectedInsumo || showDeleteConfirm) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showInsumoModal, showEditModal, selectedInsumo, showDeleteConfirm]);

  useEffect(() => {
    if (!editError) return;
    document.getElementById(`edit-requisicion-field-${editError.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [editError]);

  const { data: loteResults = [] } = useQuery<LoteOption[]>({
    queryKey: ['lotes', loteSearch],
    queryFn: () => remisionesService.searchLotes(loteSearch),
    enabled: showInsumoModal,
  });

  const { data: productoResults = [] } = useQuery<ProductoOption[]>({
    queryKey: ['productos', productoSearch],
    queryFn: () => remisionesService.searchProductos(productoSearch),
    enabled: showInsumoModal,
  });

  const createDetRequisicionMutation = useMutation({
    mutationFn: () => remisionesService.createDetRequisicion({
      requisicionId: id!,
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
    const key = PRECIO_POR_CUBRIMIENTO[(req?.cubrimiento ?? '').trim().toUpperCase()];
    const precio = key ? p[key] : null;
    setInsumoPrecio(precio !== null && precio !== undefined ? String(precio) : '');
  };

  const handleGuardarInsumo = () => {
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

  if (isLoading) return <Layout><div style={{ padding: '2rem', textAlign: 'center' }}><Loader className="spinner" size={32} /></div></Layout>;
  if (error) return <Layout><div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>Error al cargar: {(error as any)?.message || 'Error desconocido'}</div></Layout>;
  if (!req) return <Layout><div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>Requisición no encontrada</div></Layout>;

  return (
    <Layout>
      <div style={styles.container}>
        <div style={styles.header}>
          <button onClick={() => navigate(-1)} style={styles.backBtn}>
            <ArrowLeft size={18} />
          </button>
          <div style={styles.titleGroup}>
            <h1 style={styles.title}>Requisición</h1>
          </div>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <div style={styles.sectionTitleRow}>
            <h2 style={styles.sectionTitle}>Información General</h2>
            <button
              className="btn-press"
              style={{ ...styles.editBtn, ...(hoveredEditBtn ? styles.editBtnHover : {}) }}
              onMouseEnter={() => setHoveredEditBtn(true)}
              onMouseLeave={() => setHoveredEditBtn(false)}
              onClick={openEditModal}
            >
              <Pencil size={16} /> Editar
            </button>
            <button
              className="btn-press"
              style={{ ...styles.btnDanger, ...(hoveredDeleteBtn ? styles.btnDangerHover : {}) }}
              onMouseEnter={() => setHoveredDeleteBtn(true)}
              onMouseLeave={() => setHoveredDeleteBtn(false)}
              onClick={() => { setDeleteError(null); setShowDeleteConfirm(true); }}
            >
              <Trash2 size={16} /> Eliminar
            </button>
          </div>
          <div style={styles.infoCardGrid}>
            <div style={styles.gridField}><span style={styles.label}>ID Movimiento</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{req.id}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Marca de Tiempo</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatDateTime(req.marcaDeTiempo)}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Usuario</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{req.usuario || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Fecha</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatDate(req.fecha)}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Status</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{req.status || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Proviene de Programación?</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{req.provieneDeProgramacion === null ? '-' : req.provieneDeProgramacion ? 'SI' : 'NO'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>No Programación</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{req.folio || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Validación</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{req.validacion || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Existe Programación?</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{req.existeProgramacion === null ? '-' : req.existeProgramacion ? 'SI' : 'NO'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Cubrimiento</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{req.cubrimiento || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Tarifa</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{req.tarifa || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Contacto</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{req.contacto || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Sede Origen</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{req.sedeOrigen || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Año</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{req.anio || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Mes</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{req.mes || '-'}</span></div>
          </div>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <div style={styles.sectionTitleRow}>
            <h2 style={styles.sectionTitle}>Detalle de la Requisición</h2>
            <span style={styles.badge}>{detalles.length}</span>
          </div>
          {detalles.length === 0 ? (
            <div style={styles.detalleReqCard}>
              <div style={styles.detalleReqEmpty}>No hay datos relacionados</div>
            </div>
          ) : (
            <div style={styles.detalleReqCard}>
              <div style={{ overflowX: 'auto' as const }}>
                <div style={{ ...styles.insumoRow, ...styles.colHeader }}>
                  <span style={styles.colHeaderText}>Producto</span>
                  <span style={styles.colHeaderText}>Descripción</span>
                  <span style={styles.colHeaderText}>Categoría</span>
                  <span style={styles.colHeaderText}>Sistema</span>
                  <span style={styles.colHeaderText}>Lote</span>
                  <span style={styles.colHeaderText}>Cantidad</span>
                  <span style={styles.colHeaderText}>Precio</span>
                </div>
                {detalles.map((d, i) => (
                  <div
                    key={d.id}
                    style={{ ...styles.insumoRow, ...(i > 0 ? styles.rowBorder : {}), cursor: 'pointer' }}
                    onClick={() => setSelectedInsumo(d)}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <span style={styles.cellText}>{d.referencia ?? d.producto ?? '-'}</span>
                    <span style={styles.cellText}>{d.descripcion ?? '-'}</span>
                    <span style={styles.cellText}>{d.categoria ?? '-'}</span>
                    <span style={styles.cellText}>{d.sistema ?? '-'}</span>
                    <span style={styles.cellText}>{d.lote ?? '-'}</span>
                    <span style={styles.cellText}>{d.cantidad ?? '-'}</span>
                    <span style={styles.cellText}>{formatMoney(d.precio)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button style={styles.addInsumoBtn} onClick={openInsumoModal}>
            <Plus size={14} /> Agregar Insumo
          </button>
        </div>

        <div style={styles.pdfBtnRow}>
          <button
            style={{ ...styles.crearPdfBtn, ...(hoveredPdfBtn === 'pdf' ? styles.crearPdfBtnHover : {}) }}
            onMouseEnter={() => setHoveredPdfBtn('pdf')}
            onMouseLeave={() => setHoveredPdfBtn(null)}
          >
            <FileText size={16} /> Crear PDF
          </button>
          <button
            style={{ ...styles.crearPdfBtn, ...(hoveredPdfBtn === 'sos' ? styles.crearPdfBtnHover : {}) }}
            onMouseEnter={() => setHoveredPdfBtn('sos')}
            onMouseLeave={() => setHoveredPdfBtn(null)}
          >
            <FileText size={16} /> PDF S.O.S
          </button>
        </div>
      </div>

      {selectedInsumo && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setSelectedInsumo(null)}>
          <div className="modal-content-anim" style={styles.editModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <button style={styles.closeBtn} onClick={() => setSelectedInsumo(null)}>
                <X size={18} />
              </button>
              <h2 style={styles.modalTitle}>Detalle del Insumo</h2>
            </div>
            <div style={styles.editModalBody}>
              <div style={styles.infoCardGrid}>
                <div style={styles.gridField}><span style={styles.label}>ID Detalle</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedInsumo.id}</span></div>
                <div style={styles.gridField}><span style={styles.label}>Movimiento</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{req.id}</span></div>
                <div style={styles.gridField}><span style={styles.label}>Lote</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedInsumo.lote ?? '-'}</span></div>
                <div style={styles.gridField}><span style={styles.label}>Producto</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedInsumo.producto ?? '-'}</span></div>
                <div style={styles.gridField}><span style={styles.label}>Cantidad</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedInsumo.cantidad ?? '-'}</span></div>
                <div style={styles.gridField}><span style={styles.label}>Precio</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatMoney(selectedInsumo.precio)}</span></div>
                <div style={styles.gridField}><span style={styles.label}>Sistema</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedInsumo.sistema ?? '-'}</span></div>
                <div style={styles.gridField}><span style={styles.label}>Referencia</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedInsumo.referencia ?? '-'}</span></div>
                <div style={styles.gridField}><span style={styles.label}>Tarifa Asociada</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedInsumo.tarifaAsociada ?? '-'}</span></div>
                <div style={styles.gridField}><span style={styles.label}>Descripción</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedInsumo.descripcion ?? '-'}</span></div>
                <div style={styles.gridField}><span style={styles.label}>Categoría</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedInsumo.categoria ?? '-'}</span></div>
                <div style={styles.gridField}><span style={styles.label}>Fecha</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatDate(selectedInsumo.fecha)}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => { if (!deleteRequisicionMutation.isPending) setShowDeleteConfirm(false); }}>
          <div className="modal-content-anim" style={{ ...styles.editModalContent, maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <h2 style={styles.modalTitle}>Eliminar Requisición</h2>
            </div>
            <div style={styles.editModalBody}>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: 0 }}>
                ¿Seguro que quieres eliminar la requisición <strong>{id}</strong>? Se eliminarán también todos sus insumos. Esta acción no se puede deshacer.
              </p>
              {deleteError && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.75rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                  <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span style={{ color: '#b91c1c', fontSize: '0.82rem', fontWeight: 500, lineHeight: 1.4 }}>{deleteError}</span>
                </div>
              )}
            </div>
            <div style={styles.editModalFooter}>
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
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
          <div className="modal-content-anim" style={styles.editModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <button style={styles.closeBtn} onClick={() => setShowEditModal(false)}>
                <X size={18} />
              </button>
              <h2 style={styles.modalTitle}>Editar Requisición</h2>
            </div>

            <div style={styles.editModalBody}>
              <div style={styles.formGroup} id="edit-requisicion-field-fecha">
                <label style={styles.label}>Fecha *</label>
                <input
                  type="date"
                  style={{ ...styles.input, ...(editError?.field === 'fecha' ? styles.inputError : {}) }}
                  value={editFecha}
                  onChange={e => { setEditFecha(e.target.value); setEditError(null); }}
                />
                {editError?.field === 'fecha' && <span style={styles.errorText}>{editError.message}</span>}
              </div>

              <div style={styles.formGroup} id="edit-requisicion-field-cubrimiento">
                <label style={styles.label}>Cubrimiento *</label>
                <div style={styles.sedeGrid}>
                  {cubrimientos.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      style={{ ...styles.sedeBtn, ...(editCubrimiento?.id === c.id ? styles.sedeBtnActive : {}) }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => {
                        setEditCubrimiento(c);
                        setEditTarifaId('');
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

              <div style={styles.formGroup} id="edit-requisicion-field-tarifa">
                <label style={styles.label}>Tarifa *</label>
                <select
                  style={{ ...styles.input, ...(editError?.field === 'tarifa' ? styles.inputError : {}) }}
                  value={editTarifaId}
                  disabled={!editCubrimiento}
                  onChange={e => { setEditTarifaId(e.target.value); setEditError(null); }}
                >
                  <option value="" disabled>{editCubrimiento ? 'Seleccionar tarifa' : 'Selecciona primero un cubrimiento'}</option>
                  {tarifasCubrimiento.map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
                {editError?.field === 'tarifa' && <span style={styles.errorText}>{editError.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Insumos</label>
                {detalles.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.5rem', marginBottom: '0.5rem' }}>
                    {detalles.map(d => (
                      <div key={d.id} style={styles.insumoDraftRow}>
                        <span style={styles.insumoDraftText}>
                          {d.referencia ?? d.producto ?? 'Sin producto'} — {d.cantidad ?? 0} × {formatMoney(d.precio)}
                          {d.lote ? ` (Lote: ${d.lote})` : ''}
                        </span>
                        <Pencil size={14} style={{ cursor: 'pointer', color: '#6b7280', flexShrink: 0 }} onClick={() => openEditInsumoModal(d)} />
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

            <div style={styles.editModalFooter}>
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
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setShowInsumoModal(false)}>
          <div className="modal-content-anim" style={styles.editModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <button style={styles.closeBtn} onClick={() => setShowInsumoModal(false)}>
                <X size={18} />
              </button>
              <h2 style={styles.modalTitle}>{editingInsumoId ? 'Editar Insumo' : 'Agregar Insumo'}</h2>
            </div>

            <div style={styles.editModalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Movimiento *</label>
                <span style={styles.readOnlyField}>{req.id}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Lote</label>
                {insumoLote ? (
                  <div style={styles.tagsWrap}>
                    <span style={styles.tag}>
                      {insumoLote.lote}
                      <X size={12} style={{ cursor: 'pointer' }} onClick={() => setInsumoLote(null)} />
                    </span>
                  </div>
                ) : (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      style={styles.input}
                      placeholder="Buscar lote..."
                      value={loteSearch}
                      onChange={e => setLoteSearch(e.target.value)}
                    />
                    {loteSearch.trim() && (
                      <div style={styles.dropdown}>
                        {loteResults.length === 0 ? (
                          <div style={{ ...styles.dropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                        ) : (
                          loteResults.map(l => (
                            <div key={l.id} style={styles.dropdownItem} onClick={() => { setInsumoLote(l); setLoteSearch(''); }}>
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
                  <div style={styles.tagsWrap}>
                    <span style={styles.tag}>
                      {formatProductoLabel(insumoProducto)}
                      <X size={12} style={{ cursor: 'pointer' }} onClick={() => setInsumoProducto(null)} />
                    </span>
                  </div>
                ) : (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      style={styles.input}
                      placeholder="Buscar producto..."
                      value={productoSearch}
                      onChange={e => setProductoSearch(e.target.value)}
                    />
                    {productoSearch.trim() && (
                      <div style={styles.dropdown}>
                        {productoResults.length === 0 ? (
                          <div style={{ ...styles.dropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                        ) : (
                          productoResults.map(p => (
                            <div key={p.id} style={styles.dropdownItem} onClick={() => handleSelectProducto(p)}>
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
                    style={{ ...styles.input, paddingRight: '5rem', ...(insumoError?.field === 'cantidad' ? styles.inputError : {}) }}
                    placeholder="0"
                    value={insumoCantidad}
                    onChange={e => { setInsumoCantidad(e.target.value); setInsumoError(null); }}
                  />
                  <div style={styles.stepperBtns}>
                    <button type="button" style={styles.stepperBtn} onClick={() => { setInsumoCantidad(String((Number(insumoCantidad) || 0) - 1)); setInsumoError(null); }}>−</button>
                    <button type="button" style={styles.stepperBtn} onClick={() => { setInsumoCantidad(String((Number(insumoCantidad) || 0) + 1)); setInsumoError(null); }}>+</button>
                  </div>
                </div>
                {insumoError?.field === 'cantidad' && <span style={styles.errorText}>{insumoError.message}</span>}
              </div>

              <div style={styles.formGroup} id="insumo-field-precio">
                <label style={styles.label}>Precio *</label>
                <div style={styles.stepperWrap}>
                  <input
                    type="number"
                    step="0.01"
                    style={{ ...styles.input, paddingRight: '5rem', ...(insumoError?.field === 'precio' ? styles.inputError : {}) }}
                    placeholder="$ 0.00"
                    value={insumoPrecio}
                    onChange={e => { setInsumoPrecio(e.target.value); setInsumoError(null); }}
                  />
                  <div style={styles.stepperBtns}>
                    <button type="button" style={styles.stepperBtn} onClick={() => { setInsumoPrecio(String((Number(insumoPrecio) || 0) - 100)); setInsumoError(null); }}>−</button>
                    <button type="button" style={styles.stepperBtn} onClick={() => { setInsumoPrecio(String((Number(insumoPrecio) || 0) + 100)); setInsumoError(null); }}>+</button>
                  </div>
                </div>
                {insumoError?.field === 'precio' && <span style={styles.errorText}>{insumoError.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Tarifa Asociada</label>
                <span style={styles.readOnlyField}>{showEditModal ? (tarifasCubrimiento.find(t => t.id === editTarifaId)?.nombre ?? req.tarifa ?? '-') : (req.tarifa ?? '-')}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Fecha</label>
                <span style={styles.readOnlyField}>{formatDate(showEditModal ? (editFecha || req.fecha) : req.fecha)}</span>
              </div>
            </div>

            <div style={styles.editModalFooter}>
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
    </Layout>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' },
  header: { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' },
  backBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', border: '1px solid #e5e7eb', borderRadius: '10px', backgroundColor: '#fff', cursor: 'pointer', color: '#333', flexShrink: 0 },
  titleGroup: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  title: { fontSize: '1.4rem', fontWeight: 700, color: '#333', margin: 0 },
  sectionTitleRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' },
  sectionTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#333', margin: 0 },
  badge: { backgroundColor: '#e5e7eb', color: '#6b7280', fontSize: '0.75rem', fontWeight: 700, minWidth: '1.5rem', height: '1.5rem', padding: '0 0.4rem', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  editBtn: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto', padding: '0.6rem 1.1rem', border: 'none', borderRadius: '8px', backgroundColor: '#6b8c1f', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  editBtnHover: { backgroundColor: '#5a7519' },
  btnDanger: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #fecaca', borderRadius: '8px', backgroundColor: '#fff', color: '#dc2626', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  btnDangerHover: { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  sedeGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' },
  sedeBtn: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', color: '#374151', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const },
  sedeBtnActive: { backgroundColor: '#6b8c1f', border: '1px solid #6b8c1f', color: '#fff' },
  infoCardGrid: { backgroundColor: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem 2rem' },
  gridField: { display: 'flex', flexDirection: 'column' as const, gap: '0.35rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f3f4f6' },
  label: { fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', flexShrink: 0 },
  value: { fontSize: '0.875rem', fontWeight: 600, color: '#333', textAlign: 'right' as const },
  detalleReqCard: { backgroundColor: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' },
  detalleReqEmpty: { padding: '2rem', textAlign: 'center' as const, color: '#9ca3af', fontSize: '0.875rem' },
  insumoRow: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))', gap: '0.5rem', padding: '0.75rem 1.25rem', alignItems: 'center', minWidth: '840px' },
  colHeader: { backgroundColor: '#fafafa', borderBottom: '1px solid #f3f4f6' },
  colHeaderText: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  rowBorder: { borderTop: '1px solid #f3f4f6' },
  cellText: { fontSize: '0.85rem', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  addInsumoBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%', marginTop: '0.75rem', padding: '0.6rem', border: '1px dashed #c9dba3', borderRadius: '10px', backgroundColor: '#f9fbf6', color: '#4f6b17', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' },
  insumoDraftRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.6rem 0.85rem', backgroundColor: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '8px' },
  insumoDraftText: { fontSize: '0.8rem', fontWeight: 600, color: '#374151' },
  pdfBtnRow: { display: 'flex', gap: '1rem' },
  crearPdfBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', flex: 1, padding: '0.75rem', border: 'none', borderRadius: '8px', backgroundColor: '#6b8c1f', color: '#fff', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', transition: 'background-color 0.15s' },
  crearPdfBtnHover: { backgroundColor: '#5a7519' },

  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 },
  editModalContent: { backgroundColor: '#fff', borderRadius: '12px', width: '90%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  editModalHeader: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1.5rem', borderBottom: '1px solid #e5e7eb', position: 'sticky' as const, top: 0, backgroundColor: '#f9fafb', zIndex: 1, borderTopLeftRadius: '12px', borderTopRightRadius: '12px' },
  editModalBody: { padding: '1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '1.25rem' },
  editModalFooter: { display: 'flex', gap: '1rem', padding: '1.5rem', borderTop: '1px solid #e5e7eb', justifyContent: 'flex-end' as const },
  modalTitle: { fontSize: '1.25rem', fontWeight: 700, color: '#333', margin: 0 },
  closeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', border: 'none', backgroundColor: '#f3f4f6', borderRadius: '8px', cursor: 'pointer', color: '#666' },
  cancelBtn: { padding: '0.5rem 1.5rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: '#333' },
  saveBtn: { padding: '0.5rem 1.5rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
  deleteConfirmBtn: { padding: '0.5rem 1.5rem', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
  formGroup: { display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' },
  input: { padding: '0.75rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const },
  inputError: { borderColor: '#dc2626' },
  errorText: { fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 },
  readOnlyField: { padding: '0.75rem', border: '1.5px solid #f3f4f6', borderRadius: '8px', fontSize: '0.875rem', backgroundColor: '#f9fafb', color: '#374151', fontWeight: 600 },
  tagsWrap: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' },
  tag: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.75rem', backgroundColor: '#f3f4f6', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600, color: '#374151' },
  dropdown: { position: 'absolute' as const, top: 'calc(100% + 4px)', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto' as const, zIndex: 20 },
  dropdownItem: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.9rem', fontSize: '0.85rem', color: '#374151', cursor: 'pointer' },
  stepperWrap: { position: 'relative' as const },
  stepperBtns: { position: 'absolute' as const, right: '0.5rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '0.35rem' },
  stepperBtn: { width: '1.75rem', height: '1.75rem', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '1rem', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center' },
};
