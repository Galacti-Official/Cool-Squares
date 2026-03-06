export default function Footer() {
  return (
    <footer className="border-t border-btn/35 py-8">
      <div className="max-w-5xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
        <span className="font-display text-xl text-text">🌿 CoolSquares</span>
        <p className="text-xs text-text-light">
          © 2026 CoolSquares Initiative · Making urban heat manageable
        </p>
        <div className="flex gap-1">
          {["Privacy", "Terms"].map((label) => (
            <button
              key={label}
              className="px-3 py-1.5 text-xs text-text-mid hover:text-text transition-colors rounded-full hover:bg-fg"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </footer>
  );
}
