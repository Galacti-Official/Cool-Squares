import FadeUp from "./FadeUp";

const features = [
  {
    icon: "🌳",
    title: "Strategic Tree Planting",
    desc: "Canopy-optimised species selected for maximum shade coverage and low water demand, reducing radiant heat by up to 40%.",
  },
  {
    icon: "💧",
    title: "Misting & Water Features",
    desc: "Low-energy evaporative cooling via ground-level mist jets and reflective shallow pools that double as social spaces.",
  },
  {
    icon: "🪨",
    title: "Cool Paving Materials",
    desc: "High-albedo and permeable surfaces that reflect sunlight and allow rainwater infiltration to cool the ground.",
  },
  {
    icon: "⛺",
    title: "Adaptive Shade Canopies",
    desc: "Tensile fabric structures engineered to track the sun's arc, providing shade when and where it is needed most.",
  },
  {
    icon: "🌿",
    title: "Green Infrastructure",
    desc: "Vertical gardens, living walls, and grass buffers that absorb heat, improve air quality, and boost biodiversity.",
  },
  {
    icon: "📡",
    title: "IoT Monitoring Network",
    desc: "Real-time temperature and humidity sensors feed a dashboard so cities can measure impact and iterate quickly.",
  },
];

export default function Features() {
  return (
    <section id="features" className="py-20">
      <div className="max-w-5xl mx-auto px-6">
        <FadeUp className="text-center mb-14">
          <h2 className="font-display text-4xl md:text-5xl text-text mb-3">
            Layered cooling solutions
          </h2>
          <p className="text-text-mid max-w-md mx-auto">
            Each intervention is modelled against local climate data before recommendation.
          </p>
        </FadeUp>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <FadeUp key={f.title} delay={i * 80}>
              <div className="h-full bg-fg border border-btn/35 rounded-2xl p-7 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(46,58,31,0.12)] transition-all duration-300">
                <span className="text-3xl block mb-4">{f.icon}</span>
                <h3 className="font-display text-xl text-text mb-2">{f.title}</h3>
                <p className="text-text-mid text-sm leading-relaxed">{f.desc}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}
