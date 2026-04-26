interface KPICardProps {
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
  accentColor?: string;
}

export default function KPICard({ label, value, sub, subColor, accentColor = 'var(--primary)' }: KPICardProps) {
  return (
    <div
      className="flex flex-col gap-2 flex-1 min-w-0 relative overflow-hidden"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '14px 20px 12px',
      }}
    >
      {/* Accent top line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(to right, ${accentColor}, transparent)`,
          borderRadius: '12px 12px 0 0',
        }}
      />

      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
        }}
      >
        {label}
      </p>

      <p
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--text)',
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </p>

      {sub && (
        <p
          style={{
            fontSize: 11,
            color: subColor ?? 'var(--muted)',
            marginTop: 2,
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
