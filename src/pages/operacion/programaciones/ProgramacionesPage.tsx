import { useState, useEffect, memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { Search, Lock, AlertCircle, CheckCircle2, DollarSign, Plus, Check, X, Calendar, BarChart3, Activity, MapPin } from 'lucide-react';
import Layout from '../../../components/layout/Layout';
import DateRangeFilter from '../../../components/filters/DateRangeFilter';
import StatusFilter from '../../../components/filters/StatusFilter';
import ProgramacionesStats from './ProgramacionesStats';
import { useResponsiveStyles } from '../../../hooks/useResponsiveStyles';
import { programacionesService } from '../../../services/programaciones.service';
import { sedesService, type Sede } from '../../../services/sedes.service';
import type { ProgramacionQuery, ProgramacionItem, ProgramacionListResponse, FlagsUpdate } from '../../../services/programaciones.service';

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

const FLAG_CONFIG: { key: FlagKey; icon: React.ReactNode; label: string; color: string }[] = [
  { key: 'sinRemision',       icon: <AlertCircle size={13} />,  label: 'Sin Remisión',  color: '#dc2626' },
  { key: 'consumoNoValidado', icon: <CheckCircle2 size={13} />, label: 'Sin Validar Consumo', color: '#7c3aed' },
  { key: 'sinComision',       icon: <DollarSign size={13} />,   label: 'Sin Comisión',  color: '#2563eb' },
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
    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
      {active.map(({ key, icon, color }) => (
        <span key={key} style={{ ...badgeDot, backgroundColor: `${color}18`, color }}>{icon}</span>
      ))}
    </div>
  );
}

