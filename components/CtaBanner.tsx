export default function CtaBanner() {
  return (
    <section id="contact" className="py-20 snap-start">
      <div className="max-w-5xl mx-auto px-6">
        <div>
          <div className="bg-gradient-to-br from-btn to-[#c8dba0] rounded-3xl px-10 py-14 flex flex-col md:flex-row items-center justify-between gap-8">
            <h2 className="font-display text-3xl md:text-4xl text-text max-w-lg">
              Trpí vaše náměstí přehříváním? Vyzkoušejte náš plánovač a ochlaďte své město!
            </h2>
            <button className="shrink-0 inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-medium bg-text text-bg shadow-[0_6px_20px_rgba(46,58,31,0.3)] hover:bg-[#1a2410] hover:-translate-y-0.5 active:translate-y-0 transition-all">
              Vyzkoušet →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}