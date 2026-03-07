const steps = [
  {
    title: "Rozbalení a montáž",
    desc: "Naše  rostlinná stěna přijde rozdělena na čtyři hlavní části. Rám stěny, hliníková vana, ocelový rám a prkna. Balení obsahuje i substrát a sazeničky.",
  },
  {
    title: "Růst",
    desc: "Po sestavení a zasazení Psího vína, začne rostlina obrůstat rám stěny a vytvářet hustou pokrývku.",
  },
  {
    title: "Výsledek",
    desc: "Po tom co rostlina obroste celý rám, vytvoří příjemné stíněné místo. Objem hliníkové vany je dostačující na to aby rostlina měla dostatek vláhy i v horkých letních dnech.",
  },
  {
    title: "DIY Úprava",
    desc: "Kvůli modularitě a open source zpracování, lze jednoduše nainstalovat naše nebo vaše  vlastní příslušenství.",
  }
];

export default function HowItWorks() {
  return (
    <section id="how" className="bg-fg py-20 snap-start">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="font-display text-4xl md:text-5xl text-text mb-3">
            Jak to funguje?
          </h2>
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
