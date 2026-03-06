import FadeUp from "./FadeUp";

const steps = [
  {
    title: "Thermal audit",
    desc: "We map surface temperatures with drone-mounted thermal cameras to identify hot spots and shade deficits.",
  },
  {
    title: "Climate modelling",
    desc: "Site-specific simulations test intervention scenarios before a single euro is committed to construction.",
  },
  {
    title: "Co-design workshop",
    desc: "Residents, city planners, and landscape architects shape the final design together over two public sessions.",
  },
  {
    title: "Install & monitor",
    desc: "Implementation is phased to minimise disruption. IoT sensors track outcomes against baseline for 12 months.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="bg-fg py-20">
      <div className="max-w-5xl mx-auto px-6">
        <FadeUp className="text-center mb-14">
          <h2 className="font-display text-4xl md:text-5xl text-text mb-3">
            From assessment to cool square
          </h2>
          <p className="text-text-mid max-w-md mx-auto">
            Our process is rigorous, collaborative, and built around measurable outcomes.
          </p>
        </FadeUp>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((s, i) => (
            <FadeUp key={s.title} delay={i * 100}>
              <div>
                <p className="font-display text-5xl text-btn/50 leading-none mb-4">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="font-display text-lg text-text mb-2">{s.title}</h3>
                <p className="text-text-mid text-sm leading-relaxed">{s.desc}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}
