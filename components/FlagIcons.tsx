export function FlagUS({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 20 14" style={{ borderRadius: 2, flexShrink: 0 }}>
      <rect width="20" height="14" fill="#B22234" />
      {[1, 3, 5, 7, 9, 11, 13].map((y) => (
        <rect key={y} y={y} width="20" height="1" fill="#fff" />
      ))}
      <rect width="9" height="8" fill="#3C3B6E" />
    </svg>
  );
}

export function FlagAR({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 20 14" style={{ borderRadius: 2, flexShrink: 0 }}>
      <rect width="20" height="14" fill="#fff" />
      <rect width="20" height="4.67" fill="#74ACDF" />
      <rect y="9.33" width="20" height="4.67" fill="#74ACDF" />
      <circle cx="10" cy="7" r="1.8" fill="#F6B40E" stroke="#85340A" strokeWidth="0.15" />
    </svg>
  );
}
