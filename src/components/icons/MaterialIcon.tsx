import type { CSSProperties } from 'react';

export function MaterialIcon({ name, size = 20, color, style }: { name: string; size?: number; color?: string; style?: CSSProperties }) {
  return (
    <span className="material-symbols-rounded" style={{ fontSize: size, color, ...style }}>
      {name}
    </span>
  );
}
