import { AlertCircle, CheckCircle2, DollarSign, Lock } from 'lucide-react';
import { useResponsiveStyles } from '../../../hooks/useResponsiveStyles';
import type { ProgramacionStats } from '../../../services/programaciones.service';

interface Props {
  stats: ProgramacionStats | undefined;
  isLoading: boolean;
}

const fmt = (n: number) => n.toLocaleString('es-MX');
const fmtMoney = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

function StatCard({ icon, label, value, color, sub }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  sub?: string;
}) {
  return (
    <div
      style={{ ...card, borderTop: `3px solid ${color}` }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = card.boxShadow;
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ color, opacity: 0.8 }}>{icon}</span>
      </div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1a1a1a', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: '#999', marginTop: '0.3rem' }}>{sub}</div>}
    </div>
  );
}

export default function ProgramacionesStats({ stats, isLoading }: Props) {
  const { isMobile } = useResponsiveStyles();

  if (isLoading || !stats) {
    return (
      <div style={{ ...grid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(5, 1fr)' }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ ...card, backgroundColor: '#f9fafb' }} />
        ))}
      </div>
    );
  }

  const alertasPct = stats.total > 0
    ? Math.round(((stats.sinRemision + stats.consumoNoValidado + stats.sinComision) / stats.total) * 100)
    : 0;

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ ...grid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)' }}>
        <StatCard
          icon={<AlertCircle size={18} />}
          label="Sin remisión"
          value={fmt(stats.sinRemision)}
          color="#dc2626"
          sub={stats.total > 0 ? `${Math.round((stats.sinRemision / stats.total) * 100)}% del total` : ''}
        />
        <StatCard
          icon={<CheckCircle2 size={18} />}
          label="Sin validar consumo"
          value={fmt(stats.consumoNoValidado)}
          color="#7c3aed"
          sub={stats.total > 0 ? `${Math.round((stats.consumoNoValidado / stats.total) * 100)}% del total` : ''}
        />
        <StatCard
          icon={<DollarSign size={18} />}
          label="Sin comisión"
          value={fmt(stats.sinComision)}
          color="#2563eb"
          sub={stats.total > 0 ? `${Math.round((stats.sinComision / stats.total) * 100)}% del total` : ''}
        />
        <StatCard
          icon={<Lock size={18} />}
          label="Cerradas"
          value={fmt(stats.cerradas)}
          color="#6b7280"
          sub={stats.total > 0 ? `${Math.round((stats.cerradas / stats.total) * 100)}% del total` : ''}
        />
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '10px',
  padding: '1rem 1.25rem',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  transition: 'all 0.2s ease',
  cursor: 'default',
  backfaceVisibility: 'hidden',
  WebkitFontSmoothing: 'antialiased',
};
const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, 1fr)',
  gap: '0.75rem',
  marginBottom: '0.75rem',
};
