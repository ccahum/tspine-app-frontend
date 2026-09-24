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
  Users,
  Car,
  Route,
  Contact,
  KeyRound,
  X,
  LogOut,
} from 'lucide-react';
import { esSuperAdmin } from '../../lib/auth.utils';
import { tieneAccesoAVista } from '../../lib/permissions.utils';
import { useResponsiveStyles } from '../../hooks/useResponsiveStyles';
import { useNavigateWithLoading } from '../../hooks/useNavigateWithLoading';
import { prefetchRoute } from '../../routeImports';
import { authService } from '../../services/auth.service';
import SuccessToast from '../SuccessToast';

// Mismo delay que el logout del Header (ver Header.tsx) — deja tiempo a que se vea el desvanecido
// de la app antes de saltar a /login, para que no se sienta como un corte brusco.
const LOGOUT_REDIRECT_DELAY_MS = 500;

const operacionSubmodules = [
  { icon: Calendar, label: 'Programación', path: '/operacion/programaciones' },
  { icon: FileText, label: 'Cotizaciones', path: '/operacion/cotizaciones' },
  { icon: ClipboardCheck, label: 'Remisión', path: '/operacion/remision' },
  { icon: ShieldCheck, label: 'Autorización de consumos', path: '/operacion/autorizacion-consumos' },
  { icon: CalendarDays, label: 'Calendario de programación', path: '/operacion/calendario' },
  { icon: Tag, label: 'Listas de precio', path: '/operacion/listas-precio' },
  { icon: Tags, label: 'Precios especiales', path: '/operacion/precios-especiales' },
];

