import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Wrench, ShoppingCart, Package, Landmark,
  TrendingUp, ClipboardList, UserCog, Truck,
  Calendar, BarChart3,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { useResponsiveStyles } from '../../hooks/useResponsiveStyles';
import { programacionesService } from '../../services/programaciones.service';

const modules = [
  { icon: Wrench, label: 'Módulo Operación', path: '/operacion', color: '#6b8c1f' },
  { icon: ShoppingCart, label: 'Módulo Compras', path: '/compras', color: '#4a7c59' },
  { icon: Package, label: 'Módulo Almacén', path: '/almacen', color: '#5c7a3e' },
  { icon: Landmark, label: 'Módulo Tesorería', path: '/tesoreria', color: '#3d6b52' },
  { icon: TrendingUp, label: 'Módulo Gestión Financiera', path: '/gestion-financiera', color: '#6b8c1f' },
  { icon: ClipboardList, label: 'Módulo Catálogos', path: '/catalogos', color: '#4a7c59' },
  { icon: UserCog, label: 'Módulo Administración', path: '/administracion', color: '#5c7a3e' },
  { icon: Truck, label: 'Gestión Vehicular', path: '/vehicular', color: '#3d6b52' },
];

function ModuleCard({ icon: Icon, label, path, color }: typeof modules[0]) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => navigate(path)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.card,
        boxShadow: hovered
          ? `0 8px 24px rgba(107,140,31,0.2)`
          : '0 2px 8px rgba(0,0,0,0.07)',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        borderTop: `3px solid ${hovered ? color : 'transparent'}`,
      }}
    >
      <div style={{ ...styles.iconWrap, backgroundColor: `${color}18` }}>
        <Icon size={32} color={color} />
      </div>
      <span style={styles.cardLabel}>{label}</span>
    </div>
  );
}

export default function DashboardPage() {
  const usuario = JSON.parse(localStorage.getItem('usuario') ?? '{}');
  const { isMobile } = useResponsiveStyles();

  const { data: allProgramaciones } = useQuery({
    queryKey: ['programaciones-dashboard'],
    queryFn: () => programacionesService.findAll({ limit: 10000 }),
  });

  const stats = useMemo(() => {
    if (!allProgramaciones?.data) return { thisYear: 0, thisMonth: 0 };
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let thisYear = 0;
    let thisMonth = 0;

    allProgramaciones.data.forEach(prog => {
      if (prog.fechaQx) {
        const progDate = new Date(prog.fechaQx);
        if (progDate.getFullYear() === currentYear) {
          thisYear++;
          if (progDate.getMonth() === currentMonth) {
            thisMonth++;
          }
        }
      }
    });

    return { thisYear, thisMonth };
  }, [allProgramaciones]);

  return (
    <Layout>
      <div style={{ ...styles.container, paddingLeft: isMobile ? '1rem' : '2rem', paddingRight: isMobile ? '1rem' : '2rem' }}>
        <div style={styles.welcome}>
          <h2 style={styles.welcomeTitle}>Inicio</h2>
          <p style={styles.welcomeSub}>Bienvenido, <strong>{usuario.nombreCompleto}</strong></p>
        </div>

        <div style={{ ...styles.statsGrid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', marginBottom: '2rem' }}>
          <div style={styles.statCard} onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 16px rgba(107,140,31,0.15)'; }} onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; }}>
            <div style={styles.statHeader}>
              <Calendar size={20} color="#6b8c1f" />
              <span style={styles.statLabel}>Programaciones del Año</span>
            </div>
            <div style={{ ...styles.statValue, color: '#6b8c1f' }}>{stats.thisYear}</div>
          </div>

          <div style={styles.statCard} onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 16px rgba(107,140,31,0.15)'; }} onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; }}>
            <div style={styles.statHeader}>
              <BarChart3 size={20} color="#2563eb" />
              <span style={styles.statLabel}>Programaciones del Mes</span>
            </div>
            <div style={{ ...styles.statValue, color: '#2563eb' }}>{stats.thisMonth}</div>
          </div>
        </div>

        <div style={{ ...styles.grid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {modules.map((mod) => (
            <ModuleCard key={mod.path} {...mod} />
          ))}
        </div>
      </div>
    </Layout>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    paddingLeft: '2rem',
    paddingRight: '2rem',
  },
  welcome: {
    marginBottom: '1.5rem',
  },
  welcomeTitle: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#333',
    margin: '0 0 0.25rem',
  },
  welcomeSub: {
    color: '#666',
    margin: 0,
    fontSize: '0.9rem',
  },
  statsGrid: {
    display: 'grid',
    gap: '1.25rem',
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '1.5rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    transition: 'all 0.2s ease',
  },
  statHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1rem',
  },
  statLabel: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#666',
  },
  statValue: {
    fontSize: '2.5rem',
    fontWeight: 700,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '1.25rem',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '1.75rem 1.5rem',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '1rem',
    transition: 'all 0.2s ease',
    borderTop: '3px solid transparent',
  },
  iconWrap: {
    width: '56px',
    height: '56px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#333',
  },
};
