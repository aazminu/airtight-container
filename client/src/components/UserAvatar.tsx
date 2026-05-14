interface UserAvatarProps {
  email: string | null | undefined;
  size?: number;
  onClick?: () => void;
  ariaLabel?: string;
}

const PALETTE = [
  '#ac3e31', // accent red
  '#2da44e', // green
  '#0969da', // blue
  '#9333ea', // purple
  '#d97706', // amber
  '#0891b2', // cyan
  '#db2777', // pink
  '#65a30d', // lime
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export default function UserAvatar({
  email,
  size = 36,
  onClick,
  ariaLabel,
}: UserAvatarProps) {
  const trimmed = (email ?? '').trim();
  const initial = trimmed && trimmed !== 'unauthorized'
    ? trimmed[0].toUpperCase()
    : '?';
  const color = PALETTE[hashCode(trimmed) % PALETTE.length];
  const style: React.CSSProperties = {
    width: size,
    height: size,
    background: color,
    color: '#fff',
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-sans), system-ui, sans-serif',
    fontWeight: 700,
    fontSize: Math.round(size * 0.42),
    letterSpacing: 0,
    userSelect: 'none',
    cursor: onClick ? 'pointer' : 'default',
    border: 'none',
    padding: 0,
    lineHeight: 1,
    transition: 'transform 0.12s ease, box-shadow 0.12s ease',
  };
  if (onClick) {
    return (
      <button
        type="button"
        className="userAvatar"
        style={style}
        onClick={onClick}
        aria-label={ariaLabel ?? `Account menu for ${trimmed}`}
      >
        {initial}
      </button>
    );
  }
  return (
    <span className="userAvatar" style={style} aria-hidden="true">
      {initial}
    </span>
  );
}
