import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader, Plus, X } from 'lucide-react';
import { MaterialIcon } from '../../../components/icons/MaterialIcon';
import { remisionesService, type ConsumoDetalle, type ConsumoValidacionLote, type ConsumoProductoValidadoItem, type AlmacenOption, type LoteOption } from '../../../services/remisiones.service';
import { programacionesService, type SedeOption } from '../../../services/programaciones.service';
import { useNavigateWithLoading } from '../../../hooks/useNavigateWithLoading';
import { useResponsiveStyles } from '../../../hooks/useResponsiveStyles';
import ValidarConsumoModal from '../programaciones/ValidarConsumoModal';

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

// Par label/valor del mismo tipo que usa el detalle de Cotizaciones (DetalleItem en CotizacionesPage.tsx)
function DetalleItem({ label, value, onClick, bold }: { label: string; value: React.ReactNode; onClick?: () => void; bold?: boolean }) {
  return (
    <div style={styles.detalleItem}>
      <span style={styles.detalleLabel}>{label}</span>
      <span style={{ ...styles.detalleValue, ...(bold ? { fontWeight: 700 } : {}), ...(onClick ? { color: '#4d7a13', fontWeight: 600, cursor: 'pointer' } : {}) }} onClick={onClick}>{value}</span>
    </div>
  );
}

// Mismo tag verde (medicoTag + pickBtnActive) que se usa para valores de producto/selección en
// ValidarConsumoModal.tsx — `box` usa un radio de borde más chico (para campos de texto más largo,
// como Pro Rem/Pro Val, donde el pill totalmente redondeado se ve raro).
function TagItem({ label, value, box }: { label: string; value: React.ReactNode; box?: boolean }) {
  return (
    <div style={styles.detalleItem}>
      <span style={styles.detalleLabel}>{label}</span>
      <span style={{ ...styles.tagPill, ...(box ? styles.tagBox : {}) }}>{value}</span>
    </div>
  );
}

