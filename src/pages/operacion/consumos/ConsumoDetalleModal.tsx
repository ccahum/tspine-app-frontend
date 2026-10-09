import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader, Plus, X } from 'lucide-react';
import { MaterialIcon } from '../../../components/icons/MaterialIcon';
import { remisionesService, type ConsumoDetalle, type ConsumoValidacionLote, type ConsumoProductoValidadoItem, type AlmacenOption, type LoteOption } from '../../../services/remisiones.service';
import { programacionesService, type SedeOption } from '../../../services/programaciones.service';
import { useNavigateWithLoading } from '../../../hooks/useNavigateWithLoading';
import { useResponsiveStyles } from '../../../hooks/useResponsiveStyles';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import SuccessToast from '../../../components/SuccessToast';
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

// Mismo criterio que getTecnicoInitials en RemisionDetailPage.tsx.
const getInitials = (nombreCompleto: string): string => {
  const words = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '-';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 2][0]).toUpperCase();
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

// Una etapa del timeline de trazabilidad (círculo con ícono + línea conectora a la izquierda,
// tarjeta de contenido a la derecha) — mismo lenguaje visual que ActividadTimeline.tsx, pero cada
// etapa acá es una tarjeta con su propio contenido, no solo un label+subtexto.
function TimelineStage({ icon, title, tag, onTagClick, last, warn, children }: { icon: string; title: string; tag?: string | null; onTagClick?: () => void; last?: boolean; warn?: boolean; children: React.ReactNode }) {
  return (
    <div style={styles.pvStageRow}>
      <div style={styles.pvStageIconCol}>
        <span style={{ ...styles.pvStageIcon, ...(warn ? { backgroundColor: '#c2730c' } : {}) }}>
          <MaterialIcon name={icon} size={12} color="#fff" />
        </span>
        {!last && <span style={styles.pvStageLine} />}
      </div>
      <div style={{ ...styles.pvStageContent, ...(last ? { paddingBottom: 0 } : {}) }}>
        <div style={styles.pvStageHeaderRow}>
          <h4 style={styles.pvStageTitle}>{title}</h4>
          {tag && <span style={{ ...styles.pvStageTag, ...(onTagClick ? { cursor: 'pointer' } : {}) }} onClick={onTagClick}>{tag}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

// Contenido del detalle de un Producto Validado: franja "Flujo de cantidades" + timeline vertical
// de trazabilidad (Programación → Remisión → Validación en almacén → Lotes → Consumo) — se
// reutiliza tanto cuando se abre solo (desde la tabla "Validar consumos") como dentro del modal
// completo del consumo (clic en una fila de la pestaña "Producto Validado").
function ProductoValidadoFields({
  consumo, pv, irARemision, hoveredLoteId, onHoverLote, onSelectLote, isMobile,
}: {
  consumo: ConsumoDetalle;
  pv: ConsumoProductoValidadoItem;
  irARemision: () => void;
  hoveredLoteId: string | null;
  onHoverLote: (id: string | null) => void;
  onSelectLote: (lote: ConsumoValidacionLote) => void;
  isMobile: boolean;
}) {
  const valorValidado = pv.cantRealValidada * Number(consumo.valorUnitario || 0);
  const esProductoDistinto = pv.prodRealConsumido === false;
  // Diferencia entre lo remitido (cantidad × valor unitario del producto original) y lo
  // realmente consumido (cantidad validada × costo de catálogo del producto consumido) — mismo
  // costoUnitario que ya usa "Costo Unit." en Consumos utilizados/Validar consumos.
  const diferenciaValor = (pv.cantRealValidada * pv.costoUnitario) - (Number(consumo.cantidad) * Number(consumo.valorUnitario));
  return (
    <>
      <div style={{ ...styles.pvFlujoBar, ...(isMobile ? { flexWrap: 'wrap' as const } : {}) }}>
        <div style={styles.pvFlujoSegment}>
          <span style={styles.pvFlujoLabel}>Remitida</span>
          <span style={styles.pvFlujoValue}>{pv.cantRemisionada}</span>
          <span style={styles.pvFlujoSub}>Enviada al hospital</span>
        </div>
        <div style={{ ...styles.pvFlujoSegment, backgroundColor: esProductoDistinto ? '#fef3c7' : '#f3faec' }}>
          <span style={styles.pvFlujoLabel}>
            <MaterialIcon name={esProductoDistinto ? 'swap_horiz' : 'check'} size={11} color={esProductoDistinto ? '#c2730c' : '#4d7a13'} /> Validada
          </span>
          <span style={{ ...styles.pvFlujoValue, color: esProductoDistinto ? '#c2730c' : '#3f6510' }}>{pv.cantRealValidada}</span>
          <span style={styles.pvFlujoSub}>{esProductoDistinto ? 'Producto distinto' : 'Revisada por almacén'}</span>
        </div>
        <div style={styles.pvFlujoSegment}>
          <span style={styles.pvFlujoLabel}>Usada</span>
          <span style={styles.pvFlujoValue}>{pv.cantRealValidada}</span>
          <span style={styles.pvFlujoSub}>Registrada en validación</span>
        </div>
        <div style={{ ...styles.pvFlujoSegment, ...styles.pvFlujoSegmentDark }}>
          <span style={{ ...styles.pvFlujoLabel, ...styles.pvFlujoLabelDark }}>Valor</span>
          <span style={{ ...styles.pvFlujoValue, ...styles.pvFlujoValueDark }}>{formatMoney(valorValidado)}</span>
          <span style={{ ...styles.pvFlujoSub, ...styles.pvFlujoSubDark }}>{pv.cantRealValidada} × {formatMoney(consumo.valorUnitario)}</span>
        </div>
      </div>

      <div style={styles.pvTimeline}>
        <TimelineStage icon="event" title="Programación" tag={consumo.numProgram}>
          <div style={styles.pvStageCard}>
            <div style={{ ...styles.detalleGrid, ...(isMobile ? { gridTemplateColumns: '1fr' } : {}) }}>
              <DetalleItem label="Fecha de cirugía" value={formatDate(consumo.fechaQx)} />
              <TagItem label="Doctor" value={consumo.doctor || '-'} />
              <TagItem label="Hospital" value={consumo.hospital || '-'} />
            </div>
          </div>
        </TimelineStage>

        <TimelineStage icon="assignment_turned_in" title="Remisión" tag={consumo.numRemision || consumo.remisionId} onTagClick={consumo.remisionId ? irARemision : undefined}>
          <div style={styles.pvStageCard}>
            <div style={{ ...styles.detalleItem, marginBottom: '0.5rem' }}>
              <span style={styles.detalleLabel}>Producto remitido</span>
              <span style={{ ...styles.detalleValue, fontWeight: 700 }}>{consumo.descripcion || consumo.referencia || '-'}</span>
            </div>
            <div style={{ ...styles.detalleGrid, ...(isMobile ? { gridTemplateColumns: '1fr' } : {}) }}>
              <DetalleItem label="Cantidad" value={consumo.cantidad} />
              <DetalleItem label="Valor unitario" value={formatMoney(consumo.valorUnitario)} bold />
              <div style={styles.detalleItem}>
                <span style={styles.detalleLabel}>Orden de compra</span>
                <span style={{ ...styles.detalleValue, ...(pv.numeroOC ? {} : { color: '#c2730c', fontWeight: 600 }) }}>{pv.numeroOC || 'Pendiente'}</span>
              </div>
            </div>
          </div>
        </TimelineStage>

        <TimelineStage icon={esProductoDistinto ? 'priority_high' : 'check'} title="Validación en almacén" warn={esProductoDistinto}>
          {esProductoDistinto ? (
            <div style={styles.pvDistintoBox}>
              <div style={styles.pvDistintoHeader}>
                <span style={styles.pvDistintoIcon}><MaterialIcon name="swap_horiz" size={14} color="#fff" /></span>
                <div style={{ minWidth: 0 }}>
                  <span style={{ ...styles.detalleValue, fontWeight: 700, color: '#92400e' }}>Se consumió un producto distinto al remitido</span>
                  <span style={{ display: 'block', fontSize: '0.72rem', color: '#92400e' }}>Revisa el cambio realizado en este consumo.</span>
                </div>
              </div>
              <div style={{ ...styles.pvDistintoCompareRow, ...(isMobile ? { flexDirection: 'column' as const } : {}) }}>
                <div style={styles.pvDistintoCompareCol}>
                  <span style={styles.pvDistintoCompareLabel}>Remitido</span>
                  <span style={styles.pvDistintoCompareCodigo}>{consumo.referencia || '-'}</span>
                  <span style={{ ...styles.detalleValue, fontWeight: 700, textDecoration: 'line-through', color: '#9ca3af' }}>{consumo.descripcion || '-'}</span>
                  <span style={styles.pvFlujoSub}>{consumo.cantidad} × {formatMoney(consumo.valorUnitario)}</span>
                </div>
                <div style={{ ...styles.pvDistintoCompareCol, ...(isMobile ? { borderLeft: 'none', borderTop: '1px solid #fde68a', paddingTop: '0.6rem' } : { borderLeft: '1px solid #fde68a' }) }}>
                  <span style={styles.pvDistintoCompareLabel}>Consumido</span>
                  <span style={styles.pvDistintoCompareCodigo}>{pv.referenciaValidada || '-'}</span>
                  <span style={{ ...styles.detalleValue, fontWeight: 700 }}>{pv.productoValidadoDescripcion || '-'}</span>
                  <span style={styles.pvFlujoSub}>{pv.cantRealValidada} × {formatMoney(pv.costoUnitario)}</span>
                </div>
              </div>
              <div style={styles.pvDistintoFooter}>
                <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 600 }}>
                  Diferencia de valor: {diferenciaValor >= 0 ? '+' : '-'}{formatMoney(Math.abs(diferenciaValor))}
                </span>
              </div>
            </div>
          ) : (
            <div style={styles.pvValidacionBox}>
              <span style={styles.pvValidacionCheck}><MaterialIcon name="check" size={9} color="#fff" /></span>
              <div style={{ minWidth: 0 }}>
                <span style={{ ...styles.detalleValue, fontWeight: 700, color: '#3f6510' }}>Se consumió el mismo producto que se remitió</span>
                <span style={{ display: 'block', ...styles.detalleValue }}>{pv.productoValidadoDescripcion || '-'}</span>
              </div>
            </div>
          )}
          <div style={styles.pvStageCard}>
            <div style={{ ...styles.detalleGrid, ...(isMobile ? { gridTemplateColumns: '1fr' } : {}) }}>
              <DetalleItem label="Cantidad validada" value={pv.cantRealValidada} />
              <DetalleItem label="Producto Tspine" value={pv.prodDeTspine === null ? '-' : pv.prodDeTspine ? 'Sí' : 'No'} />
              <DetalleItem label="Sede de consumo" value={pv.sedeConsumo || '-'} />
            </div>
            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column' as const, gap: '0.3rem' }}>
              <div style={styles.pvNotaBox}><span style={styles.pvNotaLabel}>Nota de almacén:</span> <span style={styles.pvNotaValue}>{pv.observacionesAlm || 'sin observaciones'}</span></div>
              <span style={styles.pvNotaTexto}>Observaciones generales: {consumo.observaciones || 'sin observaciones'}</span>
            </div>
          </div>
        </TimelineStage>

        <TimelineStage icon="inventory_2" title={`Lotes · ${pv.lotes.length} asignado${pv.lotes.length === 1 ? '' : 's'}`}>
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
        </TimelineStage>

        <TimelineStage icon="task_alt" title="Consumo" last>
          <div style={styles.pvStageCard}>
            <span style={styles.detalleValue}>Cantidad usada: {pv.cantRealValidada} de {pv.cantRealValidada}</span>
          </div>
        </TimelineStage>
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
  const [consumoExpanded, setConsumoExpanded] = useState(false);
  const [selectedLote, setSelectedLote] = useState<ConsumoValidacionLote | null>(null);
  const [selectedPv, setSelectedPv] = useState<ConsumoProductoValidadoItem | null>(null);
  const [pvDismissed, setPvDismissed] = useState(false);
  const [hoveredPvId, setHoveredPvId] = useState<string | null>(null);
  const [hoveredLoteId, setHoveredLoteId] = useState<string | null>(null);

  const { data: consumo, isLoading, error } = useQuery<ConsumoDetalle | null>({
    queryKey: ['consumo-detalle', id],
    queryFn: () => remisionesService.getConsumoDetalle(id),
  });

  const [showValidar, setShowValidar] = useState(false);
  const [showValidarSuccess, setShowValidarSuccess] = useState(false);

  // Si se abrió desde la tabla "Validar consumos" (trae un valConsumoId puntual), se calcula aquí
  // mismo en el render (no en un efecto aparte) para que el sub-modal de detalle aparezca en la
  // misma pintura que el modal principal, en vez de mostrar primero la pestaña general/tabla y
  // luego "saltar" al detalle un instante después.
  const autoPv = (!pvDismissed && valConsumoId) ? (consumo?.productoValidado.find(p => p.id === valConsumoId) ?? null) : null;
  const activePv = selectedPv ?? autoPv;
  const closePvModal = () => { setSelectedPv(null); setPvDismissed(true); };

  // Menú de "..." junto al botón de cerrar del header de Producto Validado — mismo patrón que el
  // menú de "más opciones" en RemisionDetailPage.tsx (botón + dropdown + cierre al hacer clic afuera).
  const [showPvMenu, setShowPvMenu] = useState(false);
  const pvMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showPvMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (pvMenuRef.current && !pvMenuRef.current.contains(e.target as Node)) setShowPvMenu(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showPvMenu]);

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
  useBodyScrollLock(true);

  const lotesValidados = consumo?.productoValidado.flatMap(pv => pv.lotes) ?? [];
  const irARemision = () => consumo?.remisionId && navigate(`/operacion/remisiones/${consumo.remisionId}`, '/operacion/remisiones/:id');

  return (
    <>
      {valConsumoId ? (
        <div className="modal-overlay-anim" style={styles.modalOverlay}>
          <div className="modal-content-anim" style={{ ...styles.subModalContent, maxWidth: '820px' }} onClick={e => e.stopPropagation()}>
            {isLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center' as const }}><Loader className="spinner" size={28} /></div>
            ) : error ? (
              <div style={{ padding: '3rem', textAlign: 'center' as const, color: '#dc2626' }}>Error al cargar: {(error as any)?.message || 'Error desconocido'}</div>
            ) : !consumo || !activePv ? (
              <div style={{ padding: '3rem', textAlign: 'center' as const, color: '#999' }}>Producto validado no encontrado</div>
            ) : (
              <>
                <div style={styles.subModalHeader}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                      <span style={styles.pvTrazaLabel}>Validación del consumo</span>
                      <span style={{ ...styles.pvEstadoBadge, ...(activePv.eliminar ? styles.pvEstadoBadgeInactive : {}) }}>{activePv.eliminar ? 'Inactivo' : 'Activo'}</span>
                    </div>
                    <h2 style={{ ...styles.modalTitle, fontSize: '0.95rem', lineHeight: 1.25 }}>{activePv.referenciaValidada || '-'} · {activePv.productoValidadoDescripcion || '-'}</h2>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <div style={{ position: 'relative' as const }} ref={pvMenuRef}>
                      <button type="button" className="btn-press header-btn-secondary" style={styles.pvHeaderIconBtn} onClick={() => setShowPvMenu(o => !o)}>
                        <MaterialIcon name="more_horiz" size={18} />
                      </button>
                      {showPvMenu && (
                        <div style={styles.dropdown}>
                          <button style={styles.dropdownItem} onClick={() => { setShowPvMenu(false); openAddLote(); }}>
                            <Plus size={15} /> Agregar lote
                          </button>
                        </div>
                      )}
                    </div>
                    <button className="btn-press header-btn-secondary" style={styles.pvHeaderIconBtn} onClick={onClose}>
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
              {(() => {
                const totalValidada = consumo.productoValidado.reduce((sum, pv) => sum + pv.cantRealValidada, 0);
                const estaValidado = totalValidada > 0 && totalValidada >= consumo.cantidad;
                const sinValidar = totalValidada === 0;
                const estadoLabel = estaValidado ? 'Consumo validado' : sinValidar ? 'Sin validar consumo' : 'Validación parcial';
                const ubicacionesLotes = new Set(lotesValidados.map(l => `${l.ubicacion ?? ''}·${l.sede ?? ''}`));
                const lotesSubtitulo = lotesValidados.length > 0 && ubicacionesLotes.size === 1
                  ? `${lotesValidados[0].ubicacion ?? '-'} · ${lotesValidados[0].sede ?? '-'}`
                  : null;
                // Antes de validar, hace referencia al consumo (producto remitido) que todavía no
                // se valida — no al texto de "Consumo" de la programación (consumo.consumo), que
                // es genérico y se repite igual en todos los consumos de la misma programación.
                // Una vez validado, se reemplaza por el/los producto(s) realmente validado(s).
                const detalleConfirmadoTexto = totalValidada > 0
                  ? (consumo.productoValidado.map(pv => pv.productoValidadoDescripcion).filter(Boolean).join(', ') || '-')
                  : (consumo.descripcion || consumo.referencia || '-');
                return (
                  <>
                    <div style={styles.headerCard}>
                      <div style={styles.headerTopRow}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0, flex: 1 }}>
                          <div style={styles.titleIconBadge}>
                            <MaterialIcon name="package_2" size={20} color="#4d7a13" />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.2rem', minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={styles.titleLabel}>Consumo</span>
                              <span style={{ ...styles.pvEstadoBadge, ...(estaValidado ? {} : styles.pvConsumoBadgePendiente) }}>
                                {estaValidado && <MaterialIcon name="check" size={10} color="#3f6510" />} {estadoLabel}
                              </span>
                            </div>
                            <h2 style={styles.title}>{consumo.descripcion || consumo.referencia || 'Consumo'}</h2>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                          {!estaValidado && (
                            <button type="button" className="btn-press" style={{ ...styles.pickBtn, ...styles.pickBtnActive }} onClick={() => setShowValidar(true)}>
                              Validar consumo
                            </button>
                          )}
                          <button style={styles.closeBtn} onClick={onClose}>
                            <X size={18} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div style={styles.modalBody}>
                      <div style={styles.pvConsumoSectionHeaderRow}>
                        <h3 style={styles.sectionTitle}>Flujo de cantidades</h3>
                      </div>
                      <div style={{ ...styles.pvFlujoBar, ...(isMobile ? { flexWrap: 'wrap' as const } : {}) }}>
                        <div style={styles.pvFlujoSegment}>
                          <span style={styles.pvFlujoLabel}>Remitida</span>
                          <span style={styles.pvFlujoValue}>{consumo.cantidad}</span>
                          <span style={styles.pvFlujoSub}>Enviada al hospital</span>
                        </div>
                        <div style={{ ...styles.pvFlujoSegment, ...(totalValidada > 0 ? { backgroundColor: '#f3faec' } : {}) }}>
                          <span style={styles.pvFlujoLabel}>Validada</span>
                          <span style={{ ...styles.pvFlujoValue, ...(totalValidada > 0 ? { color: '#3f6510' } : {}) }}>{totalValidada}</span>
                          <span style={styles.pvFlujoSub}>En {consumo.productoValidado.length} registro{consumo.productoValidado.length === 1 ? '' : 's'}</span>
                        </div>
                        <div style={styles.pvFlujoSegment}>
                          <span style={styles.pvFlujoLabel}>Usada</span>
                          <span style={styles.pvFlujoValue}>{consumo.cantidadUsada}</span>
                          <span style={styles.pvFlujoSub}>{consumo.cantidadUsada > 0 && consumo.cantidadUsada >= consumo.cantidad ? 'Uso completo' : consumo.cantidadUsada > 0 ? 'Uso parcial' : 'Sin uso registrado'}</span>
                        </div>
                        <div style={styles.pvFlujoSegment}>
                          <span style={styles.pvFlujoLabel}>Con lote</span>
                          <span style={styles.pvFlujoValue}>{consumo.cantidadUsada}</span>
                          <span style={styles.pvFlujoSub}>{consumo.cantidadUsada} de {consumo.cantidad} unidades</span>
                        </div>
                        <div style={{ ...styles.pvFlujoSegment, ...styles.pvFlujoSegmentDark }}>
                          <span style={{ ...styles.pvFlujoLabel, ...styles.pvFlujoLabelDark }}>Valor del consumo</span>
                          <span style={{ ...styles.pvFlujoValue, ...styles.pvFlujoValueDark }}>{formatMoney(consumo.valor)}</span>
                          <span style={{ ...styles.pvFlujoSub, ...styles.pvFlujoSubDark }}>{consumo.cantidad} × {formatMoney(consumo.valorUnitario)}</span>
                        </div>
                      </div>

                      <div style={{ ...styles.pvConsumoConfirmBox, ...(estaValidado ? styles.pvConsumoConfirmBoxDone : {}) }}>
                        <span style={{ ...styles.pvConsumoConfirmIcon, ...(estaValidado ? styles.pvConsumoConfirmIconDone : {}) }}>
                          <MaterialIcon name={estaValidado ? 'check' : 'priority_high'} size={13} color="#fff" />
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ ...styles.detalleValue, fontWeight: 700, color: estaValidado ? '#3f6510' : '#6d28d9' }}>
                            {estaValidado ? 'Detalle de consumo confirmado' : 'Confirma el detalle de consumo capturado'}
                          </span>
                          <span style={{ display: 'block', fontSize: '0.74rem', color: estaValidado ? '#3f6510' : '#6d28d9', marginBottom: '0.5rem' }}>
                            {estaValidado ? 'Se confirmó al validar el consumo' : 'Este punto requiere revisión manual antes de validar'}
                          </span>
                          <div style={styles.pvConsumoConfirmTextBox}>
                            <span style={{ ...styles.detalleValue, ...(consumoExpanded ? {} : styles.detalleValueClamp) }}>{detalleConfirmadoTexto}</span>
                            {detalleConfirmadoTexto.length > 180 && (
                              <button type="button" style={styles.verMasBtn} onClick={() => setConsumoExpanded(v => !v)}>
                                {consumoExpanded ? 'Ver menos' : 'Ver más'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{ ...styles.pvConsumoTwoCol, ...(isMobile ? { gridTemplateColumns: '1fr' } : {}) }}>
                        <div style={styles.pvStageCard}>
                          <h3 style={{ ...styles.sectionTitle, marginBottom: '0.75rem' }}>Detalle de la cirugía</h3>
                          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <span style={styles.pvConsumoAvatar}>{getInitials(consumo.doctor || '-')}</span>
                              <div style={{ minWidth: 0 }}>
                                <span style={{ display: 'block', ...styles.detalleLabel }}>Doctor</span>
                                <span style={{ ...styles.detalleValue, fontWeight: 700 }}>{consumo.doctor || '-'}</span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <span style={styles.pvConsumoIconCircle}><MaterialIcon name="local_hospital" size={14} color="#4d7a13" /></span>
                              <div style={{ minWidth: 0 }}>
                                <span style={{ display: 'block', ...styles.detalleLabel }}>Hospital</span>
                                <span style={{ ...styles.detalleValue, fontWeight: 700 }}>{consumo.hospital || '-'}</span>
                              </div>
                            </div>
                            {(consumo.numRemision || consumo.remisionId) && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <span style={styles.pvConsumoIconCircle}><MaterialIcon name="assignment_turned_in" size={14} color="#4d7a13" /></span>
                                <div style={{ minWidth: 0 }}>
                                  <span style={{ display: 'block', ...styles.detalleLabel }}>Remisión</span>
                                  <span style={{ ...styles.detalleValue, fontWeight: 700, ...(consumo.remisionId ? { color: '#4d7a13', cursor: 'pointer' } : {}) }} onClick={consumo.remisionId ? irARemision : undefined}>
                                    {consumo.numRemision || consumo.remisionId}
                                  </span>
                                </div>
                              </div>
                            )}
                            {consumo.fechaQx && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <span style={styles.pvConsumoIconCircle}><MaterialIcon name="event" size={14} color="#4d7a13" /></span>
                                <div style={{ minWidth: 0 }}>
                                  <span style={{ display: 'block', ...styles.detalleLabel }}>Fecha de cirugía</span>
                                  <span style={{ ...styles.detalleValue, fontWeight: 700 }}>{formatDate(consumo.fechaQx)}</span>
                                </div>
                              </div>
                            )}
                            <span style={styles.pvNotaTexto}>{consumo.observaciones || 'Sin observaciones'}</span>
                          </div>
                        </div>

                        <div style={styles.pvStageCard}>
                          <div style={styles.pvConsumoListHeader}>
                            <h3 style={{ ...styles.sectionTitle, margin: 0 }}>Productos validados · {consumo.productoValidado.length}</h3>
                          </div>
                          {consumo.productoValidado.length === 0 ? (
                            <div style={styles.pvConsumoEmpty}>
                              <span style={styles.pvConsumoEmptyIcon}><MaterialIcon name="inventory_2" size={18} color="#d1d5db" /></span>
                              <span style={styles.pvConsumoEmptyTitle}>Aún no hay productos validados</span>
                              <span style={styles.pvConsumoEmptySub}>Aparecerán aquí cuando almacén valide la unidad remitida.</span>
                            </div>
                          ) : (
                            consumo.productoValidado.map((pv, i) => (
                              <div
                                key={pv.id}
                                style={{ ...styles.pvConsumoListRow, ...(i > 0 ? { borderTop: '1px solid #f3f4f0' } : {}), ...(hoveredPvId === pv.id ? { backgroundColor: '#f3faec' } : {}) }}
                                onMouseEnter={() => setHoveredPvId(pv.id)}
                                onMouseLeave={() => setHoveredPvId(null)}
                                onClick={() => setSelectedPv(pv)}
                              >
                                <span style={{ ...styles.pvConsumoListIcon, ...(pv.prodRealConsumido === false ? styles.pvConsumoListIconWarn : {}) }}>
                                  <MaterialIcon name={pv.prodRealConsumido === false ? 'swap_horiz' : 'check'} size={11} color="#fff" />
                                </span>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <span style={{ display: 'block', ...styles.detalleValue, fontWeight: 700 }}>{pv.productoValidadoDescripcion || '-'}</span>
                                  <span style={{ display: 'block', fontSize: '0.72rem', color: '#9ca3af' }}>{consumo.referencia || '-'} → {pv.referenciaValidada || '-'}</span>
                                </div>
                                <span style={styles.pvConsumoListBadge}>{pv.cantRealValidada} de {consumo.cantidad}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div style={{ ...styles.pvStageCard, marginTop: '1rem' }}>
                        <div style={styles.pvConsumoListHeader}>
                          <h3 style={{ ...styles.sectionTitle, margin: 0 }}>Lotes validados · {lotesValidados.length}</h3>
                          {lotesSubtitulo && <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{lotesSubtitulo}</span>}
                        </div>
                        {lotesValidados.length === 0 ? (
                          <div style={styles.pvConsumoEmpty}>
                            <span style={styles.pvConsumoEmptyIcon}><MaterialIcon name="sell" size={18} color="#d1d5db" /></span>
                            <span style={styles.pvConsumoEmptyTitle}>Sin lotes asignados</span>
                            <span style={styles.pvConsumoEmptySub}>La unidad aún no tiene lote registrado.</span>
                          </div>
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
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </div>
      </div>
      )}

      {!valConsumoId && consumo && activePv && (
        <div className="modal-overlay-anim" style={{ ...styles.modalOverlay, zIndex: 10050 }}>
          <div className="modal-content-anim" style={{ ...styles.subModalContent, maxWidth: '820px' }} onClick={e => e.stopPropagation()}>
            <div style={styles.subModalHeader}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                  <span style={styles.pvTrazaLabel}>Validación del consumo</span>
                  <span style={{ ...styles.pvEstadoBadge, ...(activePv.eliminar ? styles.pvEstadoBadgeInactive : {}) }}>{activePv.eliminar ? 'Inactivo' : 'Activo'}</span>
                </div>
                <h2 style={{ ...styles.modalTitle, fontSize: '0.95rem', lineHeight: 1.25 }}>{activePv.referenciaValidada || '-'} · {activePv.productoValidadoDescripcion || '-'}</h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                <div style={{ position: 'relative' as const }} ref={pvMenuRef}>
                  <button type="button" className="btn-press header-btn-secondary" style={styles.pvHeaderIconBtn} onClick={() => setShowPvMenu(o => !o)}>
                    <MaterialIcon name="more_horiz" size={18} />
                  </button>
                  {showPvMenu && (
                    <div style={styles.dropdown}>
                      <button style={styles.dropdownItem} onClick={() => { setShowPvMenu(false); openAddLote(); }}>
                        <Plus size={15} /> Agregar lote
                      </button>
                    </div>
                  )}
                </div>
                <button className="btn-press header-btn-secondary" style={styles.pvHeaderIconBtn} onClick={closePvModal}>
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
            setShowValidarSuccess(true);
          }}
        />
      )}

      <SuccessToast show={showValidarSuccess} message="Consumo validado" onClose={() => setShowValidarSuccess(false)} />
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  headerCard: { borderBottom: '1px solid #eeeee6', padding: '1rem 1.5rem', position: 'sticky' as const, top: 0, backgroundColor: '#fff', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', zIndex: 1 },
  headerTopRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' },
  titleIconBadge: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', flexShrink: 0 },
  titleLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  title: { fontSize: '1.05rem', fontWeight: 700, color: '#16170f', margin: 0, lineHeight: 1.3, display: '-webkit-box' as const, WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' as const },

  sectionTitle: { fontSize: '0.95rem', fontWeight: 700, color: '#16170f', margin: 0 },

  infoSectionBox: { backgroundColor: '#f9fafb', border: '1px solid #eeeee6', borderRadius: '10px', padding: '0.9rem 1rem' },
  detalleGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.75rem 1.1rem' },
  detalleItem: { display: 'flex', flexDirection: 'column' as const, gap: '0.2rem' },
  detalleLabel: { fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', letterSpacing: '0.02em' },
  detalleValue: { fontSize: '0.82rem', fontWeight: 400, color: '#16170f', lineHeight: 1.35, wordBreak: 'break-word' as const },
  detalleValueClamp: { display: '-webkit-box' as const, WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' as const },
  tagPill: { display: 'inline-flex', alignSelf: 'flex-start' as const, alignItems: 'center', padding: '0.25rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, lineHeight: 1.3, backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510' },
  tagBox: { borderRadius: '8px' },
  verMasBtn: { alignSelf: 'flex-start' as const, background: 'transparent', border: 'none', padding: 0, color: '#4d7a13', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', marginTop: '0.2rem' },

  emptySection: { textAlign: 'center' as const, padding: '1.5rem', color: '#9ca3af', fontSize: '0.85rem', backgroundColor: '#f9fafb', borderRadius: '10px' },

  // "Flujo de cantidades" — un solo elemento tipo stepper (Remitida → Validada → Usada → Valor),
  // mismo lenguaje visual que el stepper de ProgramacionDetailPage (círculo + conector).
  // Un solo elemento (borde/esquinas redondeadas compartidas), dividido en 4 segmentos pegados
  // entre sí (sin gap, separados por un borde interno) — Remitida/Validada/Usada/Valor.
  pvFlujoBar: { display: 'flex', border: '1px solid #eeeee6', borderRadius: '10px', overflow: 'hidden', marginBottom: '1rem' },
  pvFlujoSegment: { flex: 1, minWidth: 0, padding: '0.6rem 0.9rem', backgroundColor: '#f9fafb', borderRight: '1px solid #eeeee6', display: 'flex', flexDirection: 'column' as const, gap: '0.2rem' },
  pvFlujoSegmentDark: { backgroundColor: '#16170f', borderRight: 'none' },
  pvFlujoLabel: { display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.64rem', fontWeight: 700, color: '#9ca3af', letterSpacing: '0.02em' },
  pvFlujoLabelDark: { color: 'rgba(255,255,255,0.65)' },
  pvFlujoValue: { fontSize: '1.3rem', fontWeight: 700, color: '#16170f' },
  pvFlujoValueDark: { color: '#fff' },
  pvFlujoSub: { fontSize: '0.66rem', color: '#9ca3af' },
  pvFlujoSubDark: { color: 'rgba(255,255,255,0.55)' },

  // Timeline vertical de trazabilidad (Programación → Remisión → Validación → Lotes → Consumo).
  pvTimeline: { display: 'flex', flexDirection: 'column' as const },
  pvStageRow: { display: 'flex', gap: '0.65rem' },
  pvStageIconCol: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center' },
  pvStageIcon: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#6b8c1f', flexShrink: 0 },
  pvStageLine: { width: '2px', flex: 1, backgroundColor: '#e5e7eb', minHeight: '0.7rem' },
  pvStageContent: { flex: 1, minWidth: 0, paddingBottom: '0.75rem' },
  pvStageHeaderRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.4rem' },
  pvStageTitle: { fontSize: '0.8rem', fontWeight: 700, color: '#16170f', margin: 0 },
  pvStageTag: { fontSize: '0.68rem', fontWeight: 700, color: '#4d7a13', flexShrink: 0 },
  pvStageCard: { backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '8px', padding: '0.65rem 0.8rem' },
  pvValidacionBox: { backgroundColor: '#f3faec', border: '1px solid #dbe8c2', borderRadius: '8px', padding: '0.5rem 0.7rem', display: 'flex', alignItems: 'flex-start' as const, gap: '0.5rem', marginBottom: '0.6rem' },
  pvValidacionCheck: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#6b8c1f', flexShrink: 0, marginTop: '0.1rem' },

  // Caso "producto distinto al remisionado" — recuadro naranja con comparación Remitido/Consumido
  // y la diferencia de valor entre ambos (costoUnitario del producto consumido, igual que "Costo
  // Unit." en Consumos utilizados/Validar consumos).
  pvDistintoBox: { backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', overflow: 'hidden' as const, marginBottom: '0.6rem' },
  pvDistintoHeader: { display: 'flex', alignItems: 'flex-start' as const, gap: '0.5rem', padding: '0.6rem 0.7rem' },
  pvDistintoIcon: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#c2730c', flexShrink: 0, marginTop: '0.1rem' },
  pvDistintoCompareRow: { display: 'flex', backgroundColor: '#fff', borderTop: '1px solid #fde68a', borderBottom: '1px solid #fde68a' },
  pvDistintoCompareCol: { flex: 1, minWidth: 0, padding: '0.55rem 0.7rem', display: 'flex', flexDirection: 'column' as const, gap: '0.15rem' },
  pvDistintoCompareLabel: { fontSize: '0.64rem', fontWeight: 700, color: '#c2730c', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  pvDistintoCompareCodigo: { fontSize: '0.78rem', fontWeight: 700, color: '#16170f' },
  pvDistintoFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', padding: '0.5rem 0.7rem' },
  pvNotaBox: { backgroundColor: '#f9fafb', border: '1px solid #eeeee6', borderRadius: '8px', padding: '0.5rem 0.7rem', fontSize: '0.75rem' },
  pvNotaLabel: { color: '#9ca3af' },
  pvNotaValue: { color: '#16170f', fontWeight: 700 },
  pvNotaTexto: { fontSize: '0.7rem', color: '#9ca3af' },

  // Vista principal de "Consumo" (ConsumoDetalleModal sin pestañas) — franja de 5 cajas, recuadro
  // morado de confirmación, dos columnas (cirugía/productos validados) y lista de lotes.
  pvConsumoSectionHeaderRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', marginBottom: '0.6rem' },
  pvConsumoBadgePendiente: { backgroundColor: '#ede9fe', color: '#6d28d9' },
  pvConsumoConfirmBox: { backgroundColor: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '10px', padding: '0.75rem 0.9rem', display: 'flex', alignItems: 'flex-start' as const, gap: '0.6rem', marginBottom: '1rem' },
  pvConsumoConfirmBoxDone: { backgroundColor: '#f3faec', border: '1px solid #dbe8c2' },
  pvConsumoConfirmIcon: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#6d28d9', flexShrink: 0, marginTop: '0.1rem' },
  pvConsumoConfirmIconDone: { backgroundColor: '#6b8c1f' },
  pvConsumoConfirmTextBox: { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.6rem 0.75rem' },
  pvConsumoTwoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem', alignItems: 'start' },
  pvConsumoAvatar: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#e9f2d8', color: '#3f6510', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 },
  pvConsumoIconCircle: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#e9f2d8', flexShrink: 0 },
  pvConsumoListHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', marginBottom: '0.6rem' },
  pvConsumoEmpty: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '0.35rem', padding: '1.25rem', textAlign: 'center' as const },
  pvConsumoEmptyIcon: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '50%', backgroundColor: '#f3f4f6' },
  pvConsumoEmptyTitle: { fontSize: '0.82rem', fontWeight: 700, color: '#6b7280' },
  pvConsumoEmptySub: { fontSize: '0.72rem', color: '#9ca3af' },
  pvConsumoListRow: { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0', cursor: 'pointer' },
  pvConsumoListIcon: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#6b8c1f', flexShrink: 0 },
  pvConsumoListIconWarn: { backgroundColor: '#c2730c' },
  pvConsumoListBadge: { fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', backgroundColor: '#f3f4f6', padding: '0.2rem 0.55rem', borderRadius: '999px', flexShrink: 0, whiteSpace: 'nowrap' as const },
  pvTrazaLabel: { fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  pvEstadoBadge: { display: 'inline-flex', alignItems: 'center', padding: '0.1rem 0.5rem', borderRadius: '999px', fontSize: '0.64rem', fontWeight: 700, backgroundColor: '#e9f2d8', color: '#3f6510' },
  pvEstadoBadgeInactive: { backgroundColor: '#f3f4f6', color: '#6b7280' },
  // Mismo formato de botón-ícono redondo con borde que usan los headers de Programación/Remisión
  // (iconMenuBtn) — el "..." y el cerrar de este header deben verse igual que en esos formularios.
  pvHeaderIconBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: '1px solid #e5e7eb', borderRadius: '999px', cursor: 'pointer', color: '#33342a', backgroundColor: '#fff', flexShrink: 0 },
  dropdown: { position: 'absolute' as const, top: 'calc(100% + 8px)', right: 0, backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: '180px', overflow: 'hidden', zIndex: 200, padding: '0.35rem' },
  dropdownItem: { display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.6rem 0.75rem', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.84375rem', color: '#33342a', fontWeight: 600, textAlign: 'left' as const },

  consumosTableWrap: { overflow: 'auto' as const, maxHeight: '320px', borderRadius: '10px', border: '1px solid #eeeee6' },
  consumosTable: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.78rem' },
  consumosTh: { padding: '0.55rem 0.75rem', textAlign: 'left' as const, fontWeight: 700, color: '#9ca3af', fontSize: '0.65rem', textTransform: 'uppercase' as const, letterSpacing: '0.03em', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' as const, position: 'sticky' as const, top: 0 },
  consumosTd: { padding: '0.55rem 0.75rem', borderBottom: '1px solid #f3f4f0', color: '#33342a', whiteSpace: 'nowrap' as const },
  consumosTdTruncate: { overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, maxWidth: '220px' },

  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '2rem' },
  modalContent: { backgroundColor: '#fff', borderRadius: '16px', width: '90%', maxWidth: '900px', maxHeight: '90dvh', overflowY: 'auto' as const, overflowX: 'hidden' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  subModalContent: { backgroundColor: '#fff', borderRadius: '16px', width: '90%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' as const, overflowX: 'hidden' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  subModalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.1rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #eeeee6', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', position: 'sticky' as const, top: 0 },
  modalTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#16170f', margin: 0 },
  closeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', border: 'none', backgroundColor: '#f4f4ee', borderRadius: '8px', cursor: 'pointer', color: '#6b6b60', flexShrink: 0 },
  modalBody: { padding: '1rem 1.1rem' },
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
