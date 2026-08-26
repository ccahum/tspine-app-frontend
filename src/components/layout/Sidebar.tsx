import { useState, useEffect } from 'react';
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
  ChevronDown,
  FileText,
  Calendar,
  ClipboardCheck,
  ShieldCheck,
  CalendarDays,
  Tag,
  Tags,
  CalendarPlus,
  Users,
  Car,
  Route,
  Contact,
} from 'lucide-react';
import { esSuperAdmin } from '../../lib/auth.utils';

const operacionSubmodules = [
  { icon: Calendar, label: 'Programación', path: '/operacion/programaciones' },
  { icon: FileText, label: 'Cotizaciones', path: '/operacion/cotizaciones' },
  { icon: ClipboardCheck, label: 'Remisión', path: '/operacion/remision' },
  { icon: ShieldCheck, label: 'Autorización de consumos', path: '/operacion/autorizacion-consumos' },
  { icon: CalendarDays, label: 'Calendario de programación', path: '/operacion/calendario' },
  { icon: Tag, label: 'Listas de precio', path: '/operacion/listas-precio' },
  { icon: Tags, label: 'Precios especiales', path: '/operacion/precios-especiales' },
  { icon: CalendarPlus, label: 'Solicitud de programación', path: '/operacion/solicitud-programacion' },
];

const administracionSubmodules = [
  { icon: Users, label: 'Usuarios', path: '/administracion/usuarios' },
  { icon: Contact, label: 'Terceros', path: '/administracion/terceros' },
];

const vehicularSubmodules = [
  { icon: Car, label: 'Catálogo Vehicular', path: '/vehicular/catalogo' },
  { icon: Route, label: 'Control de Viajes', path: '/vehicular/control-viajes' },
];

const navItems = [
  { icon: Home, label: 'Inicio', path: '/dashboard' },
  { icon: Wrench, label: 'Operación', path: '/operacion', submodules: operacionSubmodules },
  { icon: ShoppingCart, label: 'Compras', path: '/compras' },
  { icon: Package, label: 'Almacén', path: '/almacen' },
  { icon: Landmark, label: 'Tesorería', path: '/tesoreria' },
  { icon: TrendingUp, label: 'Gestión Financiera', path: '/gestion-financiera' },
  { icon: ClipboardList, label: 'Catálogos', path: '/catalogos' },
  { icon: UserCog, label: 'Administración', path: '/administracion', submodules: administracionSubmodules },
  { icon: Truck, label: 'Gestión Vehicular', path: '/vehicular', submodules: vehicularSubmodules },
];

export default function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const [openModule, setOpenModule] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Administración solo se ofrece a superadmins — el backend ya la rechaza para los demás, pero
  // ni siquiera debería aparecer en el menú.
  const visibleNavItems = navItems.filter(item => item.path !== '/administracion' || esSuperAdmin());

  // Al llegar a una ruta de un módulo con submódulos (ej. /operacion/programaciones), abre ese
  // módulo automáticamente para que el usuario vea en qué submódulo está parado.
  const deriveOpenModule = (pathname: string) => {
    const parent = visibleNavItems.find(
      item => item.submodules && (pathname === item.path || pathname.startsWith(`${item.path}/`)),
    );
    return parent ? parent.path : null;
  };

  useEffect(() => {
    setOpenModule(deriveOpenModule(location.pathname));
  }, [location.pathname]);

  return (
    <aside
      style={{ ...styles.sidebar, width: expanded ? '220px' : '60px' }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => { setExpanded(false); setOpenModule(deriveOpenModule(location.pathname)); }}
    >
      {visibleNavItems.map(({ icon: Icon, label, path, submodules }) => {
        const active = location.pathname === path || location.pathname.startsWith(`${path}/`);
        const hasSubmodules = !!submodules?.length;
        const isOpen = openModule === path;
        return (
          <div key={path}>
            <button
              onClick={() => {
                if (hasSubmodules && expanded) {
                  setOpenModule(isOpen ? null : path);
                } else {
                  navigate(path);
                }
              }}
              style={{
                ...styles.item,
                backgroundColor: active ? '#6b8c1f' : (isOpen ? 'rgba(255,255,255,0.08)' : 'transparent'),
                color: active ? '#fff' : '#ccc',
              }}
              title={!expanded ? label : ''}
              onMouseEnter={e => { if (!active && !isOpen) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={e => { if (!active && !isOpen) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <Icon size={20} style={{ flexShrink: 0 }} />
              {expanded && <span style={styles.label}>{label}</span>}
              {expanded && hasSubmodules && (
                <ChevronDown
                  size={14}
                  style={{ marginLeft: 'auto', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s ease', flexShrink: 0 }}
                />
              )}
            </button>

            {expanded && hasSubmodules && isOpen && (
              <div className="sidebar-submenu-anim" style={styles.submoduleList}>
                {submodules.map(({ label: subLabel, path: subPath }) => {
                  const subActive = location.pathname === subPath || location.pathname.startsWith(`${subPath}/`);
                  return (
                    <button
                      key={subPath}
                      onClick={() => navigate(subPath)}
                      style={{
                        ...styles.subItem,
                        backgroundColor: subActive ? '#6b8c1f' : 'transparent',
                        color: subActive ? '#fff' : '#b5b5ab',
                      }}
                      onMouseEnter={e => { if (!subActive) { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff'; } }}
                      onMouseLeave={e => { if (!subActive) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#b5b5ab'; } }}
                    >
                      <span style={styles.subLabel}>{subLabel}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
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
    overflowY: 'auto',
    zIndex: 99,
    boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.65rem',
    margin: '0 8px 4px',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    borderRadius: '12px',
    transition: 'background-color 0.15s, color 0.15s',
    whiteSpace: 'nowrap',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 500,
  },
  submoduleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    margin: '0 4px 6px 16px',
  },
  subItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.45rem 0.4rem',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    borderRadius: '10px',
    transition: 'background-color 0.15s, color 0.15s',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  subLabel: {
    fontSize: '0.78rem',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    minWidth: 0,
  },
};