// Contenido del detalle de un Producto Validado (grid de campos + su propia sección de Lotes
// Validados) — se reutiliza tanto cuando se abre solo (desde la tabla "Validar consumos") como
// dentro del modal completo del consumo (clic en una fila de la pestaña "Producto Validado").
function ProductoValidadoFields({
  consumo, pv, irARemision, hoveredLoteId, onHoverLote, onSelectLote, isMobile, onAddLote,
}: {
  consumo: ConsumoDetalle;
  pv: ConsumoProductoValidadoItem;
  irARemision: () => void;
  hoveredLoteId: string | null;
  onHoverLote: (id: string | null) => void;
  onSelectLote: (lote: ConsumoValidacionLote) => void;
  isMobile: boolean;
  onAddLote: () => void;
}) {
  return (
    <>
      <div style={styles.infoSectionBox}>
        <div style={styles.detalleGrid}>
          <TagItem label="N° Programación" value={consumo.numProgram || '-'} />
          <DetalleItem label="N° Remisión" value={consumo.numRemision || consumo.remisionId || '-'} onClick={consumo.remisionId ? irARemision : undefined} />
          <DetalleItem label="Fecha QX" value={formatDate(consumo.fechaQx)} />
          <TagItem label="Doctor" value={consumo.doctor || '-'} />
          <TagItem label="Hospital" value={consumo.hospital || '-'} />
          <DetalleItem label="N° O.C." value={pv.numeroOC || '-'} />
          <DetalleItem label="Referencia" value={consumo.referencia || '-'} />
          <TagItem label="Pro Rem" value={consumo.descripcion || '-'} box />
          <DetalleItem label="Can Rem" value={consumo.cantidad} />
          <DetalleItem label="Valor Unitario" value={formatMoney(consumo.valorUnitario)} bold />
          <DetalleItem label="Valor" value={formatMoney(consumo.valor)} bold />
          <DetalleItem label="Cant. Usada" value={consumo.cantidadUsada} />
          <DetalleItem label="Observaciones" value={consumo.observaciones || '-'} />
          <DetalleItem label="Sede Consumo" value={pv.sedeConsumo || '-'} />
          <DetalleItem label="Prod. Real Consumido?" value={pv.prodRealConsumido === null ? '-' : pv.prodRealConsumido ? 'Mismo Producto' : 'Producto Diferente'} />
          <TagItem label="Pro Val" value={pv.productoValidadoDescripcion || '-'} box />
          <DetalleItem label="Prod. De Tspine?" value={pv.prodDeTspine === null ? '-' : pv.prodDeTspine ? 'Sí' : 'No'} />
          <DetalleItem label="Can Val" value={pv.cantRealValidada} />
          <DetalleItem label="Observaciones Alm" value={pv.observacionesAlm || '-'} />
          <DetalleItem label="Eliminar" value={pv.eliminar ? 'Inactiva' : 'Activa'} />
        </div>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <div style={styles.sectionHeaderRow}>
          <h3 style={styles.sectionTitle}>Lotes Validados</h3>
          <span style={styles.countBadge}>{pv.lotes.length}</span>
        </div>
        {pv.lotes.length === 0 ? (
          <div style={styles.emptySection}>No hay datos relacionados</div>
        ) : (
          <div style={styles.consumosTableWrap}>
            <table style={styles.consumosTable}>
              <thead>
                <tr>
                  <th style={styles.consumosTh}>Lote</th>
                  <th style={styles.consumosTh}>Cantidad</th>
                  <th style={styles.consumosTh}>Sede</th>
                  <th style={styles.consumosTh}>Ubicación</th>
                  <th style={styles.consumosTh}>Registrado Por</th>
                  <th style={styles.consumosTh}>Marca de Tiempo</th>
                </tr>
              </thead>
              <tbody>
                {pv.lotes.map(l => (
                  <tr
                    key={l.id}
                    style={{ cursor: 'pointer', ...(hoveredLoteId === l.id ? { backgroundColor: '#f3faec' } : {}) }}
                    onMouseEnter={() => onHoverLote(l.id)}
                    onMouseLeave={() => onHoverLote(null)}
                    onClick={() => onSelectLote(l)}
                  >
                    <td style={{ ...styles.consumosTd, fontWeight: 700, color: '#3f6510' }}>{l.lote || '-'}</td>
                    <td style={styles.consumosTd}>{l.cantidad}</td>
                    <td style={styles.consumosTd}>{l.sede || '-'}</td>
                    <td style={styles.consumosTd}>{l.ubicacion || '-'}</td>
                    <td style={styles.consumosTd}>{l.registradoPor || '-'}</td>
                    <td style={styles.consumosTd}>{formatDateTime(l.marcaTiempo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {isMobile && (
          <button type="button" className="btn-press" style={styles.addLoteBtnMobile} onClick={onAddLote}>
            <Plus size={14} /> Lote
          </button>
        )}
      </div>
    </>
  );
}

interface ConsumoDetalleModalProps {
  id: string;
  onClose: () => void;
  /**
   * Id del ValConsumo (registro de "Validar consumos") que se quiere mostrar de entrada — cuando
   * se abre desde esa tabla, debe ir directo al detalle de ESE producto validado (como hacía antes
   * ProductoValidadoDetailPage), no a la pestaña general del consumo.
   */
  valConsumoId?: string;
}

// Mismo formato que el detalle de Cotizaciones (DetalleModal en CotizacionesPage.tsx): un modal
// en vez de una página de ruta aparte — se abre desde donde sea que se liste el consumo
// (Programación, Remisión), sin navegar fuera de esa pantalla.
export default function ConsumoDetalleModal({ id, onClose, valConsumoId }: ConsumoDetalleModalProps) {
  const navigate = useNavigateWithLoading();
  const queryClient = useQueryClient();
  const { isMobile } = useResponsiveStyles();
  const [mainTab, setMainTab] = useState<'general' | 'productoValidado' | 'lotesValidados'>(valConsumoId ? 'productoValidado' : 'general');
  const [consumoExpanded, setConsumoExpanded] = useState(false);
  const [selectedLote, setSelectedLote] = useState<ConsumoValidacionLote | null>(null);
  const [selectedPv, setSelectedPv] = useState<ConsumoProductoValidadoItem | null>(null);
  const [pvDismissed, setPvDismissed] = useState(false);
  const [hoveredPvId, setHoveredPvId] = useState<string | null>(null);
  const [hoveredLoteId, setHoveredLoteId] = useState<string | null>(null);
  const bodyContentRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState<number | null>(null);

  const { data: consumo, isLoading, error } = useQuery<ConsumoDetalle | null>({
    queryKey: ['consumo-detalle', id],
    queryFn: () => remisionesService.getConsumoDetalle(id),
  });

  const [showValidar, setShowValidar] = useState(false);

  // Si se abrió desde la tabla "Validar consumos" (trae un valConsumoId puntual), se calcula aquí
  // mismo en el render (no en un efecto aparte) para que el sub-modal de detalle aparezca en la
  // misma pintura que el modal principal, en vez de mostrar primero la pestaña general/tabla y
  // luego "saltar" al detalle un instante después.
  const autoPv = (!pvDismissed && valConsumoId) ? (consumo?.productoValidado.find(p => p.id === valConsumoId) ?? null) : null;
  const activePv = selectedPv ?? autoPv;
  const closePvModal = () => { setSelectedPv(null); setPvDismissed(true); };

  // "Agregar lote" a un Producto Validado (ValConsumo) ya existente — mismo formulario/flujo que
  // el "Nuevo lote" de ValidarConsumoModal.tsx, pero aquí crea el lote directo (no se junta en
  // estado local) porque el ValConsumo ya existe de antemano.
  const [showAddLote, setShowAddLote] = useState(false);
  const [addLoteSedeId, setAddLoteSedeId] = useState<string | null>(null);
  const [addLoteAlmacenId, setAddLoteAlmacenId] = useState<string | null>(null);
  const [addLoteLoteId, setAddLoteLoteId] = useState<string | null>(null);
  const [addLoteLoteLabel, setAddLoteLoteLabel] = useState<string | null>(null);
  const [addLoteLoteSearch, setAddLoteLoteSearch] = useState('');
  const [addLoteLoteFocused, setAddLoteLoteFocused] = useState(false);
  const [addLoteLoteHighlighted, setAddLoteLoteHighlighted] = useState(0);
  const [addLoteCantidad, setAddLoteCantidad] = useState('1');
  const [addLoteError, setAddLoteError] = useState<{ field: string; message: string } | null>(null);
  const addLoteInputRef = useRef<HTMLInputElement>(null);
  const addLoteCantidadInputRef = useRef<HTMLInputElement>(null);

  const { data: addLoteSedes = [] } = useQuery<SedeOption[]>({
    queryKey: ['programaciones-sedes'],
    queryFn: () => programacionesService.getSedes(),
    enabled: showAddLote,
  });
  const { data: addLoteAlmacenes = [] } = useQuery<AlmacenOption[]>({
    queryKey: ['remisiones-almacenes', addLoteSedeId],
    queryFn: () => remisionesService.findAlmacenes(addLoteSedeId ?? undefined),
    enabled: showAddLote && !!addLoteSedeId,
  });
  const { data: addLoteLoteResults = [] } = useQuery<LoteOption[]>({
    queryKey: ['remisiones-lotes', addLoteLoteSearch],
    queryFn: () => remisionesService.searchLotes(addLoteLoteSearch),
    enabled: showAddLote && addLoteLoteFocused,
  });

  useEffect(() => {
    setAddLoteLoteHighlighted(0);
  }, [addLoteLoteResults]);

  useEffect(() => {
    if (!addLoteError) return;
    document.getElementById(`add-lote-field-${addLoteError.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [addLoteError]);

  // Preselecciona la Sede con la que se validó este producto (activePv.sedeConsumo, un nombre) en
  // cuanto cargue el catálogo de sedes — mismo criterio que "Nuevo lote" en ValidarConsumoModal,
  // que hereda la Sede Consumo ya elegida en vez de dejarla vacía.
  useEffect(() => {
    if (!showAddLote || addLoteSedeId || !activePv?.sedeConsumo || addLoteSedes.length === 0) return;
    const matched = addLoteSedes.find(s => s.nombre === activePv.sedeConsumo);
    if (matched) setAddLoteSedeId(matched.id);
  }, [showAddLote, addLoteSedes, addLoteSedeId, activePv]);

  const selectAddLoteLote = (l: LoteOption) => {
    setAddLoteLoteId(l.id);
    setAddLoteLoteLabel(l.lote ?? '-');
    setAddLoteLoteSearch('');
    setAddLoteError(null);
    addLoteCantidadInputRef.current?.focus();
  };

  const openAddLote = () => {
    const matchedSede = activePv?.sedeConsumo ? addLoteSedes.find(s => s.nombre === activePv.sedeConsumo) : undefined;
    setAddLoteSedeId(matchedSede?.id ?? null);
    setAddLoteAlmacenId(null);
    setAddLoteLoteId(null);
    setAddLoteLoteLabel(null);
    setAddLoteLoteSearch('');
    setAddLoteCantidad('1');
    setAddLoteError(null);
    setShowAddLote(true);
  };

  const addLoteMutation = useMutation({
    mutationFn: () => remisionesService.createValConsumoLote({
      valConsumoId: activePv!.id,
      sedeId: addLoteSedeId!,
      almacenId: addLoteAlmacenId!,
      loteId: addLoteLoteId!,
      cantidad: Number(addLoteCantidad),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consumo-detalle', id] });
      setShowAddLote(false);
    },
  });

  const handleGuardarAddLote = () => {
    const cantidad = Number(addLoteCantidad);
    if (!addLoteSedeId) { setAddLoteError({ field: 'sede', message: 'Selecciona la sede.' }); return; }
    if (!addLoteAlmacenId) { setAddLoteError({ field: 'ubicacion', message: 'Selecciona la ubicación.' }); return; }
    if (!addLoteLoteId) { setAddLoteError({ field: 'lote', message: 'Selecciona el lote.' }); return; }
    if (!Number.isFinite(cantidad) || cantidad <= 0) { setAddLoteError({ field: 'cantidad', message: 'Ingresa una cantidad válida.' }); return; }
    setAddLoteError(null);
    addLoteMutation.mutate();
  };

  // Bloquea el scroll del fondo mientras el modal está montado — la página que lo abre puede no
  // tener su propio control de overflow (ej. el wrapper de ruta para /operacion/consumos/:id).
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Anima el alto del contenedor del body al cambiar de pestaña (o al expandir "Consumo"), en vez
  // de saltar de golpe entre el alto corto de "Información General" y el de las tablas.
  useEffect(() => {
    const el = bodyContentRef.current;
    if (!el) return;
    const resizeObserver = new ResizeObserver(() => {
      setBodyHeight(el.scrollHeight);
    });
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [!!consumo]);

  const lotesValidados = consumo?.productoValidado.flatMap(pv => pv.lotes) ?? [];
  const irARemision = () => consumo?.remisionId && navigate(`/operacion/remisiones/${consumo.remisionId}`, '/operacion/remisiones/:id');

  return (
    <>
      {valConsumoId ? (
        <div className="modal-overlay-anim" style={styles.modalOverlay}>
          <div className="modal-content-anim" style={styles.subModalContent} onClick={e => e.stopPropagation()}>
            {isLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center' as const }}><Loader className="spinner" size={28} /></div>
            ) : error ? (
              <div style={{ padding: '3rem', textAlign: 'center' as const, color: '#dc2626' }}>Error al cargar: {(error as any)?.message || 'Error desconocido'}</div>
            ) : !consumo || !activePv ? (
              <div style={{ padding: '3rem', textAlign: 'center' as const, color: '#999' }}>Producto validado no encontrado</div>
            ) : (
              <>
                <div style={styles.subModalHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={styles.titleIconBadge}>
                      <MaterialIcon name="package_2" size={18} color="#4d7a13" />
                    </div>
                    <h2 style={styles.modalTitle}>Producto Validado</h2>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {!isMobile && (
                      <button type="button" className="btn-press" style={styles.addLoteBtn} onClick={openAddLote}>
                        <Plus size={14} /> Lote
                      </button>
                    )}
                    <button style={styles.closeBtn} onClick={onClose}>
                      <X size={18} />
                    </button>
                  </div>
                </div>
                <div style={styles.modalBody}>
                  <ProductoValidadoFields
                    consumo={consumo}
                    pv={activePv}
                    irARemision={irARemision}
                    hoveredLoteId={hoveredLoteId}
                    onHoverLote={setHoveredLoteId}
                    onSelectLote={setSelectedLote}
                    isMobile={isMobile}
                    onAddLote={openAddLote}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
      <div className="modal-overlay-anim" style={styles.modalOverlay}>
        <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
          {isLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center' as const }}><Loader className="spinner" size={28} /></div>
          ) : error ? (
            <div style={{ padding: '3rem', textAlign: 'center' as const, color: '#dc2626' }}>Error al cargar: {(error as any)?.message || 'Error desconocido'}</div>
          ) : !consumo ? (
            <div style={{ padding: '3rem', textAlign: 'center' as const, color: '#999' }}>Consumo no encontrado</div>
          ) : (
            <>
              <div style={styles.headerCard}>
                <div style={styles.headerTopRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0, flex: 1 }}>
                    <div style={styles.titleIconBadge}>
                      <MaterialIcon name="package_2" size={20} color="#4d7a13" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', minWidth: 0 }}>
                      <span style={styles.titleLabel}>Consumo</span>
                      <h2 style={styles.title}>{consumo.descripcion || consumo.referencia || 'Consumo'}</h2>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    {consumo.productoValidado.length === 0 && (
                      <button type="button" className="btn-press" style={{ ...styles.pickBtn, ...styles.pickBtnActive }} onClick={() => setShowValidar(true)}>
                        Validar consumo
                      </button>
                    )}
                    <button style={styles.closeBtn} onClick={onClose}>
                      <X size={18} />
                    </button>
                  </div>
                </div>

                <div style={styles.summaryBar}>
                  <div style={styles.summaryBarItem}>
                    <span style={styles.detalleLabel}>N° Remisión</span>
                    <span style={{ ...styles.summaryBarValue, ...(consumo.remisionId ? { color: '#4d7a13', cursor: 'pointer' } : {}) }} onClick={irARemision}>
                      {consumo.numRemision || consumo.remisionId || '-'}
                    </span>
                  </div>
                  <div style={styles.summaryBarItem}>
                    <span style={styles.detalleLabel}>Fecha QX</span>
                    <span style={styles.summaryBarValue}>{formatDate(consumo.fechaQx)}</span>
                  </div>
                  <div style={styles.summaryBarItem}>
                    <span style={styles.detalleLabel}>Hospital</span>
                    <span style={styles.summaryBarValue}>{consumo.hospital || '-'}</span>
                  </div>
                  <div style={styles.summaryBarItem}>
                    <span style={styles.detalleLabel}>Valor</span>
                    <span style={{ ...styles.summaryBarValue, fontWeight: 700, color: '#3f6510' }}>{formatMoney(consumo.valor)}</span>
                  </div>
                </div>

                <div style={styles.infoTabBar}>
                  <button type="button" style={{ ...styles.infoTabBtn, ...(mainTab === 'general' ? styles.infoTabBtnActive : styles.infoTabBtnInactive) }} onClick={() => setMainTab('general')}>
                    Información General
                  </button>
                  <button type="button" style={{ ...styles.infoTabBtn, ...(mainTab === 'productoValidado' ? styles.infoTabBtnActive : styles.infoTabBtnInactive) }} onClick={() => setMainTab('productoValidado')}>
                    Producto Validado
                    <span style={{ ...styles.countBadge, ...(mainTab === 'productoValidado' ? styles.countBadgeActive : {}) }}>{consumo.productoValidado.length}</span>
                  </button>
                  <button type="button" style={{ ...styles.infoTabBtn, ...(mainTab === 'lotesValidados' ? styles.infoTabBtnActive : styles.infoTabBtnInactive) }} onClick={() => setMainTab('lotesValidados')}>
                    Lotes Validados
                    <span style={{ ...styles.countBadge, ...(mainTab === 'lotesValidados' ? styles.countBadgeActive : {}) }}>{lotesValidados.length}</span>
                  </button>
                </div>
              </div>

              <div style={{ overflow: 'hidden', transition: 'height 0.28s cubic-bezier(0.4, 0, 0.2, 1)', ...(bodyHeight !== null ? { height: `${bodyHeight}px` } : {}) }}>
              <div ref={bodyContentRef} style={styles.modalBody}>
              <div key={mainTab} className="page-fade-in">
                {mainTab === 'general' && (
                  <div style={styles.infoSectionBox}>
                    <div style={styles.detalleGrid}>
                      <TagItem label="Doctor" value={consumo.doctor || '-'} />
                      <DetalleItem label="Referencia" value={consumo.referencia || '-'} />
                      <TagItem label="Descripción" value={consumo.descripcion || '-'} />
                      <DetalleItem label="Cantidad" value={consumo.cantidad} />
                      <DetalleItem label="Valor Unitario" value={formatMoney(consumo.valorUnitario)} bold />
                      <DetalleItem label="Cant. Usada" value={consumo.cantidadUsada} />
                      <DetalleItem label="Observaciones" value={consumo.observaciones || '-'} />
                      <div style={{ ...styles.detalleItem, gridColumn: '1 / -1' }}>
                        <span style={styles.detalleLabel}>Consumo</span>
                        <span style={{ ...styles.detalleValue, ...(consumoExpanded ? {} : styles.detalleValueClamp) }}>{consumo.consumo || '-'}</span>
                        {(consumo.consumo?.length ?? 0) > 180 && (
                          <button type="button" style={styles.verMasBtn} onClick={() => setConsumoExpanded(v => !v)}>
                            {consumoExpanded ? 'Ver menos' : 'Ver más'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {mainTab === 'productoValidado' && (
                  consumo.productoValidado.length === 0 ? (
                    <div style={styles.emptySection}>No hay datos relacionados</div>
                  ) : (
                    <div style={styles.consumosTableWrap}>
                      <table style={styles.consumosTable}>
                        <thead>
                          <tr>
                            <th style={styles.consumosTh}>Can Rem</th>
                            <th style={styles.consumosTh}>Real Validada</th>
                            <th style={styles.consumosTh}>Referencia</th>
                            <th style={styles.consumosTh}>Referencia Validada</th>
                            <th style={styles.consumosTh}>Pro Val</th>
                          </tr>
                        </thead>
                        <tbody>
                          {consumo.productoValidado.map(pv => (
                            <tr
                              key={pv.id}
                              style={{ cursor: 'pointer', ...(hoveredPvId === pv.id ? { backgroundColor: '#f3faec' } : {}) }}
                              onMouseEnter={() => setHoveredPvId(pv.id)}
                              onMouseLeave={() => setHoveredPvId(null)}
                              onClick={() => setSelectedPv(pv)}
                            >
                              <td style={styles.consumosTd}>{pv.cantRemisionada}</td>
                              <td style={styles.consumosTd}>{pv.cantRealValidada}</td>
                              <td style={{ ...styles.consumosTd, ...styles.consumosTdTruncate }} title={pv.referencia ?? undefined}>{pv.referencia || '-'}</td>
                              <td style={{ ...styles.consumosTd, ...styles.consumosTdTruncate }} title={pv.referenciaValidada ?? undefined}>{pv.referenciaValidada || '-'}</td>
                              <td style={{ ...styles.consumosTd, ...styles.consumosTdTruncate, fontWeight: 700, color: '#3f6510' }} title={pv.productoValidadoDescripcion ?? undefined}>{pv.productoValidadoDescripcion || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}

                {mainTab === 'lotesValidados' && (
                  lotesValidados.length === 0 ? (
                    <div style={styles.emptySection}>No hay datos relacionados</div>
                  ) : (
                    <div style={styles.consumosTableWrap}>
                      <table style={styles.consumosTable}>
                        <thead>
                          <tr>
                            <th style={styles.consumosTh}>Lote</th>
                            <th style={styles.consumosTh}>Cantidad</th>
                            <th style={styles.consumosTh}>Sede</th>
                            <th style={styles.consumosTh}>Ubicación</th>
                            <th style={styles.consumosTh}>Registrado Por</th>
                            <th style={styles.consumosTh}>Marca de Tiempo</th>
                            <th style={styles.consumosTh}>Producto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lotesValidados.map(l => (
                            <tr
                              key={l.id}
                              style={{ cursor: 'pointer', ...(hoveredLoteId === l.id ? { backgroundColor: '#f3faec' } : {}) }}
                              onMouseEnter={() => setHoveredLoteId(l.id)}
                              onMouseLeave={() => setHoveredLoteId(null)}
                              onClick={() => setSelectedLote(l)}
                            >
                              <td style={{ ...styles.consumosTd, fontWeight: 700, color: '#3f6510' }}>{l.lote || '-'}</td>
                              <td style={styles.consumosTd}>{l.cantidad}</td>
                              <td style={styles.consumosTd}>{l.sede || '-'}</td>
                              <td style={styles.consumosTd}>{l.ubicacion || '-'}</td>
                              <td style={styles.consumosTd}>{l.registradoPor || '-'}</td>
                              <td style={styles.consumosTd}>{formatDateTime(l.marcaTiempo)}</td>
                              <td style={{ ...styles.consumosTd, ...styles.consumosTdTruncate }} title={l.producto ?? undefined}>{l.producto || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
      )}

      {!valConsumoId && consumo && activePv && (
        <div className="modal-overlay-anim" style={{ ...styles.modalOverlay, zIndex: 10050 }}>
          <div className="modal-content-anim" style={styles.subModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.subModalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={styles.titleIconBadge}>
                  <MaterialIcon name="package_2" size={18} color="#4d7a13" />
                </div>
                <h2 style={styles.modalTitle}>Producto Validado</h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {!isMobile && (
                  <button type="button" className="btn-press" style={styles.addLoteBtn} onClick={openAddLote}>
                    <Plus size={14} /> Lote
                  </button>
                )}
                <button style={styles.closeBtn} onClick={closePvModal}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <div style={styles.modalBody}>
              <ProductoValidadoFields
                consumo={consumo}
                pv={activePv}
                irARemision={irARemision}
                hoveredLoteId={hoveredLoteId}
                onHoverLote={setHoveredLoteId}
                onSelectLote={setSelectedLote}
                isMobile={isMobile}
                onAddLote={openAddLote}
              />
            </div>
          </div>
        </div>
      )}

      {selectedLote && (
        <div className="modal-overlay-anim" style={{ ...styles.modalOverlay, zIndex: 10050 }}>
          <div className="modal-content-anim" style={styles.subModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.subModalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={styles.titleIconBadge}>
                  <MaterialIcon name="package_2" size={18} color="#4d7a13" />
                </div>
                <h2 style={styles.modalTitle}>Lote Validado</h2>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelectedLote(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.infoSectionBox}>
                <div style={styles.detalleGrid}>
                  <TagItem label="Lote" value={selectedLote.lote || '-'} />
                  <DetalleItem label="Cantidad" value={selectedLote.cantidad} />
                  <DetalleItem label="Sede" value={selectedLote.sede || '-'} />
                  <DetalleItem label="Ubicación" value={selectedLote.ubicacion || '-'} />
                  <TagItem label="Registrado Por" value={selectedLote.registradoPor || '-'} />
                  <DetalleItem label="Marca de Tiempo" value={formatDateTime(selectedLote.marcaTiempo)} />
                  <DetalleItem label="Producto" value={selectedLote.producto || '-'} />
                  <DetalleItem label="Fecha" value={formatDate(selectedLote.fecha)} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activePv && showAddLote && (
        <div className="modal-overlay-anim" style={{ ...styles.modalOverlay, zIndex: 10100 }}>
          <div className="modal-content-anim" style={{ ...styles.subModalContent, maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div style={styles.subModalHeader}>
              <h2 style={styles.modalTitle}>Agregar lote</h2>
              <button style={styles.closeBtn} onClick={() => setShowAddLote(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.formGroup}>
                <span style={styles.detalleLabel}>Producto</span>
                <div>
                  <span style={styles.tagPill}>{activePv.productoValidadoDescripcion || '-'}</span>
                </div>
              </div>

              <div style={styles.formGroup} id="add-lote-field-sede">
                <span style={styles.detalleLabel}>Sede *</span>
                <div style={styles.pickBtnGrid}>
                  {addLoteSedes.filter(s => !/global/i.test(s.nombre)).map(s => (
                    <button key={s.id} type="button" style={{ ...styles.pickBtn, ...(addLoteSedeId === s.id ? styles.pickBtnActive : {}), ...(addLoteError?.field === 'sede' ? styles.errorBorder : {}) }} onMouseDown={e => e.preventDefault()} onClick={() => { setAddLoteSedeId(s.id); setAddLoteAlmacenId(null); setAddLoteError(null); }}>
                      {s.nombre}
                    </button>
                  ))}
                </div>
                {addLoteError?.field === 'sede' && <span style={styles.errorText}>{addLoteError.message}</span>}
              </div>

              {addLoteSedeId && (
                <div style={styles.formGroup} id="add-lote-field-ubicacion">
                  <span style={styles.detalleLabel}>Ubicación *</span>
                  <div style={styles.pickBtnGrid}>
                    {addLoteAlmacenes.length === 0 ? (
                      <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Sin ubicaciones para esta sede.</span>
                    ) : (
                      addLoteAlmacenes.map(a => (
                        <button key={a.id} type="button" style={{ ...styles.pickBtn, ...(addLoteAlmacenId === a.id ? styles.pickBtnActive : {}), ...(addLoteError?.field === 'ubicacion' ? styles.errorBorder : {}) }} onMouseDown={e => e.preventDefault()} onClick={() => { setAddLoteAlmacenId(a.id); setAddLoteError(null); addLoteInputRef.current?.focus(); }}>
                          {a.nombre ?? '-'}
                        </button>
                      ))
                    )}
                  </div>
                  {addLoteError?.field === 'ubicacion' && <span style={styles.errorText}>{addLoteError.message}</span>}
                </div>
              )}

              <div style={styles.formGroup} id="add-lote-field-lote">
                <span style={styles.detalleLabel}>Lote *</span>
                {addLoteLoteId ? (
                  <div>
                    <span style={styles.tagPill}>
                      {addLoteLoteLabel}
                      <X size={12} style={{ cursor: 'pointer', marginLeft: '0.4rem' }} onClick={() => { setAddLoteLoteId(null); setAddLoteLoteLabel(null); }} />
                    </span>
                  </div>
                ) : (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      ref={addLoteInputRef}
                      style={{ ...styles.formInput, ...(addLoteError?.field === 'lote' ? styles.errorBorder : {}) }}
                      placeholder="Buscar"
                      value={addLoteLoteSearch}
                      onChange={e => setAddLoteLoteSearch(e.target.value)}
                      onFocus={() => setAddLoteLoteFocused(true)}
                      onBlur={() => setTimeout(() => setAddLoteLoteFocused(false), 150)}
                      onKeyDown={e => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setAddLoteLoteHighlighted(i => Math.min(i + 1, addLoteLoteResults.length - 1));
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setAddLoteLoteHighlighted(i => Math.max(i - 1, 0));
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          const l = addLoteLoteResults[addLoteLoteHighlighted];
                          if (l) selectAddLoteLote(l);
                        }
                      }}
                    />
                    {addLoteLoteFocused && (
                      <div style={styles.medicoDropdown}>
                        {addLoteLoteResults.length === 0 ? (
                          <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                        ) : (
                          addLoteLoteResults.map((l, i) => (
                            <div
                              key={l.id}
                              style={{ ...styles.medicoDropdownItem, ...(i === addLoteLoteHighlighted ? styles.pickBtnActive : {}) }}
                              onMouseDown={e => e.preventDefault()}
                              onMouseEnter={() => setAddLoteLoteHighlighted(i)}
                              onClick={() => selectAddLoteLote(l)}
                            >
                              {l.lote ?? '-'}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                {addLoteError?.field === 'lote' && <span style={styles.errorText}>{addLoteError.message}</span>}
              </div>

              <div style={styles.formGroup} id="add-lote-field-cantidad">
                <span style={styles.detalleLabel}>Cantidad *</span>
                <div style={styles.stepperWrap}>
                  <input
                    ref={addLoteCantidadInputRef}
                    style={{ ...styles.formInput, paddingRight: '5rem', ...(addLoteError?.field === 'cantidad' ? styles.errorBorder : {}) }}
                    type="number"
                    min={1}
                    value={addLoteCantidad}
                    onChange={e => { setAddLoteCantidad(e.target.value); setAddLoteError(null); }}
                  />
                  <div style={styles.stepperBtns}>
                    <button type="button" style={styles.stepperBtn} onClick={() => { setAddLoteCantidad(String(Math.max(1, (Number(addLoteCantidad) || 0) - 1))); setAddLoteError(null); }}>−</button>
                    <button type="button" style={styles.stepperBtn} onClick={() => { setAddLoteCantidad(String((Number(addLoteCantidad) || 0) + 1)); setAddLoteError(null); }}>+</button>
                  </div>
                </div>
                {addLoteError?.field === 'cantidad' && <span style={styles.errorText}>{addLoteError.message}</span>}
              </div>
            </div>

            <div style={styles.subModalFooter}>
              <button style={styles.cancelBtn} onClick={() => setShowAddLote(false)}>Cancelar</button>
              <button style={styles.saveBtn} onClick={handleGuardarAddLote} disabled={addLoteMutation.isPending}>
                {addLoteMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showValidar && consumo?.programacionId && (
        <ValidarConsumoModal
          consumoId={id}
          programacionId={consumo.programacionId}
          onClose={() => setShowValidar(false)}
          onValidated={() => {
            setShowValidar(false);
            queryClient.invalidateQueries({ queryKey: ['consumo-detalle', id] });
          }}
        />
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  headerCard: { borderBottom: '1px solid #eeeee6', padding: '1.5rem 1.5rem 1.25rem', position: 'sticky' as const, top: 0, backgroundColor: '#fff', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', zIndex: 1 },
  headerTopRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.25rem' },
  titleIconBadge: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', flexShrink: 0 },
  titleLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  title: { fontSize: '1.05rem', fontWeight: 700, color: '#16170f', margin: 0, lineHeight: 1.3, display: '-webkit-box' as const, WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' as const },

  summaryBar: { backgroundColor: '#f9fafb', border: '1px solid #eeeee6', borderRadius: '10px', padding: '1rem 1.25rem', display: 'flex', flexWrap: 'wrap' as const, gap: '1.75rem' },
  summaryBarItem: { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem' },
  summaryBarValue: { fontSize: '0.9375rem', fontWeight: 600, color: '#16170f' },

  countBadge: { backgroundColor: '#e5e7eb', color: '#6b7280', fontSize: '0.72rem', fontWeight: 700, minWidth: '1.4rem', height: '1.4rem', padding: '0 0.4rem', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  countBadgeActive: { backgroundColor: '#e9f2d8', color: '#3f6510' },

  sectionHeaderRow: { display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' },
  sectionTitle: { fontSize: '0.95rem', fontWeight: 700, color: '#16170f', margin: 0 },

  addLoteBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', border: '1px solid #dbe8c2', borderRadius: '10px', backgroundColor: '#fff', color: '#3f6510', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  addLoteBtnMobile: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%', boxSizing: 'border-box' as const, marginTop: '0.75rem', padding: '0.65rem 0.9rem', border: 'none', borderRadius: '10px', backgroundColor: '#eef5e3', color: '#5a7d3a', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' },

  infoTabBar: { display: 'flex', gap: '0.25rem', borderBottom: '1px solid #eeeee6', marginTop: '1.25rem', overflowX: 'auto' as const, overflowY: 'hidden' as const },
  infoTabBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.75rem 1rem', border: 'none', background: 'transparent', fontSize: '0.84375rem', fontWeight: 600, cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: '-1px', outline: 'none', boxShadow: 'none', flexShrink: 0, whiteSpace: 'nowrap' as const },
  infoTabBtnActive: { color: '#4d7a13', borderBottomColor: '#4d7a13' },
  infoTabBtnInactive: { color: '#6b7280', borderBottomColor: 'transparent' },

  infoSectionBox: { backgroundColor: '#f9fafb', border: '1px solid #eeeee6', borderRadius: '10px', padding: '1.25rem' },
  detalleGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '1.25rem 1.5rem' },
  detalleItem: { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem' },
  detalleLabel: { fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  detalleValue: { fontSize: '0.9375rem', fontWeight: 400, color: '#16170f', lineHeight: 1.4, wordBreak: 'break-word' as const },
  detalleValueClamp: { display: '-webkit-box' as const, WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' as const },
  tagPill: { display: 'inline-flex', alignSelf: 'flex-start' as const, alignItems: 'center', padding: '0.4rem 0.75rem', borderRadius: '999px', fontSize: '0.82rem', fontWeight: 600, lineHeight: 1.3, backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510' },
  tagBox: { borderRadius: '8px' },
  verMasBtn: { alignSelf: 'flex-start' as const, background: 'transparent', border: 'none', padding: 0, color: '#4d7a13', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', marginTop: '0.2rem' },

  emptySection: { textAlign: 'center' as const, padding: '1.5rem', color: '#9ca3af', fontSize: '0.85rem', backgroundColor: '#f9fafb', borderRadius: '10px' },

  consumosTableWrap: { overflow: 'auto' as const, maxHeight: '320px', borderRadius: '10px', border: '1px solid #eeeee6' },
  consumosTable: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.78rem' },
  consumosTh: { padding: '0.55rem 0.75rem', textAlign: 'left' as const, fontWeight: 700, color: '#9ca3af', fontSize: '0.65rem', textTransform: 'uppercase' as const, letterSpacing: '0.03em', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' as const, position: 'sticky' as const, top: 0 },
  consumosTd: { padding: '0.55rem 0.75rem', borderBottom: '1px solid #f3f4f0', color: '#33342a', whiteSpace: 'nowrap' as const },
  consumosTdTruncate: { overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, maxWidth: '220px' },

  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '2rem' },
  modalContent: { backgroundColor: '#fff', borderRadius: '16px', width: '90%', maxWidth: '900px', maxHeight: '90dvh', overflowY: 'auto' as const, overflowX: 'hidden' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  subModalContent: { backgroundColor: '#fff', borderRadius: '16px', width: '90%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' as const, overflowX: 'hidden' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  subModalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #eeeee6', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', position: 'sticky' as const, top: 0 },
  modalTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#16170f', margin: 0 },
  closeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: 'none', backgroundColor: '#f4f4ee', borderRadius: '8px', cursor: 'pointer', color: '#6b6b60', flexShrink: 0 },
  modalBody: { padding: '1.5rem' },
  subModalFooter: { display: 'flex', gap: '0.75rem', padding: '1.25rem 1.5rem', borderTop: '1px solid #eeeee6', justifyContent: 'flex-end' as const },

  formGroup: { display: 'flex', flexDirection: 'column' as const, gap: '0.5rem', marginBottom: '1.1rem' },
  formInput: { padding: '0.75rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const },
  errorBorder: { border: '1.5px solid #dc2626' },
  errorText: { fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 },

  pickBtnGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' },
  pickBtn: { padding: '0.5rem 0.9rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', color: '#6b7280', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', outline: 'none', boxShadow: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' },
  pickBtnActive: { backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510' },

  medicoDropdown: { position: 'absolute' as const, top: 'calc(100% + 0.35rem)', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto' as const, zIndex: 20 },
  medicoDropdownItem: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.75rem', fontSize: '0.85rem', fontWeight: 600, color: '#333', cursor: 'pointer' },

  stepperWrap: { position: 'relative' as const },
  stepperBtns: { position: 'absolute' as const, right: '0.5rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '0.35rem' },
  stepperBtn: { width: '1.75rem', height: '1.75rem', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '1rem', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  cancelBtn: { padding: '0.5rem 1.5rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: '#333' },
  saveBtn: { padding: '0.5rem 1.5rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
};
