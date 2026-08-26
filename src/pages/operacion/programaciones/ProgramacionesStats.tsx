import { useState } from 'react';
import { AlertCircle, CircleX, DollarSign, Lock } from 'lucide-react';
import { useResponsiveStyles } from '../../../hooks/useResponsiveStyles';
import type { ProgramacionStats } from '../../../services/programaciones.service';

interface Props {
  stats: ProgramacionStats | undefined;
  isLoading: boolean;
  activeFilters: string[];
  onToggleFilter: (key: string) => void;
}

const fmt = (n: number) => n.toLocaleString('es-MX');

function StatCard({ icon, label, value, color, sub, active, onClick }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  sub?: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...card,
        cursor: 'pointer',
        borderColor: active || hovered ? color : '#eeeee6',
        backgroundColor: active ? `${color}0d` : '#fff',
        boxShadow: active || hovered ? '0 8px 20px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
        transform: active || hovered ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      <div style={row}>
        <div style={{ ...iconWrap, backgroundColor: `${color}1a` }}>
          <span style={{ color, display: 'flex' }}>{icon}</span>
        </div>
        <div style={textCol}>
          <span style={cardLabel}>{label}</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#16170f', lineHeight: 1 }}>{value}</div>
          {sub && <span style={cardDescription}>{sub}</span>}
        </div>
      </div>
    </div>
  );
}

export default function ProgramacionesStats({ stats, isLoading, activeFilters, onToggleFilter }: Props) {
  const { isMobile } = useResponsiveStyles();

  if (isLoading || !stats) {
    return (
      <div style={{ ...grid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)' }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ ...card, backgroundColor: '#f9fafb' }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ ...grid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)' }}>
        <StatCard
          icon={<AlertCircle size={26} />}
          label="Sin remisión"
          value={fmt(stats.sinRemision)}
          color="#dc2626"
          sub={stats.total > 0 ? `${Math.round((stats.sinRemision / stats.total) * 100)}% del total` : ''}
          active={activeFilters.includes('sinRemision')}
          onClick={() => onToggleFilter('sinRemision')}
        />
        <StatCard
          icon={<CircleX size={26} />}
          label="Sin validar consumo"
          value={fmt(stats.consumoNoValidado)}
          color="#7c3aed"
          sub={stats.total > 0 ? `${Math.round((stats.consumoNoValidado / stats.total) * 100)}% del total` : ''}
          active={activeFilters.includes('consumoNoValidado')}
          onClick={() => onToggleFilter('consumoNoValidado')}
        />
        <StatCard
          icon={
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26 }}>
              <DollarSign size={26} />
              <span style={{ position: 'absolute', top: '50%', left: '50%', width: '33px', height: '2.5px', backgroundColor: 'currentColor', transform: 'translate(-50%, -50%) rotate(-45deg)', borderRadius: '1px' }} />
            </span>
          }
          label="Sin comisión"
          value={fmt(stats.sinComision)}
          color="#2563eb"
          sub={stats.total > 0 ? `${Math.round((stats.sinComision / stats.total) * 100)}% del total` : ''}
          active={activeFilters.includes('sinComision')}
          onClick={() => onToggleFilter('sinComision')}
        />
        <StatCard
          icon={<Lock size={26} />}
          label="Cerradas"
          value={fmt(stats.cerradas)}
          color="#6b7280"
          sub={stats.total > 0 ? `${Math.round((stats.cerradas / stats.total) * 100)}% del total` : ''}
          active={activeFilters.includes('cerrada')}
          onClick={() => onToggleFilter('cerrada')}
        />
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  backgroundColor: '#fff',
  border: '1px solid #eeeee6',
  borderRadius: '16px',
  padding: '1.25rem',
  transition: 'all 0.2s ease',
  cursor: 'default',
  backfaceVisibility: 'hidden',
  WebkitFontSmoothing: 'antialiased',
};
const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
};
const textCol: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.2rem',
};
const iconWrap: React.CSSProperties = {
  width: '64px',
  height: '64px',
  borderRadius: '16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};
const cardLabel: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#374151',
};
const cardDescription: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 400,
  color: '#9ca3af',
};
const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '1rem',
  marginBottom: '1rem',
};
