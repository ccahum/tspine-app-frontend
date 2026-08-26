import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { authService } from '../../services/auth.service';
import { useResponsiveStyles } from '../../hooks/useResponsiveStyles';
import logo from '../../assets/luminar-logo-v1.png';
import portada from '../../assets/luminar_wallpaper3.jpg';

type Step = 'CREDENCIALES' | 'CONFIGURAR_2FA' | 'VERIFICAR_2FA' | 'EXITO';

// Cuánto se muestra la pantalla de "verificado" antes de entrar al dashboard — solo el tiempo
// justo para que no se sienta como un salto brusco, sin hacer esperar de más al usuario.
const REDIRECT_DELAY_MS = 900;

// "Recordarme" solo recuerda el usuario (no la contraseña ni el 2FA, que siempre se piden) para
// prellenar el campo la próxima vez.
const REMEMBER_USUARIO_KEY = 'tspine_remembered_usuario';

// Un cuadro por dígito, con auto-focus al primero y avance/retroceso automático entre casillas
// para que el usuario no tenga que hacer click — solo escribir.
function CodigoDigitsInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const updateDigit = (index: number, raw: string) => {
    const char = raw.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = char;
    onChange(next.join(''));
    if (char && index < 5) inputsRef.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    onChange(pasted);
    inputsRef.current[Math.min(pasted.length, 5)]?.focus();
  };

  return (
    <div style={styles.codeInputsRow}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { inputsRef.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={e => updateDigit(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          style={styles.codeDigitBox}
        />
      ))}
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { isMobile } = useResponsiveStyles();
  const [step, setStep] = useState<Step>('CREDENCIALES');
  const [usuario, setUsuario] = useState(() => localStorage.getItem(REMEMBER_USUARIO_KEY) ?? '');
  const [password, setPassword] = useState('');
  const [recordarme, setRecordarme] = useState(() => !!localStorage.getItem(REMEMBER_USUARIO_KEY));
  const [pendingToken, setPendingToken] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const finalizarSesion = (res: { accessToken: string; usuario: unknown }) => {
    localStorage.setItem('accessToken', res.accessToken);
    localStorage.setItem('usuario', JSON.stringify(res.usuario));
    setStep('EXITO');
    setTimeout(() => navigate('/dashboard'), REDIRECT_DELAY_MS);
  };

  const handleCredenciales = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await authService.login({ usuario, password });

      if (recordarme) {
        localStorage.setItem(REMEMBER_USUARIO_KEY, usuario);
      } else {
        localStorage.removeItem(REMEMBER_USUARIO_KEY);
      }

      setPendingToken(res.pendingToken);

      if (res.estado === 'REQUIERE_CONFIGURAR_2FA') {
        const setup = await authService.setupTotp(res.pendingToken);
        setQrDataUrl(setup.qrDataUrl);
        setSecret(setup.secret);
        setStep('CONFIGURAR_2FA');
      } else {
        setStep('VERIFICAR_2FA');
      }
    } catch {
      setError('Usuario o contraseña incorrectos');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmarSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await authService.confirmarSetupTotp(pendingToken, codigo);
      finalizarSesion(res);
    } catch {
      setError('Código inválido, verifica e intenta de nuevo');
    } finally {
      setLoading(false);
    }
  };

  const handleVerificarCodigo = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await authService.verificarCodigo(pendingToken, codigo);
      finalizarSesion(res);
    } catch {
      setError('Código inválido, verifica e intenta de nuevo');
    } finally {
      setLoading(false);
    }
  };

  const volverACredenciales = () => {
    setStep('CREDENCIALES');
    setPassword('');
    setCodigo('');
    setError('');
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {!isMobile && (
          <div style={styles.imagePanel}>
            <div style={styles.imageTextWrap}>
              <div style={styles.imageTextBlock}>
                <h2 style={styles.imageHeadline}>Control total de tu operación quirúrgica.</h2>
                <p style={styles.imageSubtext}>
                  Programaciones, remisiones, inventario y finanzas en un solo lugar.
                </p>
              </div>
            </div>
            <p style={styles.imageFooter}>© {new Date().getFullYear()} LUMINAR - TECNOLOGÍA SPINE</p>
          </div>
        )}

        <div style={styles.formPanel}>
          <img src={logo} alt="Luminar Tecnología Spine" style={styles.formLogo} />

          {step === 'CREDENCIALES' && (
            <form onSubmit={handleCredenciales} style={styles.form}>
              <h1 style={styles.title}>Bienvenido de vuelta</h1>
              <p style={styles.subtitle}>Ingresa a tu cuenta de Luminar</p>

              <div style={styles.field}>
                <label style={styles.label}>Usuario</label>
                <input
                  type="text"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  style={styles.input}
                  placeholder="usuario"
                  autoFocus
                  required
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={styles.input}
                  placeholder="••••••••"
                  required
                />
              </div>

              <div style={styles.optionsRow}>
                <label style={styles.checkboxLabel}>
                  <input type="checkbox" checked={recordarme} onChange={e => setRecordarme(e.target.checked)} />
                  Recordarme
                </label>
                <span style={styles.forgotLink}>¿Olvidaste tu contraseña?</span>
              </div>

              {error && <p style={styles.error}>{error}</p>}

              <button type="submit" className="btn-press" style={styles.button} disabled={loading}>
                {loading ? 'Ingresando...' : 'Ingresar'}
              </button>
            </form>
          )}

          {step === 'CONFIGURAR_2FA' && (
            <form onSubmit={handleConfirmarSetup} style={{ ...styles.form, textAlign: 'center' as const }}>
              <h1 style={styles.title}>Configura la verificación en dos pasos</h1>
              <p style={styles.subtitle}>
                Escanea este código con Google Authenticator, Authy o una app similar. Es obligatorio
                para poder ingresar.
              </p>

              {qrDataUrl && <img src={qrDataUrl} alt="Código QR de verificación" style={styles.qr} />}

              <p style={styles.secretHint}>
                ¿No puedes escanear? Ingresa este código manualmente:
                <br />
                <span style={styles.secretCode}>{secret}</span>
              </p>

              <div style={styles.field}>
                <label style={styles.label}>Código de 6 dígitos</label>
                <CodigoDigitsInput value={codigo} onChange={setCodigo} />
              </div>

              {error && <p style={styles.error}>{error}</p>}

              <button type="submit" className="btn-press" style={styles.button} disabled={loading || codigo.length !== 6}>
                {loading ? 'Verificando...' : 'Activar y continuar'}
              </button>
              <button type="button" className="login-link-btn" style={styles.linkButton} onClick={volverACredenciales}>
                Volver
              </button>
            </form>
          )}

          {step === 'VERIFICAR_2FA' && (
            <form onSubmit={handleVerificarCodigo} style={{ ...styles.form, textAlign: 'center' as const }}>
              <h1 style={styles.title}>Verificación en dos pasos</h1>
              <p style={styles.subtitle}>Ingresa el código de 6 dígitos de tu app de autenticación.</p>

              <div style={styles.field}>
                <label style={styles.label}>Código de 6 dígitos</label>
                <CodigoDigitsInput value={codigo} onChange={setCodigo} />
              </div>

              {error && <p style={styles.error}>{error}</p>}

              <button type="submit" className="btn-press" style={styles.button} disabled={loading || codigo.length !== 6}>
                {loading ? 'Verificando...' : 'Ingresar'}
              </button>
              <button type="button" className="login-link-btn" style={styles.linkButton} onClick={volverACredenciales}>
                Volver
              </button>
            </form>
          )}

          {step === 'EXITO' && (
            <div className="page-fade-in" style={{ ...styles.form, textAlign: 'center' as const, alignItems: 'center' }}>
              <div className="login-success-check" style={styles.successIconWrap}>
                <CheckCircle2 size={40} color="#3f6510" strokeWidth={2.5} />
              </div>
              <h1 style={styles.title}>¡Listo!</h1>
              <p style={styles.subtitle}>Iniciando sesión...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100vh',
    backgroundColor: '#eeeee7',
  },
  card: {
    backgroundColor: '#fff',
    width: '100%',
    height: '100vh',
    display: 'flex',
    overflow: 'hidden' as const,
  },
  imagePanel: {
    flex: '1 1 58%',
    position: 'relative' as const,
    backgroundImage: `linear-gradient(180deg, rgba(10,20,15,0.22) 0%, rgba(10,20,15,0.3) 45%, rgba(6,14,10,0.88) 100%), url(${portada})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'space-between',
    padding: '2.25rem',
  },
  imageLogo: {
    width: '150px',
    filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))',
  },
  imageTextWrap: {
    flex: '1 1 auto',
    display: 'flex',
    alignItems: 'center',
  },
  imageTextBlock: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.6rem',
  },
  imageHeadline: {
    fontSize: '1.6rem',
    fontWeight: 800,
    color: '#fff',
    margin: 0,
    lineHeight: 1.25,
  },
  imageSubtext: {
    fontSize: '0.9rem',
    color: 'rgba(255,255,255,0.82)',
    margin: 0,
    lineHeight: 1.5,
    maxWidth: '360px',
  },
  imageFooter: {
    fontSize: '0.62rem',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: '0.08em',
    margin: 0,
  },
  formPanel: {
    flex: '1 1 45%',
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    alignItems: 'center',
    padding: '3rem 3.5rem',
    overflowY: 'auto' as const,
    boxSizing: 'border-box' as const,
  },
  formLogo: {
    width: '130px',
    marginBottom: '2rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.1rem',
    width: '100%',
    maxWidth: '380px',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 800,
    color: '#16170f',
    margin: 0,
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#8a8a7e',
    margin: '-0.6rem 0 0.4rem',
    lineHeight: 1.5,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
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
  optionsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '-0.2rem',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.85rem',
    color: '#4b4b40',
    fontWeight: 600,
    cursor: 'pointer',
  },
  forgotLink: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#4d7a13',
    cursor: 'default',
  },
  error: {
    color: '#dc2626',
    fontSize: '0.85rem',
    margin: 0,
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
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#6b7280',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    padding: '0.25rem',
  },
  qr: {
    width: '180px',
    height: '180px',
    alignSelf: 'center',
    border: '1px solid #eeeee6',
    borderRadius: '8px',
    padding: '0.5rem',
  },
  successIconWrap: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    backgroundColor: '#e9f2d8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 0.5rem',
  },
  secretHint: {
    fontSize: '0.8rem',
    color: '#9ca3af',
    margin: 0,
  },
  secretCode: {
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#374151',
    letterSpacing: '0.05em',
  },
  codeInputsRow: {
    display: 'flex',
    gap: '0.6rem',
    justifyContent: 'center',
  },
  codeDigitBox: {
    width: '3rem',
    height: '3.4rem',
    textAlign: 'center' as const,
    fontSize: '1.4rem',
    fontWeight: 700,
    border: 'none',
    backgroundColor: '#f5f5f0',
    borderRadius: '10px',
    outline: 'none',
    color: '#333',
    boxSizing: 'border-box' as const,
  },
};
