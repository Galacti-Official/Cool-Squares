import FadeUp from "./FadeUp";

export default function Hero() {
  return (
    <section className="relative py-28 overflow-hidden">
      {/* Background blobs */}
      <div className="pointer-events-none absolute -top-32 -right-36 w-[520px] h-[520px] rounded-full bg-[radial-gradient(circle,#d4e8a8,transparent_70%)] animate-drift-slow" />
      <div className="pointer-events-none absolute -bottom-16 -left-20 w-[340px] h-[340px] rounded-full bg-[radial-gradient(circle,#c8dba0,transparent_70%)] animate-drift-rev" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 flex items-center">
        {/* Left content */}
        <FadeUp className="max-w-xl">
          {/* Eyebrow */}
          <span className="inline-flex items-center gap-2 bg-fg border border-btn/50 rounded-full px-4 py-1.5 text-xs font-medium tracking-widest uppercase text-text-mid mb-6">
            🌡️ Urban Heat Island Response
          </span>

          <h1 className="font-display text-5xl md:text-[4.2rem] leading-[1.1] text-text mb-5">
            Making city squares{" "}
            <em className="italic text-text-light">pleasantly cool</em> again
          </h1>

          <p className="text-text-mid text-lg max-w-md mb-10 leading-relaxed">
            Evidence-based interventions — shade canopies, reflective paving,
            water features, and greenery — that reduce surface temperatures by
            up to 8 °C.
          </p>

          <div className="flex flex-wrap gap-3">
            <button className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-medium bg-btn text-text shadow-[0_4px_14px_rgba(172,193,138,0.45)] hover:bg-btn-dark hover:-translate-y-0.5 active:translate-y-0 transition-all">
              Assess my square →
            </button>
            <button className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-medium border-2 border-btn text-text hover:bg-btn hover:shadow-[0_4px_14px_rgba(172,193,138,0.35)] hover:-translate-y-0.5 active:translate-y-0 transition-all">
              View case studies
            </button>
          </div>
        </FadeUp>

        {/* Floating badge */}
        <div className="hidden lg:block absolute right-[6%] top-1/2 -translate-y-1/2 bg-fg border-2 border-btn/60 rounded-3xl px-8 py-7 text-center animate-float shadow-[0_12px_40px_rgba(46,58,31,0.12)]">
          <p className="text-xs uppercase tracking-widest text-text-light mb-1">
            avg. surface temp
          </p>
          <p className="font-display text-5xl text-text leading-none">–8°C</p>
          <p className="text-sm font-medium text-btn-dark mt-1">
            <span className="text-btn">↓</span> after intervention
          </p>
        </div>
      </div>
    </section>
  );
}
