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
      className="kpi-card-mobile"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '14px 20px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        flex: 1,
        minWidth: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 2,
          background: `linear-gradient(to right, ${accentColor}, transparent)`,
          borderRadius: '12px 12px 0 0',
        }}
      />

      <div className="kpi-left">
        <p
          className="kpi-label"
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            margin: 0,
          }}
        >
          {label}
        </p>

        <p
          className="kpi-value"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--text)',
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            margin: '4px 0 0',
          }}
        >
          {value}
        </p>

        {sub && (
          <p
            className="kpi-sub"
            style={{
              fontSize: 11,
              color: subColor ?? 'var(--muted)',
              marginTop: 4,
              marginBottom: 0,
            }}
          >
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}
