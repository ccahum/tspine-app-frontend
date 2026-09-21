import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import SignaturePad from '../SignaturePad';
import { authService } from '../../services/auth.service';

/** Configurar (primera vez, ver Header) o editar (desde el menú de usuario) la firma personal
 * del usuario — una vez guardada, se puede reutilizar con un clic al crear/editar una cotización
 * ("Usar mi firma"). No tiene opción de "eliminar", solo de reemplazarla dibujando una nueva. */
export default function FirmaModal({ modoEdicion, onDone }: { modoEdicion?: boolean; onDone: (guardada: boolean) => void }) {
  const queryClient = useQueryClient();
  // En modo edición se precarga la firma actual en el lienzo, para que el usuario vea qué tiene
  // guardado y decida si la redibuja — en el primer inicio de sesión no hay nada que precargar.
  const { data: firmaActual } = useQuery({
    queryKey: ['mi-firma'],
    queryFn: () => authService.obtenerFirma(),
    enabled: !!modoEdicion,
  });

  const [firma, setFirma] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // SignaturePad solo lee su prop `value` una vez, al montarse (para precargar el lienzo) — no
  // reacciona si cambia después. Por eso el lienzo no se monta hasta que la firma actual ya esté
  // resuelta (o se sepa que no hay nada que precargar), para que la reciba correcta desde el mount.
  const cargando = !!modoEdicion && firmaActual === undefined;
  const valorLienzo = firma ?? (modoEdicion ? firmaActual?.firma ?? null : null);

  const handleGuardar = async () => {
    if (guardando) return;
    if (!firma) {
      setError('No puedes guardar una firma vacía. Dibújala primero.');
      return;
    }
    setError('');
    setGuardando(true);
    try {
      await authService.guardarFirma(firma);
      // El buscador de "Usar mi firma" en Cotizaciones (y esta misma pantalla, si se reabre)
      // cachean esta consulta — sin invalidar seguirían mostrando la firma anterior hasta que
      // React Query la revalidara sola.
      queryClient.invalidateQueries({ queryKey: ['mi-firma'] });
      onDone(true);
    } catch {
      setError('No se pudo guardar la firma, intenta de nuevo');
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay-anim" style={styles.overlay}>
      <div className="firma-setup-content-anim" style={styles.content}>
        <div style={styles.header}>
          <h2 style={styles.title}>{modoEdicion ? 'Editar tu firma' : 'Guarda tu firma'}</h2>
          <button style={styles.closeBtn} onClick={() => onDone(false)} title={modoEdicion ? 'Cancelar' : 'Omitir por ahora'}>
            <X size={18} />
          </button>
        </div>
        <p style={styles.subtitle}>
          {modoEdicion
            ? 'Dibuja una firma nueva para reemplazar la que ya tienes guardada.'
            : 'Dibújala una vez y podrás reutilizarla con un clic al crear o editar una cotización, en vez de tener que dibujarla cada vez. Puedes omitir este paso y configurarla más tarde.'}
        </p>

        {cargando ? (
          <div style={styles.canvasLoading}>Cargando tu firma...</div>
        ) : (
          <SignaturePad value={valorLienzo} onChange={setFirma} error={!!error} />
        )}
        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.actions}>
          <button type="button" className="btn-press" style={styles.skipBtn} onClick={() => onDone(false)}>
            {modoEdicion ? 'Cancelar' : 'Omitir por ahora'}
          </button>
          <button type="button" className="btn-press" style={styles.saveBtn} onClick={handleGuardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar firma'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(22,23,15,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10500, padding: '1rem',
  },
  content: {
    backgroundColor: '#fff', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '460px',
    boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' },
  title: { fontSize: '1.2rem', fontWeight: 800, color: '#16170f', margin: 0 },
  closeBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px',
    border: 'none', background: 'none', borderRadius: '8px', cursor: 'pointer', color: '#8a8a7e', flexShrink: 0,
  },
  subtitle: { fontSize: '0.85rem', color: '#6b6b60', lineHeight: 1.5, margin: '0 0 1rem' },
  canvasLoading: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '140px',
    border: '1.5px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', color: '#9ca3af', fontSize: '0.85rem',
  },
  error: { color: '#dc2626', fontSize: '0.8rem', margin: '0.5rem 0 0' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.25rem' },
  skipBtn: {
    padding: '0.65rem 1rem', border: 'none', background: 'none', color: '#6b7280',
    fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', borderRadius: '10px',
  },
  saveBtn: {
    padding: '0.65rem 1.25rem', border: 'none', backgroundColor: '#6a7c09', color: '#fff',
    fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', borderRadius: '10px',
  },
};
