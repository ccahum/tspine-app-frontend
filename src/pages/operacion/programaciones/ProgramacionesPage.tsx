import { useState, useEffect, useRef, memo, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { Search, Lock, AlertCircle, CircleX, DollarSign, Plus, X, Calendar, BarChart3, Activity, MapPin, ArrowDown, ArrowUp, ArrowRight, FileText, ChevronDown } from 'lucide-react';
import { MaterialIcon } from '../../../components/icons/MaterialIcon';
import HeaderBackReveal from '../../../components/HeaderBackReveal';
import DatePicker from '../../../components/DatePicker';
import DateRangeFilter from '../../../components/filters/DateRangeFilter';
import StatusFilter from '../../../components/filters/StatusFilter';
import ProgramacionesStats from './ProgramacionesStats';
import SuccessToast from '../../../components/SuccessToast';
import { useNavigateWithLoading } from '../../../hooks/useNavigateWithLoading';
import { useResponsiveStyles } from '../../../hooks/useResponsiveStyles';
import { useSmoothWheelScroll } from '../../../hooks/useSmoothWheelScroll';
import { programacionesService } from '../../../services/programaciones.service';
import type { ProgramacionQuery, ProgramacionItem, SedeOption, HospitalOption, MedicoOption, CotizacionOption, ProgramacionSortField } from '../../../services/programaciones.service';
import { cotizacionesService } from '../../../services/cotizaciones.service';
import type { ProductoOption } from '../../../services/cotizaciones.service';
import { remisionesService } from '../../../services/remisiones.service';
import type { TecnicoOption } from '../../../services/remisiones.service';
import { getTodayMexico, getNowMexicoTime } from '../../../lib/date.utils';

type FlagKey = 'sinRemision' | 'consumoNoValidado' | 'sinComision' | 'cerrada';

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

const isFechaHoy = (fechaQx: string | null): boolean =>
  !!fechaQx && fechaQx.split('T')[0] === getTodayMexico();

const formatMoney = (value: number | null): string => {
  if (value === null || value === undefined) return '-';
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Los 4 indicadores se calculan automáticamente (¿tienen relaciones reales?) — son de solo lectura.
// "cerrada" se cierra desde el botón "Cerrar Programación" en el detalle, que valida remisión y requisición.
const FLAG_CONFIG: { key: FlagKey; icon: React.ReactNode; label: string; color: string }[] = [
  { key: 'sinRemision',       icon: <AlertCircle size={13} />,  label: 'Sin Remisión',  color: '#dc2626' },
  { key: 'consumoNoValidado', icon: <CircleX size={13} />,      label: 'Sin Validar Consumo', color: '#7c3aed' },
  {
    key: 'sinComision',
    icon: (
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13 }}>
        <DollarSign size={13} />
        <span style={{ position: 'absolute', top: '50%', left: '50%', width: '17px', height: '1.6px', backgroundColor: 'currentColor', transform: 'translate(-50%, -50%) rotate(-45deg)', borderRadius: '1px' }} />
      </span>
    ),
    label: 'Sin Comisión',
    color: '#2563eb',
  },
  { key: 'cerrada',           icon: <Lock size={13} />,         label: 'Cerrada',       color: '#6b7280' },
];

const badgeDot: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: '20px', height: '20px', borderRadius: '50%',
};

function StatusBadges({ item }: { item: ProgramacionItem }) {
  const active = FLAG_CONFIG.filter(f => item[f.key]);
  if (active.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: '3px', flexWrap: 'nowrap' }}>
      {active.map(({ key, icon, color }) => (
        <span key={key} style={{ ...badgeDot, backgroundColor: `${color}18`, color }}>{icon}</span>
      ))}
    </div>
  );
}

