import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, Check, X as XIcon } from 'lucide-react';
import { authService } from '../../services/auth.service';
import { validarPassword, evaluarPassword } from '../../lib/password.utils';
import logo from '../../assets/luminar-logo-v1.png';

type Step = 'FORM' | 'EXITO';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [step, setStep] = useState<Step>('FORM');
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [verNuevaPassword, setVerNuevaPassword] = useState(false);
  const [verConfirmarPassword, setVerConfirmarPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const errorPassword = validarPassword(nuevaPassword);
    if (errorPassword) {
      setError(errorPassword);
      return;
    }
    if (nuevaPassword !== confirmarPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      await authService.resetPassword(token, nuevaPassword);
      setStep('EXITO');
    } catch (err) {
      const mensaje = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(mensaje ?? 'El link de recuperación no es válido o ya expiró');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src={logo} alt="Luminar Tecnología Spine" style={styles.logo} />

        {!token ? (
          <div style={styles.form}>
            <h1 style={styles.title}>Link inválido</h1>
            <p style={styles.subtitle}>Este link de recuperación no es válido. Solicita uno nuevo desde la pantalla de inicio de sesión.</p>
            <button type="button" className="btn-press" style={styles.button} onClick={() => navigate('/login')}>
              Ir a iniciar sesión
            </button>
          </div>
        ) : step === 'EXITO' ? (
          <div className="page-fade-in" style={styles.form}>
            <div style={styles.successIconWrap}>
              <CheckCircle2 size={40} color="#3f6510" />
            </div>
            <h1 style={styles.title}>Contraseña actualizada</h1>
            <p style={styles.subtitle}>Ya puedes iniciar sesión con tu nueva contraseña.</p>
            <button type="button" className="btn-press" style={styles.button} onClick={() => navigate('/login')}>
              Ir a iniciar sesión
            </button>
          </div>
        ) : (
          <form className="page-fade-in" onSubmit={handleSubmit} style={styles.form}>
            <h1 style={styles.title}>Crea tu nueva contraseña</h1>
            <p style={styles.subtitle}>Elige una contraseña que no hayas usado antes.</p>

            <div style={styles.field}>
              <label style={styles.label}>Nueva contraseña</label>
              <div style={styles.passwordWrap}>
                <input
                  type={verNuevaPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={nuevaPassword}
                  onChange={(e) => setNuevaPassword(e.target.value)}
                  style={{ ...styles.input, ...styles.passwordInput }}
                  placeholder="••••••••"
                  autoFocus
                  required
                />
                <button
                  type="button"
                  style={styles.eyeButton}
                  onClick={() => setVerNuevaPassword(v => !v)}
                  tabIndex={-1}
                >
                  {verNuevaPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <ul style={styles.requisitosList}>
                {evaluarPassword(nuevaPassword).map(r => (
                  <li key={r.label} style={{ ...styles.requisitoItem, color: r.cumple ? '#3f6510' : '#8a8a7e' }}>
                    {r.cumple ? <Check size={14} /> : <XIcon size={14} />}
                    {r.label}
                  </li>
                ))}
              </ul>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Confirmar contraseña</label>
              <div style={styles.passwordWrap}>
                <input
                  type={verConfirmarPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmarPassword}
                  onChange={(e) => setConfirmarPassword(e.target.value)}
                  style={{ ...styles.input, ...styles.passwordInput }}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  style={styles.eyeButton}
                  onClick={() => setVerConfirmarPassword(v => !v)}
                  tabIndex={-1}
                >
                  {verConfirmarPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && <p style={styles.error}>{error}</p>}

            <button type="submit" className="btn-press" style={styles.button} disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#eeeee7',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem',
  },
  card: {
    backgroundColor: '#fff',
    width: '100%',
    maxWidth: '420px',
    borderRadius: '16px',
    padding: '2.5rem 2.25rem',
    display: 'flex',
    flexDirection: 'column' as const,
    boxShadow: '0 12px 40px rgba(0,0,0,0.08)',
  },
  logo: {
    width: '150px',
    alignSelf: 'center',
    marginBottom: '1.5rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1.1rem',
  },
  title: {
    fontSize: '1.4rem',
    fontWeight: 800,
    color: '#16170f',
    margin: 0,
    textAlign: 'center' as const,
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#8a8a7e',
    margin: '-0.6rem 0 0.4rem',
    lineHeight: 1.5,
    textAlign: 'center' as const,
  },
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 700,
    color: '#33342a',
  },
  input: {
    padding: '0.75rem 0.9rem',
    border: 'none',
    backgroundColor: '#f5f5f0',
    borderRadius: '10px',
    fontSize: '0.9rem',
    outline: 'none',
    color: '#333',
    boxSizing: 'border-box' as const,
  },
  passwordWrap: {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
  },
  passwordInput: {
    width: '100%',
    paddingRight: '2.6rem',
  },
  eyeButton: {
    position: 'absolute' as const,
    right: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    padding: 0,
    color: '#8a8a7e',
    cursor: 'pointer',
  },
  requisitosList: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.25rem 0.75rem',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  requisitoItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    fontSize: '0.78rem',
    fontWeight: 600,
    transition: 'color 0.15s ease',
  },
  error: {
    color: '#dc2626',
    fontSize: '0.85rem',
    margin: 0,
    textAlign: 'center' as const,
  },
  button: {
    padding: '0.85rem',
    backgroundColor: '#3f6510',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '1rem',
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
  successIconWrap: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    backgroundColor: '#e9f2d8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: '0.25rem',
  },
};
