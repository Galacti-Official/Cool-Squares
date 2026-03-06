export default function Hero() {
  return (
    <section className="relative py-28 overflow-hidden">
      {/* Background blobs */}
      <div className="pointer-events-none absolute -top-32 -right-36 w-[520px] h-[520px] rounded-full bg-[radial-gradient(circle,#d4e8a8,transparent_70%)] animate-drift-slow" />
      <div className="pointer-events-none absolute -bottom-16 -left-20 w-[340px] h-[340px] rounded-full bg-[radial-gradient(circle,#c8dba0,transparent_70%)] animate-drift-rev" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 flex items-center">
        {/* Left content */}
        <div className="max-w-xl">
          <h1 className="font-display text-5xl md:text-[4.2rem] leading-[1.1] text-text mb-5">
            Přetváření městských náměstí, aby byla {" "}
            <em className="italic text-text-light">pěkně cool</em> zeleným způsobem
          </h1>

          <p className="text-text-mid text-lg max-w-md mb-10 leading-relaxed">
            Úvodní text půjde sem
          </p>

          <div className="flex flex-wrap gap-3">
            <button className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-medium bg-btn text-text shadow-[0_4px_14px_rgba(172,193,138,0.45)] hover:bg-btn-dark hover:-translate-y-0.5 active:translate-y-0 transition-all">
              Moje náměstí →
            </button>
            <a href="#features" className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-medium text-sm bg-fg text-text-mid hover:bg-fg/80 hover:text-text transition-colors">
              Prozkoumat řešení
            </a>
          </div>
        </div>

        {/* Floating badge */}
        <div className="hidden lg:block absolute right-[6%] top-1/2 -translate-y-1/2 bg-fg border-2 border-btn/60 rounded-3xl px-8 py-7 text-center animate-float shadow-[0_12px_40px_rgba(46,58,31,0.12)]">
          <p className="text-xs uppercase tracking-widest text-text-light mb-1">
            očekávaná teplotní redukce
          </p>
          <p className="font-display text-5xl text-text leading-none">–8°C</p>
          <p className="text-sm font-medium text-btn-dark mt-1">
            <span className="text-btn">↓</span> po implementaci našeho řešení
          </p>
        </div>
      </div>
    </section>
  );
}
