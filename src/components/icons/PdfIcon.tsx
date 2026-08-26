interface PdfIconProps {
  size?: number;
  color?: string;
}

export default function PdfIcon({ size = 16, color = 'currentColor' }: PdfIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <text
        x="12"
        y="17.5"
        textAnchor="middle"
        fontSize="7"
        fontWeight="700"
        fontFamily="Arial, sans-serif"
        stroke="none"
        fill={color}
        letterSpacing="-0.3"
      >
        PDF
      </text>
    </svg>
  );
}
