import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Loader, CalendarDays } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import HeaderBackReveal from '../../../components/HeaderBackReveal';
import { programacionesService } from '../../../services/programaciones.service';
import { toLocalDateString } from '../../../lib/date.utils';
import { useResponsiveStyles } from '../../../hooks/useResponsiveStyles';
import { useNavigateWithLoading } from '../../../hooks/useNavigateWithLoading';

const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
const getFirstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

const MAX_VISIBLE_EVENTS = 4;

// Colores ya definidos para cada sede — se mantienen tal cual, no se tocan.
const SEDE_COLORS: { [key: string]: string } = {
  'Sede Cancún': '#6b8c1f',        // Verde
  'Sede Guadalajara': '#f59e0b',   // Naranja
  'Sede Mérida': '#2563eb',        // Azul
  'Sede Vallarta': '#fbbf24',      // Amarillo
};
const DEFAULT_SEDE_COLOR = '#9ca3af';
const getSedeColor = (sede: string | undefined | null) => SEDE_COLORS[sede || ''] ?? DEFAULT_SEDE_COLOR;

interface ProgramacionInfo {
  id: string;
  medicos: string[];
  fechaQx: string;
  horaQx?: string;
  sede?: string;
}

type ViewType = 'mes' | 'semana' | 'dia';

