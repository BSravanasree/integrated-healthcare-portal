export function Stars({ value, size = 'sm' }) {
  const full = Math.round(value);
  return (
    <span className={`stars stars-${size}`} aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} aria-hidden="true" className={i <= full ? 'on' : ''}>★</span>)}
    </span>
  );
}

export function Initials({ name }) {
  const parts = name.replace(/^Dr\.?\s+/i, '').split(' ');
  const text = (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  return <span className="avatar" aria-hidden="true">{text}</span>;
}

export function Alert({ kind = 'error', children }) {
  if (!children) return null;
  return <p className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</p>;
}
