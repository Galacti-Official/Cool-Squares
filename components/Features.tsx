import Image from "next/image";

const features = [
  {
    icon: "/leaf.svg",
    title: "Rostlinná stěna",
    desc: "Živá stěna tvořena psím vínem, která zlepšuje mikroklima a estetiku svého prostředí",
  },
  {
    icon: "/planter.svg",
    title: "Květináče s auto-zavlažováním",
    desc: "Zavlažovací systém s využitím dešťové vody",
  },
  {
    icon: "/accessories.svg",
    title: "Příslušenství",
    desc: "IoT Senzory, solární panely, vodní nádrže a další",
  }
];

export default function Features() {
  return (
    <section id="features" className="py-20 snap-start">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="font-display text-4xl md:text-5xl text-text mb-3">
            Naše řešení
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div key={f.title} className="h-full bg-fg border border-btn/35 rounded-2xl p-7 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(46,58,31,0.12)] transition-all duration-300">
              <Image
                src={f.icon}
                alt={`${f.title} ikona`}
                width={36}
                height={36}
                className="mb-4 block h-9 w-9"
              />
              <h3 className="font-display text-xl text-text mb-2">{f.title}</h3>
              <p className="text-text-mid text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
