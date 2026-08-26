import { useEffect, useRef, useState } from 'react';
import { Search, Bell, ChevronDown, LogOut, ClipboardList, FileText, Receipt, Loader } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import { busquedaGlobalService, type BusquedaGlobalResult } from '../../services/busquedaGlobal.service';
import { notificacionesService, NOTIFICACIONES_PAGE_SIZE, type Notificacion } from '../../services/notificaciones.service';
import logo from '../../assets/luminar-logo-v1.png';

const getInitials = (name: string): string => name.trim().slice(0, 2).toUpperCase();

// Guarda en localStorage (sobrevive recargas) el momento en que el usuario abrió la campana por
// última vez, para que el punto rojo solo cuente notificaciones creadas DESPUÉS de eso — así no
// reaparece cada 60s por las mismas notificaciones que ya vio pero no ha marcado como leídas.
const LAST_SEEN_KEY = 'tspine_notif_last_seen_at';
const countUnseen = (list: Notificacion[]): number => {
  const lastSeenAt = localStorage.getItem(LAST_SEEN_KEY);
  return list.filter(n => !n.leida && (!lastSeenAt || n.createdAt > lastSeenAt)).length;
};

// Color del punto/tinte según el tipo de notificación — rojo si algo se rechazó, verde si se
// aprobó, ámbar para lo pendiente/informativo. Los tipos nuevos que no estén aquí caen en gris.
const NOTIF_TIPO_COLOR: Record<string, string> = {
  SOLICITUD_PROGRAMACION_APROBADA: '#6b8c1f',
  SOLICITUD_PROGRAMACION_RECHAZADA: '#dc2626',
  SOLICITUD_PROGRAMACION_PENDIENTE: '#d97706',
};
const getNotifColor = (tipo: string): string => NOTIF_TIPO_COLOR[tipo] ?? '#6b7280';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const isDashboard = location.pathname === '/dashboard';
  const usuario = JSON.parse(localStorage.getItem('usuario') ?? '{}');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BusquedaGlobalResult | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notificacion[] | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifLoadingMore, setNotifLoadingMore] = useState(false);
  const [notifHasMore, setNotifHasMore] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // El contador (para el punto rojo) se revisa cada 60s sin importar si el desplegable está
  // abierto — cuenta solo lo no leído Y creado después del último "visto" (ver countUnseen).
  useEffect(() => {
    const fetchCount = () => {
      notificacionesService.listar()
        .then(list => setUnreadCount(countUnseen(list)))
        .catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, []);

  const toggleNotif = () => {
    const opening = !notifOpen;
    setNotifOpen(opening);
    if (opening) {
      // El punto rojo desaparece al abrir la campana (ya las "viste") y se queda oculto hasta
      // que llegue algo genuinamente nuevo — cada notificación individual sigue sin marcarse
      // como leída hasta que le des clic, eso solo afecta el resaltado dentro de la lista.
      setUnreadCount(0);
      localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
      setNotifLoading(true);
      notificacionesService.listar()
        .then(list => { setNotifications(list); setNotifHasMore(list.length === NOTIFICACIONES_PAGE_SIZE); })
        .catch(() => { setNotifications([]); setNotifHasMore(false); })
        .finally(() => setNotifLoading(false));
    }
  };

  const handleVerMas = () => {
    if (!notifications) return;
    setNotifLoadingMore(true);
    notificacionesService.listar(notifications.length)
      .then(more => {
        setNotifications(prev => [...(prev ?? []), ...more]);
        setNotifHasMore(more.length === NOTIFICACIONES_PAGE_SIZE);
      })
      .catch(() => setNotifHasMore(false))
      .finally(() => setNotifLoadingMore(false));
  };

  const handleNotifClick = (n: Notificacion) => {
    setNotifOpen(false);
    if (!n.leida) {
      notificacionesService.marcarLeida(n.id).catch(() => {});
      setUnreadCount(c => Math.max(0, c - 1));
    }
    if (n.link) navigate(n.link);
  };

  const handleMarcarTodasLeidas = () => {
    notificacionesService.marcarTodasLeidas().catch(() => {});
    setNotifications(prev => prev?.map(n => ({ ...n, leida: true })) ?? null);
    setUnreadCount(0);
  };

  const formatNotifTime = (dateString: string): string => {
    const diffMs = Date.now() - new Date(dateString).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'ahora';
    if (diffMin < 60) return `hace ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `hace ${diffH} h`;
    const diffD = Math.floor(diffH / 24);
    return `hace ${diffD} d`;
  };

  const handleLogout = () => {
    authService.logout();
    navigate('/login');
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Búsqueda con debounce: espera 300ms sin que el usuario siga escribiendo antes de consultar
  // al backend, para no disparar una petición por cada tecla.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      busquedaGlobalService.buscar(term)
        .then(res => { setResults(res); setSearchOpen(true); })
        .catch(() => setResults({ programaciones: [], remisiones: [], tecnicos: [] }))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const goTo = (path: string) => {
    navigate(path);
    setSearchOpen(false);
    setQuery('');
    setResults(null);
  };

  const hasResults = results && (results.programaciones.length > 0 || results.remisiones.length > 0 || results.cotizaciones.length > 0);
  const showDropdown = searchOpen && query.trim().length >= 2;

  return (
    <header style={styles.header}>
      <div style={styles.left}>
        <img
          src={logo}
          alt="Tecnología Spine"
          style={{ ...styles.logo, transition: 'transform 0.2s ease', cursor: 'pointer' }}
          onClick={() => navigate('/dashboard')}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        />
      </div>

      <div style={styles.center}>
        {!isDashboard && (
          <div ref={searchWrapRef} style={styles.searchWrap}>
            <Search size={16} style={styles.searchIcon} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Buscar programación, remisión o técnico..."
              style={styles.searchInput}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => { if (query.trim().length >= 2) setSearchOpen(true); }}
            />
            {searching ? (
              <Loader size={14} className="spinner" style={{ ...styles.searchKbd, border: 'none', backgroundColor: 'transparent' }} />
            ) : (
              <kbd style={styles.searchKbd}>Ctrl K</kbd>
            )}

            {showDropdown && (
              <div style={styles.searchDropdown}>
                {!searching && !hasResults && (
                  <div style={styles.searchEmpty}>Sin resultados para "{query.trim()}"</div>
                )}

                {results && results.programaciones.length > 0 && (
                  <div style={styles.searchSection}>
                    <span style={styles.searchSectionTitle}>Programaciones</span>
                    {results.programaciones.map(p => (
                      <button
                        key={p.id}
                        style={styles.searchResultItem}
                        onClick={() => goTo(`/operacion/programaciones/${p.id}`)}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f5f5f0'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <ClipboardList size={14} color="#6b8c1f" style={{ flexShrink: 0 }} />
                        <span style={styles.searchResultText}>
                          <strong>{p.numProgram ?? p.id}</strong>{p.hospital ? ` — ${p.hospital}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {results && results.remisiones.length > 0 && (
                  <div style={styles.searchSection}>
                    <span style={styles.searchSectionTitle}>Remisiones</span>
                    {results.remisiones.map(r => (
                      <button
                        key={r.id}
                        style={styles.searchResultItem}
                        onClick={() => goTo(`/operacion/remisiones/${r.id}`)}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f5f5f0'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <FileText size={14} color="#2563eb" style={{ flexShrink: 0 }} />
                        <span style={styles.searchResultText}>
                          <strong>{r.numRemision ?? r.id}</strong>{r.paciente ? ` — ${r.paciente}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {results && results.cotizaciones.length > 0 && (
                  <div style={styles.searchSection}>
                    <span style={styles.searchSectionTitle}>Cotizaciones</span>
                    {results.cotizaciones.map(c => (
                      <button
                        key={c.id}
                        style={styles.searchResultItem}
                        onClick={() => goTo(`/operacion/cotizaciones?id=${c.id}`)}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f5f5f0'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <Receipt size={14} color="#7c3aed" style={{ flexShrink: 0 }} />
                        <span style={styles.searchResultText}>
                          <strong>{c.numCotizacion ?? c.id}</strong>{c.hospital ? ` — ${c.hospital}` : c.medico ? ` — ${c.medico}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={styles.right}>
        <div style={{ position: 'relative' as const }} ref={notifRef}>
          <button
            style={{ ...styles.iconBtn, position: 'relative' as const }}
            title="Notificaciones"
            onClick={toggleNotif}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span style={styles.notifBadge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>

          {notifOpen && (
            <div className="dropdown-anim" style={styles.notifDropdown}>
              <div style={styles.notifDropdownHeader}>
                <span style={styles.notifDropdownTitle}>Notificaciones</span>
                {!!notifications?.some(n => !n.leida) && (
                  <button style={styles.notifMarkAllBtn} onClick={handleMarcarTodasLeidas}>
                    Marcar todas como leídas
                  </button>
                )}
              </div>

              {notifLoading ? (
                <div style={styles.notifEmpty}>Cargando...</div>
              ) : !notifications || notifications.length === 0 ? (
                <div style={styles.notifEmpty}>Sin notificaciones</div>
              ) : (
                notifications.map(n => {
                  const color = getNotifColor(n.tipo);
                  const unreadBg = `${color}0d`;
                  return (
                    <button
                      key={n.id}
                      style={{ ...styles.notifItem, ...(n.leida ? {} : { backgroundColor: unreadBg }) }}
                      onClick={() => handleNotifClick(n)}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f5f5f0'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = n.leida ? 'transparent' : unreadBg; }}
                    >
                      {!n.leida && <span style={{ ...styles.notifDot, backgroundColor: color }} />}
                      <div style={styles.notifItemBody}>
                        <span style={styles.notifItemTitle}>{n.titulo}</span>
                        <span style={styles.notifItemMsg}>{n.mensaje}</span>
                        <span style={styles.notifItemTime}>{formatNotifTime(n.createdAt)}</span>
                      </div>
                    </button>
                  );
                })
              )}
              {!notifLoading && notifHasMore && (
                <button style={styles.notifVerMasBtn} onClick={handleVerMas} disabled={notifLoadingMore}>
                  {notifLoadingMore ? 'Cargando...' : 'Ver más'}
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ position: 'relative' as const }} ref={menuRef}>
          <button style={styles.userBtn} onClick={() => setMenuOpen(o => !o)}>
            <div style={styles.avatar}>{getInitials(usuario.nombreCompleto ?? '')}</div>
            <div style={styles.userTextCol}>
              <span style={styles.userName}>{usuario.nombreCompleto}</span>
              <span style={styles.userRole}>{usuario.perfilNombre}</span>
            </div>
            <ChevronDown size={16} color="#9ca3af" style={{ transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
          </button>

          {menuOpen && (
            <div style={styles.dropdown}>
              <button
                style={styles.dropdownItem}
                onClick={handleLogout}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fef2f2'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <LogOut size={16} /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    height: '60px',
    backgroundColor: '#ffffff',
    borderBottom: '2px solid #e5e7eb',
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    padding: '0 1.5rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.875rem',
    flexShrink: 0,
  },
  logo: { height: '40px' },
  center: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
  },
  searchWrap: {
    position: 'relative',
    width: '100%',
    maxWidth: '440px',
  },
  searchIcon: {
    position: 'absolute',
    left: '0.75rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#9ca3af',
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    padding: '0.5rem 3.25rem 0.5rem 2.25rem',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    backgroundColor: '#f9fafb',
    fontSize: '0.875rem',
    outline: 'none',
    boxSizing: 'border-box' as const,
    color: '#333',
  },
  searchKbd: {
    position: 'absolute',
    right: '0.6rem',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: '0.7rem',
    fontWeight: 600,
    color: '#9ca3af',
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    padding: '0.1rem 0.4rem',
    pointerEvents: 'none' as const,
  },
  searchDropdown: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
    padding: '0.5rem',
    maxHeight: '420px',
    overflowY: 'auto',
    zIndex: 200,
  },
  searchEmpty: {
    padding: '0.75rem',
    fontSize: '0.82rem',
    color: '#9ca3af',
    textAlign: 'center',
  },
  searchSection: {
    marginBottom: '0.35rem',
  },
  searchSectionTitle: {
    display: 'block',
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: '0.4rem 0.6rem 0.2rem',
  },
  searchResultItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    width: '100%',
    padding: '0.5rem 0.6rem',
    border: 'none',
    backgroundColor: 'transparent',
    borderRadius: '8px',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'background-color 0.15s ease',
  },
  searchResultText: {
    fontSize: '0.82rem',
    color: '#374151',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    flexShrink: 0,
  },
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    color: '#6b7280',
  },
  notifBadge: {
    position: 'absolute',
    top: '1px',
    right: '1px',
    boxSizing: 'border-box' as const,
    minWidth: '18px',
    height: '18px',
    padding: '0 4px',
    borderRadius: '999px',
    backgroundColor: '#dc2626',
    color: '#fff',
    fontSize: '11px',
    lineHeight: '11px',
    fontWeight: 700,
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid #fff',
    backfaceVisibility: 'hidden' as const,
    WebkitFontSmoothing: 'antialiased' as const,
    transform: 'translateZ(0)',
  },
  notifDropdown: {
    position: 'absolute' as const,
    top: 'calc(100% + 8px)',
    right: 0,
    width: '360px',
    maxHeight: '440px',
    overflowY: 'auto' as const,
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
    zIndex: 200,
  },
  notifDropdownHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #f3f4f6',
    position: 'sticky' as const,
    top: 0,
    backgroundColor: '#fff',
  },
  notifDropdownTitle: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#16170f',
  },
  notifMarkAllBtn: {
    border: 'none',
    background: 'transparent',
    color: '#6b8c1f',
    fontSize: '0.72rem',
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
  },
  notifVerMasBtn: {
    display: 'block',
    width: '100%',
    padding: '0.65rem',
    border: 'none',
    borderTop: '1px solid #f3f4f6',
    background: 'transparent',
    color: '#6b8c1f',
    fontSize: '0.78rem',
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'center' as const,
  },
  notifEmpty: {
    padding: '2rem 1rem',
    textAlign: 'center' as const,
    color: '#9ca3af',
    fontSize: '0.82rem',
  },
  notifItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    width: '100%',
    padding: '0.75rem 1rem',
    border: 'none',
    borderBottom: '1px solid #f3f4f6',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'background-color 0.15s ease',
  },
  notifDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: '#6b8c1f',
    marginTop: '0.35rem',
    flexShrink: 0,
  },
  notifItemBody: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.15rem',
    minWidth: 0,
  },
  notifItemTitle: {
    fontSize: '0.82rem',
    fontWeight: 700,
    color: '#16170f',
  },
  notifItemMsg: {
    fontSize: '0.78rem',
    color: '#6b7280',
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
  },
  notifItemTime: {
    fontSize: '0.68rem',
    color: '#9ca3af',
    marginTop: '0.1rem',
  },
  userBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '0.25rem',
    borderRadius: '8px',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: '#1f2937',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
    fontWeight: 700,
    flexShrink: 0,
  },
  userTextCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    lineHeight: 1.25,
  },
  userName: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#1f2937',
  },
  userRole: {
    fontSize: '0.72rem',
    fontWeight: 600,
    color: '#6b8c1f',
  },
  dropdown: {
    position: 'absolute' as const,
    top: 'calc(100% + 8px)',
    right: 0,
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    minWidth: '170px',
    overflow: 'hidden',
    zIndex: 200,
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    width: '100%',
    padding: '0.65rem 0.9rem',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '0.85rem',
    color: '#dc2626',
    fontWeight: 600,
    textAlign: 'left' as const,
  },
};
