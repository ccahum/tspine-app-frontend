import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader, X } from 'lucide-react';
import { MaterialIcon } from '../../../components/icons/MaterialIcon';
import { useSmoothWheelScroll } from '../../../hooks/useSmoothWheelScroll';
import { useNavigateWithLoading } from '../../../hooks/useNavigateWithLoading';
import { remisionesService, type DetTecnicoDetalle, type ProgramacionRealizadaItem, type EjecucionPagoItem } from '../../../services/remisiones.service';

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
  return `${day}/${month}/${year} ${hours}:${minutes}`;
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

// Par label/valor del mismo tipo que usa el detalle de Cotizaciones/Requisiciones (DetalleItem).
function DetalleItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={styles.detalleItem}>
      <span style={styles.detalleLabel}>{label}</span>
      <span style={styles.detalleValue}>{value}</span>
    </div>
  );
}

function TagItem({ label, value, onClick }: { label: string; value: React.ReactNode; onClick?: () => void }) {
  return (
    <div style={styles.detalleItem}>
      <span style={styles.detalleLabel}>{label}</span>
      <span style={{ ...styles.tagPill, ...(onClick ? { cursor: 'pointer' } : {}) }} onClick={onClick}>{value}</span>
    </div>
  );
}

interface ComisionDetalleModalProps {
  id: string;
  onClose: () => void;
}