export default function CalendarPage() {
  const { isMobile } = useResponsiveStyles();
  const navigate = useNavigateWithLoading();
  const [currentDate, setCurrentDate] = useState(new Date());

  // Mismo patrón que CotizacionesPage/OperacionPage: pageWrapper anclado al viewport +
  // scroll del body bloqueado mientras esta página está montada, para que todo el contenido dé
  // en una sola pantalla (el calendario en sí scrollea internamente si le hace falta).
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  const [view, setView] = useState<ViewType>('mes');
  const [programacionesByDate, setProgramacionesByDate] = useState<{ [key: string]: ProgramacionInfo[] }>({});
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);

  // Antes se traía TODO el histórico de programaciones sin ningún filtro de fecha (el endpoint
  // soporta dateFrom/dateTo, pero no se le mandaban) — con el tiempo esa consulta se vuelve cada
  // vez más lenta. Se acota a una ventana de 3 meses centrada en el mes que se está viendo (uno
  // antes, el actual, uno después), suficiente para navegar semana/día sin quedarse corto, y se
  // vuelve a pedir solo si el usuario navega fuera de esa ventana.
  const rangeStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  const rangeEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0);
  const { data: allProgramaciones, isLoading: programacionesLoading } = useQuery({
    queryKey: ['programaciones-calendar', currentDate.getFullYear(), currentDate.getMonth()],
    queryFn: () => programacionesService.findAllForCalendar(toLocalDateString(rangeStart), toLocalDateString(rangeEnd)),
  });

  const { data: sedeOptions = [] } = useQuery({
    queryKey: ['programaciones-sedes'],
    queryFn: () => programacionesService.getSedes(),
  });

  useEffect(() => {
    if (allProgramaciones) {
      const grouped: { [key: string]: ProgramacionInfo[] } = {};
      allProgramaciones.forEach(p => {
        if (p.fechaQx) {
          const key = p.fechaQx.split('T')[0];
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push({
            id: p.id,
            medicos: p.medicos || [],
            fechaQx: p.fechaQx,
            horaQx: p.horaQx ?? undefined,
            sede: p.sede ?? undefined,
          });
        }
      });
      setProgramacionesByDate(grouped);
    }
  }, [allProgramaciones]);

  const formatDate = (date: Date) => toLocalDateString(date);
  const getProgramacionesForDay = (date: Date) => programacionesByDate[formatDate(date)] || [];

  const today = new Date();

  const getWeekDates = () => {
    const d = new Date(currentDate);
    const day = d.getDay();
    const diff = d.getDate() - day;
    const startDate = new Date(d.setDate(diff));
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      return date;
    });
  };

  const monthYear = currentDate.toLocaleString('es-MX', { month: 'long', year: 'numeric' });
  // En la vista de día, se muestra a la izquierda de la barra de navegación de mes (que no
  // scrollea) en vez de como título arriba de la lista, para que quede siempre visible aunque
  // se haga scroll en las cirugías del día.
  const dayNavLabel = (() => {
    const s = currentDate.toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  const renderMes = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days = Array(firstDay).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));

    const isCurrentMonth = currentDate.getMonth() === today.getMonth() && currentDate.getFullYear() === today.getFullYear();

    return (
      <>
        <div style={styles.weekDaysRow}>
          {['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'].map(d => (
            <div key={d} style={styles.weekDayHeader}>{d}</div>
          ))}
        </div>
        <div style={{ ...styles.monthGrid, ...(isMobile ? { gridAutoRows: '92px' } : {}) }}>
          {days.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} style={styles.emptyDay} />;

            const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
            const progs = getProgramacionesForDay(date);
            const isToday = isCurrentMonth && day === today.getDate();

            if (isMobile) {
              return (
                <div
                  key={`day-${currentDate.getFullYear()}-${currentDate.getMonth()}-${day}`}
                  style={{ ...styles.dayCellMobile, cursor: 'pointer' }}
                  onClick={() => { setCurrentDate(date); setView('dia'); }}
                >
                  <span style={isToday ? styles.todayBadge : styles.dayNumber}>{day}</span>
                  <div style={styles.dayBarsList}>
                    {progs.slice(0, MAX_VISIBLE_EVENTS).map(prog => (
                      <div
                        key={prog.id}
                        onClick={e => { e.stopPropagation(); navigate(`/operacion/programaciones/${prog.id}`, '/operacion/programaciones/:id'); }}
                        style={{ ...styles.dayBar, backgroundColor: getSedeColor(prog.sede) }}
                      >
                        {prog.medicos[0] || '—'}
                      </div>
                    ))}
                    {progs.length > MAX_VISIBLE_EVENTS && (
                      <div style={styles.dayBarMore}>
                        +{progs.length - MAX_VISIBLE_EVENTS} más
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div key={`day-${currentDate.getFullYear()}-${currentDate.getMonth()}-${day}`} style={styles.dayCell}>
                <div style={styles.dayNumberRow}>
                  <span style={isToday ? styles.todayBadge : styles.dayNumber}>{day}</span>
                </div>
                <div style={styles.eventsList}>
                  {progs.slice(0, MAX_VISIBLE_EVENTS).map(prog => {
                    const color = getSedeColor(prog.sede);
                    return (
                      <div
                        key={prog.id}
                        onClick={() => navigate(`/operacion/programaciones/${prog.id}`, '/operacion/programaciones/:id')}
                        style={{ ...styles.eventChip, backgroundColor: `${color}18`, zIndex: hoveredEventId === prog.id ? 30 : 1 }}
                        onMouseEnter={e => { setHoveredEventId(prog.id); e.currentTarget.style.filter = 'brightness(0.97)'; }}
                        onMouseLeave={e => { setHoveredEventId(null); e.currentTarget.style.filter = 'none'; }}
                      >
                        <span style={{ ...styles.eventDot, backgroundColor: color }} />
                        <span style={styles.eventName}>{prog.medicos[0] || '—'}</span>
                        {hoveredEventId === prog.id && (
                          <div style={styles.eventTooltip}>
                            <span style={{ ...styles.eventTooltipDot, backgroundColor: color }} />
                            {prog.sede || 'Sin sede'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {progs.length > MAX_VISIBLE_EVENTS && (
                    <div
                      style={styles.moreLink}
                      onClick={() => { setCurrentDate(date); setView('dia'); }}
                    >
                      +{progs.length - MAX_VISIBLE_EVENTS} más
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  };

  // Render Semana
  const renderSemana = () => {
    const weekDates = getWeekDates();
    return (
      <div style={{ ...styles.weekContainer, gridTemplateColumns: isMobile ? '1fr' : 'repeat(7, 1fr)' }}>
        {weekDates.map(date => {
          const progs = getProgramacionesForDay(date);
          const isToday = date.toDateString() === today.toDateString();
          const dayName = date.toLocaleString('es-MX', { weekday: 'short', day: 'numeric' });

          return (
            <div key={date.toISOString()} style={styles.dayColumn}>
              <div style={{ ...styles.dayColumnHeader, ...(isToday ? styles.dayColumnHeaderToday : {}) }}>
                {dayName}
              </div>
              <div style={styles.dayColumnContent}>
                {progs.map(prog => {
                  const color = getSedeColor(prog.sede);
                  return (
                    <div
                      key={prog.id}
                      onClick={() => navigate(`/operacion/programaciones/${prog.id}`, '/operacion/programaciones/:id')}
                      style={{ ...styles.eventChip, backgroundColor: `${color}18`, zIndex: hoveredEventId === prog.id ? 30 : 1 }}
                      onMouseEnter={e => { setHoveredEventId(prog.id); e.currentTarget.style.filter = 'brightness(0.97)'; }}
                      onMouseLeave={e => { setHoveredEventId(null); e.currentTarget.style.filter = 'none'; }}
                    >
                      <span style={{ ...styles.eventDot, backgroundColor: color }} />
                      <span style={styles.eventName}>{prog.medicos[0] || '—'}</span>
                      {prog.horaQx && <span style={styles.eventTime}>{prog.horaQx}</span>}
                      {hoveredEventId === prog.id && (
                        <div style={styles.eventTooltip}>
                          <span style={{ ...styles.eventTooltipDot, backgroundColor: color }} />
                          {prog.sede || 'Sin sede'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Render Día
  const renderDia = () => {
    const progs = getProgramacionesForDay(currentDate);
    const dayName = currentDate.toLocaleString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    return (
      <div style={styles.dayDetail}>
        {/* En escritorio este título ya se muestra fijo en la barra de navegación (dayNavLabel) */}
        {isMobile && <h3 style={styles.dayDetailTitle}>{dayName}</h3>}
        <div style={styles.dayDetailContent}>
          {progs.length === 0 ? (
            <p style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem' }}>Sin cirugías programadas</p>
          ) : (
            progs.map(prog => {
              const color = getSedeColor(prog.sede);
              return (
                <div
                  key={prog.id}
                  onClick={() => navigate(`/operacion/programaciones/${prog.id}`, '/operacion/programaciones/:id')}
                  style={{ ...styles.dayProgItem, borderLeft: `4px solid ${color}` }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: '#16170f' }}>
                      <span style={{ ...styles.eventDot, backgroundColor: color }} />
                      {prog.medicos[0] || 'Sin médico'}
                    </div>
                    {prog.horaQx && <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>{prog.horaQx}</div>}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}> {prog.sede || '-'}</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
      <div style={{ ...styles.pageWrapper, left: isMobile ? 0 : '60px' }}>
        <div style={styles.headerCard}>
          <div style={{ ...styles.header, ...(isMobile ? styles.headerMobile : {}) }}>
            <div style={styles.headerTitleGroup}>
              <HeaderBackReveal
                onBack={() => navigate(-1)}
                icon={<CalendarDays size={20} color="#4d7a13" />}
                mobileIconAsBack={isMobile}
              >
                <h1 style={styles.title}>Calendario de programación</h1>
              </HeaderBackReveal>
            </div>

            <div style={{ ...styles.viewTabs, ...(isMobile ? { width: '100%', justifyContent: 'center' as const } : {}) }}>
              {(['mes', 'semana', 'dia'] as ViewType[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{ ...styles.viewTab, ...(view === v ? styles.viewTabActive : {}), ...(isMobile ? { flex: 1 } : {}) }}
                >
                  {v === 'mes' ? 'Mes' : v === 'semana' ? 'Semana' : 'Día'}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.sedesLegendDivider} />

          <div style={styles.sedesLegend}>
            <span style={styles.sedesLabel}>Sedes</span>
            {sedeOptions.map(s => (
              <span key={s.id} style={styles.sedeLegendItem}>
                <span style={{ ...styles.sedeLegendDot, backgroundColor: getSedeColor(s.nombre) }} />
                {s.nombre.replace(/^Sede\s+/i, '')}
              </span>
            ))}
          </div>
        </div>

        <div style={styles.calendarCard}>
          <div style={{ ...styles.calendarNav, ...(isMobile ? styles.calendarNavMobile : {}) }}>
            {isMobile ? (
              <>
                <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))} style={styles.navBtn}>
                  <ChevronLeft size={18} />
                </button>
                <h2 style={{ ...styles.monthYear, minWidth: 0, fontSize: '1.1rem' }}>{monthYear.charAt(0).toUpperCase() + monthYear.slice(1)}</h2>
                <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))} style={styles.navBtn}>
                  <ChevronRight size={18} />
                </button>
              </>
            ) : (
              <>
                <div style={styles.calendarNavSide}>
                  {view === 'dia' && <span style={styles.dayTitleInline}>{dayNavLabel}</span>}
                </div>
                <div style={styles.calendarNavCenter}>
                  <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))} style={styles.navBtn}>
                    <ChevronLeft size={18} />
                  </button>
                  <h2 style={styles.monthYear}>{monthYear.charAt(0).toUpperCase() + monthYear.slice(1)}</h2>
                  <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))} style={styles.navBtn}>
                    <ChevronRight size={18} />
                  </button>
                </div>
                <div style={styles.calendarNavSide} />
              </>
            )}
          </div>

          <div style={styles.calendarContent}>
            {programacionesLoading ? (
              <div style={{ padding: '4rem', textAlign: 'center' as const, color: '#9ca3af' }}>
                <Loader className="spinner" size={28} />
              </div>
            ) : (
              <>
                {view === 'mes' && renderMes()}
                {view === 'semana' && renderSemana()}
                {view === 'dia' && renderDia()}
              </>
            )}
          </div>
        </div>
      </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  // Anclado directo a los bordes del viewport (en vez de calc(100vh - Npx)) para que el alto
  // disponible salga siempre correcto. Mismo patrón que pageWrapper en CotizacionesPage.tsx.
  pageWrapper: { position: 'fixed' as const, top: '60px', right: 0, bottom: 0, padding: '1.5rem', boxSizing: 'border-box' as const, display: 'flex', flexDirection: 'column' as const, gap: '1rem', overflow: 'hidden', maxWidth: '1400px', margin: '0 auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' as const },
  headerMobile: { flexDirection: 'column' as const, alignItems: 'stretch' as const },
  headerTitleGroup: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  title: { fontSize: '1.4rem', fontWeight: 700, color: '#333', margin: 0 },

  // Un solo recuadro blanco agrupa el título, las pestañas de vista, la navegación de mes y la
  // leyenda de sedes — antes eran dos cajas separadas (viewTabs con su propio fondo, sedesLegend
  // aparte) además de un botón "Volver" suelto arriba.
  headerCard: { backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '16px', padding: '1.25rem', flexShrink: 0 },
  viewTabs: { display: 'flex', gap: '0.4rem', backgroundColor: '#f5f5f0', padding: '0.3rem', borderRadius: '10px', width: 'fit-content' },
  viewTab: { padding: '0.5rem 1.1rem', border: '1px solid transparent', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', backgroundColor: 'transparent', color: '#6b6b60', transition: 'all 0.15s ease' },
  viewTabActive: { backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510' },
  navBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', color: '#374151', transition: 'all 0.15s ease' },
  monthYear: { fontSize: '1.3rem', fontWeight: 700, color: '#16170f', margin: 0, minWidth: '220px', textAlign: 'center' as const, textTransform: 'capitalize' as const },

  sedesLegendDivider: { height: '1px', backgroundColor: '#eeeee6', margin: '1.1rem 0' },
  sedesLegend: { display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, gap: '1.1rem' },
  sedesLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginRight: '0.25rem' },
  sedeLegendItem: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', fontWeight: 600, color: '#33342a' },
  sedeLegendDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },

  // flex:1 + minHeight:0: ocupa todo el espacio restante del pageWrapper; su contenido
  // (calendarContent) es lo único que scrollea si la grilla no cabe completa.
  calendarCard: { backgroundColor: '#fff', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #eeeee6', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' },
  // Título del mes + flechas de navegación, ahora dentro de calendarCard (arriba de la grilla de
  // días) en vez de en el recuadro superior junto a las pestañas de vista. En escritorio es un
  // grid de 3 columnas (1fr auto 1fr) para poder anclar el título del día a la izquierda sin
  // perder el centrado del bloque de navegación de mes; en mobile sigue siendo un flex simple.
  calendarNav: { display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', flexShrink: 0 },
  calendarNavMobile: { display: 'flex', justifyContent: 'space-between' as const },
  calendarNavSide: { display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' },
  calendarNavCenter: { display: 'flex', alignItems: 'center', gap: '1rem', justifySelf: 'center' as const },
  // Título de la vista de día, mostrado a la izquierda de la barra de navegación de mes (que no
  // scrollea) para que quede siempre visible aunque se haga scroll en las cirugías del día.
  dayTitleInline: { fontSize: '1.05rem', fontWeight: 700, color: '#16170f', textTransform: 'capitalize' as const, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
  calendarContent: { flex: 1, minHeight: 0, overflowY: 'auto' as const },

  weekDaysRow: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', marginBottom: '0.4rem' },
  weekDayHeader: { padding: '0.4rem 0.3rem', fontWeight: 700, color: '#9ca3af', fontSize: '0.68rem', textAlign: 'center' as const, textTransform: 'uppercase' as const, letterSpacing: '0.06em' },
  monthGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gridAutoRows: '176px', gap: '1px', backgroundColor: '#eeeee6', border: '1px solid #eeeee6', borderRadius: '10px' },
  emptyDay: { backgroundColor: '#fafaf8' },
  dayCell: { backgroundColor: '#fff', padding: '0.4rem 0.4rem 0.5rem', display: 'flex', flexDirection: 'column' as const, gap: '0.3rem', height: '176px', overflow: 'visible', minWidth: 0 },
  dayCellMobile: { backgroundColor: '#fff', padding: '0.2rem', display: 'flex', flexDirection: 'column' as const, gap: '0.12rem', height: '92px', minWidth: 0, overflow: 'hidden' },
  dayBarsList: { display: 'flex', flexDirection: 'column' as const, gap: '0.1rem', minWidth: 0 },
  dayBar: { fontSize: '0.5rem', fontWeight: 700, color: '#fff', padding: '0.09rem 0.2rem', borderRadius: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, cursor: 'pointer', lineHeight: 1.35 },
  dayBarMore: { fontSize: '0.48rem', fontWeight: 700, color: '#6b7280', padding: '0.05rem 0.2rem', cursor: 'pointer', lineHeight: 1.35 },
  dayNumberRow: { display: 'flex', alignItems: 'center', flexShrink: 0 },
  dayNumber: { fontSize: '0.8rem', color: '#33342a', fontWeight: 600, lineHeight: 1, padding: '0.15rem 0.35rem' },
  todayBadge: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#6b8c1f', color: '#fff', fontSize: '0.75rem', fontWeight: 700, lineHeight: 1 },
  eventsList: { display: 'flex', flexDirection: 'column' as const, gap: '0.25rem', minHeight: 0 },
  eventChip: { display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.28rem 0.45rem', borderRadius: '7px', cursor: 'pointer', transition: 'filter 0.15s ease', minWidth: 0, flexShrink: 0, position: 'relative' as const },
  eventDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },
  eventName: { fontSize: '0.72rem', fontWeight: 600, color: '#33342a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, minWidth: 0, flex: 1 },
  moreLink: { fontSize: '0.68rem', fontWeight: 700, color: '#6b8c1f', cursor: 'pointer', padding: '0.15rem 0.45rem', flexShrink: 0 },
  eventTime: { fontSize: '0.65rem', color: '#9ca3af', marginLeft: 'auto', flexShrink: 0 },
  eventTooltip: { position: 'absolute' as const, bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#16170f', color: '#fff', fontSize: '0.7rem', fontWeight: 600, padding: '0.35rem 0.6rem', borderRadius: '6px', whiteSpace: 'nowrap' as const, boxShadow: '0 4px 12px rgba(0,0,0,0.18)', pointerEvents: 'none' as const, display: 'flex', alignItems: 'center', gap: '0.35rem', zIndex: 40 },
  eventTooltipDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },

  weekContainer: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.75rem' },
  dayColumn: { backgroundColor: '#fff', borderRadius: '10px', overflow: 'hidden', border: '1px solid #eeeee6', display: 'flex', flexDirection: 'column' as const },
  dayColumnHeader: { padding: '0.65rem', fontSize: '0.8rem', fontWeight: 700, color: '#33342a', borderBottom: '1px solid #eeeee6', textAlign: 'center' as const, backgroundColor: '#f9fafb', textTransform: 'capitalize' as const },
  dayColumnHeaderToday: { backgroundColor: '#e9f2d8', color: '#3f6510' },
  dayColumnContent: { flex: 1, padding: '0.5rem', display: 'flex', flexDirection: 'column' as const, gap: '0.4rem', overflow: 'auto', maxHeight: '420px' },

  dayDetail: { padding: '1rem' },
  dayDetailTitle: { fontSize: '1.4rem', fontWeight: 700, color: '#16170f', marginBottom: '1.25rem', textTransform: 'capitalize' as const },
  dayDetailContent: { display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' },
  dayProgItem: { padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '10px', transition: 'box-shadow 0.15s ease', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
};
