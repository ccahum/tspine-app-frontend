import { LogOut, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import logo from '../../assets/logo.png';

export default function Header() {
  const navigate = useNavigate();
  const usuario = JSON.parse(localStorage.getItem('usuario') ?? '{}');

  const handleLogout = () => {
    authService.logout();
    navigate('/login');
  };

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
        <span style={styles.title}>TSpine 2.0</span>
      </div>
      <div style={styles.right}>
        <div style={styles.userChip}>
          <User size={16} color="#6b8c1f" />
          <span style={styles.userName}>{usuario.nombreCompleto}</span>
          <span style={styles.perfilBadge}>{usuario.perfilNombre}</span>
        </div>
        <button onClick={handleLogout} style={styles.logoutBtn} title="Cerrar sesión">
          <LogOut size={18} />
        </button>
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
    justifyContent: 'space-between',
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
  },
  logo: { height: '40px' },
  title: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#333333',
    letterSpacing: '-0.3px',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  userChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    backgroundColor: '#f4f5f7',
    padding: '0.35rem 0.75rem',
    borderRadius: '20px',
    border: '1px solid #e5e7eb',
  },
  userName: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#333',
  },
  perfilBadge: {
    fontSize: '0.75rem',
    color: '#6b8c1f',
    fontWeight: 600,
    backgroundColor: '#f0f4e8',
    padding: '0.1rem 0.5rem',
    borderRadius: '10px',
  },
  logoutBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    backgroundColor: 'transparent',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    cursor: 'pointer',
    color: '#666',
  },
};
