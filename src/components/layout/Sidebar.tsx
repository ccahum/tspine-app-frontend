import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  Wrench,
  ShoppingCart,
  Package,
  Landmark,
  TrendingUp,
  ClipboardList,
  UserCog,
  Truck,
  ChevronRight,
} from 'lucide-react';

const navItems = [
  { icon: Home, label: 'Inicio', path: '/dashboard' },
  { icon: Wrench, label: 'Operación', path: '/operacion' },
  { icon: ShoppingCart, label: 'Compras', path: '/compras' },
  { icon: Package, label: 'Almacén', path: '/almacen' },
  { icon: Landmark, label: 'Tesorería', path: '/tesoreria' },
  { icon: TrendingUp, label: 'Gestión Financiera', path: '/gestion-financiera' },
  { icon: ClipboardList, label: 'Catálogos', path: '/catalogos' },
  { icon: UserCog, label: 'Administración', path: '/administracion' },
  { icon: Truck, label: 'Gestión Vehicular', path: '/vehicular' },
];

export default function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside
      style={{ ...styles.sidebar, width: expanded ? '220px' : '60px' }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {navItems.map(({ icon: Icon, label, path }) => {
        const active = location.pathname === path;
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            style={{
              ...styles.item,
              backgroundColor: active ? '#6b8c1f' : 'transparent',
              color: active ? '#fff' : '#ccc',
            }}
            title={!expanded ? label : ''}
          >
            <Icon size={20} style={{ flexShrink: 0 }} />
            {expanded && <span style={styles.label}>{label}</span>}
            {expanded && active && <ChevronRight size={14} style={{ marginLeft: 'auto' }} />}
          </button>
        );
      })}
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    position: 'fixed',
    top: '60px',
    left: 0,
    bottom: 0,
    backgroundColor: '#333333',
    display: 'flex',
    flexDirection: 'column',
    paddingTop: '0.5rem',
    transition: 'width 0.2s ease',
    overflowX: 'hidden',
    zIndex: 99,
    boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    border: 'none',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    borderRadius: '0',
    transition: 'background-color 0.15s',
    whiteSpace: 'nowrap',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 500,
  },
};