// Mismo formato que el detalle de Consumos/Validar consumo/Requisiciones: modal con header +
// pestañas, en vez de una página de ruta aparte.
export default function ComisionDetalleModal({ id, onClose }: ComisionDetalleModalProps) {
  const navigate = useNavigateWithLoading();
  const [mainTab, setMainTab] = useState<'general' | 'pagos' | 'ejecucion'>('general');
  const [selectedPago, setSelectedPago] = useState<ProgramacionRealizadaItem | null>(null);
  const [hoveredPagoId, setHoveredPagoId] = useState<string | null>(null);
  const [selectedEjecucion, setSelectedEjecucion] = useState<EjecucionPagoItem | null>(null);
  const [hoveredEjecucionId, setHoveredEjecucionId] = useState<string | null>(null);
  const [consumoExpanded, setConsumoExpanded] = useState(false);
  const bodyContentRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState<number | null>(null);
  const pagosScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(pagosScrollRef);
  const ejecucionScrollRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(ejecucionScrollRef);

  const { data: dt, isLoading, error } = useQuery<DetTecnicoDetalle | null>({
    queryKey: ['dettecnico-detalle', id],
    queryFn: () => remisionesService.getDetTecnicoDetalle(id),
  });

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
  }, [!!dt]);

  return (
    <>
      <div className="modal-overlay-anim" style={styles.modalOverlay}>
        <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
          {isLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center' as const }}><Loader className="spinner" size={28} /></div>
          ) : error ? (
            <div style={{ padding: '3rem', textAlign: 'center' as const, color: '#dc2626' }}>Error al cargar: {(error as any)?.message || 'Error desconocido'}</div>
          ) : !dt ? (
            <div style={{ padding: '3rem', textAlign: 'center' as const, color: '#999' }}>Comisión no encontrada</div>
          ) : (
            <>
              <div style={styles.headerCard}>
                <div style={styles.headerTopRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0, flex: 1 }}>
                    <div style={styles.titleIconBadge}>
                      <MaterialIcon name="payments" size={20} color="#4d7a13" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', minWidth: 0 }}>
                      <span style={styles.titleLabel}>Comisión</span>
                      <h2 style={styles.title}>{dt.nombreContacto || 'Comisión'}</h2>
                    </div>
                  </div>

                  <button style={styles.closeBtn} onClick={onClose}>
                    <X size={18} />
                  </button>
                </div>

                <div style={styles.summaryBar}>
                  <div style={styles.summaryBarItem}>
                    <span style={styles.detalleLabel}>Tipo</span>
                    <span style={styles.summaryBarValue}>{dt.tipo || '-'}</span>
                  </div>
                  <div style={styles.summaryBarItem}>
                    <span style={styles.detalleLabel}>V/R Comisión</span>
                    <span style={{ ...styles.summaryBarValue, fontWeight: 700, color: '#3f6510' }}>{formatMoney(dt.vrComision)}</span>
                  </div>
                  <div style={styles.summaryBarItem}>
                    <span style={styles.detalleLabel}>Pagado</span>
                    <span style={styles.summaryBarValue}>{formatMoney(dt.pagado)}</span>
                  </div>
                  <div style={styles.summaryBarItem}>
                    <span style={styles.detalleLabel}>Saldo</span>
                    <span style={styles.summaryBarValue}>{formatMoney(dt.saldo)}</span>
                  </div>
                </div>

                <div style={styles.infoTabBar}>
                  <button type="button" style={{ ...styles.infoTabBtn, ...(mainTab === 'general' ? styles.infoTabBtnActive : styles.infoTabBtnInactive) }} onClick={() => setMainTab('general')}>
                    Información General
                  </button>
                  <button type="button" style={{ ...styles.infoTabBtn, ...(mainTab === 'pagos' ? styles.infoTabBtnActive : styles.infoTabBtnInactive) }} onClick={() => setMainTab('pagos')}>
                    Programación Realizada
                    <span style={{ ...styles.countBadge, ...(mainTab === 'pagos' ? styles.countBadgeActive : {}) }}>{dt.programacionRealizada.length}</span>
                  </button>
                  <button type="button" style={{ ...styles.infoTabBtn, ...(mainTab === 'ejecucion' ? styles.infoTabBtnActive : styles.infoTabBtnInactive) }} onClick={() => setMainTab('ejecucion')}>
                    Ejecución del Pago
                    <span style={{ ...styles.countBadge, ...(mainTab === 'ejecucion' ? styles.countBadgeActive : {}) }}>{dt.ejecucionPagos.length}</span>
                  </button>
                </div>
              </div>

              <div style={{ overflow: 'hidden', transition: 'height 0.28s cubic-bezier(0.4, 0, 0.2, 1)', ...(bodyHeight !== null ? { height: `${bodyHeight}px` } : {}) }}>
              <div ref={bodyContentRef} style={styles.modalBody}>
              <div key={mainTab} className="page-fade-in">
                {mainTab === 'general' && (
                  <div style={styles.infoSectionBox}>
                    <div style={styles.detalleGrid}>
                      <DetalleItem label="ID_Técnicos" value={dt.id} />
                      <TagItem
                        label="N° Programación"
                        value={dt.numProgram || '-'}
                        onClick={dt.programacionId ? () => navigate(`/operacion/programaciones/${dt.programacionId}`, '/operacion/programaciones/:id') : undefined}
                      />
                      <TagItem label="Remisión Aplicada" value={dt.numRemision || '-'} />
                      <DetalleItem label="Fecha QX" value={formatDate(dt.fechaQx)} />
                      <TagItem label="Doctor" value={dt.doctor || '-'} />
                      <TagItem label="Hospital" value={dt.hospital || '-'} />
                      <DetalleItem label="Tipo" value={dt.tipo || '-'} />
                      <DetalleItem label="V/R Comis. o Bonific." value={formatMoney(dt.vrComision)} />
                      <DetalleItem label="Pagado" value={formatMoney(dt.pagado)} />
                      <DetalleItem label="Saldo" value={formatMoney(dt.saldo)} />
                      <DetalleItem label="Total Factura" value={formatMoney(dt.totalFactura)} />
                      <DetalleItem label="Estado Actual" value={dt.estadoActual ? 'Activa' : 'Inactiva'} />
                      <DetalleItem label="Observaciones" value={dt.observaciones || '-'} />
                      <div style={{ ...styles.detalleItem, gridColumn: '1 / -1' }}>
                        <span style={styles.detalleLabel}>Consumo</span>
                        <span style={{ ...styles.detalleValue, ...(consumoExpanded ? {} : styles.consumoClamp) }}>{dt.consumo || '-'}</span>
                        {(dt.consumo?.length ?? 0) > 180 && (
                          <button type="button" style={styles.verMasBtn} onClick={() => setConsumoExpanded(v => !v)}>
                            {consumoExpanded ? 'Ver menos' : 'Ver más'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {mainTab === 'pagos' && (
                  dt.programacionRealizada.length === 0 ? (
                    <div style={styles.emptySection}>No hay datos relacionados</div>
                  ) : (
                    <div style={styles.consumosTableWrap}>
                      <div ref={pagosScrollRef} style={{ overflow: 'auto' as const, maxHeight: '320px' }}>
                        <table style={styles.consumosTable}>
                          <thead>
                            <tr>
                              <th style={styles.consumosTh}>Folio</th>
                              <th style={styles.consumosTh}>Proviene De</th>
                              <th style={styles.consumosTh}>Tipo de Pago</th>
                              <th style={styles.consumosTh}>Beneficiario Gasto</th>
                              <th style={styles.consumosTh}>Beneficiario Pago</th>
                              <th style={{ ...styles.consumosTh, textAlign: 'right' as const }}>Pagado</th>
                              <th style={{ ...styles.consumosTh, textAlign: 'right' as const }}>Saldo</th>
                              <th style={styles.consumosTh}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dt.programacionRealizada.map(p => (
                              <tr
                                key={p.id}
                                style={{ cursor: 'pointer', ...(hoveredPagoId === p.id ? { backgroundColor: '#f3faec' } : {}) }}
                                onMouseEnter={() => setHoveredPagoId(p.id)}
                                onMouseLeave={() => setHoveredPagoId(null)}
                                onClick={() => setSelectedPago(p)}
                              >
                                <td style={{ ...styles.consumosTd, fontWeight: 700, color: '#3f6510' }}>{p.folio || '-'}</td>
                                <td style={styles.consumosTd}>{p.provieneDe || '-'}</td>
                                <td style={styles.consumosTd}>{p.tipoDePago || '-'}</td>
                                <td style={{ ...styles.consumosTd, ...styles.consumosTdTruncate }} title={p.beneficiarioGasto ?? undefined}>{p.beneficiarioGasto || '-'}</td>
                                <td style={{ ...styles.consumosTd, ...styles.consumosTdTruncate }} title={p.beneficiarioPago ?? undefined}>{p.beneficiarioPago || '-'}</td>
                                <td style={{ ...styles.consumosTd, textAlign: 'right' as const, fontWeight: 700 }}>{formatMoney(p.pagado)}</td>
                                <td style={{ ...styles.consumosTd, textAlign: 'right' as const, fontWeight: 700 }}>{formatMoney(p.saldo)}</td>
                                <td style={styles.consumosTd}>{p.statusDeGestion || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                )}

                {mainTab === 'ejecucion' && (
                  dt.ejecucionPagos.length === 0 ? (
                    <div style={styles.emptySection}>No hay datos relacionados</div>
                  ) : (
                    <div style={styles.consumosTableWrap}>
                      <div ref={ejecucionScrollRef} style={{ overflow: 'auto' as const, maxHeight: '320px' }}>
                        <table style={styles.consumosTable}>
                          <thead>
                            <tr>
                              <th style={styles.consumosTh}>Folio Relacionado</th>
                              <th style={styles.consumosTh}>Registrado Por</th>
                              <th style={styles.consumosTh}>Fecha y Hora</th>
                              <th style={styles.consumosTh}>Cuenta</th>
                              <th style={{ ...styles.consumosTh, textAlign: 'right' as const }}>Monto</th>
                              <th style={styles.consumosTh}>Status</th>
                              <th style={styles.consumosTh}>Programación</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dt.ejecucionPagos.map(pe => (
                              <tr
                                key={pe.id}
                                style={{ cursor: 'pointer', ...(hoveredEjecucionId === pe.id ? { backgroundColor: '#f3faec' } : {}) }}
                                onMouseEnter={() => setHoveredEjecucionId(pe.id)}
                                onMouseLeave={() => setHoveredEjecucionId(null)}
                                onClick={() => setSelectedEjecucion(pe)}
                              >
                                <td style={{ ...styles.consumosTd, fontWeight: 700, color: '#3f6510' }}>{pe.folioRelacionado || '-'}</td>
                                <td style={styles.consumosTd}>{pe.registradoPor || '-'}</td>
                                <td style={styles.consumosTd}>{formatDateTime(pe.fechaYHora)}</td>
                                <td style={styles.consumosTd}>{pe.cuenta || '-'}</td>
                                <td style={{ ...styles.consumosTd, textAlign: 'right' as const, fontWeight: 700 }}>{formatMoney(pe.monto)}</td>
                                <td style={styles.consumosTd}>
                                  <span style={pe.ejecutado ? styles.statusEjecutado : styles.statusPendiente}>{pe.ejecutado ? 'EJECUTADO' : 'PENDIENTE'}</span>
                                </td>
                                <td style={styles.consumosTd}>{pe.programacion || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                )}
              </div>
              </div>
              </div>
            </>
          )}
        </div>
      </div>

      {selectedPago && (
        <div className="modal-overlay-anim" style={{ ...styles.modalOverlay, zIndex: 10050 }}>
          <div className="modal-content-anim" style={styles.subModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.subModalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={styles.titleIconBadge}>
                  <MaterialIcon name="payments" size={18} color="#4d7a13" />
                </div>
                <h2 style={styles.modalTitle}>Pago relacionado</h2>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelectedPago(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.infoSectionBox}>
                <div style={styles.detalleGrid}>
                  <DetalleItem label="ID" value={selectedPago.id} />
                  <DetalleItem label="Fecha de Programación" value={formatDateTime(selectedPago.marcaTiempo)} />
                  <DetalleItem label="Folio" value={selectedPago.folio || '-'} />
                  <DetalleItem label="Programada para el" value={formatDate(selectedPago.fechaPago)} />
                  <DetalleItem label="Programado por" value={selectedPago.programadoPor || '-'} />
                  <DetalleItem label="Tipo" value={selectedPago.tipo || '-'} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedEjecucion && (
        <div className="modal-overlay-anim" style={{ ...styles.modalOverlay, zIndex: 10050 }}>
          <div className="modal-content-anim" style={styles.subModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.subModalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={styles.titleIconBadge}>
                  <MaterialIcon name="payments" size={18} color="#4d7a13" />
                </div>
                <h2 style={styles.modalTitle}>Ejecución del Pago</h2>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelectedEjecucion(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.infoSectionBox}>
                <div style={styles.detalleGrid}>
                  <DetalleItem label="Folio" value={selectedEjecucion.id} />
                  <DetalleItem label="Registrado Por" value={selectedEjecucion.registradoPor || '-'} />
                  <DetalleItem label="Fecha y Hora" value={formatDateTime(selectedEjecucion.fechaYHora)} />
                  <DetalleItem label="Programación" value={selectedEjecucion.programacion || '-'} />
                  <DetalleItem label="Fecha de Registro" value={formatDate(selectedEjecucion.fechaDeRegistro)} />
                  <DetalleItem
                    label="Estado del Pago"
                    value={<span style={selectedEjecucion.ejecutado ? styles.statusEjecutado : styles.statusPendiente}>{selectedEjecucion.ejecutado ? 'EJECUTADO' : 'PENDIENTE'}</span>}
                  />
                  <DetalleItem label="Fecha Programado" value={formatDate(selectedEjecucion.fechaProgramado)} />
                  <DetalleItem label="Fecha de Ejecución" value={formatDate(selectedEjecucion.fechaDeEjecucion)} />
                  <DetalleItem label="Beneficiario Gasto" value={selectedEjecucion.beneficiarioGasto || '-'} />
                  <DetalleItem label="Beneficiario Pago" value={selectedEjecucion.beneficiarioPago || '-'} />
                  <DetalleItem label="Monto" value={formatMoney(selectedEjecucion.monto)} />
                  <DetalleItem label="Forma de Pago" value={selectedEjecucion.formaPago || '-'} />
                  <DetalleItem label="Cuenta" value={selectedEjecucion.cuenta || '-'} />
                  <DetalleItem label="Origen" value={selectedEjecucion.origen || '-'} />
                  <DetalleItem label="Folio Relacionado" value={selectedEjecucion.folioRelacionado || '-'} />
                  <DetalleItem label="Comprobante de Pago" value={selectedEjecucion.comprobantePago || '-'} />
                  <DetalleItem label="Saldo" value={formatMoney(selectedEjecucion.saldo)} />
                  <DetalleItem label="Tipo de Comprobante" value={selectedEjecucion.tipoDeComprobante || '-'} />
                  <DetalleItem label="Fiscal?" value={selectedEjecucion.fiscal === null ? '-' : selectedEjecucion.fiscal ? 'SI' : 'NO'} />
                  <DetalleItem label="IVA %" value={`${selectedEjecucion.ivaPorcentaje ?? 0}%`} />
                  <DetalleItem label="IVA RET %" value={`${selectedEjecucion.ivaRetPorcentaje ?? 0}%`} />
                  <DetalleItem label="Año" value={selectedEjecucion.anio || '-'} />
                  <DetalleItem label="Mes" value={selectedEjecucion.mes || '-'} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '2rem' },
  modalContent: { backgroundColor: '#fff', borderRadius: '16px', width: '90%', maxWidth: '900px', maxHeight: '90dvh', overflowY: 'auto' as const, overflowX: 'hidden' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  subModalContent: { backgroundColor: '#fff', borderRadius: '16px', width: '90%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' as const, overflowX: 'hidden' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  subModalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #eeeee6', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', position: 'sticky' as const, top: 0 },
  modalTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#16170f', margin: 0 },
  modalBody: { padding: '1.5rem' },
  closeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: 'none', backgroundColor: '#f4f4ee', borderRadius: '8px', cursor: 'pointer', color: '#6b6b60', flexShrink: 0 },

  headerCard: { borderBottom: '1px solid #eeeee6', padding: '1.5rem 1.5rem 1.25rem', position: 'sticky' as const, top: 0, backgroundColor: '#fff', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', zIndex: 1 },
  headerTopRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' as const, marginBottom: '1.25rem' },
  titleIconBadge: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', flexShrink: 0 },
  titleLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  title: { fontSize: '1.05rem', fontWeight: 700, color: '#16170f', margin: 0, lineHeight: 1.3 },

  summaryBar: { backgroundColor: '#f9fafb', border: '1px solid #eeeee6', borderRadius: '10px', padding: '1rem 1.25rem', display: 'flex', flexWrap: 'wrap' as const, gap: '1.75rem' },
  summaryBarItem: { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem' },
  summaryBarValue: { fontSize: '0.9375rem', fontWeight: 600, color: '#16170f' },

  countBadge: { backgroundColor: '#e5e7eb', color: '#6b7280', fontSize: '0.72rem', fontWeight: 700, minWidth: '1.4rem', height: '1.4rem', padding: '0 0.4rem', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  countBadgeActive: { backgroundColor: '#e9f2d8', color: '#3f6510' },

  infoTabBar: { display: 'flex', gap: '0.25rem', borderBottom: '1px solid #eeeee6', marginTop: '1.25rem', overflowX: 'auto' as const, overflowY: 'hidden' as const },
  infoTabBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.75rem 1rem', border: 'none', background: 'transparent', fontSize: '0.84375rem', fontWeight: 600, cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: '-1px', outline: 'none', boxShadow: 'none', flexShrink: 0, whiteSpace: 'nowrap' as const },
  infoTabBtnActive: { color: '#4d7a13', borderBottomColor: '#4d7a13' },
  infoTabBtnInactive: { color: '#6b7280', borderBottomColor: 'transparent' },

  infoSectionBox: { backgroundColor: '#f9fafb', border: '1px solid #eeeee6', borderRadius: '10px', padding: '1.25rem' },
  detalleGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '1.25rem 1.5rem' },
  detalleItem: { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem' },
  detalleLabel: { fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  detalleValue: { fontSize: '0.9375rem', fontWeight: 400, color: '#16170f', lineHeight: 1.4, wordBreak: 'break-word' as const },
  tagPill: { display: 'inline-flex', alignSelf: 'flex-start' as const, alignItems: 'center', padding: '0.4rem 0.75rem', borderRadius: '999px', fontSize: '0.82rem', fontWeight: 600, lineHeight: 1.3, backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510' },
  consumoClamp: { display: '-webkit-box' as const, WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' as const },
  verMasBtn: { alignSelf: 'flex-start' as const, background: 'transparent', border: 'none', padding: 0, color: '#4d7a13', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', marginTop: '0.3rem' },

  emptySection: { textAlign: 'center' as const, padding: '1.5rem', color: '#9ca3af', fontSize: '0.85rem', backgroundColor: '#f9fafb', borderRadius: '10px' },

  consumosTableWrap: { overflow: 'auto' as const, maxHeight: '320px', borderRadius: '10px', border: '1px solid #eeeee6' },
  consumosTable: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.78rem' },
  consumosTh: { padding: '0.55rem 0.75rem', textAlign: 'left' as const, fontWeight: 700, color: '#9ca3af', fontSize: '0.65rem', textTransform: 'uppercase' as const, letterSpacing: '0.03em', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' as const, position: 'sticky' as const, top: 0 },
  consumosTd: { padding: '0.55rem 0.75rem', borderBottom: '1px solid #f3f4f0', color: '#33342a', whiteSpace: 'nowrap' as const },
  consumosTdTruncate: { overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, maxWidth: '200px' },

  statusEjecutado: { fontSize: '0.7rem', fontWeight: 700, color: '#3f6510', backgroundColor: '#e9f2d8', padding: '0.3rem 0.6rem', borderRadius: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.03em', width: 'fit-content' as const },
  statusPendiente: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', backgroundColor: '#f3f4f6', padding: '0.3rem 0.6rem', borderRadius: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.03em', width: 'fit-content' as const },
};
