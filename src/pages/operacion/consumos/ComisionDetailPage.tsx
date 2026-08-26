import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader, X } from 'lucide-react';
import Layout from '../../../components/layout/Layout';
import { remisionesService, type DetTecnicoDetalle, type ProgramacionRealizadaItem, type EjecucionPagoItem } from '../../../services/remisiones.service';
import { useSmoothWheelScroll } from '../../../hooks/useSmoothWheelScroll';

const formatMoney = (value: any): string => {
  if (value === null || value === undefined) return '-';
  const num = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isNaN(num) ? '-' : `$${num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
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

export default function ComisionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [selectedPago, setSelectedPago] = useState<ProgramacionRealizadaItem | null>(null);
  const [hoveredPagoId, setHoveredPagoId] = useState<string | null>(null);
  const [hoveredEjecucionId, setHoveredEjecucionId] = useState<string | null>(null);
  const [selectedEjecucion, setSelectedEjecucion] = useState<EjecucionPagoItem | null>(null);
  const [modalScrolled, setModalScrolled] = useState(false);
  const pagosScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(pagosScrollRef);
  const ejecucionScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(ejecucionScrollRef);

  useEffect(() => {
    document.body.style.overflow = (selectedPago || selectedEjecucion) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [selectedPago, selectedEjecucion]);

  const { data: dt, isLoading, error } = useQuery<DetTecnicoDetalle | null>({
    queryKey: ['dettecnico-detalle', id],
    queryFn: () => remisionesService.getDetTecnicoDetalle(id!),
    enabled: !!id,
  });

  if (isLoading) return <Layout><div style={{ padding: '2rem', textAlign: 'center' }}><Loader className="spinner" size={32} /></div></Layout>;
  if (error) return <Layout><div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>Error al cargar: {(error as any)?.message || 'Error desconocido'}</div></Layout>;
  if (!dt) return <Layout><div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>Comisión no encontrada</div></Layout>;

  return (
    <Layout>
      <div style={styles.container}>
        <div style={styles.header}>
          <button onClick={() => navigate(-1)} style={styles.backBtn}>
            <ArrowLeft size={18} />
          </button>
          <div style={styles.titleGroup}>
            <h1 style={styles.title}>{dt.nombreContacto || 'Comisión'}</h1>
          </div>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <div style={styles.sectionTitleRow}>
            <h2 style={styles.sectionTitle}>Información General</h2>
          </div>
          <div style={styles.infoCardGrid}>
            <div style={styles.gridField}><span style={styles.label}>Nombre Contacto</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{dt.nombreContacto || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>ID_Técnicos</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{dt.id}</span></div>
            <div style={styles.gridField}>
              <span style={styles.label}>N° Programación</span>
              <span
                style={{ ...styles.value, textAlign: 'left' as const, color: '#db2777', cursor: dt.programacionId ? 'pointer' : 'default' }}
                onClick={() => dt.programacionId && navigate(`/operacion/programaciones/${dt.programacionId}`)}
              >
                {dt.numProgram || '-'}
              </span>
            </div>
            <div style={styles.gridField}><span style={styles.label}>Fecha QX</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatDate(dt.fechaQx)}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Doctor</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{dt.doctor || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Hospital</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{dt.hospital || '-'}</span></div>
            <div style={styles.gridField}>
              <span style={styles.label}>Consumo</span>
              <span style={{ ...styles.value, textAlign: 'left' as const }}>{dt.consumo || '-'}</span>
            </div>
            <div style={styles.gridField}><span style={styles.label}>Tipo</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{dt.tipo || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>V/R Comis. o Bonific.</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatMoney(dt.vrComision)}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Pagado</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatMoney(dt.pagado)}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Saldo</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatMoney(dt.saldo)}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Total Factura</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatMoney(dt.totalFactura)}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Observaciones</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{dt.observaciones || '-'}</span></div>
            <div style={styles.gridField}><span style={styles.label}>Estado Actual</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{dt.estadoActual ? 'Activa' : 'Inactiva'}</span></div>
          </div>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <div style={styles.sectionTitleRow}>
            <h2 style={styles.sectionTitle}>Programación Realizada</h2>
            <span style={styles.badge}>{dt.programacionRealizada.length}</span>
          </div>
          {dt.programacionRealizada.length === 0 ? (
            <div style={styles.emptyState}>No hay datos relacionados</div>
          ) : (
            <div style={styles.remList}>
              <div style={{ ...styles.pagoRow, ...styles.colHeader }}>
                <span style={styles.colHeaderText}>Folio</span>
                <span style={styles.colHeaderText}>Proviene De</span>
                <span style={styles.colHeaderText}>Tipo de Pago</span>
                <span style={styles.colHeaderText}>Beneficiar de Gasto</span>
                <span style={styles.colHeaderText}>Beneficiar de Pago</span>
                <span style={styles.colHeaderText}>Pagado</span>
                <span style={styles.colHeaderText}>Saldo</span>
                <span style={styles.colHeaderText}>Status de Gestión</span>
              </div>
              <div ref={pagosScrollRef} style={styles.scrollBody}>
                {dt.programacionRealizada.map((p, i) => (
                  <div
                    key={p.id}
                    style={{ ...styles.pagoRow, ...(i > 0 ? styles.rowBorder : {}), ...(hoveredPagoId === p.id ? styles.rowHover : {}), cursor: 'pointer' }}
                    onClick={() => { setSelectedPago(p); setModalScrolled(false); }}
                    onMouseEnter={() => setHoveredPagoId(p.id)}
                    onMouseLeave={() => setHoveredPagoId(null)}
                  >
                    <span style={styles.cellText}>{p.folio || '-'}</span>
                    <span style={styles.cellText}>{p.provieneDe || '-'}</span>
                    <span style={styles.cellText}>{p.tipoDePago || '-'}</span>
                    <span style={styles.cellText}>{p.beneficiarioGasto || '-'}</span>
                    <span style={styles.cellText}>{p.beneficiarioPago || '-'}</span>
                    <span style={{ ...styles.cellText, fontWeight: 600, color: '#333' }}>{formatMoney(p.pagado)}</span>
                    <span style={{ ...styles.cellText, fontWeight: 600, color: '#333' }}>{formatMoney(p.saldo)}</span>
                    <span style={styles.cellText}>{p.statusDeGestion || '-'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <div style={styles.sectionTitleRow}>
            <h2 style={styles.sectionTitle}>Ejecución del Pago</h2>
            <span style={styles.badge}>{dt.ejecucionPagos.length}</span>
          </div>
          {dt.ejecucionPagos.length === 0 ? (
            <div style={styles.emptyState}>No hay datos relacionados</div>
          ) : (
            <div style={styles.remList}>
              <div style={{ ...styles.ejecucionRow, ...styles.colHeader }}>
                <span style={styles.colHeaderText}>Folio Relacionado</span>
                <span style={styles.colHeaderText}>Registrado Por</span>
                <span style={styles.colHeaderText}>Fecha y Hora</span>
                <span style={styles.colHeaderText}>Cuenta</span>
                <span style={styles.colHeaderText}>Monto</span>
                <span style={styles.colHeaderText}>Status</span>
                <span style={styles.colHeaderText}>Programación</span>
              </div>
              <div ref={ejecucionScrollRef} style={styles.scrollBody}>
                {dt.ejecucionPagos.map((pe, i) => (
                  <div
                    key={pe.id}
                    style={{ ...styles.ejecucionRow, ...(i > 0 ? styles.rowBorder : {}), ...(hoveredEjecucionId === pe.id ? styles.rowHover : {}), cursor: 'pointer' }}
                    onClick={() => { setSelectedEjecucion(pe); setModalScrolled(false); }}
                    onMouseEnter={() => setHoveredEjecucionId(pe.id)}
                    onMouseLeave={() => setHoveredEjecucionId(null)}
                  >
                    <span style={styles.cellText}>{pe.folioRelacionado || '-'}</span>
                    <span style={styles.cellText}>{pe.registradoPor || '-'}</span>
                    <span style={styles.cellText}>{formatDateTime(pe.fechaYHora)}</span>
                    <span style={styles.cellText}>{pe.cuenta || '-'}</span>
                    <span style={{ ...styles.cellText, fontWeight: 600, color: '#333' }}>{formatMoney(pe.monto)}</span>
                    <span style={pe.ejecutado ? styles.statusEjecutado : styles.statusPendiente}>
                      {pe.ejecutado ? 'EJECUTADO' : 'PENDIENTE'}
                    </span>
                    <span style={styles.cellText}>{pe.programacion || '-'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedPago && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setSelectedPago(null)}>
          <div
            className="modal-content-anim"
            style={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            onScroll={(e) => setModalScrolled(e.currentTarget.scrollTop > 4)}
          >
            <div style={styles.modalHeader}>
              <div style={styles.modalHeaderTop}>
                <h3 style={styles.modalTitle}>Pago relacionado</h3>
                <button style={styles.modalCloseBtn} onClick={() => setSelectedPago(null)}>
                  <X size={18} />
                </button>
              </div>
              {modalScrolled && <span style={styles.modalFolioSubtitle}>{selectedPago.id}</span>}
            </div>
            <div style={styles.modalBody}>
              <div style={styles.modalField}><span style={styles.label}>ID</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedPago.id}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Fecha de Programación</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatDateTime(selectedPago.marcaTiempo)}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Folio</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedPago.folio || '-'}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Programada para el</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatDate(selectedPago.fechaPago)}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Programado por</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedPago.programadoPor || '-'}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Tipo</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedPago.tipo || '-'}</span></div>
            </div>
          </div>
        </div>
      )}

      {selectedEjecucion && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setSelectedEjecucion(null)}>
          <div
            className="modal-content-anim"
            style={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            onScroll={(e) => setModalScrolled(e.currentTarget.scrollTop > 4)}
          >
            <div style={styles.modalHeader}>
              <div style={styles.modalHeaderTop}>
                <h3 style={styles.modalTitle}>Ejecución del Pago</h3>
                <button style={styles.modalCloseBtn} onClick={() => setSelectedEjecucion(null)}>
                  <X size={18} />
                </button>
              </div>
              {modalScrolled && <span style={styles.modalFolioSubtitle}>{selectedEjecucion.id}</span>}
            </div>
            <div style={styles.modalBody}>
              <div style={styles.modalField}><span style={styles.label}>Folio</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedEjecucion.id}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Registrado Por</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedEjecucion.registradoPor || '-'}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Fecha y Hora</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatDateTime(selectedEjecucion.fechaYHora)}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Programación</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedEjecucion.programacion || '-'}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Fecha de Registro</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatDate(selectedEjecucion.fechaDeRegistro)}</span></div>
              <div style={styles.modalField}>
                <span style={styles.label}>Estado del Pago</span>
                <span style={selectedEjecucion.ejecutado ? styles.statusEjecutado : styles.statusPendiente}>
                  {selectedEjecucion.ejecutado ? 'EJECUTADO' : 'PENDIENTE'}
                </span>
              </div>
              <div style={styles.modalField}><span style={styles.label}>Fecha Programado</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatDate(selectedEjecucion.fechaProgramado)}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Fecha de Ejecución</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatDate(selectedEjecucion.fechaDeEjecucion)}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Beneficiar de Gasto</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedEjecucion.beneficiarioGasto || '-'}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Beneficiar de Pago</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedEjecucion.beneficiarioPago || '-'}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Monto</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatMoney(selectedEjecucion.monto)}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Forma de Pago</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedEjecucion.formaPago || '-'}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Cuenta</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedEjecucion.cuenta || '-'}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Origen</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedEjecucion.origen || '-'}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Folio Relacionado</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedEjecucion.folioRelacionado || '-'}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Comprobante de Pago</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedEjecucion.comprobantePago || '-'}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Saldo</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{formatMoney(selectedEjecucion.saldo)}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Tipo de Comprobante</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedEjecucion.tipoDeComprobante || '-'}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Fiscal?</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedEjecucion.fiscal === null ? '-' : selectedEjecucion.fiscal ? 'SI' : 'NO'}</span></div>
              <div style={styles.modalField}><span style={styles.label}>IVA %</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedEjecucion.ivaPorcentaje ?? 0}%</span></div>
              <div style={styles.modalField}><span style={styles.label}>IVA RET %</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedEjecucion.ivaRetPorcentaje ?? 0}%</span></div>
              <div style={styles.modalField}><span style={styles.label}>Año</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedEjecucion.anio || '-'}</span></div>
              <div style={styles.modalField}><span style={styles.label}>Mes</span><span style={{ ...styles.value, textAlign: 'left' as const }}>{selectedEjecucion.mes || '-'}</span></div>
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
  label: { fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', flexShrink: 0 },
  value: { fontSize: '0.875rem', fontWeight: 600, color: '#333', textAlign: 'right' as const },
  emptyState: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #f3f4f6', padding: '2rem', textAlign: 'center' as const, color: '#9ca3af', fontSize: '0.875rem' },
  remList: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #f3f4f6', overflow: 'hidden' },
  colHeader: { backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' },
  colHeaderText: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  pagoRow: { display: 'grid', gridTemplateColumns: '130px 110px 110px 1fr 1fr 110px 100px 150px', alignItems: 'center', padding: '0.6rem 1.25rem', gap: '0.75rem', backgroundColor: '#fff' },
  ejecucionRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 160px 220px 120px 130px 130px', alignItems: 'center', padding: '0.6rem 1.25rem', gap: '0.75rem', backgroundColor: '#fff' },
  statusEjecutado: { fontSize: '0.7rem', fontWeight: 700, color: '#15803d', backgroundColor: '#dcfce7', padding: '0.3rem 0.6rem', borderRadius: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.03em', width: 'fit-content' },
  statusPendiente: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', backgroundColor: '#f3f4f6', padding: '0.3rem 0.6rem', borderRadius: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.03em', width: 'fit-content' },
  scrollBody: { maxHeight: '320px', overflowY: 'auto' as const },
  rowBorder: { borderTop: '1px solid #f3f4f6' },
  rowHover: { backgroundColor: '#f3f4f6' },
  cellText: { fontSize: '0.85rem', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  modalOverlay: { position: 'fixed' as const, inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', width: '420px', maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto' as const },
  modalHeader: { position: 'sticky' as const, top: 0, zIndex: 1, backgroundColor: '#f9fafb', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f3f4f6', borderTopLeftRadius: '12px', borderTopRightRadius: '12px' },
  modalHeaderTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: '1.05rem', fontWeight: 700, color: '#333', margin: 0 },
  modalFolioSubtitle: { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginTop: '0.25rem' },
  modalCloseBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '2rem', height: '2rem', border: 'none', borderRadius: '8px', backgroundColor: '#f3f4f6', color: '#6b7280', cursor: 'pointer' },
  modalBody: { padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '1rem' },
  modalField: { display: 'flex', flexDirection: 'column' as const, gap: '0.35rem', padding: '0.75rem 0', borderBottom: '1px solid #f3f4f6' },
};
