import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import InactivityLogout from './InactivityLogout';
import { useResponsiveStyles } from '../../hooks/useResponsiveStyles';
import { NavigationLoadingContext } from '../../hooks/useNavigateWithLoading';

// Antes cada página se envolvía en <Layout>{contenido}</Layout> por su cuenta, lo que significaba
// que Header/Sidebar vivían DENTRO de cada chunk cargado con React.lazy() — al navegar a una
// página que aún no había descargado, React desmontaba todo (incluido el Sidebar) y mostraba un
// spinner solo en pantalla en blanco hasta que el chunk nuevo cargaba. Ahora Layout es la ruta
// padre (ver App.tsx): Header/Sidebar quedan fijos y solo el <Outlet/> (el contenido) muestra el
// loader mientras carga, sin que el resto de la app parpadee.
function ContentLoader() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', minHeight: 'calc(100vh - 60px)' }}>
      <div style={{ display: 'flex', gap: '0.45rem' }}>
        <span className="content-loader-dot" style={{ animationDelay: '0s' }} />
        <span className="content-loader-dot" style={{ animationDelay: '0.15s' }} />
        <span className="content-loader-dot" style={{ animationDelay: '0.3s' }} />
      </div>
      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#6b6b60', letterSpacing: '0.02em' }}>Cargando...</span>
    </div>
  );
}

export default function Layout() {
  const { isMobile } = useResponsiveStyles();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // No basta con confiar en que el fallback de <Suspense> aparezca a tiempo (su momento exacto
  // depende de detalles de React que no controlamos) — este flag se prende en el mismo clic de
  // cualquier link/tarjeta que use useNavigateWithLoading (Sidebar, tarjetas de módulo en
  // Dashboard/OperacionPage/etc.), ligado a la promesa real del import() del módulo, y se apaga
  // cuando esa promesa resuelve.
  const [isNavigating, setIsNavigating] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (!mobileNavOpen) return;
    // overflow:hidden solo en el body no basta en iOS Safari — el fondo se sigue pudiendo
    // deslizar con el dedo mientras el drawer del menú está abierto. Fijar la posición del body
    // en el scroll actual sí lo bloquea ahí (mismo patrón que los modales de detalle).
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [mobileNavOpen]);

  return (
    <NavigationLoadingContext.Provider value={{ start: () => setIsNavigating(true), end: () => setIsNavigating(false) }}>
      <div style={styles.root}>
        <InactivityLogout />
        <Header onMenuClick={() => setMobileNavOpen(true)} />
        <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
        <main style={{ ...styles.main, marginLeft: isMobile ? 0 : '60px', position: 'relative' }}>
          {isNavigating && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 5, backgroundColor: '#f4f5f7' }}>
              <ContentLoader />
            </div>
          )}
          <Suspense fallback={<ContentLoader />}>
            {/* key={pathname}: remonta el contenido en cada navegación para que se repita la
                animación de entrada (antes se lograba porque Layout entero remontaba). */}
            <div key={location.pathname} className="page-fade-in">
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>
    </NavigationLoadingContext.Provider>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    backgroundColor: '#f4f5f7',
    position: 'relative',
  },
  main: {
    marginTop: '60px',
    marginLeft: '60px',
    padding: '1rem 0',
    minHeight: 'calc(100vh - 60px)',
  },
};