const administracionSubmodules = [
  { icon: Users, label: 'Usuarios', path: '/administracion/usuarios' },
  { icon: Contact, label: 'Terceros', path: '/administracion/terceros' },
  { icon: KeyRound, label: 'Perfiles', path: '/administracion/perfiles' },
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

interface SidebarProps {
  /** Solo aplica en mobile: controla si el drawer está abierto. Se ignora en desktop. */
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export default function Sidebar({ mobileOpen = false, onCloseMobile }: SidebarProps) {
  const { isMobile } = useResponsiveStyles();
  const [expanded, setExpanded] = useState(false);
  const [openModule, setOpenModule] = useState<string | null>(null);
  // mobileOpen lo controla el padre (Layout.tsx) — al pasar a false, `if (!mobileOpen) return
  // null` desmontaba el drawer de golpe, sin dar tiempo a que corriera una animación de salida.
  // `closing` retiene el drawer montado el tiempo justo para que se vea el slide-out antes de
  // avisarle al padre que ya puede desmontarlo de verdad.
  const [closing, setClosing] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [showLogoutToast, setShowLogoutToast] = useState(false);
  const navigateTo = useNavigateWithLoading();
  const navigate = useNavigate();
  const location = useLocation();

  const confirmarCerrarSesion = () => {
    authService.logout();
    setConfirmLogout(false);
    setShowLogoutToast(true);
    document.getElementById('root')?.classList.add('app-fade-out');
    setTimeout(() => {
      document.getElementById('root')?.classList.remove('app-fade-out');
      navigate('/login');
    }, LOGOUT_REDIRECT_DELAY_MS);
  };

  // Administración solo se ofrece a superadmins — el backend ya la rechaza para los demás, pero
  // ni siquiera debería aparecer en el menú. Además, para un perfil restringido (ver
  // permissions.utils.ts), cada módulo con submódulos solo muestra los que sí tiene asignados —
  // si le queda vacío, el módulo padre desaparece del todo. Los módulos "placeholder" sin
  // submódulos propios (Compras, Almacén, etc. — todavía no tienen página real) también se
  // ocultan para un perfil restringido, aunque no exista ninguna vista que los cubra: no tiene
  // sentido mostrar algo a lo que nunca se le podría dar acceso.
  const visibleNavItems = navItems
    .filter(item => item.path !== '/administracion' || esSuperAdmin())
    .map(item => (item.submodules ? { ...item, submodules: item.submodules.filter(s => tieneAccesoAVista(s.path)) } : item))
    .filter(item => {
      if (item.submodules) return item.submodules.length > 0;
      if (item.path === '/dashboard') return true;
      return tieneAccesoAVista(item.path);
    });

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

  // En el drawer de mobile no hay hover, así que siempre se ve "expandido" (con etiquetas).
  const showLabels = isMobile ? true : expanded;

  const closeMobileDrawer = () => {
    setClosing(true);
    setConfirmLogout(false);
    setTimeout(() => {
      setClosing(false);
      onCloseMobile?.();
    }, 200);
  };

  const handleItemClick = (path: string, hasSubmodules: boolean) => {
    if (hasSubmodules && showLabels) {
      setOpenModule(prev => (prev === path ? null : path));
    } else {
      navigateTo(path);
      if (isMobile) closeMobileDrawer();
    }
  };

  const handleSubItemClick = (subPath: string) => {
    navigateTo(subPath);
    if (isMobile) closeMobileDrawer();
  };

  const navList = (
    <>
      {visibleNavItems.map(({ icon: Icon, label, path, submodules }) => {
        const active = location.pathname === path || location.pathname.startsWith(`${path}/`);
        const hasSubmodules = !!submodules?.length;
        const isOpen = openModule === path;
        return (
          <div key={path}>
            <button
              onClick={() => handleItemClick(path, hasSubmodules)}
              style={{
                ...styles.item,
                backgroundColor: active ? '#6b8c1f' : (isOpen ? 'rgba(255,255,255,0.08)' : 'transparent'),
                color: active ? '#fff' : '#ccc',
              }}
              title={!showLabels ? label : ''}
              onMouseEnter={e => {
                if (!active && !isOpen) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)';
                prefetchRoute(path);
              }}
              onMouseLeave={e => { if (!active && !isOpen) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <Icon size={20} style={{ flexShrink: 0 }} />
              {showLabels && <span style={styles.label}>{label}</span>}
              {showLabels && hasSubmodules && (
                <ChevronDown
                  size={14}
                  style={{ marginLeft: 'auto', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s ease', flexShrink: 0 }}
                />
              )}
            </button>

            {showLabels && hasSubmodules && isOpen && (
              <div className="sidebar-submenu-anim" style={styles.submoduleList}>
                {submodules.map(({ label: subLabel, path: subPath }) => {
                  const subActive = location.pathname === subPath || location.pathname.startsWith(`${subPath}/`);
                  return (
                    <button
                      key={subPath}
                      onClick={() => handleSubItemClick(subPath)}
                      style={{
                        ...styles.subItem,
                        backgroundColor: subActive ? '#6b8c1f' : 'transparent',
                        color: subActive ? '#fff' : '#b5b5ab',
                      }}
                      onMouseEnter={e => {
                        if (!subActive) { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff'; }
                        prefetchRoute(subPath);
                      }}
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

      <div style={styles.logoutDivider} />
      {confirmLogout ? (
        <div style={styles.logoutConfirmBox}>
          <span style={styles.logoutConfirmText}>¿Cerrar sesión?</span>
          <div style={styles.logoutConfirmActions}>
            <button style={styles.logoutCancelBtn} onClick={() => setConfirmLogout(false)}>Cancelar</button>
            <button style={styles.logoutConfirmBtn} onClick={confirmarCerrarSesion}>Sí, cerrar</button>
          </div>
        </div>
      ) : (
        <button
          className="sidebar-logout-btn"
          onClick={() => setConfirmLogout(true)}
          style={{ ...styles.item, backgroundColor: 'transparent', color: '#f4a29a' }}
          title={!showLabels ? 'Cerrar sesión' : ''}
        >
          <LogOut size={20} style={{ flexShrink: 0 }} />
          {showLabels && <span style={styles.label}>Cerrar sesión</span>}
        </button>
      )}
    </>
  );

  if (isMobile) {
    if (!mobileOpen && !closing) return null;
    return (
      <>
        <div className={closing ? 'modal-overlay-closing' : 'modal-overlay-anim'} style={styles.backdrop} onClick={closeMobileDrawer} />
        <aside className={closing ? 'mobile-drawer-anim-out' : 'mobile-drawer-anim'} style={styles.drawer}>
          <div style={styles.drawerHeader}>
            <span style={styles.drawerTitle}>Menú</span>
            <button style={styles.drawerCloseBtn} onClick={closeMobileDrawer}>
              <X size={20} />
            </button>
          </div>
          <div style={styles.drawerBody}>{navList}</div>
        </aside>
        <SuccessToast
          show={showLogoutToast}
          message="Cerrando sesión..."
          color="#dc2626"
          textColor="#dc2626"
          icon={<LogOut size={24} strokeWidth={2.2} />}
          onClose={() => setShowLogoutToast(false)}
          duration={LOGOUT_REDIRECT_DELAY_MS}
        />
      </>
    );
  }

  return (
    <>
      <aside
        style={{ ...styles.sidebar, width: expanded ? '220px' : '60px' }}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => { setExpanded(false); setOpenModule(deriveOpenModule(location.pathname)); setConfirmLogout(false); }}
      >
        {navList}
      </aside>
      <SuccessToast
        show={showLogoutToast}
        message="Cerrando sesión..."
        color="#dc2626"
        textColor="#dc2626"
        icon={<LogOut size={24} strokeWidth={2.2} />}
        onClose={() => setShowLogoutToast(false)}
        duration={LOGOUT_REDIRECT_DELAY_MS}
      />
    </>
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
  backdrop: {
    position: 'fixed',
    top: '60px',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 98,
  },
  drawer: {
    position: 'fixed',
    top: '60px',
    left: 0,
    bottom: 0,
    width: 'min(280px, 82vw)',
    backgroundColor: '#333333',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    zIndex: 99,
    boxShadow: '2px 0 12px rgba(0,0,0,0.25)',
  },
  drawerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    flexShrink: 0,
  },
  drawerTitle: {
    fontSize: '0.8rem',
    fontWeight: 700,
    color: '#fff',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  drawerCloseBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: 'transparent',
    color: '#ccc',
    cursor: 'pointer',
  },
  drawerBody: {
    paddingTop: '0.5rem',
    paddingBottom: '1rem',
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
  logoutDivider: {
    height: '1px',
    backgroundColor: 'rgba(255,255,255,0.1)',
    margin: '0.5rem 12px',
  },
  logoutConfirmBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.6rem',
    margin: '0 8px 4px',
    padding: '0.75rem',
    backgroundColor: 'rgba(220,38,38,0.12)',
    borderRadius: '12px',
  },
  logoutConfirmText: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#fff',
  },
  logoutConfirmActions: {
    display: 'flex',
    justifyContent: 'flex-end' as const,
    gap: '0.5rem',
  },
  logoutCancelBtn: {
    padding: '0.35rem 0.65rem',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#ccc',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  logoutConfirmBtn: {
    padding: '0.35rem 0.65rem',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#dc2626',
    color: '#fff',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
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
