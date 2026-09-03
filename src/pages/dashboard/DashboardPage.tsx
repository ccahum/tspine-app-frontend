import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wrench, ShoppingCart, Archive, Landmark,
  TrendingUp, ClipboardList, Users, Truck,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { useResponsiveStyles } from '../../hooks/useResponsiveStyles';
import { esSuperAdmin } from '../../lib/auth.utils';

const ACCENT = '#4a7c59';

const modules = [
  { icon: Wrench, label: 'Operación', description: 'Programaciones, remisiones y bitácora', path: '/operacion' },
  { icon: ShoppingCart, label: 'Compras', description: 'Órdenes de compra y proveedores', path: '/compras' },
  { icon: Archive, label: 'Almacén', description: 'Inventario, entradas y salidas', path: '/almacen' },
  { icon: Landmark, label: 'Tesorería', description: 'Pagos, cobros y cuentas', path: '/tesoreria' },
  { icon: TrendingUp, label: 'Gestión financiera', description: 'Reportes y análisis financiero', path: '/gestion-financiera' },
  { icon: ClipboardList, label: 'Catálogos', description: 'Insumos, hospitales y médicos', path: '/catalogos' },
  { icon: Users, label: 'Administración', description: 'Usuarios, roles y permisos', path: '/administracion' },
  { icon: Truck, label: 'Gestión vehicular', description: 'Flotilla y logística', path: '/vehicular' },
];

function ModuleCard({ icon: Icon, label, description, path }: typeof modules[0]) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => navigate(path)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.card,
        borderColor: hovered ? ACCENT : '#eeeee6',
        boxShadow: hovered ? '0 8px 20px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      <div style={styles.iconWrap}>
        <Icon size={20} color={ACCENT} />
      </div>
      <span style={styles.cardLabel}>{label}</span>
      <span style={styles.cardDescription}>{description}</span>
    </div>
  );
}

export default function DashboardPage() {
  const { isMobile } = useResponsiveStyles();
  // Administración solo se ofrece a superadmins — mismo criterio que Sidebar.tsx.
  const modulosVisibles = modules.filter(mod => mod.path !== '/administracion' || esSuperAdmin());

  return (
    <Layout>
      <div style={{ ...styles.container, paddingLeft: isMobile ? '1rem' : '2rem', paddingRight: isMobile ? '1rem' : '2rem' }}>
        <div style={styles.welcome}>
          <h2 style={styles.welcomeTitle}>Inicio</h2>
          <p style={styles.welcomeSub}>Selecciona un módulo para continuar</p>
        </div>

        <div style={{ ...styles.grid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {modulosVisibles.map((mod) => (
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
    color: '#16170f',
    margin: '0 0 0.3rem',
  },
  welcomeSub: {
    color: '#6b7280',
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
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '1.25rem',
  },
  card: {
    backgroundColor: '#fff',
    border: '1px solid #eeeee6',
    borderRadius: '16px',
    padding: '1.5rem',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '0.6rem',
    transition: 'all 0.2s ease',
  },
  iconWrap: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    backgroundColor: '#e9f2d8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '0.3rem',
  },
  cardLabel: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#16170f',
  },
  cardDescription: {
    fontSize: '0.82rem',
    fontWeight: 400,
    color: '#6b7280',
    marginTop: '-0.35rem',
  },
};
