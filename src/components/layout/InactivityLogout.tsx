import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { authService } from '../../services/auth.service';
import { useResponsiveStyles } from '../../hooks/useResponsiveStyles';

const DEFAULT_INACTIVITY_MINUTES = 10;
const configuredMinutes = Number(import.meta.env.LUMINAR_INACTIVITY_MINUTES);
const INACTIVITY_MINUTES = configuredMinutes > 0 ? configuredMinutes : DEFAULT_INACTIVITY_MINUTES;
const INACTIVITY_LIMIT_MS = INACTIVITY_MINUTES * 60 * 1000;
const WARNING_SECONDS = 15;
const LOGOUT_REDIRECT_DELAY_MS = 500;

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;

/**
 * Cierra la sesión sola tras N minutos sin actividad (mouse/teclado/touch/scroll, configurable con
 * LUMINAR_INACTIVITY_MINUTES), avisando con una cuenta regresiva los últimos 15 segundos —
 * cualquier actividad durante esos 15s cancela el cierre y reinicia el conteo completo. Vive
 * dentro de Layout.tsx, que solo se monta para rutas autenticadas, así que corre durante toda la
 * sesión sin depender de en qué página esté.
 */
export default function InactivityLogout() {
  const { isMobile } = useResponsiveStyles();
  const navigate = useNavigate();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastResetRef = useRef(0);

  useEffect(() => {
    const doLogout = () => {
      authService.logout();
      // Mismo desvanecido que el cierre de sesión manual (ver Header.confirmarCerrarSesion), para
      // que no se sienta como un corte brusco.
      document.getElementById('root')?.classList.add('app-fade-out');
      setTimeout(() => {
        document.getElementById('root')?.classList.remove('app-fade-out');
        navigate('/login');
      }, LOGOUT_REDIRECT_DELAY_MS);
    };

    const startWarning = () => {
      setSecondsLeft(WARNING_SECONDS);
      countdownIntervalRef.current = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev === null) return null;
          if (prev <= 1) {
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            doLogout();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    };

    const resetTimers = () => {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      setSecondsLeft(null);
      warningTimerRef.current = setTimeout(startWarning, INACTIVITY_LIMIT_MS - WARNING_SECONDS * 1000);
    };

    resetTimers();

    // Throttle: no hace falta reiniciar el temporizador en cada pixel de movimiento del mouse,
    // basta con una vez por segundo.
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastResetRef.current < 1000) return;
      lastResetRef.current = now;
      resetTimers();
    };

    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, handleActivity, { passive: true }));

    return () => {
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, handleActivity));
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [navigate]);

  if (secondsLeft === null) return null;

  return (
    <div
      className="dropdown-anim"
      style={{
        ...styles.overlay,
        // En móvil, left:50% + translateX(-50%) con un ancho fijo dejaba la tarjeta angosta y el
        // texto se veía apachurrado en 3 líneas — en vez de centrarla con ancho fijo, ocupa el
        // ancho disponible entre márgenes, igual que otros paneles flotantes en móvil.
        ...(isMobile ? { left: '0.75rem', right: '0.75rem', transform: 'none' } : {}),
      }}
    >
      <Clock size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
      <span style={styles.text}>
        Tu sesión se cerrará por inactividad en <strong style={styles.strong}>{secondsLeft}s</strong>
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: '76px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 10100,
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '0.85rem 1.25rem',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '14px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)',
  },
  text: {
    fontSize: '0.9rem',
    fontWeight: 400,
    color: '#dc2626',
  },
  strong: {
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
};
