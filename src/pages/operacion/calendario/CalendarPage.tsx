import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '../../../components/layout/Layout';
import { useResponsiveStyles } from '../../../hooks/useResponsiveStyles';
import { programacionesService } from '../../../services/programaciones.service';

const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
const getFirstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

const SEDE_COLORS: { [key: string]: string } = {
  'Sede Cancún': '#6b8c1f',        // Verde
  'Sede Guadalajara': '#f59e0b',   // Naranja
  'Sede Mérida': '#2563eb',        // Azul
  'Sede Vallarta': '#fbbf24',      // Amarillo
};

interface ProgramacionInfo {
  id: string;
  medicos: string[];
  fechaQx: string;
  horaQx?: string;
  sede?: string;
}

type ViewType = 'mes' | 'semana' | 'dia';

export default function CalendarPage() {
  const navigate = useNavigate();
  const { isMobile } = useResponsiveStyles();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewType>('mes');
  const [programacionesByDate, setProgramacionesByDate] = useState<{ [key: string]: ProgramacionInfo[] }>({});

  const { data: allProgramaciones } = useQuery({
    queryKey: ['programaciones-calendar'],
    queryFn: () => programacionesService.findAll({ limit: 10000 }),
  });

  useEffect(() => {
    if (allProgramaciones?.data) {
      const grouped: { [key: string]: ProgramacionInfo[] } = {};
      allProgramaciones.data.forEach(p => {
        if (p.fechaQx) {
          const key = p.fechaQx.split('T')[0];
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push({
            id: p.id,
            medicos: p.medicos || [],
            fechaQx: p.fechaQx,
            horaQx: p.horaQx,
            sede: p.sede || (p as any).sedeId,
          });
        }
      });
      setProgramacionesByDate(grouped);
    }
  }, [allProgramaciones]);

  const formatDate = (date: Date) => date.toISOString().split('T')[0];
  const getProgramacionesForDay = (date: Date) => programacionesByDate[formatDate(date)] || [];

  // Stats
  const today = new Date();
  const todayProgramaciones = getProgramacionesForDay(today);
  const totalSurgeries = todayProgramaciones.length;
  const totalDoctors = [...new Set(todayProgramaciones.flatMap(p => p.medicos))].length;
  const totalMonth = Object.values(programacionesByDate).flat().length;

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

  // Render Mes
  const renderMes = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days = Array(firstDay).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));

    const today = new Date();
    const isCurrentMonth = currentDate.getMonth() === today.getMonth() && currentDate.getFullYear() === today.getFullYear();

    return (
      <>
        <div style={styles.weekDays}>
          {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'].map(d => (
            <div key={d} style={styles.weekDay}>{d}</div>
          ))}
        </div>
        <div style={styles.daysGrid}>
          {days.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} style={styles.emptyDay} />;

            const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
            const progs = getProgramacionesForDay(date);
            const isToday = isCurrentMonth && day === today.getDate();
            const firstProgColor = progs.length > 0 ? SEDE_COLORS[progs[0].sede || 'Cancún'] || '#6b8c1f' : null;

            return (
              <div
                key={`day-${currentDate.getFullYear()}-${currentDate.getMonth()}-${day}`}
                style={{
                  ...styles.dayCell,
                  backgroundColor: isToday ? '#f0f4e8' : '#fff',
                  borderTop: isToday ? '3px solid #6b8c1f' : '1px solid #e5e7eb',
                }}
              >
                <div style={{ ...styles.dayNumber, fontWeight: isToday ? 700 : 400 }}>{day}</div>
                <div style={styles.doctorsList}>
                  {progs.slice(0, 3).map((prog) => {
                    const color = SEDE_COLORS[prog.sede || 'Sede Cancún'] || '#6b8c1f';
                    return (
                      <div
                        key={prog.id}
                        onClick={() => navigate(`/operacion/programaciones/${prog.id}`)}
                        style={{ ...styles.doctorBadge, backgroundColor: color + '20', borderLeft: `3px solid ${color}`, cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
                      >
                        <span style={{ color, fontSize: '0.7rem', fontWeight: 600 }}>
                          {prog.medicos[0] || '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {progs.length > 3 && (
                  <div
                    onClick={() => {
                      setCurrentDate(date);
                      setView('dia');
                    }}
                    style={{ ...styles.progCount, cursor: 'pointer', textDecoration: 'underline' }}
                    onMouseEnter={e => { e.currentTarget.style.color = firstProgColor; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#6b8c1f'; }}
                  >
                    +{progs.length - 3} más
                  </div>
                )}
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
      <div style={styles.weekContainer}>
        {weekDates.map(date => {
          const progs = getProgramacionesForDay(date);
          const isToday = date.toDateString() === today.toDateString();
          const dayName = date.toLocaleString('es-MX', { weekday: 'short', day: 'numeric' });

          return (
            <div key={date.toISOString()} style={{ ...styles.dayColumn, backgroundColor: isToday ? '#f0f4e8' : '#fff' }}>
              <div style={{ ...styles.dayColumnHeader, fontWeight: isToday ? 700 : 400, backgroundColor: isToday ? '#e8f0d9' : '#f9fafb' }}>
                {dayName}
              </div>
              <div style={styles.dayColumnContent}>
                {progs.map((prog) => {
                  const color = SEDE_COLORS[prog.sede || 'Cancún'] || '#6b8c1f';
                  return (
                    <div
                      key={prog.id}
                      onClick={() => navigate(`/operacion/programaciones/${prog.id}`)}
                      style={{
                        ...styles.progItem,
                        backgroundColor: color + '15',
                        borderLeft: `3px solid ${color}`,
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateX(2px)'; }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateX(0)'; }}
                    >
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color }}>
                        {prog.medicos[0] || '—'}
                      </div>
                      {prog.horaQx && <div style={{ fontSize: '0.65rem', color: '#666' }}>{prog.horaQx}</div>}
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
        <h3 style={styles.dayDetailTitle}>{dayName}</h3>
        <div style={styles.dayDetailContent}>
          {progs.length === 0 ? (
            <p style={{ color: '#999', textAlign: 'center', padding: '2rem' }}>Sin cirugías programadas</p>
          ) : (
            progs.map((prog) => {
              const color = SEDE_COLORS[prog.sede || 'Cancún'] || '#6b8c1f';
              return (
                <div
                  key={prog.id}
                  onClick={() => navigate(`/operacion/programaciones/${prog.id}`)}
                  style={{
                    ...styles.dayProgItem,
                    borderLeft: `4px solid ${color}`,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <div style={{ fontWeight: 600, color }}>
                      {prog.medicos[0] || 'Sin médico'}
                    </div>
                    {prog.horaQx && <div style={{ fontSize: '0.9rem', color: '#666' }}>{prog.horaQx}</div>}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#999' }}>Sede: {prog.sede || 'Cancún'}</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div style={styles.container}>
        {/* Dashboard Stats */}
        <div style={{ ...styles.statsGrid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)' }}>
          <div style={styles.statCard} onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.1)'; }} onMouseLeave={e => { e.currentTarget.style.boxShadow = styles.statCard.boxShadow; }}>
            <div style={styles.statLabel}>Cirugías Hoy</div>
            <div style={{ ...styles.statValue, color: '#6b8c1f' }}>{totalSurgeries}</div>
          </div>
          <div style={styles.statCard} onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.1)'; }} onMouseLeave={e => { e.currentTarget.style.boxShadow = styles.statCard.boxShadow; }}>
            <div style={styles.statLabel}>Médicos Hoy</div>
            <div style={{ ...styles.statValue, color: '#2563eb' }}>{totalDoctors}</div>
          </div>
          <div style={styles.statCard} onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.1)'; }} onMouseLeave={e => { e.currentTarget.style.boxShadow = styles.statCard.boxShadow; }}>
            <div style={styles.statLabel}>Total Mes</div>
            <div style={{ ...styles.statValue, color: '#7c3aed' }}>{totalMonth}</div>
          </div>
        </div>

        {/* View Tabs */}
        <div style={styles.tabsContainer}>
          {(['mes', 'semana', 'dia'] as ViewType[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                ...styles.viewTab,
                backgroundColor: view === v ? '#6b8c1f' : '#f3f4f6',
                color: view === v ? '#fff' : '#666',
              }}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {/* Calendar */}
        <div style={styles.calendarCard}>
          <div style={styles.calendarHeader}>
            <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))} style={styles.navBtn}>
              <ChevronLeft size={18} />
            </button>
            <h2 style={styles.monthYear}>{monthYear.charAt(0).toUpperCase() + monthYear.slice(1)}</h2>
            <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))} style={styles.navBtn}>
              <ChevronRight size={18} />
            </button>
          </div>

          {view === 'mes' && renderMes()}
          {view === 'semana' && renderSemana()}
          {view === 'dia' && renderDia()}
        </div>
      </div>
    </Layout>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' },
  statsGrid: { display: 'grid', gap: '1rem', marginBottom: '2rem' },
  statCard: { backgroundColor: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', transition: 'all 0.2s ease', cursor: 'default', backfaceVisibility: 'hidden' },
  statLabel: { fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.75rem' },
  statValue: { fontSize: '2rem', fontWeight: 700 },
  tabsContainer: { display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' },
  viewTab: { padding: '0.5rem 1rem', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', transition: 'all 0.2s ease', backfaceVisibility: 'hidden' },
  calendarCard: { backgroundColor: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  calendarHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' },
  navBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', transition: 'all 0.2s ease', backfaceVisibility: 'hidden' },
  monthYear: { fontSize: '1.5rem', fontWeight: 700, color: '#333', margin: 0 },
  weekDays: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0px', marginBottom: '0.5rem' },
  weekDay: { padding: '0.3rem 0.2rem', fontWeight: 600, color: '#9ca3af', fontSize: '0.6rem', textAlign: 'center', textTransform: 'uppercase' },
  daysGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0px', backgroundColor: '#e5e7eb', padding: '0px', borderRadius: '8px', overflow: 'hidden' },
  emptyDay: { backgroundColor: '#f9fafb', minHeight: '75px', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' },
  dayCell: { backgroundColor: '#fff', minHeight: '75px', padding: '0.2rem 0.15rem', display: 'flex', flexDirection: 'column', gap: '0.1rem', transition: 'all 0.2s ease', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' },
  dayNumber: { fontSize: '0.6rem', color: '#333', fontWeight: 500, lineHeight: '1' },
  doctorsList: { display: 'flex', flexDirection: 'column', gap: '0px', flex: 1, overflow: 'hidden' },
  doctorBadge: { padding: '1px 2px', borderRadius: '2px', fontSize: '0.55rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'all 0.2s ease', lineHeight: '1.1' },
  progCount: { fontSize: '0.65rem', fontWeight: 700, color: '#6b8c1f', textAlign: 'right' },
  weekContainer: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.75rem' },
  dayColumn: { backgroundColor: '#fff', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' },
  dayColumnHeader: { padding: '0.75rem', fontSize: '0.875rem', fontWeight: 600, color: '#333', borderBottom: '1px solid #e5e7eb', textAlign: 'center' },
  dayColumnContent: { flex: 1, padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', overflow: 'auto', maxHeight: '400px' },
  progItem: { padding: '0.5rem', borderRadius: '6px', fontSize: '0.8rem', transition: 'all 0.2s ease', cursor: 'pointer' },
  dayDetail: { padding: '1rem' },
  dayDetailTitle: { fontSize: '1.5rem', fontWeight: 700, color: '#333', marginBottom: '1.5rem', textTransform: 'capitalize' },
  dayDetailContent: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  dayProgItem: { padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px', transition: 'all 0.2s ease', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
};
