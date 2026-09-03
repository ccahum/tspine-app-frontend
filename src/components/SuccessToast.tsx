import { useEffect, useState, type ReactNode } from 'react';

interface SuccessToastProps {
  show: boolean;
  message: string;
  onClose: () => void;
  duration?: number;
  color?: string;
  textColor?: string;
  /** Ícono a mostrar en vez del check animado por default (ej. para un toast de bienvenida). */
  icon?: ReactNode;
}

const EXIT_MS = 280;

export default function SuccessToast({
  show,
  message,
  onClose,
  duration = 2000,
  color = '#6b8c1f',
  textColor = '#1f2937',
  icon,
}: SuccessToastProps) {
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!show) return;
    setMounted(true);
    setClosing(false);

    const closeTimer = setTimeout(() => setClosing(true), duration);
    return () => clearTimeout(closeTimer);
  }, [show, duration]);

  useEffect(() => {
    if (!closing) return;
    const unmountTimer = setTimeout(() => {
      setMounted(false);
      onClose();
    }, EXIT_MS);
    return () => clearTimeout(unmountTimer);
  }, [closing, onClose]);

  if (!mounted) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '76px',
        left: '50%',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        gap: '0.85rem',
        padding: '0.9rem 1.25rem',
        backgroundColor: '#fff',
        borderRadius: '14px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        minWidth: '280px',
        animation: `${closing ? 'toast-slide-out' : 'toast-slide-in'} ${EXIT_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
      }}
    >
      {icon ? (
        <div
          style={{
            width: 30, height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color, animation: closing ? undefined : 'toast-icon-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
          }}
        >
          {icon}
        </div>
      ) : (
        <svg width="30" height="30" viewBox="0 0 52 52" style={{ flexShrink: 0 }}>
          <circle
            cx="26" cy="26" r="23" fill="none" stroke={color} strokeWidth="3.5"
            style={{ strokeDasharray: 145, strokeDashoffset: closing ? 0 : 145, animation: closing ? undefined : 'toast-circle-draw 0.45s ease-out forwards' }}
          />
          <path
            d="M15 27l7.5 7.5L37 18" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ strokeDasharray: 30, strokeDashoffset: closing ? 0 : 30, animation: closing ? undefined : 'toast-check-draw 0.35s 0.4s ease-out forwards' }}
          />
        </svg>
      )}

      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: textColor }}>{message}</span>
    </div>
  );
}
