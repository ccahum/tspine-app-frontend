import { useEffect, useState } from 'react';
import {
  Wrench, ShoppingCart, Archive, Landmark,
  TrendingUp, ClipboardList, Users, Truck,
} from 'lucide-react';
import { useResponsiveStyles } from '../../hooks/useResponsiveStyles';
import { esSuperAdmin } from '../../lib/auth.utils';
import { tieneAccesoAVista, moduloTieneAlgunAcceso } from '../../lib/permissions.utils';
import { useNavigateWithLoading } from '../../hooks/useNavigateWithLoading';

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
  const navigate = useNavigateWithLoading();
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
  // Mismo criterio que Sidebar.tsx: Administración solo para superadmins; Operación/Vehicular
  // (módulos con submódulos propios) se muestran si el perfil tiene acceso a alguno de ellos;
  // el resto (módulos placeholder sin submódulos reales) se oculta para un perfil restringido.
  const modulosVisibles = modules.filter(mod => {
    if (mod.path === '/administracion') return esSuperAdmin();
    if (mod.path === '/operacion' || mod.path === '/vehicular') return moduloTieneAlgunAcceso(mod.path);
    return tieneAccesoAVista(mod.path);
  });

  // Mismo patrón que OperacionPage/CotizacionesPage: pageWrapper anclado al viewport +
  // scroll del body bloqueado mientras esta página está montada, para que todos los módulos
  // den completos en una sola pantalla sin barra de scroll de la página.
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
      <div style={{ ...styles.pageWrapper, left: isMobile ? 0 : '60px', paddingLeft: isMobile ? '1rem' : '2rem', paddingRight: isMobile ? '1rem' : '2rem' }}>
        <div style={styles.welcome}>
          <h2 style={styles.welcomeTitle}>Inicio</h2>
          <p style={styles.welcomeSub}>Selecciona un módulo para continuar</p>
        </div>

        <div style={styles.gridWrap}>
          <div style={{ ...styles.grid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {modulosVisibles.map((mod) => (
              <ModuleCard key={mod.path} {...mod} />
            ))}
          </div>
        </div>
      </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  // Anclado directo a los bordes del viewport (en vez de calc(100vh - Npx)) para que el alto
  // disponible salga siempre correcto. Mismo patrón que pageWrapper en OperacionPage.tsx.
  pageWrapper: {
    position: 'fixed', top: '60px', right: 0, bottom: 0,
    paddingTop: '1.5rem', paddingBottom: '1.5rem', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden',
  },
  // paddingTop: sin esto, el translateY(-2px) + boxShadow del hover en la primera fila queda
  // recortado por el propio overflowY:auto de este contenedor.
  gridWrap: { flex: 1, minHeight: 0, overflowY: 'auto', paddingTop: '6px' },
  welcome: {
    marginBottom: '1.5rem',
    flexShrink: 0,
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
