import { useRef, useLayoutEffect, useState } from 'react';

interface SignaturePadProps {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  error?: boolean;
}

const getPos = (canvas: HTMLCanvasElement, e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
  const rect = canvas.getBoundingClientRect();
  const point = 'touches' in e ? e.touches[0] : e;
  return { x: point.clientX - rect.left, y: point.clientY - rect.top };
};

const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export default function SignaturePad({ value, onChange, error }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const sizeRef = useRef({ width: 0, height: 0 });
  const pointsRef = useRef<{ x: number; y: number }[]>([]);
  const [isEmpty, setIsEmpty] = useState(!value);

  // El canvas se dibuja con width:100% (ancho variable según el modal), pero su buffer interno
  // de píxeles (canvas.width/height) es fijo — si no coinciden, el trazo queda desfasado del
  // cursor. Aquí igualamos el buffer al tamaño real renderizado (+ devicePixelRatio para nitidez)
  // y escalamos el contexto, así las coordenadas del mouse (en px CSS) mapean 1:1 al dibujo.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    sizeRef.current = { width: rect.width, height: rect.height };
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';

    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = value;
    }
  }, []);

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawingRef.current = true;
    const pos = getPos(canvas, e);
    pointsRef.current = [pos];
    // Punto inicial (por si es solo un clic, sin arrastre) para que quede un punto visible.
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle as string;
    ctx.fill();
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    e.preventDefault();
    const pos = getPos(canvas, e);
    const points = pointsRef.current;
    points.push(pos);

    // Suaviza el trazo dibujando curvas cuadráticas entre puntos medios consecutivos, en vez de
    // líneas rectas punto a punto — así el trazo se ve continuo/curvo como una firma real y no
    // como un polígono de segmentos angulosos.
    if (points.length > 2) {
      const [p0, p1, p2] = points.slice(-3);
      const m1 = midpoint(p0, p1);
      const m2 = midpoint(p1, p2);
      ctx.beginPath();
      ctx.moveTo(m1.x, m1.y);
      ctx.quadraticCurveTo(p1.x, p1.y, m2.x, m2.y);
      ctx.stroke();
    }
    setIsEmpty(false);
  };

  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    pointsRef.current = [];
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = sizeRef.current;
    ctx.clearRect(0, 0, width, height);
    setIsEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '140px',
          border: `1.5px solid ${error ? '#dc2626' : '#e5e7eb'}`,
          borderRadius: '8px',
          backgroundColor: '#fff',
          touchAction: 'none',
          cursor: 'crosshair',
        }}
        onMouseDown={start}
        onMouseMove={draw}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={draw}
        onTouchEnd={end}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem' }}>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{isEmpty ? 'Firma aquí' : ''}</span>
        <button
          type="button"
          onClick={clear}
          style={{ border: 'none', background: 'none', color: '#6b8c1f', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}
