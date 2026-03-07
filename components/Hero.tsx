import StlPreview from "./StlPreview";

export default function Hero() {
  const modelPath = encodeURI("/Rostliná brána.stl");

  return (
    <section className="relative py-28 overflow-hidden snap-start">
      <div className="relative z-10 max-w-6xl mx-auto px-6 flex items-center lg:items-stretch justify-between gap-10">
        {/* Left content */}
        <div className="max-w-xl">
          <h1 className="font-display text-5xl md:text-[4.2rem] leading-[1.1] text-text mb-5">
            Moderní řešení pro problémy {" "}
            <em className="italic text-text-light">moderního města</em>
          </h1>

          <p className="text-text-mid text-lg max-w-md mb-10 leading-relaxed">
            Úvodní text půjde sem
          </p>

          <div className="flex flex-wrap gap-3">
            <button className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-medium bg-btn text-text shadow-[0_4px_14px_rgba(172,193,138,0.45)] hover:bg-btn-dark hover:-translate-y-0.5 active:translate-y-0 transition-all">
              Moje okolí →
            </button>
            <a href="#features" className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-medium text-sm bg-fg text-text-mid hover:bg-fg/80 hover:text-text transition-colors">
              Prozkoumat řešení
            </a>
          </div>
        </div>

        <div className="hidden lg:flex w-[420px] shrink-0 self-stretch">
          <StlPreview modelPath={modelPath} />
        </div>
      </div>
    </section>
  );
}