const ProgramacionRow = memo(({ item, onContextMenu, navigate, getBorderColor, index }: { item: ProgramacionItem; onContextMenu: (e: React.MouseEvent, item: ProgramacionItem) => void; navigate: (path: string) => void; getBorderColor: (item: ProgramacionItem) => string; index: number }) => (
  <tr
    key={item.id}
    style={styles.tr}
    onClick={() => navigate(`/operacion/programaciones/${item.id}`)}
    onContextMenu={e => onContextMenu(e, item)}
    onMouseEnter={e => {
      e.currentTarget.style.backgroundColor = '#f3f4f6';
      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.backgroundColor = '#fff';
      e.currentTarget.style.boxShadow = 'none';
    }}
  >
    <td style={{ ...styles.td, textAlign: 'center', fontWeight: 600, color: '#999', width: '40px' }}>{index + 1}</td>
    <td style={{ ...styles.td, borderLeft: `3px solid ${getBorderColor(item)}`, paddingLeft: '10px', width: '70px' }}>
      <StatusBadges item={item} />
    </td>
    <td style={{ ...styles.td, fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b8c1f', fontWeight: 700 }}>
      {item.idLegacy ?? item.id}
    </td>
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
    <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600, color: item.saldo ? '#333' : '#9ca3af' }}>
      {item.saldo ? `$${item.saldo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '-'}
    </td>
    <td style={{ ...styles.td, minWidth: '100px' }}>
      {item.avance !== null ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ flex: 1, height: '5px', backgroundColor: '#e5e7eb', borderRadius: '3px' }}>
            <div style={{ width: `${item.avance}%`, height: '100%', backgroundColor: '#6b8c1f', borderRadius: '3px' }} />
          </div>
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#555', flexShrink: 0 }}>{item.avance}%</span>
        </div>
      ) : <span style={{ color: '#9ca3af' }}>-</span>}
    </td>
  </tr>
));

function ContextMenu({ x, y, item, onToggle, onClose }: {
  x: number; y: number;
  item: ProgramacionItem;
  onToggle: (key: FlagKey, value: boolean) => void;
  onClose: () => void;
}) {
  const menuW = 210;
  const menuH = FLAG_CONFIG.length * 38 + 16;
  const left = x + menuW > window.innerWidth  ? x - menuW : x;
  const top  = y + menuH > window.innerHeight ? y - menuH : y;

  return (
    <div
      style={{ position: 'fixed', top, left, zIndex: 9999, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '6px', minWidth: `${menuW}px` }}
      onClick={e => e.stopPropagation()}
    >
      <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 8px 6px' }}>
        Marcar como
      </p>
      {FLAG_CONFIG.map(({ key, icon, label, color }) => {
        const active = item[key];
        return (
          <button
            key={key}
            onClick={() => { onToggle(key, !active); onClose(); }}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '7px 10px', border: 'none', borderRadius: '7px', backgroundColor: active ? `${color}12` : 'transparent', cursor: 'pointer', fontSize: '0.83rem', fontWeight: active ? 600 : 400, color: active ? color : '#374151', textAlign: 'left' }}
          >
            <span style={{ color: active ? color : '#d1d5db', flexShrink: 0 }}>{icon}</span>
            <span style={{ flex: 1 }}>{label}</span>
            {active && <Check size={13} color={color} />}
          </button>
        );
      })}
    </div>
  );
}

export default function ProgramacionesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isMobile } = useResponsiveStyles();
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [allData, setAllData] = useState<ProgramacionItem[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [formData, setFormData] = useState({ fechaQx: '', horaQx: '', sede: '', hospital: '', medico: '', consumo: '', observaciones: '' });
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedMonthForSedes, setSelectedMonthForSedes] = useState<number>(new Date().getMonth() + 1);

  const query: ProgramacionQuery = {
    page, limit: 300,
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sinRemision: statusFilters.includes('sinRemision') ? true : undefined,
    consumoNoValidado: statusFilters.includes('consumoNoValidado') ? true : undefined,
    sinComision: statusFilters.includes('sinComision') ? true : undefined,
    cerrada: statusFilters.includes('cerrada') ? true : undefined,
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

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    return () => { window.removeEventListener('click', close); };
  }, []);

  useEffect(() => {
    const loadSedes = async () => {
      const sedesList = await sedesService.getAll();
      setSedes(sedesList);
    };
    loadSedes();
  }, []);

  // Resetear al cambiar filtros
  useEffect(() => {
    setPage(1);
    setAllData([]);
  }, [search, dateFrom, dateTo, statusFilters]);

  // Cargar nuevos datos cuando cambia page
  useEffect(() => {
    if (data?.data) {
      if (page === 1) {
        setAllData(data.data);
      } else {
        setAllData(prev => {
          const existingIds = new Set(prev.map(item => item.id));
          const newItems = data.data.filter(item => !existingIds.has(item.id));
          return [...prev, ...newItems];
        });
      }
    }
  }, [page, data]);


  const flagMutation = useMutation({
    mutationFn: ({ id, flags }: { id: string; flags: FlagsUpdate }) =>
      programacionesService.updateFlags(id, flags),
    onMutate: async ({ id, flags }) => {
      await queryClient.cancelQueries({ queryKey: ['programaciones', query] });
      const snapshot = queryClient.getQueryData<ProgramacionListResponse>(['programaciones', query]);
      queryClient.setQueryData<ProgramacionListResponse>(['programaciones', query], (old) => {
        if (!old) return old;
        return { ...old, data: old.data.map(item => item.id === id ? { ...item, ...flags } : item) };
      });
      setAllData(prev => prev.map(item => item.id === id ? { ...item, ...flags } : item));
      return { snapshot };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<ProgramacionListResponse>(['programaciones', query], (old) => {
        if (!old) return old;
        return { ...old, data: old.data.map(item => item.id === updated.id ? updated : item) };
      });
      setAllData(prev => prev.map(item => item.id === updated.id ? updated : item));
      queryClient.invalidateQueries({ queryKey: ['programaciones-stats'] });
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(['programaciones', query], context.snapshot);
      }
    },
  });

  const handleToggleFlag = (key: FlagKey, value: boolean) => {
    if (!contextMenu) return;
    flagMutation.mutate({ id: contextMenu.itemId, flags: { [key]: value } });
  };

  const handleRowContextMenu = (e: React.MouseEvent, item: ProgramacionItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, itemId: item.id });
  };

  const contextMenuItem = contextMenu
    ? allData.find(i => i.id === contextMenu.itemId) ?? null
    : null;

  const getBorderColor = (item: ProgramacionItem) => {
    if (item.cerrada) return '#9ca3af';
    if (item.sinRemision) return '#dc2626';
    if (item.consumoNoValidado) return '#7c3aed';
    if (item.sinComision) return '#2563eb';
    return '#e5e7eb';
  };

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
    const percentChange = previousCount > 0 ? ((difference / previousCount) * 100).toFixed(1) : 0;
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

  const handleSaveNew = async () => {
    try {
      const payload = {
        fechaQx: formData.fechaQx,
        horaQx: formData.horaQx,
        sede: formData.sede,
        hospital: formData.hospital,
        medicos: formData.medico ? [formData.medico] : [],
        observaciones: formData.observaciones,
        consumo: formData.consumo,
      };
      await programacionesService.create(payload);
      setShowNewModal(false);
      setFormData({ fechaQx: '', horaQx: '', sede: '', hospital: '', medico: '', consumo: '', observaciones: '' });
      queryClient.invalidateQueries({ queryKey: ['programaciones'] });
    } catch (err) {
      console.error('Error al crear programación:', err);
    }
  };

  return (
    <Layout>
      {contextMenu && contextMenuItem && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenuItem}
          onToggle={handleToggleFlag}
          onClose={() => setContextMenu(null)}
        />
      )}

      {showNewModal && (
        <div style={styles.modalOverlay} onClick={() => setShowNewModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>NUEVA PROGRAMACIÓN</h2>
              <button style={styles.closeBtn} onClick={() => setShowNewModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>FECHA QX *</label>
                <input
                  type="date"
                  style={styles.input}
                  value={formData.fechaQx}
                  onChange={(e) => setFormData({ ...formData, fechaQx: e.target.value })}
                  placeholder="dd/mm/aaaa"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>HORA QX * (formato 24h)</label>
                <input
                  type="text"
                  style={styles.input}
                  value={formData.horaQx}
                  onChange={(e) => setFormData({ ...formData, horaQx: e.target.value })}
                  placeholder="HH:mm"
                  maxLength={5}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>SEDE *</label>
                <select
                  style={styles.input}
                  value={formData.sede}
                  onChange={(e) => setFormData({ ...formData, sede: e.target.value })}
                >
                  <option value="">Seleccionar sede</option>
                  {sedes.map(s => (
                    <option key={s.id} value={s.nombre}>{s.nombre}</option>
                  ))}
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>HOSPITAL *</label>
                <input
                  type="text"
                  style={styles.input}
                  value={formData.hospital}
                  onChange={(e) => setFormData({ ...formData, hospital: e.target.value })}
                  placeholder="Buscar"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>MÉDICO *</label>
                <input
                  type="text"
                  style={styles.input}
                  value={formData.medico}
                  onChange={(e) => setFormData({ ...formData, medico: e.target.value })}
                  placeholder="Agregar médico"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>CONSUMO *</label>
                <textarea
                  style={{ ...styles.input, minHeight: '100px', resize: 'vertical' }}
                  value={formData.consumo}
                  onChange={(e) => setFormData({ ...formData, consumo: e.target.value })}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>OBSERVACIONES</label>
                <textarea
                  style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
                  value={formData.observaciones}
                  onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                  placeholder="Observaciones adicionales"
                />
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button style={styles.cancelBtn} onClick={() => setShowNewModal(false)}>
                Cancelar
              </button>
              <button style={styles.saveBtn} onClick={handleSaveNew}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ ...styles.pageWrapper, padding: isMobile ? '0 0.75rem' : '0 1rem' }}>
      {/* <div style={styles.breadcrumb}>
        <span style={styles.link} onClick={() => navigate('/dashboard')}>Inicio</span>
        <span style={styles.sep}> › </span>
        <span style={styles.link} onClick={() => navigate('/operacion')}>Módulo Operación</span>
        <span style={styles.sep}> › </span>
        <span style={styles.current}>Programaciones</span>
      </div> */}

      <div style={{ ...styles.yearMonthGrid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', marginBottom: '1.5rem' }}>
        <div style={{ ...styles.yearMonthCard, borderTop: '3px solid #6b8c1f' }} onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 16px rgba(107,140,31,0.15)'; }} onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; }}>
          <div style={styles.yearMonthHeader}>
            <Calendar size={18} color="#6b8c1f" />
            <div style={styles.yearMonthLabelCol}>
              <span style={styles.comparisonTitle}>Programaciones del Año</span>
              <span style={styles.yearMonthSubLabel}>{new Date().getFullYear()}</span>
            </div>
          </div>
          <div style={styles.yearMonthValue}>{yearMonthStats.thisYear}</div>
        </div>

        <div style={{ ...styles.yearMonthCard, borderTop: '3px solid #6b8c1f' }} onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 16px rgba(107,140,31,0.15)'; }} onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; }}>
          <div style={styles.yearMonthHeader}>
            <BarChart3 size={18} color="#6b8c1f" />
            <div style={styles.yearMonthLabelCol}>
              <span style={styles.comparisonTitle}>Programaciones del Mes</span>
              <span style={styles.yearMonthSubLabel}>{new Date().toLocaleString('es-MX', { month: 'long', year: 'numeric' })}</span>
            </div>
          </div>
          <div style={styles.yearMonthValue}>{yearMonthStats.thisMonth}</div>
        </div>

        <div style={{ ...styles.yearMonthCard, borderTop: '3px solid #6b8c1f' }} onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 16px rgba(107,140,31,0.15)'; }} onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; }}>
          <div style={styles.yearMonthHeader}>
            <Activity size={18} color="#6b8c1f" />
            <div style={styles.yearMonthLabelCol}>
              <span style={styles.comparisonTitle}>Total Programaciones</span>
              <span style={styles.yearMonthSubLabel}>Todos los registros</span>
            </div>
          </div>
          <div style={styles.yearMonthValue}>{stats?.total || 0}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div style={{ ...styles.comparisonCard, borderTop: '3px solid #6b8c1f' }}>
          <div style={styles.comparisonHeader}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
              <Calendar size={18} color="#6b8c1f" style={{ marginTop: '0.2rem', flexShrink: 0 }} />
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
            {monthComparison.map(item => (
              <div key={item.year} style={styles.comparisonItem}>
                <div style={styles.comparisonYear}>{item.year}</div>
                <div style={styles.comparisonCount}>{item.count}</div>
                <div style={styles.comparisonLabel}>programaciones</div>
              </div>
            ))}
          </div>

          {comparisonAnalysis && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '8px', fontSize: '0.8rem', color: '#555', lineHeight: '1.5' }}>
              <p style={{ margin: 0 }}>
                <span style={{ fontWeight: 600, color: comparisonAnalysis.trend === 'subida' ? '#6b8c1f' : '#dc2626' }}>
                  {comparisonAnalysis.trendSymbol} {comparisonAnalysis.difference} programaciones {comparisonAnalysis.trend}
                </span>{' '}
                con respecto al año anterior, lo que representa un{' '}
                <span style={{ fontWeight: 600, color: comparisonAnalysis.trend === 'subida' ? '#6b8c1f' : '#dc2626' }}>
                  {comparisonAnalysis.percentChange}% de {comparisonAnalysis.trend}
                </span>
                .
              </p>
            </div>
          )}
        </div>

        <div style={{ ...styles.comparisonCard, borderTop: '3px solid #6b8c1f', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <MapPin size={16} color="#6b8c1f" />
              <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#333', margin: 0 }}>Distribución por Sede {currentYear}</h3>
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
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={sedeDistributionData.data.map(s => ({ name: s.sede.replace('Sede ', ''), value: s.total }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {sedeDistributionData.data.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `${value} programaciones`} />
                  <Legend verticalAlign="bottom" height={32} />
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

      <ProgramacionesStats stats={stats} isLoading={statsLoading} />

      <div style={{ ...styles.toolbar, flexWrap: 'wrap' }}>
        <div style={{ ...styles.searchWrap, minWidth: isMobile ? '100%' : '250px', marginBottom: isMobile ? '0.5rem' : 0 }}>
          <Search size={15} color="#999" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
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

        <span style={styles.totalLabel}>
          {isLoading ? '...' : `${data?.total ?? 0} registros`}
        </span>

        <button
          style={{ ...styles.newBtn, width: isMobile ? '100%' : 'auto', marginLeft: isMobile ? 0 : 'auto' }}
          onClick={() => setShowNewModal(true)}
          onMouseEnter={e => {
            e.currentTarget.style.backgroundColor = '#1a1a1a';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.backgroundColor = '#333';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <Plus size={16} />
          Nueva
        </button>
      </div>

      <div style={{ ...styles.tableWrap, maxHeight: isMobile ? 'calc(100vh - 500px)' : 'calc(100vh - 340px)' }}>
        {isLoading && allData.length === 0 ? (
          <div style={styles.empty}>Cargando...</div>
        ) : allData.length === 0 ? (
          <div style={styles.empty}>Sin registros</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr style={styles.thead}>
                {['#', '', 'N° Program', 'Fecha QX', 'Hora QX', 'Sede', 'Ciudad QX', 'Médico', 'Hospital', 'Observaciones', 'Saldo', '% Avance'].map((h, i) => (
                  <th key={i} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allData.map((item, index) => (
                <ProgramacionRow
                  key={item.id}
                  item={item}
                  index={index}
                  onContextMenu={handleRowContextMenu}
                  navigate={navigate}
                  getBorderColor={getBorderColor}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination controls */}
      {data && data.totalPages > 1 && (
        <div style={styles.pagination}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: page === 1 ? '#e5e7eb' : '#6b8c1f',
              color: page === 1 ? '#9ca3af' : '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: '0.875rem',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              if (page !== 1) {
                e.currentTarget.style.backgroundColor = '#5a7819';
              }
            }}
            onMouseLeave={e => {
              if (page !== 1) {
                e.currentTarget.style.backgroundColor = '#6b8c1f';
              }
            }}
          >
            ← Anterior
          </button>

          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#333' }}>
            Página {page} de {data.totalPages}
          </span>

          <button
            onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
            disabled={page === data.totalPages}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: page === data.totalPages ? '#e5e7eb' : '#6b8c1f',
              color: page === data.totalPages ? '#9ca3af' : '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: page === data.totalPages ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: '0.875rem',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              if (page !== data.totalPages) {
                e.currentTarget.style.backgroundColor = '#5a7819';
              }
            }}
            onMouseLeave={e => {
              if (page !== data.totalPages) {
                e.currentTarget.style.backgroundColor = '#6b8c1f';
              }
            }}
          >
            Siguiente →
          </button>
        </div>
      )}
      </div>
    </Layout>
  );
}

const chartColors = ['#6b8c1f', '#2563eb', '#7c3aed', '#dc2626', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6'];

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: { padding: '0 1rem' },
  breadcrumb: { display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '1rem', fontSize: '0.875rem' },
  link: { color: '#6b8c1f', cursor: 'pointer', fontWeight: 500 },
  sep: { color: '#999', margin: '0' },
  current: { color: '#333', fontWeight: 700 },
  yearMonthGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '0.75rem' },
  yearMonthCard: { backgroundColor: '#fff', borderRadius: '10px', padding: '1rem 1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', transition: 'all 0.2s ease', cursor: 'default', backfaceVisibility: 'hidden', WebkitFontSmoothing: 'antialiased' },
  yearMonthHeader: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' },
  yearMonthLabelCol: { display: 'flex', flexDirection: 'column', gap: '0.1rem', flex: 1 },
  yearMonthLabel: { fontSize: '0.75rem', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' },
  yearMonthSubLabel: { fontSize: '0.7rem', fontWeight: 500, color: '#999', textTransform: 'capitalize' },
  yearMonthValue: { fontSize: '1.6rem', fontWeight: 800, color: '#1a1a1a', lineHeight: 1 },
  comparisonCard: { backgroundColor: '#fff', borderRadius: '10px', padding: '0.75rem 1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', transition: 'all 0.2s ease', cursor: 'default', backfaceVisibility: 'hidden', WebkitFontSmoothing: 'antialiased' },
  comparisonHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem', gap: '0.75rem', flexWrap: 'wrap' },
  comparisonTitle: { fontSize: '0.875rem', fontWeight: 700, color: '#333', margin: '0 0 0.15rem 0' },
  comparisonSubtitle: { fontSize: '0.7rem', color: '#999', margin: 0, fontWeight: 500 },
  monthSelect: { padding: '0.35rem 0.5rem', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.75rem', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' },
  comparisonGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '0.5rem' },
  comparisonItem: { backgroundColor: '#f9fafb', borderRadius: '10px', padding: '1rem 1.25rem', textAlign: 'center', border: '1px solid #e5e7eb' },
  comparisonYear: { fontSize: '0.875rem', fontWeight: 600, color: '#666', marginBottom: '0.5rem' },
  comparisonCount: { fontSize: '1.8rem', fontWeight: 800, lineHeight: 1 },
  comparisonLabel: { fontSize: '0.7rem', color: '#999', marginTop: '0.5rem', fontWeight: 500 },
  chartCard: { backgroundColor: '#fff', borderRadius: '10px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', transition: 'all 0.2s ease', cursor: 'default', backfaceVisibility: 'hidden', WebkitFontSmoothing: 'antialiased' },
  toolbar: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', justifyContent: 'flex-start' },
  searchWrap: { position: 'relative', flex: 1, minWidth: '250px' },
  searchInput: { width: '100%', padding: '0.5rem 0.75rem 0.5rem 2rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' },
  totalLabel: { fontSize: '0.8rem', color: '#999', whiteSpace: 'nowrap' },
  newBtn: { display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 1rem', backgroundColor: '#333', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', marginLeft: 'auto', whiteSpace: 'nowrap', transition: 'all 0.2s ease', backfaceVisibility: 'hidden', WebkitFontSmoothing: 'antialiased' },
  tableWrap: { backgroundColor: '#fff', borderRadius: '12px', overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 340px)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' },
  thead: { backgroundColor: '#f9fafb' },
  th: { padding: '0.65rem 0.875rem', textAlign: 'left', fontWeight: 700, color: '#555', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: '#f9fafb', zIndex: 1 },
  td: { padding: '0.65rem 0.875rem', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle', color: '#333' },
  tr: { backgroundColor: '#fff', cursor: 'pointer', transition: 'all 0.2s ease', backfaceVisibility: 'hidden', WebkitFontSmoothing: 'antialiased' },
  empty: { textAlign: 'center', padding: '3rem', color: '#999' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' },
  loader: { padding: '2rem', textAlign: 'center' as const },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 },
  modalContent: { backgroundColor: '#fff', borderRadius: '12px', width: '90%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.5rem', borderBottom: '1px solid #e5e7eb' },
  modalTitle: { fontSize: '1.25rem', fontWeight: 700, color: '#333', margin: 0 },
  closeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', border: 'none', backgroundColor: '#f3f4f6', borderRadius: '8px', cursor: 'pointer', color: '#666' },
  modalBody: { padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  label: { fontSize: '0.75rem', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { padding: '0.75rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit' },
  modalFooter: { display: 'flex', gap: '1rem', padding: '1.5rem', borderTop: '1px solid #e5e7eb', justifyContent: 'flex-end' },
  cancelBtn: { padding: '0.5rem 1.5rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: '#333' },
  saveBtn: { padding: '0.5rem 1.5rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
};
