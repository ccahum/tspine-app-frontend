import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader, Plus, X } from 'lucide-react';
import Layout from '../../../components/layout/Layout';
import SuccessToast from '../../../components/SuccessToast';
import { remisionesService, type ValConsumoDetalle, type ConsumoValidacionLote } from '../../../services/remisiones.service';
import { programacionesService, type SedeOption } from '../../../services/programaciones.service';
import { useSmoothWheelScroll } from '../../../hooks/useSmoothWheelScroll';
import { useResponsiveStyles } from '../../../hooks/useResponsiveStyles';

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

export default function ProductoValidadoDetailPage() {
  const { isMobile } = useResponsiveStyles();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedLote, setSelectedLote] = useState<ConsumoValidacionLote | null>(null);
  const [hoveredLoteId, setHoveredLoteId] = useState<string | null>(null);
  const lotesScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(lotesScrollRef);

  const [showAddLoteModal, setShowAddLoteModal] = useState(false);
  const [addLoteSedeId, setAddLoteSedeId] = useState('');
  const [addLoteAlmacenId, setAddLoteAlmacenId] = useState('');
  const [addLoteCantidad, setAddLoteCantidad] = useState('');
  const [addLoteError, setAddLoteError] = useState<{ field: string; message: string } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = (selectedLote || showAddLoteModal) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [selectedLote, showAddLoteModal]);

  const { data: pv, isLoading, error } = useQuery<ValConsumoDetalle | null>({
    queryKey: ['valconsumo-detalle', id],
    queryFn: () => remisionesService.getValConsumoDetalle(id!),
    enabled: !!id,
  });

  const { data: sedeOptions = [] } = useQuery<SedeOption[]>({
    queryKey: ['programaciones-sedes'],
    queryFn: () => programacionesService.getSedes(),
    enabled: showAddLoteModal,
  });

  const { data: almacenOptions = [] } = useQuery({
    queryKey: ['remisiones-almacenes', addLoteSedeId],
    queryFn: () => remisionesService.findAlmacenes(addLoteSedeId),
    enabled: showAddLoteModal && !!addLoteSedeId,
  });

  const openAddLoteModal = () => {
    setAddLoteSedeId('');
    setAddLoteAlmacenId('');
    setAddLoteCantidad('');
    setAddLoteError(null);
    setShowAddLoteModal(true);
  };

  const createLoteMutation = useMutation({
    mutationFn: () => remisionesService.createValConsumoLote({
      valConsumoId: id!,
      sedeId: addLoteSedeId,
      almacenId: addLoteAlmacenId,
      cantidad: Number(addLoteCantidad),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['valconsumo-detalle', id] });
      setShowAddLoteModal(false);
      setToastMessage('Lote validado agregado');
    },
  });

  const handleGuardarLote = () => {
    if (!addLoteSedeId) { setAddLoteError({ field: 'sedeId', message: 'Selecciona la sede.' }); return; }
    if (!addLoteAlmacenId) { setAddLoteError({ field: 'almacenId', message: 'Selecciona la ubicación.' }); return; }
    if (!addLoteCantidad || Number(addLoteCantidad) <= 0) { setAddLoteError({ field: 'cantidad', message: 'Ingresa una cantidad válida.' }); return; }
    setAddLoteError(null);
    createLoteMutation.mutate();
  };

  if (isLoading) return <Layout><div style={{ padding: '2rem', textAlign: 'center' }}><Loader className="spinner" size={32} /></div></Layout>;
  if (error) return <Layout><div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>Error al cargar: {(error as any)?.message || 'Error desconocido'}</div></Layout>;
  if (!pv) return <Layout><div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>Producto validado no encontrado</div></Layout>;

  return (
    <Layout>
      <div style={styles.container}>
        <div style={styles.header}>
          <button onClick={() => navigate(-1)} style={styles.backBtn}>
            <ArrowLeft size={18} />
          </button>
          <div style={styles.titleGroup}>
            <h1 style={styles.title}>{pv.proVal || 'Producto Validado'}</h1>
          </div>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <div style={styles.sectionTitleRow}>
            <h2 style={styles.sectionTitle}>Información General</h2>
          </div>
          <div style={{ ...styles.infoCardGrid, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
            <div style={styles.gridField}><span style={styles.label}>N° Programación</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{pv.numProgram || '-'}</span></div>
            <div style={styles.gridField}>
              <span style={styles.label}>N° Remisión</span>
              <span
                style={{ ...styles.value, textAlign: 'left' as const, color: '#db2777', cursor: pv.remisionId ? 'pointer' : 'default' }}
                onClick={() => pv.remisionId && navigate(`/operacion/remisiones/${pv.remisionId}`)}
              >
                {pv.numRemision || pv.remisionId || '-'}
              </span>
            </div>
            <div style={styles.gridField}><span style={styles.label}>Fecha QX</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatDate(pv.fechaQx)}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Doctor</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{pv.doctor || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Hospital</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{pv.hospital || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>N° O.C.</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{pv.numeroOC || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Referencia</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{pv.referencia || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Pro Rem</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{pv.proRem || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Can Rem</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{pv.canRem}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Valor Unitario</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatMoney(pv.valorUnitario)}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Valor</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatMoney(pv.valor)}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Cant. Usada</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{pv.cantUsada}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Observaciones</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{pv.observaciones || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Sede Consumo</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{pv.sedeConsumo || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Prod. Real Consumido?</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{pv.prodRealConsumido === null ? '-' : pv.prodRealConsumido ? 'Mismo Producto' : 'Producto Diferente'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Pro Val</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{pv.proVal || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Prod. De Tspine?</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{pv.prodDeTspine === null ? '-' : pv.prodDeTspine ? 'Sí' : 'No'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Can Val</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{pv.canVal}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Observaciones Alm</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{pv.observacionesAlm || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Eliminar</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{pv.eliminar ? 'Inactiva' : 'Activa'}</span></div>
          </div>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <div style={styles.sectionTitleRow}>
            <h2 style={styles.sectionTitle}>Lotes Validados</h2>
            <span style={styles.badge}>{pv.lotes.length}</span>
            <button className="btn-press header-btn-primary" style={styles.addLoteBtn} onClick={openAddLoteModal}>
              <Plus size={14} />
              Agregar lote
            </button>
          </div>
          {pv.lotes.length === 0 ? (
            <div style={styles.emptyState}>No hay datos relacionados</div>
          ) : (
            <div style={styles.remList}>
              <div style={{ ...styles.loteRow, ...styles.colHeader }}>
                <span style={styles.colHeaderText}>Lote</span>
                <span style={styles.colHeaderText}>Cantidad</span>
                <span style={styles.colHeaderText}>Sede</span>
                <span style={styles.colHeaderText}>Ubicación</span>
                <span style={styles.colHeaderText}>Registrado Por</span>
                <span style={styles.colHeaderText}>Marca de Tiempo</span>
                <span style={styles.colHeaderText}>Producto</span>
              </div>
              <div ref={lotesScrollRef} style={styles.scrollBody}>
                {pv.lotes.map((l, i) => (
                  <div
                    key={l.id}
                    style={{ ...styles.loteRow, ...(i > 0 ? styles.rowBorder : {}), ...(hoveredLoteId === l.id ? styles.rowHover : {}) }}
                    onMouseEnter={() => setHoveredLoteId(l.id)}
                    onMouseLeave={() => setHoveredLoteId(null)}
                    onClick={() => setSelectedLote(l)}
                  >
                    <span style={styles.cellText}>{l.lote || '-'}</span>
                    <span style={styles.cellText}>{l.cantidad}</span>
                    <span style={styles.cellText}>{l.sede || '-'}</span>
                    <span style={styles.cellText}>{l.ubicacion || '-'}</span>
                    <span style={styles.cellText}>{l.registradoPor || '-'}</span>
                    <span style={styles.cellText}>{formatDateTime(l.marcaTiempo)}</span>
                    <span style={styles.cellText}>{l.producto || '-'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedLote && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setSelectedLote(null)}>
          <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Lote Validado</h2>
              <button style={styles.closeBtn} onClick={() => setSelectedLote(null)}>
                <X size={20} />
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.infoRow}><span style={styles.label}>ID</span><span style={styles.value}>{selectedLote.id}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>ValConsumo</span><span style={styles.value}>{selectedLote.valConsumoId}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Lote</span><span style={styles.value}>{selectedLote.lote || '-'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Cantidad</span><span style={styles.value}>{selectedLote.cantidad}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Sede</span><span style={styles.value}>{selectedLote.sede || '-'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Ubicación</span><span style={styles.value}>{selectedLote.ubicacion || '-'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Registrado Por</span><span style={styles.value}>{selectedLote.registradoPor || '-'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Marca de Tiempo</span><span style={styles.value}>{formatDateTime(selectedLote.marcaTiempo)}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Producto</span><span style={styles.value}>{selectedLote.producto || '-'}</span></div>
              <div style={{ ...styles.infoRow, borderBottom: 'none' }}><span style={styles.label}>Fecha</span><span style={styles.value}>{formatDate(selectedLote.fecha)}</span></div>
            </div>
          </div>
        </div>
      )}

      {showAddLoteModal && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setShowAddLoteModal(false)}>
          <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Agregar lote validado</h2>
              <button style={styles.closeBtn} onClick={() => setShowAddLoteModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Producto</label>
                <span style={styles.readOnlyField}>{pv.proVal || '-'}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Sede *</label>
                <div style={styles.pillGrid}>
                  {sedeOptions.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      style={{ ...styles.pillBtn, ...(addLoteSedeId === s.id ? styles.pillBtnActive : {}) }}
                      onClick={() => { setAddLoteSedeId(s.id); setAddLoteAlmacenId(''); setAddLoteError(null); }}
                    >
                      {s.nombre}
                    </button>
                  ))}
                </div>
                {addLoteError?.field === 'sedeId' && <span style={styles.errorText}>{addLoteError.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Ubicación *</label>
                {!addLoteSedeId ? (
                  <span style={styles.readOnlyField}>Selecciona primero una sede</span>
                ) : almacenOptions.length === 0 ? (
                  <span style={styles.readOnlyField}>No hay ubicaciones para esta sede</span>
                ) : (
                  <div style={styles.pillGrid}>
                    {almacenOptions.map(a => (
                      <button
                        key={a.id}
                        type="button"
                        style={{ ...styles.pillBtn, ...(addLoteAlmacenId === a.id ? styles.pillBtnActive : {}) }}
                        onClick={() => { setAddLoteAlmacenId(a.id); setAddLoteError(null); }}
                      >
                        {a.nombre}
                      </button>
                    ))}
                  </div>
                )}
                {addLoteError?.field === 'almacenId' && <span style={styles.errorText}>{addLoteError.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Cantidad *</label>
                <div style={styles.stepperWrap}>
                  <input
                    type="number"
                    style={{ ...styles.input, paddingRight: '5rem', ...(addLoteError?.field === 'cantidad' ? styles.inputError : {}) }}
                    placeholder="0"
                    value={addLoteCantidad}
                    onChange={e => { setAddLoteCantidad(e.target.value); setAddLoteError(null); }}
                  />
                  <div style={styles.stepperBtns}>
                    <button type="button" style={styles.stepperBtn} onClick={() => setAddLoteCantidad(String(Math.max(0, (Number(addLoteCantidad) || 0) - 1)))}>−</button>
                    <button type="button" style={styles.stepperBtn} onClick={() => setAddLoteCantidad(String((Number(addLoteCantidad) || 0) + 1))}>+</button>
                  </div>
                </div>
                {addLoteError?.field === 'cantidad' && <span style={styles.errorText}>{addLoteError.message}</span>}
              </div>

              <div style={styles.modalActions}>
                <button style={styles.cancelBtn} onClick={() => setShowAddLoteModal(false)}>Cancelar</button>
                <button style={styles.saveBtn} onClick={handleGuardarLote} disabled={createLoteMutation.isPending}>
                  {createLoteMutation.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SuccessToast show={!!toastMessage} message={toastMessage ?? ''} onClose={() => setToastMessage(null)} />
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
  infoCardGrid: { backgroundColor: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem 2rem' },
  gridField: { display: 'flex', flexDirection: 'column' as const, gap: '0.35rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f3f4f6' },
  infoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '0.75rem 0', marginBottom: '0.75rem', borderBottom: '1px solid #f3f4f6' },
  label: { fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', flexShrink: 0 },
  value: { fontSize: '0.875rem', fontWeight: 600, color: '#333', textAlign: 'right' as const },
  emptyState: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #f3f4f6', padding: '2rem', textAlign: 'center' as const, color: '#9ca3af', fontSize: '0.875rem' },
  remList: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #f3f4f6', overflowX: 'auto' as const, overflowY: 'hidden' as const },
  colHeader: { backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' },
  colHeaderText: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  loteRow: { display: 'grid', gridTemplateColumns: '100px 90px 120px 120px 1fr 130px 1fr', alignItems: 'center', padding: '0.6rem 1.25rem', gap: '0.75rem', backgroundColor: '#fff', cursor: 'pointer', minWidth: '950px' },
  scrollBody: { maxHeight: '320px', overflowY: 'auto' as const },
  rowBorder: { borderTop: '1px solid #f3f4f6' },
  rowHover: { backgroundColor: '#f3f4f6' },
  cellText: { fontSize: '0.85rem', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 },
  modalContent: { backgroundColor: '#fff', borderRadius: '12px', width: '90%', maxWidth: '480px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.5rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', borderTopLeftRadius: '12px', borderTopRightRadius: '12px' },
  modalTitle: { fontSize: '1.25rem', fontWeight: 700, color: '#333', margin: 0 },
  closeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', border: 'none', backgroundColor: '#f3f4f6', borderRadius: '8px', cursor: 'pointer', color: '#666' },
  modalBody: { padding: '1.5rem' },
  addLoteBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', border: '1px solid #dbe8c2', borderRadius: '10px', color: '#3f6510', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' as const, marginLeft: 'auto', flexShrink: 0 },
  formGroup: { display: 'flex', flexDirection: 'column' as const, gap: '0.4rem', marginBottom: '1.1rem' },
  readOnlyField: { padding: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', fontSize: '0.875rem', color: '#6b7280' },
  pillGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' },
  pillBtn: { padding: '0.55rem 0.9rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', color: '#374151', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  pillBtnActive: { backgroundColor: '#6b8c1f', border: '1px solid #6b8c1f', color: '#fff' },
  errorText: { fontSize: '0.75rem', color: '#dc2626', fontWeight: 600, marginTop: '0.3rem', display: 'block' },
  input: { width: '100%', padding: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const },
  inputError: { borderColor: '#dc2626' },
  stepperWrap: { position: 'relative' as const },
  stepperBtns: { position: 'absolute' as const, right: '0.5rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '0.35rem' },
  stepperBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1.75rem', height: '1.75rem', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: '#fff', color: '#374151', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', lineHeight: 1 },
  modalActions: { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' },
  cancelBtn: { padding: '0.6rem 1.25rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#333' },
  saveBtn: { padding: '0.6rem 1.25rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' },
};
