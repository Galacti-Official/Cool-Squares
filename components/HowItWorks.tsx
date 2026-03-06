const steps = [
  {
    title: "jmeno",
    desc: "nejakej popis",
  },
  {
    title: "jmeno",
    desc: "nejakej popis",
  },
  {
    title: "jmeno",
    desc: "nejakej popis",
  },
  {
    title: "jmeno",
    desc: "nejakej popis",
  }
];

export default function HowItWorks() {
  return (
    <section id="how" className="bg-fg py-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="font-display text-4xl md:text-5xl text-text mb-3">
            Jak to funguje?
          </h2>
          <p className="text-text-mid max-w-md mx-auto">
            popisek idk
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((s, i) => (
            <div key={s.title} className="flex flex-col gap-4">
              <p className="font-display text-5xl text-btn/50 leading-none mb-4">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="font-display text-lg text-text mb-2">{s.title}</h3>
                <p className="text-text-mid text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
