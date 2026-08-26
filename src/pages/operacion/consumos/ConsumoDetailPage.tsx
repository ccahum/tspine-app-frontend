import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader, X } from 'lucide-react';
import Layout from '../../../components/layout/Layout';
import { remisionesService, type ConsumoDetalle, type ConsumoValidacionLote, type ConsumoProductoValidadoItem } from '../../../services/remisiones.service';
import { useSmoothWheelScroll } from '../../../hooks/useSmoothWheelScroll';

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

export default function ConsumoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [selectedLote, setSelectedLote] = useState<ConsumoValidacionLote | null>(null);
  const [selectedPv, setSelectedPv] = useState<ConsumoProductoValidadoItem | null>(null);
  const [hoveredPvId, setHoveredPvId] = useState<string | null>(null);
  const [hoveredLoteId, setHoveredLoteId] = useState<string | null>(null);
  const lotesScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(lotesScrollRef);

  useEffect(() => {
    document.body.style.overflow = (selectedPv || selectedLote) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [selectedPv, selectedLote]);

  const { data: consumo, isLoading, error } = useQuery<ConsumoDetalle | null>({
    queryKey: ['consumo-detalle', id],
    queryFn: () => remisionesService.getConsumoDetalle(id!),
    enabled: !!id,
  });

  if (isLoading) return <Layout><div style={{ padding: '2rem', textAlign: 'center' }}><Loader className="spinner" size={32} /></div></Layout>;
  if (error) return <Layout><div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>Error al cargar: {(error as any)?.message || 'Error desconocido'}</div></Layout>;
  if (!consumo) return <Layout><div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>Consumo no encontrado</div></Layout>;

  const lotesValidados = consumo.productoValidado.flatMap(pv => pv.lotes);

  return (
    <Layout>
      <div style={styles.container}>
        <div style={styles.header}>
          <button onClick={() => navigate(-1)} style={styles.backBtn}>
            <ArrowLeft size={18} />
          </button>
          <div style={styles.titleGroup}>
            <h1 style={styles.title}>{consumo.descripcion || consumo.referencia || 'Consumo'}</h1>
          </div>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <div style={styles.sectionTitleRow}>
            <h2 style={styles.sectionTitle}>Información General</h2>
          </div>
          <div style={styles.infoCardGrid}>
            <div style={styles.gridField}>
              <span style={styles.label}>N° Remisión</span>
              <span
                style={{ ...styles.value, textAlign: 'left' as const, color: '#db2777', cursor: consumo.remisionId ? 'pointer' : 'default' }}
                onClick={() => consumo.remisionId && navigate(`/operacion/remisiones/${consumo.remisionId}`)}
              >
                {consumo.numRemision || consumo.remisionId || '-'}
              </span>
            </div>
            <div style={styles.gridField}><span style={styles.label}>Fecha QX</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatDate(consumo.fechaQx)}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Doctor</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{consumo.doctor || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Hospital</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{consumo.hospital || '-'}</span></div>
            <div style={styles.gridField}>
              <span style={styles.label}>Consumo</span>
              <span style={{ ...styles.value, textAlign: 'left' as const }}>{consumo.consumo || '-'}</span>
            </div>
            <div style={styles.gridField}><span style={styles.label}>Referencia</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{consumo.referencia || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Descripción</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{consumo.descripcion || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Can</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{consumo.cantidad}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Valor Unitario</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatMoney(consumo.valorUnitario)}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Valor</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatMoney(consumo.valor)}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Cant. Usada</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{consumo.cantidadUsada}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Observaciones</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{consumo.observaciones || '-'}</span></div>
          </div>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <div style={styles.sectionTitleRow}>
            <h2 style={styles.sectionTitle}>Producto Validado</h2>
            <span style={styles.badge}>{consumo.productoValidado.length}</span>
          </div>
          {consumo.productoValidado.length === 0 ? (
            <div style={styles.emptyState}>No hay datos relacionados</div>
          ) : (
            <div style={styles.remList}>
              <div style={{ ...styles.pvRow, ...styles.colHeader }}>
                <span style={styles.colHeaderText}>Can Rem</span>
                <span style={styles.colHeaderText}>Real Validada</span>
                <span style={styles.colHeaderText}>Referencia</span>
                <span style={styles.colHeaderText}>Referencia Validada</span>
                <span style={styles.colHeaderText}>Pro Val</span>
              </div>
              {consumo.productoValidado.map((pv, i) => (
                <div
                  key={pv.id}
                  style={{ ...styles.pvRow, ...(i > 0 ? styles.rowBorder : {}), ...(hoveredPvId === pv.id ? styles.rowHover : {}) }}
                  onMouseEnter={() => setHoveredPvId(pv.id)}
                  onMouseLeave={() => setHoveredPvId(null)}
                  onClick={() => setSelectedPv(pv)}
                >
                  <span style={styles.cellText}>{pv.cantRemisionada}</span>
                  <span style={styles.cellText}>{pv.cantRealValidada}</span>
                  <span style={styles.cellText}>{pv.referencia || '-'}</span>
                  <span style={styles.cellText}>{pv.referenciaValidada || '-'}</span>
                  <span style={styles.cellText}>{pv.productoValidadoDescripcion || '-'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <div style={styles.sectionTitleRow}>
            <h2 style={styles.sectionTitle}>Lotes Validados</h2>
            <span style={styles.badge}>{lotesValidados.length}</span>
          </div>
          {lotesValidados.length === 0 ? (
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
                {lotesValidados.map((l, i) => (
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

      {selectedPv && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setSelectedPv(null)}>
          <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Producto Validado</h2>
              <button style={styles.closeBtn} onClick={() => setSelectedPv(null)}>
                <X size={20} />
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.infoRow}><span style={styles.label}>N° Programación</span><span style={styles.value}>{consumo.numProgram || '-'}</span></div>
              <div style={styles.infoRow}>
                <span style={styles.label}>N° Remisión</span>
                <span
                  style={{ ...styles.value, color: '#db2777', cursor: consumo.remisionId ? 'pointer' : 'default' }}
                  onClick={() => consumo.remisionId && navigate(`/operacion/remisiones/${consumo.remisionId}`)}
                >
                  {consumo.numRemision || consumo.remisionId || '-'}
                </span>
              </div>
              <div style={styles.infoRow}><span style={styles.label}>Fecha QX</span><span style={styles.value}>{formatDate(consumo.fechaQx)}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Doctor</span><span style={styles.value}>{consumo.doctor || '-'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Hospital</span><span style={styles.value}>{consumo.hospital || '-'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>N° O.C.</span><span style={styles.value}>{selectedPv.numeroOC || '-'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Referencia</span><span style={styles.value}>{consumo.referencia || '-'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Pro Rem</span><span style={styles.value}>{consumo.descripcion || '-'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Can Rem</span><span style={styles.value}>{consumo.cantidad}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Valor Unitario</span><span style={styles.value}>{formatMoney(consumo.valorUnitario)}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Valor</span><span style={styles.value}>{formatMoney(consumo.valor)}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Cant. Usada</span><span style={styles.value}>{consumo.cantidadUsada}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Observaciones</span><span style={styles.value}>{consumo.observaciones || '-'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Sede Consumo</span><span style={styles.value}>{selectedPv.sedeConsumo || '-'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Prod. Real Consumido?</span><span style={styles.value}>{selectedPv.prodRealConsumido === null ? '-' : selectedPv.prodRealConsumido ? 'Mismo Producto' : 'Producto Diferente'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Pro Val</span><span style={styles.value}>{selectedPv.productoValidadoDescripcion || '-'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Prod. De Tspine?</span><span style={styles.value}>{selectedPv.prodDeTspine === null ? '-' : selectedPv.prodDeTspine ? 'Sí' : 'No'}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Can Val</span><span style={styles.value}>{selectedPv.cantRealValidada}</span></div>
              <div style={styles.infoRow}><span style={styles.label}>Observaciones Alm</span><span style={styles.value}>{selectedPv.observacionesAlm || '-'}</span></div>
              <div style={{ ...styles.infoRow, borderBottom: 'none' }}><span style={styles.label}>Eliminar</span><span style={styles.value}>{selectedPv.eliminar ? 'Inactiva' : 'Activa'}</span></div>
            </div>
          </div>
        </div>
      )}

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
  remList: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #f3f4f6', overflow: 'hidden' },
  colHeader: { backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' },
  colHeaderText: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  pvRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1.5fr', alignItems: 'center', padding: '0.6rem 1.25rem', gap: '0.75rem', backgroundColor: '#fff', cursor: 'pointer' },
  loteRow: { display: 'grid', gridTemplateColumns: '100px 90px 120px 120px 1fr 130px 1fr', alignItems: 'center', padding: '0.6rem 1.25rem', gap: '0.75rem', backgroundColor: '#fff', cursor: 'pointer' },
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
};
