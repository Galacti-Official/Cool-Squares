const stats = [
  { num: "47", label: "Squares transformed" },
  { num: "8°C", label: "Max temp. reduction" },
  { num: "12", label: "Cities partnered" },
  { num: "2.3M", label: "Residents benefiting" },
];

export default function StatsBar() {
  return (
    <div className="bg-fg border-y border-btn/40">
      <div className="max-w-5xl mx-auto px-6 py-8 flex flex-wrap justify-around gap-6">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="font-display text-4xl text-text">{s.num}</p>
            <p className="text-xs uppercase tracking-widest text-text-mid mt-1">
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