const ProgramacionRow = memo(({ item, navigate, index }: { item: ProgramacionItem; navigate: (path: string, routeKey?: string) => void; index: number }) => {
  const today = isFechaHoy(item.fechaQx);
  const baseBg = today ? 'rgba(107, 140, 31, 0.14)' : '#fff';
  return (
  <tr
    key={item.id}
    data-today-row={today ? 'true' : undefined}
    style={{ ...styles.tr, backgroundColor: baseBg }}
    onClick={() => navigate(`/operacion/programaciones/${item.id}`, '/operacion/programaciones/:id')}
    onMouseEnter={e => {
      e.currentTarget.style.backgroundColor = today ? 'rgba(107, 140, 31, 0.26)' : '#f3f4f6';
      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.backgroundColor = baseBg;
      e.currentTarget.style.boxShadow = 'none';
    }}
  >
    <td style={{ ...styles.td, textAlign: 'center', fontWeight: 600, color: '#999', width: '40px' }}>{index + 1}</td>
    <td style={{ ...styles.td, paddingLeft: '10px', width: '95px', whiteSpace: 'nowrap' as const }}>
      <StatusBadges item={item} />
    </td>
    <td style={{ ...styles.td, color: '#6b8c1f', fontWeight: 700 }}>
      {item.id}
    </td>
    <td style={{ ...styles.td, color: '#666', fontSize: '0.82rem', whiteSpace: 'nowrap' as const }}>{formatDateTime(item.createdAt)}</td>
    <td style={styles.td}>{formatDate(item.fechaQx)}</td>
    <td style={styles.td}>{item.horaQx ?? '-'}</td>
    <td style={styles.td}>{item.sede ?? '-'}</td>
    <td style={styles.td}>{item.ciudad ?? '-'}</td>
    <td style={{ ...styles.td, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {item.medicos.join(', ') || '-'}
    </td>
    <td style={{ ...styles.td, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {item.hospital ?? '-'}
    </td>
    <td style={{ ...styles.td, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#666', fontSize: '0.82rem' }}>
      {item.observaciones ?? '-'}
    </td>
  </tr>
  );
});

const ProgramacionCard = memo(({ item, navigate }: { item: ProgramacionItem; navigate: (path: string, routeKey?: string) => void }) => {
  const today = isFechaHoy(item.fechaQx);
  return (
    <div
      style={{ ...styles.mobileCard, ...(today ? styles.mobileCardToday : {}) }}
      onClick={() => navigate(`/operacion/programaciones/${item.id}`, '/operacion/programaciones/:id')}
    >
      <div style={styles.mobileCardTopRow}>
        <span style={styles.mobileCardId}>
          <Calendar size={12} color="#6b8c1f" style={{ flexShrink: 0 }} />
          {item.id}
        </span>
        <StatusBadges item={item} />
      </div>
      <div style={styles.mobileCardMainRow}>
        <div style={styles.mobileCardFechaHora}>
          <span style={styles.mobileCardFecha}>{formatDate(item.fechaQx)}</span>
          <span style={styles.mobileCardHora}>{item.horaQx ?? '-'}</span>
        </div>
        <div style={styles.mobileCardSedeCiudad}>
          {item.sede ?? '-'}{item.ciudad ? ` · ${item.ciudad}` : ''}
        </div>
      </div>
      <div style={styles.mobileCardFieldsRow}>
        <div style={{ ...styles.mobileCardField, flex: 1, minWidth: 0 }}>
          <span style={styles.mobileCardFieldLabel}>Médico</span>
          <span style={styles.mobileCardFieldValue}>{item.medicos.join(', ') || '-'}</span>
        </div>
        <div style={{ ...styles.mobileCardField, flex: 1, minWidth: 0 }}>
          <span style={styles.mobileCardFieldLabel}>Hospital</span>
          <span style={styles.mobileCardFieldValue}>{item.hospital ?? '-'}</span>
        </div>
      </div>
      {item.observaciones && (
        <div style={styles.mobileCardObservaciones}>{item.observaciones}</div>
      )}
    </div>
  );
});

export default function ProgramacionesPage() {
  const navigate = useNavigateWithLoading();
  const queryClient = useQueryClient();
  const { isMobile } = useResponsiveStyles();
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<ProgramacionSortField | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  // Recuerda si el usuario prefiere los indicadores contraídos, para no tener que volver a
  // ocultarlos cada vez que entra al módulo.
  const [indicadoresAbiertos, setIndicadoresAbiertos] = useState(() => localStorage.getItem('tspine_programaciones_indicadores_abiertos') !== 'false');
  useEffect(() => {
    localStorage.setItem('tspine_programaciones_indicadores_abiertos', String(indicadoresAbiertos));
  }, [indicadoresAbiertos]);
  // El gráfico de Distribución por Sede solo reproduce su animación de entrada (la de recharts)
  // al montarse — como los indicadores nunca se desmontan (se colapsan con CSS), volver a
  // mostrarlos no la repetía. Este key fuerza un remount del gráfico cada vez que se abren.
  // Se incrementa directo en el onClick del botón (no en un useEffect que reacciona al cambio
  // de indicadoresAbiertos) para que el remount quede en el mismo ciclo que el clic, sin
  // esperar un render/commit extra — así la animación arranca antes.
  const [sedeChartAnimKey, setSedeChartAnimKey] = useState(0);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(tableWrapRef, [], 3);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  // pageWrapper está anclado al viewport (position:fixed) para que solo la tabla de registros
  // scrollee internamente, igual que en CotizacionesPage — pero acá los Indicadores pueden ser
  // más altos que el espacio disponible (gráficas, comparativas, etc.). En vez de forzarlos a
  // achicarse dentro de un contenedor fijo, mientras estén abiertos se libera el scroll de toda
  // la página (pageWrapper deja de estar anclado) para que nada quede recortado; al ocultarlos
  // se vuelve al modo fijo sin scroll, ya que ahí sí cabe todo (header + tabla + paginación).
  useEffect(() => {
    document.body.style.overflow = indicadoresAbiertos ? '' : 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [indicadoresAbiertos]);

  useEffect(() => {
    if (!showNewModal) return;
    // overflow:hidden solo en el body no basta en iOS Safari — el fondo se sigue pudiendo
    // deslizar con el dedo. Fijar la posición del body en el scroll actual sí lo bloquea ahí, y
    // se restaura la posición exacta al cerrar el modal.
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [showNewModal]);

  const [newForm, setNewForm] = useState({ fechaQx: '', horaQx: '', sedeId: '', hospitalId: '' });
  const [newObservaciones, setNewObservaciones] = useState('');
  const [newConsumo, setNewConsumo] = useState('');
  const [newConsumoPanelOpen, setNewConsumoPanelOpen] = useState(false);
  const [newConsumoProductoSearch, setNewConsumoProductoSearch] = useState('');
  const [newConsumoProductoFocused, setNewConsumoProductoFocused] = useState(false);
  const [importandoConsumos, setImportandoConsumos] = useState(false);
  const consumoPanelRef = useRef<HTMLDivElement>(null);

  // Al cerrar el panel (clic afuera, X, o volver a pulsar el botón) se limpia la búsqueda a medias.
  const closeConsumoPanel = () => {
    setNewConsumoPanelOpen(false);
    setNewConsumoProductoSearch('');
  };

  // Cierra el panel "Agregar del catálogo" al hacer clic afuera (mismo patrón que DatePicker).
  useEffect(() => {
    if (!newConsumoPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (consumoPanelRef.current?.contains(e.target as Node)) return;
      closeConsumoPanel();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [newConsumoPanelOpen]);
  const [newMedicos, setNewMedicos] = useState<MedicoOption[]>([]);
  const [newMedicoSearch, setNewMedicoSearch] = useState('');
  const [newHospitalSearch, setNewHospitalSearch] = useState('');
  const [newMedicoFocused, setNewMedicoFocused] = useState(false);
  const [newHospitalFocused, setNewHospitalFocused] = useState(false);
  const [newCotizaciones, setNewCotizaciones] = useState<CotizacionOption[]>([]);
  const [newCotizacionFocused, setNewCotizacionFocused] = useState(false);
  const [newCotizacionFilterText, setNewCotizacionFilterText] = useState('');
  const [newTecnicosSugeridos, setNewTecnicosSugeridos] = useState<TecnicoOption[]>([]);
  const [newTecnicoSugeridoSearch, setNewTecnicoSugeridoSearch] = useState('');
  const [newTecnicoSugeridoFocused, setNewTecnicoSugeridoFocused] = useState(false);
  const [newProgramacionError, setNewProgramacionError] = useState<{ field: string; message: string } | null>(null);
  const [showCreateSuccess, setShowCreateSuccess] = useState(false);

  useEffect(() => {
    if (!newProgramacionError) return;
    document.getElementById(`programacion-new-field-${newProgramacionError.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [newProgramacionError]);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedMonthForSedes, setSelectedMonthForSedes] = useState<number>(new Date().getMonth() + 1);

  const query: ProgramacionQuery = {
    page, limit: 200,
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sinRemision: statusFilters.includes('sinRemision') ? true : undefined,
    consumoNoValidado: statusFilters.includes('consumoNoValidado') ? true : undefined,
    sinComision: statusFilters.includes('sinComision') ? true : undefined,
    cerrada: statusFilters.includes('cerrada') ? true : undefined,
    sortBy,
    sortOrder: sortBy ? sortOrder : undefined,
  };

  const handleSort = (field: ProgramacionSortField) => {
    setPage(1);
    if (sortBy === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['programaciones', query],
    queryFn: () => programacionesService.findAll(query),
    placeholderData: keepPreviousData,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['programaciones-stats', query],
    queryFn: () => programacionesService.getStats(query),
    placeholderData: keepPreviousData,
  });

  const { data: sedeOptions = [] } = useQuery<SedeOption[]>({
    queryKey: ['programaciones-sedes'],
    queryFn: () => programacionesService.getSedes(),
    enabled: showNewModal,
  });

  const { data: hospitalOptions = [] } = useQuery<HospitalOption[]>({
    queryKey: ['programaciones-hospitales'],
    queryFn: () => programacionesService.getHospitales(),
    enabled: showNewModal,
  });

  const { data: newMedicoResults = [] } = useQuery<MedicoOption[]>({
    queryKey: ['programaciones-medicos', newMedicoSearch],
    queryFn: () => programacionesService.searchMedicos(newMedicoSearch),
    enabled: showNewModal && newMedicoFocused,
  });

  const newMedicoNombres = newMedicos.map(m => m.nombreCompleto);
  const { data: newCotizacionResults = [] } = useQuery<CotizacionOption[]>({
    queryKey: ['programaciones-cotizaciones', newMedicoNombres],
    queryFn: () => programacionesService.searchCotizaciones(undefined, newMedicoNombres),
    enabled: showNewModal && newCotizacionFocused && newMedicoNombres.length > 0,
  });
  // El servidor ya acota a las cotizaciones de los médicos seleccionados — esto solo afina esa
  // lista en el navegador por folio/cirugía/fecha/total, sin volver a pedirle nada al backend.
  const newCotizacionFilterQuery = newCotizacionFilterText.trim().toLowerCase();
  const newCotizacionResultsFiltradas = newCotizacionFilterQuery
    ? newCotizacionResults.filter(c => {
        const folio = (c.numCotizacion ?? c.id).toLowerCase();
        const cirugia = (c.cirugia ?? '').toLowerCase();
        const fecha = formatDate(c.fecha).toLowerCase();
        const total = formatMoney(c.total).toLowerCase();
        return folio.includes(newCotizacionFilterQuery)
          || cirugia.includes(newCotizacionFilterQuery)
          || fecha.includes(newCotizacionFilterQuery)
          || total.includes(newCotizacionFilterQuery);
      })
    : newCotizacionResults;

  const { data: newConsumoProductoResults = [] } = useQuery<ProductoOption[]>({
    queryKey: ['programaciones-consumo-productos', newConsumoProductoSearch],
    queryFn: () => cotizacionesService.searchProductos(newConsumoProductoSearch),
    enabled: showNewModal && newConsumoProductoFocused,
  });

  const { data: newTecnicoSugeridoResults = [] } = useQuery<TecnicoOption[]>({
    queryKey: ['tecnicos-comisionistas', newTecnicoSugeridoSearch],
    queryFn: () => remisionesService.searchTecnicosComisionistas(newTecnicoSugeridoSearch),
    enabled: showNewModal && newTecnicoSugeridoFocused,
  });

  const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const selectedNewHospital = hospitalOptions.find(h => h.id === newForm.hospitalId) ?? null;
  // Sin texto se muestran todas las opciones (ya vienen ordenadas alfabéticamente del backend),
  // igual que el buscador de Hospital/Médico en Nueva Cotización.
  const newHospitalResults = newHospitalSearch.trim()
    ? hospitalOptions.filter(h => h.nombre.toLowerCase().includes(newHospitalSearch.trim().toLowerCase()))
    : hospitalOptions;

  // Al crear (no al editar) no se permite elegir fecha/hora ya pasada.
  const todayMexico = getTodayMexico();
  const isNewFechaToday = newForm.fechaQx === todayMexico;
  const nowMexicoTime = getNowMexicoTime();
  const minHour = isNewFechaToday ? Number(nowMexicoTime.split(':')[0]) : 0;
  const selectedHour = newForm.horaQx.split(':')[0] ?? '';
  const minMinute = isNewFechaToday && Number(selectedHour) === minHour ? Number(nowMexicoTime.split(':')[1]) : 0;

  // Bloqueo secuencial: cada campo obligatorio solo se habilita cuando el anterior ya se llenó
  // (mismo criterio que en Nueva Cotización), para guiar al usuario en el orden correcto.
  const newFechaQxListo = !!newForm.fechaQx;
  const newHoraQxListo = newFechaQxListo && !!newForm.horaQx && !newForm.horaQx.split(':').some(p => !p);
  const newSedeListo = newHoraQxListo && !!newForm.sedeId;
  const newHospitalListo = newSedeListo && !!newForm.hospitalId;
  const newMedicosListo = newHospitalListo && newMedicos.length > 0;

  // Resetear al cambiar filtros
  useEffect(() => {
    setPage(1);
  }, [search, dateFrom, dateTo, statusFilters]);

  const items = data?.data ?? [];

  // Al cargar (o recargar por filtros) posiciona el scroll en las programaciones de hoy:
  // arriba quedan las fechas futuras, abajo las pasadas. Solo aplica en la página 1.
  useEffect(() => {
    if (page !== 1 || items.length === 0) return;
    const container = tableWrapRef.current;
    if (!container) return;
    const todayRow = container.querySelector<HTMLElement>('[data-today-row="true"]');
    if (!todayRow) return;
    const headerHeight = theadRef.current?.offsetHeight ?? 0;
    container.scrollTop = todayRow.offsetTop - headerHeight;
  }, [items, page]);


  const yearMonthStats = {
    thisYear: stats?.programacionesAño ?? 0,
    thisMonth: stats?.programacionesMes ?? 0,
  };

  const { data: comparisonData } = useQuery({
    queryKey: ['programaciones-comparison-monthly'],
    queryFn: () => programacionesService.getMonthComparison(),
  });

  const currentYear = new Date().getUTCFullYear();
  const { data: sedeDistributionData } = useQuery({
    queryKey: ['programaciones-sede-distribution', currentYear, selectedMonthForSedes],
    queryFn: () => programacionesService.getSedeDistributionByMonth(currentYear, selectedMonthForSedes),
  });

  const monthComparison = useMemo(() => {
    if (!comparisonData?.data) return [];

    return comparisonData.data.map(item => ({
      year: item.year,
      count: item.months[selectedMonth] || 0,
    }));
  }, [comparisonData, selectedMonth]);

  const comparisonAnalysis = useMemo(() => {
    if (monthComparison.length < 2) return null;

    const currentYear = new Date().getUTCFullYear();
    const currentYearData = monthComparison.find(item => item.year === currentYear);
    const previousYearData = monthComparison.find(item => item.year === currentYear - 1);

    if (!currentYearData || !previousYearData) return null;

    const currentCount = currentYearData.count;
    const previousCount = previousYearData.count;
    const difference = currentCount - previousCount;
    const percentChange = previousCount > 0 ? (difference / previousCount) * 100 : 0;
    const trend = difference > 0 ? 'subida' : difference < 0 ? 'bajada' : 'igual';
    const trendSymbol = difference > 0 ? '↑' : difference < 0 ? '↓' : '→';

    // Comparar con mes anterior del año actual
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const previousMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
    const previousMonthName = monthNames[previousMonth - 1];
    const currentYearAllMonths = comparisonData?.data.find(item => item.year === currentYear);
    const previousMonthCount = currentYearAllMonths?.months[previousMonth] || 0;
    const monthDifference = currentCount - previousMonthCount;
    const monthTrend = monthDifference > 0 ? 'subida' : monthDifference < 0 ? 'bajada' : 'igual';
    const monthTrendSymbol = monthDifference > 0 ? '↑' : monthDifference < 0 ? '↓' : '→';

    return {
      difference: Math.abs(difference),
      trend,
      trendSymbol,
      percentChange: Math.abs(percentChange),
      monthDifference: Math.abs(monthDifference),
      monthTrend,
      monthTrendSymbol,
      previousMonthName,
    };
  }, [monthComparison, selectedMonth, comparisonData]);

  const sedeStats = useMemo(() => {
    const sedeData = sedeDistributionData?.data || [];
    if (!sedeData || sedeData.length === 0) return null;

    const total = sedeData.reduce((sum, s) => sum + s.total, 0);
    const maxSede = sedeData.reduce((max, s) => s.total > max.total ? s : max);
    const minSede = sedeData.reduce((min, s) => s.total < min.total ? s : min);
    const avgPerSede = (total / sedeData.length).toFixed(0);
    const maxPercentage = ((maxSede.total / total) * 100).toFixed(1);

    return {
      total,
      maxSede: maxSede.sede.replace('Sede ', ''),
      maxCount: maxSede.total,
      maxPercentage,
      minSede: minSede.sede.replace('Sede ', ''),
      minCount: minSede.total,
      avgPerSede,
      sedesCount: sedeData.length,
    };
  }, [sedeDistributionData?.data]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const creada = await programacionesService.create({
        fechaQx: newForm.fechaQx,
        horaQx: newForm.horaQx,
        sedeId: newForm.sedeId,
        hospitalId: newForm.hospitalId,
        observaciones: newObservaciones,
        consumo: newConsumo,
        medicoIds: newMedicos.map(m => m.id),
        cotizacionIds: newCotizaciones.map(c => c.id),
      });
      // Los técnicos sugeridos no se pueden crear junto con la programación (necesitan su id) —
      // se crean aparte justo después, uno por cada técnico elegido.
      if (newTecnicosSugeridos.length > 0) {
        await Promise.all(
          newTecnicosSugeridos.map(t => remisionesService.createTecnicoSugerido({ programacionId: creada.id, tecnicoId: t.id })),
        );
      }
      return creada;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programaciones'] });
      queryClient.invalidateQueries({ queryKey: ['programaciones-stats'] });
      setShowNewModal(false);
      setShowCreateSuccess(true);
    },
  });

  const openNewModal = () => {
    setNewForm({ fechaQx: '', horaQx: '', sedeId: '', hospitalId: '' });
    setNewObservaciones('');
    setNewConsumo('');
    setNewConsumoPanelOpen(false);
    setNewConsumoProductoSearch('');
    setNewMedicos([]);
    setNewMedicoSearch('');
    setNewHospitalSearch('');
    setNewCotizaciones([]);
    setNewCotizacionFilterText('');
    setNewTecnicosSugeridos([]);
    setNewTecnicoSugeridoSearch('');
    setNewProgramacionError(null);
    setShowNewModal(true);
  };

  // Trae los productos ya cotizados en las cotizaciones vinculadas y los anexa al Consumo, en el
  // mismo formato (solo nombre) que al agregarlos uno por uno desde el catálogo.
  const handleImportarConsumosCotizacion = async () => {
    if (newCotizaciones.length === 0 || importandoConsumos) return;
    setImportandoConsumos(true);
    try {
      const nombres = await programacionesService.getConsumosDeCotizaciones(newCotizaciones.map(c => c.id));
      if (nombres.length > 0) {
        setNewConsumo(prev => (prev.trim() ? `${prev.trim()}, ${nombres.join(', ')}` : nombres.join(', ')));
        setNewProgramacionError(null);
      }
    } finally {
      setImportandoConsumos(false);
    }
  };

  const handleGuardarNew = () => {
    if (!newForm.fechaQx) { setNewProgramacionError({ field: 'fechaQx', message: 'Selecciona la fecha.' }); return; }
    if (!newForm.horaQx || newForm.horaQx.split(':').some(p => !p)) { setNewProgramacionError({ field: 'horaQx', message: 'Selecciona la hora.' }); return; }
    if (!newForm.sedeId) { setNewProgramacionError({ field: 'sedeId', message: 'Selecciona la sede.' }); return; }
    if (!newForm.hospitalId) { setNewProgramacionError({ field: 'hospitalId', message: 'Selecciona el hospital.' }); return; }
    if (newMedicos.length === 0) { setNewProgramacionError({ field: 'medicos', message: 'Agrega al menos un médico.' }); return; }
    if (!newConsumo.trim()) { setNewProgramacionError({ field: 'consumo', message: 'Ingresa el consumo.' }); return; }
    setNewProgramacionError(null);
    createMutation.mutate();
  };

  return (
    <>
      {showNewModal && (
        <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setShowNewModal(false)}>
          <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Nueva Programación</h2>
              <button style={styles.closeBtn} onClick={() => setShowNewModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.formGroup} id="programacion-new-field-fechaQx">
                <label style={styles.label}>Fecha QX *</label>
                <DatePicker
                  min={todayMexico}
                  error={newProgramacionError?.field === 'fechaQx'}
                  value={newForm.fechaQx}
                  onChange={fechaQx => {
                    const esHoy = fechaQx === todayMexico;
                    const [h, m] = newForm.horaQx.split(':');
                    const horaInvalida = esHoy && h && (Number(h) < Number(nowMexicoTime.split(':')[0])
                      || (Number(h) === Number(nowMexicoTime.split(':')[0]) && m && Number(m) < Number(nowMexicoTime.split(':')[1])));
                    setNewForm({ ...newForm, fechaQx, horaQx: horaInvalida ? '' : newForm.horaQx });
                    setNewProgramacionError(null);
                  }}
                />
                {newProgramacionError?.field === 'fechaQx' && <span style={styles.errorText}>{newProgramacionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="programacion-new-field-horaQx">
                <label style={styles.label}>Hora QX *</label>
                <div style={styles.horaGrid}>
                  <select
                    disabled={!newFechaQxListo}
                    style={{ ...styles.input, ...(newProgramacionError?.field === 'horaQx' ? styles.inputError : {}), ...(!newFechaQxListo ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                    value={newForm.horaQx.split(':')[0] ?? ''}
                    onChange={e => {
                      const minuto = newForm.horaQx.split(':')[1] ?? '00';
                      setNewForm({ ...newForm, horaQx: `${e.target.value}:${minuto}` });
                      setNewProgramacionError(null);
                    }}
                  >
                    <option value="">HH</option>
                    {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).filter(h => Number(h) >= minHour).map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <select
                    disabled={!newFechaQxListo}
                    style={{ ...styles.input, ...(newProgramacionError?.field === 'horaQx' ? styles.inputError : {}), ...(!newFechaQxListo ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                    value={newForm.horaQx.split(':')[1] ?? ''}
                    onChange={e => {
                      const hora = newForm.horaQx.split(':')[0] ?? '00';
                      setNewForm({ ...newForm, horaQx: `${hora}:${e.target.value}` });
                      setNewProgramacionError(null);
                    }}
                  >
                    <option value="">MM</option>
                    {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).filter(m => Number(m) >= minMinute).map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                {!newFechaQxListo && <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Selecciona primero la fecha QX</span>}
                {newProgramacionError?.field === 'horaQx' && <span style={styles.errorText}>{newProgramacionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="programacion-new-field-sedeId">
                <label style={styles.label}>Sede *</label>
                <div style={styles.sedeGrid}>
                  {sedeOptions.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!newHoraQxListo}
                      style={{ ...styles.sedeBtn, ...(newForm.sedeId === s.id ? styles.sedeBtnActive : {}), ...(newProgramacionError?.field === 'sedeId' ? styles.inputError : {}), ...(!newHoraQxListo ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => { setNewForm({ ...newForm, sedeId: s.id }); setNewProgramacionError(null); e.currentTarget.blur(); }}
                    >
                      {s.nombre}
                    </button>
                  ))}
                </div>
                {!newHoraQxListo && <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Selecciona primero la hora QX</span>}
                {newProgramacionError?.field === 'sedeId' && <span style={styles.errorText}>{newProgramacionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="programacion-new-field-hospitalId">
                <label style={styles.label}>Hospital *</label>
                {selectedNewHospital && (
                  <div style={styles.medicoTagsWrap}>
                    <span style={styles.medicoTag}>
                      {selectedNewHospital.nombre}
                      <X size={12} style={{ cursor: 'pointer' }} onClick={() => setNewForm({ ...newForm, hospitalId: '' })} />
                    </span>
                  </div>
                )}
                {!selectedNewHospital && !newSedeListo && (
                  <span style={{ ...styles.input, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>
                    Selecciona primero la sede
                  </span>
                )}
                {!selectedNewHospital && newSedeListo && (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      style={{ ...styles.input, ...(newProgramacionError?.field === 'hospitalId' ? styles.inputError : {}) }}
                      placeholder="Buscar hospital..."
                      value={newHospitalSearch}
                      onChange={e => { setNewHospitalSearch(e.target.value); setNewProgramacionError(null); }}
                      onFocus={() => setNewHospitalFocused(true)}
                      onBlur={() => setTimeout(() => setNewHospitalFocused(false), 150)}
                    />
                    {newHospitalFocused && (
                      <div style={styles.medicoDropdown}>
                        {newHospitalResults.length === 0 ? (
                          <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                        ) : (
                          newHospitalResults.map(h => (
                            <div
                              key={h.id}
                              className="dropdown-item-hover"
                              style={styles.medicoDropdownItem}
                              onClick={() => { setNewForm({ ...newForm, hospitalId: h.id }); setNewHospitalSearch(''); setNewProgramacionError(null); }}
                            >
                              {h.nombre}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                {newProgramacionError?.field === 'hospitalId' && <span style={styles.errorText}>{newProgramacionError.message}</span>}
              </div>

              {selectedNewHospital?.ciudadCat?.nombre && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Ciudad QX</label>
                  <span style={styles.ciudadPill}>{selectedNewHospital.ciudadCat.nombre}</span>
                </div>
              )}

              <div style={styles.formGroup} id="programacion-new-field-medicos">
                <label style={styles.label}>Médico *</label>
                {newMedicos.length > 0 && (
                  <div style={styles.medicoTagsWrap}>
                    {newMedicos.map(m => (
                      <span key={m.id} style={styles.medicoTag}>
                        {m.nombreCompleto}
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => setNewMedicos(newMedicos.filter(x => x.id !== m.id))} />
                      </span>
                    ))}
                  </div>
                )}
                {!newHospitalListo && (
                  <span style={{ ...styles.input, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>
                    Selecciona primero el hospital
                  </span>
                )}
                {newHospitalListo && (
                <div style={{ position: 'relative' as const }}>
                  <input
                    style={{ ...styles.input, ...(newProgramacionError?.field === 'medicos' ? styles.inputError : {}) }}
                    placeholder="Buscar médico..."
                    value={newMedicoSearch}
                    onChange={e => { setNewMedicoSearch(e.target.value); setNewProgramacionError(null); }}
                    onFocus={() => setNewMedicoFocused(true)}
                    onBlur={() => setTimeout(() => setNewMedicoFocused(false), 150)}
                  />
                  {newMedicoFocused && (
                    <div style={styles.medicoDropdown}>
                      {newMedicoResults.filter(m => !newMedicos.some(x => x.id === m.id)).length === 0 ? (
                        <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                      ) : (
                        newMedicoResults.filter(m => !newMedicos.some(x => x.id === m.id)).map(m => (
                          <div
                            key={m.id}
                            className="dropdown-item-hover"
                            style={styles.medicoDropdownItem}
                            onClick={() => { setNewMedicos([...newMedicos, m]); setNewMedicoSearch(''); }}
                          >
                            {m.nombreCompleto}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
                )}
                {newProgramacionError?.field === 'medicos' && <span style={styles.errorText}>{newProgramacionError.message}</span>}
              </div>

              <div style={styles.formGroup} id="programacion-new-field-cotizaciones">
                <label style={styles.label}>Cotización</label>
                {newCotizaciones.length > 0 && (
                  <div style={styles.medicoTagsWrap}>
                    {newCotizaciones.map(c => (
                      <span key={c.id} style={styles.cotizacionChip}>
                        <FileText size={13} />
                        {c.numCotizacion ?? c.id}
                        <span style={{ color: '#7a9146' }}>· {formatMoney(c.total)}</span>
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => setNewCotizaciones(newCotizaciones.filter(x => x.id !== c.id))} />
                      </span>
                    ))}
                  </div>
                )}
                {newMedicos.length === 0 ? (
                  <span style={{ ...styles.input, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>
                    Selecciona primero un médico
                  </span>
                ) : (
                <div style={{ position: 'relative' as const }}>
                  <input
                    style={styles.input}
                    placeholder={`Buscar por folio, cirugía, fecha o total entre las cotizaciones de ${newMedicos.map(m => m.nombreCompleto).join(', ')}...`}
                    value={newCotizacionFilterText}
                    onChange={e => setNewCotizacionFilterText(e.target.value)}
                    onFocus={() => setNewCotizacionFocused(true)}
                    onBlur={() => setTimeout(() => setNewCotizacionFocused(false), 150)}
                  />
                  {newCotizacionFocused && (
                    <div style={styles.medicoDropdown}>
                      {newCotizacionResultsFiltradas.filter(c => !newCotizaciones.some(x => x.id === c.id)).length === 0 ? (
                        <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin cotizaciones que coincidan</div>
                      ) : (
                        newCotizacionResultsFiltradas.filter(c => !newCotizaciones.some(x => x.id === c.id)).map(c => (
                          <div
                            key={c.id}
                            className="dropdown-item-hover"
                            style={styles.medicoDropdownItem}
                            onClick={() => { setNewCotizaciones([...newCotizaciones, c]); setNewCotizacionFilterText(''); }}
                          >
                            <span style={{ flexShrink: 0, color: '#4d7a13', fontWeight: 700 }}>{c.numCotizacion ?? c.id}</span>
                            <span style={{ flexShrink: 0, color: '#9ca3af', fontWeight: 400 }}>·</span>
                            <span style={{ flexShrink: 0, fontWeight: 400 }}>{formatDate(c.fecha)}</span>
                            <span style={{ flexShrink: 0, color: '#9ca3af', fontWeight: 400 }}>·</span>
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, fontWeight: 400 }} title={c.cirugia || undefined}>
                              {c.cirugia || 'Sin cirugía'}
                            </span>
                            <span style={{ flexShrink: 0, color: '#9ca3af', fontWeight: 400 }}>·</span>
                            <span style={{ flexShrink: 0, fontWeight: 700 }}>{formatMoney(c.total)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
                )}
              </div>

              <div style={styles.formGroup} id="programacion-new-field-tecnicos-sugeridos">
                <label style={styles.label}>Técnicos Sugeridos</label>
                {newTecnicosSugeridos.length > 0 && (
                  <div style={styles.medicoTagsWrap}>
                    {newTecnicosSugeridos.map(t => (
                      <span key={t.id} style={styles.medicoTag}>
                        {t.nombreCompleto}
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => setNewTecnicosSugeridos(newTecnicosSugeridos.filter(x => x.id !== t.id))} />
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ position: 'relative' as const }}>
                  <input
                    style={styles.input}
                    placeholder="Buscar técnico..."
                    value={newTecnicoSugeridoSearch}
                    onChange={e => setNewTecnicoSugeridoSearch(e.target.value)}
                    onFocus={() => setNewTecnicoSugeridoFocused(true)}
                    onBlur={() => setTimeout(() => setNewTecnicoSugeridoFocused(false), 150)}
                  />
                  {newTecnicoSugeridoFocused && (
                    <div style={styles.medicoDropdown}>
                      {newTecnicoSugeridoResults.filter(t => !newTecnicosSugeridos.some(x => x.id === t.id)).length === 0 ? (
                        <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                      ) : (
                        newTecnicoSugeridoResults.filter(t => !newTecnicosSugeridos.some(x => x.id === t.id)).map(t => (
                          <div
                            key={t.id}
                            className="dropdown-item-hover"
                            style={styles.medicoDropdownItem}
                            onClick={() => { setNewTecnicosSugeridos([...newTecnicosSugeridos, t]); setNewTecnicoSugeridoSearch(''); }}
                          >
                            <Plus size={14} /> {t.nombreCompleto}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div style={styles.formGroup} id="programacion-new-field-consumo">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={styles.label}>Consumo *</label>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {newCotizaciones.length > 0 && (
                      <button
                        type="button"
                        className="btn-press"
                        style={{ ...styles.addFromCatalogBtn, ...(!newMedicosListo ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                        onClick={handleImportarConsumosCotizacion}
                        disabled={importandoConsumos || !newMedicosListo}
                      >
                        <FileText size={12} /> {importandoConsumos ? 'Importando...' : `Importar de ${newCotizaciones.length > 1 ? 'las cotizaciones' : 'la cotización'}`}
                      </button>
                    )}
                    <div style={{ position: 'relative' as const }} ref={consumoPanelRef}>
                      <button
                        type="button"
                        className="btn-press"
                        style={{ ...styles.addFromCatalogBtn, ...(!newMedicosListo ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                        disabled={!newMedicosListo}
                        onClick={() => (newConsumoPanelOpen ? closeConsumoPanel() : setNewConsumoPanelOpen(true))}
                      >
                        <Plus size={12} /> Agregar del catálogo
                      </button>
                    {newConsumoPanelOpen && (
                      <div style={styles.consumoPanel}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={styles.consumoPanelTitle}>Agregar producto</span>
                          <X size={14} style={{ cursor: 'pointer', color: '#9ca3af' }} onClick={closeConsumoPanel} />
                        </div>
                        <div style={{ position: 'relative' as const }}>
                          <input
                            style={{ ...styles.input, width: '100%' }}
                            placeholder="Buscar producto..."
                            value={newConsumoProductoSearch}
                            onChange={e => setNewConsumoProductoSearch(e.target.value)}
                            onFocus={() => setNewConsumoProductoFocused(true)}
                            onBlur={() => setTimeout(() => setNewConsumoProductoFocused(false), 150)}
                            autoFocus
                          />
                          {newConsumoProductoFocused && (
                            <div style={{ ...styles.medicoDropdown, left: 0, right: 0 }}>
                              {newConsumoProductoResults.length === 0 ? (
                                <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                              ) : (
                                newConsumoProductoResults.map(p => (
                                  <div
                                    key={p.id}
                                    className="dropdown-item-hover"
                                    style={styles.medicoDropdownItem}
                                    onClick={() => {
                                      const texto = p.nombre ?? '';
                                      setNewConsumo(prev => (prev.trim() ? `${prev.trim()}, ${texto}` : texto));
                                      setNewConsumoProductoSearch('');
                                      setNewProgramacionError(null);
                                    }}
                                  >
                                    {p.nombre}
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    </div>
                  </div>
                </div>
                <textarea
                  ref={autoResizeTextarea}
                  disabled={!newMedicosListo}
                  style={{ ...styles.input, minHeight: '44px', resize: 'none' as const, overflow: 'hidden' as const, ...(newProgramacionError?.field === 'consumo' ? styles.inputError : {}), ...(!newMedicosListo ? { color: '#9ca3af', backgroundColor: '#f4f4ee', cursor: 'not-allowed' } : {}) }}
                  placeholder={newMedicosListo ? 'Escribe el consumo o agrégalo desde el catálogo...' : 'Selecciona primero al menos un médico'}
                  value={newConsumo}
                  onChange={e => { setNewConsumo(e.target.value); setNewProgramacionError(null); autoResizeTextarea(e.target); }}
                />
                {newProgramacionError?.field === 'consumo' && <span style={styles.errorText}>{newProgramacionError.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Observaciones</label>
                <textarea
                  ref={autoResizeTextarea}
                  style={{ ...styles.input, minHeight: '44px', resize: 'none' as const, overflow: 'hidden' as const }}
                  value={newObservaciones}
                  onChange={e => { setNewObservaciones(e.target.value); autoResizeTextarea(e.target); }}
                  placeholder="Observaciones adicionales"
                />
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button style={styles.cancelBtn} onClick={() => setShowNewModal(false)}>
                Cancelar
              </button>
              <button style={styles.saveBtn} onClick={handleGuardarNew} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
      <SuccessToast show={showCreateSuccess} message="Programación creada" onClose={() => setShowCreateSuccess(false)} />
      <div
        style={{
          ...styles.pageWrapper,
          ...(indicadoresAbiertos ? { position: 'static' as const, overflow: 'visible' as const } : { left: isMobile ? 0 : '60px' }),
          paddingLeft: isMobile ? '0.75rem' : '1.5rem',
          paddingRight: isMobile ? '0.75rem' : '1.5rem',
        }}
      >
      <div style={styles.headerCard}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' as const }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <HeaderBackReveal
              onBack={() => navigate(-1)}
              icon={<Calendar size={20} color="#4d7a13" />}
              mobileIconAsBack={isMobile}
            >
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#333', margin: 0 }}>Programaciones</h2>
            </HeaderBackReveal>
          </div>

          <button
            type="button"
            className="btn-press"
            onClick={() => setIndicadoresAbiertos(o => {
              const next = !o;
              if (next) setSedeChartAnimKey(k => k + 1);
              return next;
            })}
            title={indicadoresAbiertos ? 'Ocultar indicadores' : 'Mostrar indicadores'}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0,
              padding: isMobile ? '0.5rem' : '0.5rem 0.9rem', border: '1px solid #eeeee6', borderRadius: '10px',
              backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, color: '#333',
            }}
          >
            <ChevronDown size={16} style={{ transform: indicadoresAbiertos ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s ease' }} />
            {!isMobile && (indicadoresAbiertos ? 'Ocultar indicadores' : 'Mostrar indicadores')}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateRows: indicadoresAbiertos ? '1fr' : '0fr', transition: 'grid-template-rows 0.3s ease', flexShrink: 0 }}>
      <div style={{ overflow: 'hidden', minHeight: 0, opacity: indicadoresAbiertos ? 1 : 0, transition: 'opacity 0.2s ease' }}>
      <div style={{ ...styles.yearMonthGrid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', marginBottom: '1.5rem' }}>
        <div
          style={styles.yearMonthCard}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#6b8c1f'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#eeeee6'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <div style={styles.yearMonthRow}>
            <div style={{ ...styles.yearMonthIconWrap, backgroundColor: '#6b8c1f1a' }}>
              <Calendar size={26} color="#6b8c1f" />
            </div>
            <div style={styles.yearMonthTextCol}>
              <span style={styles.yearMonthLabel}>Programaciones del Año</span>
              <div style={styles.yearMonthValue}>{yearMonthStats.thisYear}</div>
              <span style={styles.yearMonthSubLabel}>{new Date().getFullYear()}</span>
            </div>
          </div>
        </div>

        <div
          style={styles.yearMonthCard}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#6b8c1f'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#eeeee6'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <div style={styles.yearMonthRow}>
            <div style={{ ...styles.yearMonthIconWrap, backgroundColor: '#6b8c1f1a' }}>
              <BarChart3 size={26} color="#6b8c1f" />
            </div>
            <div style={styles.yearMonthTextCol}>
              <span style={styles.yearMonthLabel}>Programaciones del Mes</span>
              <div style={styles.yearMonthValue}>{yearMonthStats.thisMonth}</div>
              <span style={styles.yearMonthSubLabel}>{new Date().toLocaleString('es-MX', { month: 'long', year: 'numeric' })}</span>
            </div>
          </div>
        </div>

        <div
          style={styles.yearMonthCard}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#6b8c1f'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#eeeee6'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <div style={styles.yearMonthRow}>
            <div style={{ ...styles.yearMonthIconWrap, backgroundColor: '#6b8c1f1a' }}>
              <Activity size={26} color="#6b8c1f" />
            </div>
            <div style={styles.yearMonthTextCol}>
              <span style={styles.yearMonthLabel}>Total Programaciones</span>
              <div style={styles.yearMonthValue}>{stats?.total || 0}</div>
              <span style={styles.yearMonthSubLabel}>Todos los registros</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div
          style={styles.comparisonCard}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#6b8c1f'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#eeeee6'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <div style={styles.comparisonHeader}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
              <div style={{ ...styles.panelIconWrap, backgroundColor: '#6b8c1f1a' }}>
                <Calendar size={16} color="#6b8c1f" />
              </div>
              <div>
                <h3 style={styles.comparisonTitle}>Comparativa de Meses</h3>
                <p style={styles.comparisonSubtitle}>Programaciones de {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][selectedMonth - 1]} por año</p>
              </div>
            </div>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number.parseInt(e.target.value))}
              style={styles.monthSelect}
            >
              {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div style={styles.comparisonGrid}>
            {monthComparison.map(item => {
              const isCurrentYear = item.year === currentYear;
              return (
                <div
                  key={item.year}
                  style={{
                    ...styles.comparisonItem,
                    ...(isCurrentYear ? { backgroundColor: '#6b8c1f0d', border: '1px solid #6b8c1f33' } : {}),
                  }}
                >
                  <div style={styles.comparisonYear}>{item.year}</div>
                  <div style={{ ...styles.comparisonCount, color: isCurrentYear ? '#6b8c1f' : '#1a1a1a' }}>{item.count}</div>
                  <div style={styles.comparisonLabel}>programaciones</div>
                </div>
              );
            })}
          </div>

          {comparisonAnalysis && (
            <div
              style={{
                marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%', boxSizing: 'border-box',
                padding: '0.6rem 0.9rem', borderRadius: '10px',
                backgroundColor: comparisonAnalysis.trend === 'subida' ? '#6b8c1f14' : comparisonAnalysis.trend === 'bajada' ? '#dc262614' : '#6b728014',
                color: comparisonAnalysis.trend === 'subida' ? '#6b8c1f' : comparisonAnalysis.trend === 'bajada' ? '#dc2626' : '#6b7280',
                fontSize: '0.8rem', fontWeight: 600,
              }}
            >
              {comparisonAnalysis.trend === 'subida' ? <ArrowUp size={14} /> : comparisonAnalysis.trend === 'bajada' ? <ArrowDown size={14} /> : <ArrowRight size={14} />}
              {comparisonAnalysis.difference} programaciones {comparisonAnalysis.trend} con respecto al año anterior, lo que representa un {comparisonAnalysis.percentChange.toFixed(1)}% de {comparisonAnalysis.trend}.
            </div>
          )}
        </div>

        <div
          style={{ ...styles.comparisonCard, display: 'flex', flexDirection: 'column' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#6b8c1f'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#eeeee6'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{ ...styles.panelIconWrap, backgroundColor: '#6b8c1f1a' }}>
                <MapPin size={16} color="#6b8c1f" />
              </div>
              <h3 style={styles.comparisonTitle}>Distribución por Sede {currentYear}</h3>
            </div>
            <select
              value={selectedMonthForSedes}
              onChange={(e) => setSelectedMonthForSedes(Number.parseInt(e.target.value))}
              style={styles.monthSelect}
            >
              {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>

          {sedeDistributionData?.data && sedeDistributionData.data.length > 0 && sedeStats ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'center' }}>
              <ResponsiveContainer key={sedeChartAnimKey} width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={sedeDistributionData.data.map(s => ({ name: s.sede.replace('Sede ', ''), value: s.total }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    cornerRadius={6}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {sedeDistributionData.data.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `${value} programaciones`} />
                  <Legend verticalAlign="bottom" height={32} iconType="circle" iconSize={9} wrapperStyle={{ fontSize: '0.8rem', fontWeight: 600 }} />
                </PieChart>
              </ResponsiveContainer>

              <div style={{ padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '8px', fontSize: '0.8rem', color: '#555', lineHeight: '1.5', height: '100%', display: 'flex', alignItems: 'center' }}>
                <p style={{ margin: 0 }}>
                  En el mes de <span style={{ fontWeight: 600, color: '#6b8c1f' }}>
                    {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][selectedMonthForSedes - 1]}
                  </span> se detectan <span style={{ fontWeight: 600, color: '#6b8c1f' }}>{sedeStats.total} programaciones</span> distribuidas en{' '}
                  {sedeDistributionData?.data?.slice().sort((a, b) => b.total - a.total).map((sede, index) => {
                    const percentage = ((sede.total / sedeStats.total) * 100).toFixed(1);
                    return (
                      <span key={sede.sede}>
                        <span style={{ fontWeight: 600, color: '#6b8c1f' }}>
                          {sede.sede.replace('Sede ', '')}
                        </span> con <span style={{ fontWeight: 600, color: '#6b8c1f' }}>
                          {sede.total} programaciones ({percentage}%)
                        </span>
                        {index < (sedeDistributionData?.data?.length ?? 0) - 1 && ', '}
                      </span>
                    );
                  })}.
                </p>
              </div>
            </div>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#999', fontSize: '0.9rem' }}>
              Aún no hay programaciones en este mes
            </div>
          )}
        </div>
      </div>

      <ProgramacionesStats
        stats={stats}
        isLoading={statsLoading}
        activeFilters={statusFilters}
        onToggleFilter={key => {
          setStatusFilters(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
          setPage(1);
        }}
      />
      </div>
      </div>

      <div style={styles.contentCard}>
      <div style={{ ...styles.toolbar, flexWrap: 'wrap' }}>
        <div style={{ ...styles.searchWrap, minWidth: isMobile ? '100%' : '250px', marginBottom: isMobile ? '0.5rem' : 0 }}>
          <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            style={styles.searchInput}
            placeholder="Buscar por N° program, médico, hospital..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1); }}
        />

        <StatusFilter
          selected={statusFilters}
          onChange={(s) => { setStatusFilters(s); setPage(1); }}
        />

        <button
          className="btn-press header-btn-primary"
          style={{ ...styles.newBtn, width: isMobile ? '100%' : 'auto', marginLeft: isMobile ? 0 : 'auto', justifyContent: isMobile ? 'center' : 'flex-start' }}
          onClick={openNewModal}
        >
          <Plus size={16} />
          Nueva
        </button>

        <span style={styles.totalLabel}>
          {isLoading ? '...' : `${data?.total ?? 0} registros`}
        </span>
      </div>

      {/* Con los Indicadores abiertos, pageWrapper deja de tener alto fijo (ver más abajo) — sin
          un maxHeight explícito acá, flex:1 no hace nada y la tabla mostraría sus ~200
          registros de corrido, alargando la página en vez de scrollear internamente. */}
      <div
        ref={tableWrapRef}
        style={{ ...styles.tableWrap, ...(indicadoresAbiertos ? { flex: 'none' as const, maxHeight: '480px' } : {}) }}
      >
        {isLoading && items.length === 0 ? (
          <div style={styles.empty}>Cargando...</div>
        ) : items.length === 0 ? (
          <div style={styles.empty}>Sin registros</div>
        ) : isMobile ? (
          <div style={styles.mobileCardList}>
            {items.map(item => (
              <ProgramacionCard key={item.id} item={item} navigate={navigate} />
            ))}
          </div>
        ) : (
          <table style={styles.table}>
            <thead ref={theadRef}>
              <tr style={styles.thead}>
                {([
                  { label: '#', field: null },
                  { label: 'Estado', field: null },
                  { label: 'N° Program', field: 'numProgram' },
                  { label: 'Marca de Tiempo', field: 'createdAt' },
                  { label: 'Fecha QX', field: 'fechaQx' },
                  { label: 'Hora QX', field: 'horaQx' },
                  { label: 'Sede', field: 'sede' },
                  { label: 'Ciudad QX', field: null },
                  { label: 'Médico', field: null },
                  { label: 'Hospital', field: 'hospital' },
                  { label: 'Observaciones', field: 'observaciones' },
                ] as { label: string; field: ProgramacionSortField | null }[]).map((col, i) => (
                  <th
                    key={i}
                    onClick={col.field ? () => handleSort(col.field as ProgramacionSortField) : undefined}
                    style={{
                      ...styles.th,
                      ...(col.field ? { cursor: 'pointer', userSelect: 'none' as const, whiteSpace: 'nowrap' as const } : {}),
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                      {col.label}
                      {col.field && sortBy === col.field && (
                        sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <ProgramacionRow
                  key={item.id}
                  item={item}
                  index={(page - 1) * 300 + index}
                  navigate={navigate}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
      </div>

      {/* Pagination controls */}
      {data && data.totalPages > 1 && (
        <div style={styles.pagination}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ ...styles.pageBtn, ...(page === 1 ? styles.pageBtnDisabled : {}) }}
          >
            <MaterialIcon name="chevron_left" size={16} /> Anterior
          </button>

          <span style={styles.pageLabel}>Página {page} de {data.totalPages}</span>

          <button
            onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
            disabled={page === data.totalPages}
            style={{ ...styles.pageBtn, ...(page === data.totalPages ? styles.pageBtnDisabled : {}) }}
          >
            Siguiente <MaterialIcon name="chevron_right" size={16} />
          </button>
        </div>
      )}
      </div>
    </>
  );
}

const chartColors = ['#6b8c1f', '#2563eb', '#7c3aed', '#dc2626', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6'];

const styles: Record<string, React.CSSProperties> = {
  // Anclado directo a los bordes del viewport (en vez de calc(100vh - Npx)) para que el alto
  // disponible salga siempre correcto. Mismo patrón que pageWrapper en CotizacionesPage.tsx —
  // solo la tabla de registros scrollea internamente, el resto de la página no necesita scroll.
  pageWrapper: { position: 'fixed' as const, top: '60px', right: 0, bottom: 0, padding: '1.5rem', boxSizing: 'border-box' as const, display: 'flex', flexDirection: 'column' as const, gap: '1rem', overflow: 'hidden' },
  // Mismo recuadro blanco (contentCard) y botón "Volver" que usan CotizacionesPage/OperacionPage.
  headerCard: { backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '16px', padding: '1.25rem', flexShrink: 0 },
  breadcrumb: { display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '1rem', fontSize: '0.875rem' },
  link: { color: '#6b8c1f', cursor: 'pointer', fontWeight: 500 },
  sep: { color: '#999', margin: '0' },
  current: { color: '#333', fontWeight: 700 },
  yearMonthGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '0.75rem' },
  yearMonthCard: {
    backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '16px', padding: '1.25rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transform: 'translateY(0)',
    transition: 'all 0.2s ease', cursor: 'default', backfaceVisibility: 'hidden', WebkitFontSmoothing: 'antialiased',
  },
  yearMonthRow: { display: 'flex', alignItems: 'center', gap: '1rem' },
  yearMonthTextCol: { display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  yearMonthIconWrap: { width: '64px', height: '64px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  yearMonthLabel: { fontSize: '0.85rem', fontWeight: 700, color: '#16170f' },
  yearMonthSubLabel: { fontSize: '0.72rem', fontWeight: 500, color: '#9ca3af', textTransform: 'capitalize' },
  yearMonthValue: { fontSize: '1.9rem', fontWeight: 800, color: '#16170f', lineHeight: 1 },
  comparisonCard: {
    backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '16px', padding: '1.25rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transform: 'translateY(0)',
    transition: 'all 0.2s ease', cursor: 'default', backfaceVisibility: 'hidden', WebkitFontSmoothing: 'antialiased',
  },
  panelIconWrap: { width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  comparisonHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem', gap: '0.75rem', flexWrap: 'wrap' },
  comparisonTitle: { fontSize: '0.875rem', fontWeight: 700, color: '#333', margin: '0 0 0.15rem 0' },
  comparisonSubtitle: { fontSize: '0.7rem', color: '#999', margin: 0, fontWeight: 500 },
  monthSelect: { padding: '0.35rem 0.5rem', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.75rem', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' },
  comparisonGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '0.5rem' },
  comparisonItem: { backgroundColor: '#f9fafb', borderRadius: '10px', padding: '1rem 1.25rem', textAlign: 'center', border: '1px solid #e5e7eb', transition: 'all 0.2s ease' },
  comparisonYear: { fontSize: '0.875rem', fontWeight: 600, color: '#666', marginBottom: '0.5rem' },
  comparisonCount: { fontSize: '1.8rem', fontWeight: 800, lineHeight: 1 },
  comparisonLabel: { fontSize: '0.7rem', color: '#999', marginTop: '0.5rem', fontWeight: 500 },
  chartCard: { backgroundColor: '#fff', borderRadius: '10px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', transition: 'all 0.2s ease', cursor: 'default', backfaceVisibility: 'hidden', WebkitFontSmoothing: 'antialiased' },
  // flex:1 + minHeight:0: ocupa todo el espacio restante del pageWrapper (lo que dejen el header
  // y, si están abiertos, los indicadores); tableWrap es lo único que scrollea si no cabe todo.
  contentCard: { backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '16px', padding: '1.25rem', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' as const, gap: '1rem', overflow: 'hidden' },
  toolbar: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-start', flexShrink: 0 },
  searchWrap: { position: 'relative', flex: 1, minWidth: '250px' },
  searchInput: { width: '100%', padding: '0.6rem 0.75rem 0.6rem 2.25rem', border: 'none', backgroundColor: '#f5f5f0', borderRadius: '10px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', color: '#374151' },
  totalLabel: { fontSize: '0.8rem', color: '#999', whiteSpace: 'nowrap' },
  newBtn: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #dbe8c2', borderRadius: '12px', color: '#3f6510', fontWeight: 600, fontSize: '0.84375rem', cursor: 'pointer', whiteSpace: 'nowrap' as const, marginLeft: 'auto', flexShrink: 0 },
  tableWrap: { borderRadius: '10px', overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: 0, border: '1px solid #f0f0eb' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' },
  thead: { backgroundColor: '#f9fafb' },
  th: { padding: '0.65rem 0.875rem', textAlign: 'left', fontWeight: 700, color: '#555', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: '#f9fafb', zIndex: 1 },
  td: { padding: '0.65rem 0.875rem', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle', color: '#333' },
  tr: { backgroundColor: '#fff', cursor: 'pointer', transition: 'all 0.2s ease', backfaceVisibility: 'hidden', WebkitFontSmoothing: 'antialiased' },
  mobileCardList: { display: 'flex', flexDirection: 'column' as const, gap: '0.75rem', padding: '0.75rem' },
  mobileCard: { backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '12px', padding: '0.85rem', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  mobileCardToday: { backgroundColor: 'rgba(107, 140, 31, 0.14)', border: '1px solid rgba(107, 140, 31, 0.3)' },
  mobileCardTopRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' },
  mobileCardId: { display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', fontWeight: 700, color: '#6b8c1f' },
  mobileCardMainRow: { marginBottom: '0.7rem' },
  mobileCardFechaHora: { display: 'flex', alignItems: 'baseline', gap: '0.5rem' },
  mobileCardFecha: { fontSize: '0.9rem', fontWeight: 700, color: '#16170f' },
  mobileCardHora: { fontSize: '0.82rem', fontWeight: 600, color: '#374151' },
  mobileCardSedeCiudad: { fontSize: '0.78rem', color: '#6b7280', marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  mobileCardFieldsRow: { display: 'flex', gap: '1.25rem', paddingTop: '0.6rem', borderTop: '1px solid #f3f4f0' },
  mobileCardField: { display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', minWidth: 0 },
  mobileCardFieldLabel: { fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  mobileCardFieldValue: { fontSize: '0.82rem', fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  mobileCardObservaciones: { fontSize: '0.76rem', fontStyle: 'italic' as const, color: '#9ca3af', marginTop: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  empty: { textAlign: 'center', padding: '3rem', color: '#999' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', flexShrink: 0 },
  // Mismo estilo de botones de paginación que usa CotizacionesPage.tsx.
  pageBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.5rem 1rem', backgroundColor: '#e9f2d8', color: '#3f6510', border: '1px solid #dbe8c2', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '0.84375rem' },
  pageBtnDisabled: { backgroundColor: '#f4f4ee', borderColor: '#eeeee6', color: '#c7c7ba', cursor: 'not-allowed' as const },
  pageLabel: { fontSize: '0.875rem', fontWeight: 600, color: '#33342a' },
  loader: { padding: '2rem', textAlign: 'center' as const },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 },
  modalContent: { backgroundColor: '#fff', borderRadius: '12px', width: '90%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.5rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', borderTopLeftRadius: '12px', borderTopRightRadius: '12px', position: 'sticky' as const, top: 0, zIndex: 1 },
  modalTitle: { fontSize: '1.25rem', fontWeight: 700, color: '#333', margin: 0 },
  closeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', border: 'none', backgroundColor: '#f3f4f6', borderRadius: '8px', cursor: 'pointer', color: '#666' },
  modalBody: { padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  label: { fontSize: '0.75rem', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { padding: '0.75rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit' },
  inputError: { border: '1.5px solid #dc2626' },
  errorText: { fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 },
  horaGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' },
  sedeGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' },
  sedeBtn: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', color: '#374151', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const },
  sedeBtnActive: { backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510' },
  ciudadPill: { display: 'inline-flex', alignSelf: 'flex-start' as const, padding: '0.4rem 0.85rem', borderRadius: '999px', border: '1px solid #dbe8c2', backgroundColor: '#e9f2d8', fontSize: '0.85rem', fontWeight: 600, color: '#3f6510' },
  medicoTagsWrap: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' },
  medicoTag: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderRadius: '999px', backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510', fontSize: '0.8rem', fontWeight: 600 },
  cotizacionChip: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderRadius: '8px', backgroundColor: '#f4f8ea', border: '1px solid #dbe8c2', color: '#3f6510', fontSize: '0.8rem', fontWeight: 700 },
  medicoDropdown: { position: 'absolute' as const, top: 'calc(100% + 0.35rem)', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto' as const, zIndex: 20 },
  medicoDropdownItem: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.75rem', fontSize: '0.85rem', fontWeight: 600, color: '#333', cursor: 'pointer' },
  addFromCatalogBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.65rem', border: '1.5px solid #dbe8c2', borderRadius: '999px', backgroundColor: '#f4f8ea', color: '#3f6510', fontSize: '0.75rem', fontWeight: 400, cursor: 'pointer' },
  consumoPanel: { position: 'absolute' as const, bottom: 'calc(100% + 0.4rem)', right: 0, width: '280px', maxWidth: '90vw', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', boxShadow: '0 12px 30px rgba(0,0,0,0.15)', padding: '0.85rem', zIndex: 25, display: 'flex', flexDirection: 'column' as const, gap: '0.6rem' },
  consumoPanelTitle: { fontSize: '0.75rem', fontWeight: 700, color: '#555', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  modalFooter: { display: 'flex', gap: '1rem', padding: '1.5rem', borderTop: '1px solid #e5e7eb', justifyContent: 'flex-end' },
  cancelBtn: { padding: '0.5rem 1.5rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: '#333' },
  saveBtn: { padding: '0.5rem 1.5rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
};
