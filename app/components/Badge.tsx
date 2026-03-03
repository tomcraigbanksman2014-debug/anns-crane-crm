export default function Badge({ label, tone }: { label: string; tone: "good" | "warn" | "bad" | "neutral" }) {
  const map: Record<string, React.CSSProperties> = {
    good: { background: "rgba(0,180,120,0.15)", border: "1px solid rgba(0,180,120,0.25)" },
    warn: { background: "rgba(255,140,0,0.15)", border: "1px solid rgba(255,140,0,0.25)" },
    bad: { background: "rgba(255,0,0,0.12)", border: "1px solid rgba(255,0,0,0.22)" },
    neutral: { background: "rgba(0,0,0,0.06)", border: "1px solid rgba(0,0,0,0.10)" },
  };

  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 900,
        ...map[tone],
      }}
    >
      {label}
    </span>
  );
}
