import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Calendar, ClipboardCheck, ShieldCheck,
  CalendarDays, Tag, DollarSign,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { useResponsiveStyles } from '../../hooks/useResponsiveStyles';

const submodules = [
  { icon: FileText, label: 'Cotizaciones', path: '/operacion/cotizaciones', color: '#6b8c1f' },
  { icon: Calendar, label: 'Programación', path: '/operacion/programaciones', color: '#4a7c59' },
  { icon: ClipboardCheck, label: 'Remisión', path: '/operacion/remision', color: '#5c7a3e' },
  { icon: ShieldCheck, label: 'Autorización de Consumos', path: '/operacion/autorizacion-consumos', color: '#3d6b52' },
  { icon: CalendarDays, label: 'Calendario Programación', path: '/operacion/calendario', color: '#6b8c1f' },
  { icon: Tag, label: 'Listas de Precio', path: '/operacion/listas-precio', color: '#4a7c59' },
  { icon: DollarSign, label: 'Precios Especiales', path: '/operacion/precios-especiales', color: '#5c7a3e' },
];

function SubmoduleCard({ icon: Icon, label, path, color }: typeof submodules[0]) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => navigate(path)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.card,
        boxShadow: hovered ? '0 8px 24px rgba(107,140,31,0.2)' : '0 2px 8px rgba(0,0,0,0.07)',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        borderTop: `3px solid ${hovered ? color : 'transparent'}`,
      }}
    >
      <div style={{ ...styles.iconWrap, backgroundColor: `${color}18` }}>
        <Icon size={32} color={color} />
      </div>
      <span style={styles.cardLabel}>{label}</span>
    </div>
  );
}

export default function OperacionPage() {
  const navigate = useNavigate();
  const { isMobile } = useResponsiveStyles();

  return (
    <Layout>
      <div style={{ ...styles.container, paddingLeft: isMobile ? '1rem' : '2rem', paddingRight: isMobile ? '1rem' : '2rem' }}>
        <div style={{ ...styles.grid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))' }}>
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
  breadcrumb: {
    marginBottom: '1.5rem',
    fontSize: '0.9rem',
  },
  breadcrumbLink: {
    color: '#6b8c1f',
    cursor: 'pointer',
    fontWeight: 500,
  },
  separator: { color: '#999', margin: '0 0.25rem' },
  breadcrumbCurrent: { color: '#333', fontWeight: 600 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '1.25rem',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '1.75rem 1.5rem',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '1rem',
    transition: 'all 0.2s ease',
    borderTop: '3px solid transparent',
  },
  iconWrap: {
    width: '56px',
    height: '56px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#333',
  },
};
