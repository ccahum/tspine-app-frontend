import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCog, Users, Contact } from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { MaterialIcon } from '../../components/icons/MaterialIcon';
import { useResponsiveStyles } from '../../hooks/useResponsiveStyles';

const ACCENT = '#4a7c59';

const submodules = [
  { icon: Users, label: 'Usuarios', description: 'Crea usuarios y asigna su perfil de acceso', path: '/administracion/usuarios' },
  { icon: Contact, label: 'Terceros', description: 'Consulta y agrega terceros del sistema', path: '/administracion/terceros' },
];

function SubmoduleCard({ icon: Icon, label, description, path }: typeof submodules[0]) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => navigate(path)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.card,
        borderColor: hovered ? ACCENT : '#eeeee6',
        boxShadow: hovered ? '0 8px 20px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      <Icon size={20} color={ACCENT} style={{ marginBottom: '0.5rem' }} />
      <span style={styles.cardLabel}>{label}</span>
      <span style={styles.cardDescription}>{description}</span>
    </div>
  );
}

export default function AdministracionPage() {
  const navigate = useNavigate();
  const { isMobile } = useResponsiveStyles();

  return (
    <Layout>
      <div style={{ ...styles.container, paddingLeft: isMobile ? '1rem' : '2rem', paddingRight: isMobile ? '1rem' : '2rem' }}>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          style={styles.backLink}
          onMouseEnter={e => { e.currentTarget.style.color = '#4d7a13'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6b7280'; }}
        >
          <MaterialIcon name="arrow_back" size={16} />
          Volver
        </button>

        <div style={styles.header}>
          <div style={styles.headerIconWrap}>
            <UserCog size={30} color={ACCENT} />
          </div>
          <div>
            <h1 style={styles.headerTitle}>Administración</h1>
            <p style={styles.headerSub}>{submodules.length} submódulos disponibles</p>
          </div>
        </div>

        <div style={{ ...styles.grid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {submodules.map((mod) => (
            <SubmoduleCard key={mod.path} {...mod} />
          ))}
        </div>
      </div>
    </Layout>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    paddingLeft: '2rem',
    paddingRight: '2rem',
  },
  backLink: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.75rem', padding: '0.25rem 0.1rem', border: 'none', background: 'transparent', color: '#6b7280', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const, transition: 'color 0.15s ease' },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.1rem',
    marginBottom: '1.75rem',
  },
  headerIconWrap: {
    width: '64px',
    height: '64px',
    borderRadius: '16px',
    backgroundColor: '#e9f2d8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '1.8rem',
    fontWeight: 700,
    color: '#16170f',
    margin: 0,
  },
  headerSub: {
    fontSize: '0.95rem',
    color: '#6b7280',
    margin: '0.3rem 0 0',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '1.25rem',
  },
  card: {
    backgroundColor: '#fff',
    border: '1px solid #eeeee6',
    borderRadius: '16px',
    padding: '1.5rem',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    transition: 'all 0.2s ease',
  },
  cardLabel: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#16170f',
  },
  cardDescription: {
    fontSize: '0.82rem',
    fontWeight: 400,
    color: '#6b7280',
    marginTop: '0.3rem',
  },
};
