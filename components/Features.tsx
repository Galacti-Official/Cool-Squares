"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MODELS = [
  { name: "Rostlinná brána",           topImagePath: encodeURI("/Rostliná brána-preview.png") },
  { name: "Rostlinná stěna",           topImagePath: encodeURI("/Rostliná stěna-preview.png") },
  { name: "Zelená zastávka",           topImagePath: "/Zelena_Zastavka-preview.png" },
  { name: "Zastíněné parkovací místo", topImagePath: "/P-preview.png" },
];

const ITEMS = [...MODELS, ...MODELS, ...MODELS];
const N = MODELS.length;
const CARD_W = 256; // w-64
const GAP = 20;     // gap-5
const STEP = CARD_W + GAP;
const AUTO_MS = 3000;
const TRANSITION_MS = 350;

export default function Features() {
  const [index, setIndex] = useState(N);
  const [animated, setAnimated] = useState(true);
  const indexRef = useRef(N);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!animated) return;
    const t = setTimeout(() => {
      const cur = indexRef.current;
      if (cur >= N * 2) { setAnimated(false); setIndex(cur - N); indexRef.current = cur - N; }
      else if (cur < N) { setAnimated(false); setIndex(cur + N); indexRef.current = cur + N; }
    }, TRANSITION_MS);
    return () => clearTimeout(t);
  }, [index, animated]);

  const step = (dir: 1 | -1) => {
    const next = indexRef.current + dir;
    indexRef.current = next;
    setAnimated(true);
    setIndex(next);
  };

  const restartAuto = () => {
    if (autoRef.current) clearInterval(autoRef.current);
    autoRef.current = setInterval(() => step(1), AUTO_MS);
  };

  useEffect(() => {
    restartAuto();
    return () => { if (autoRef.current) clearInterval(autoRef.current); };
  }, []);

  const handlePrev = () => { step(-1); restartAuto(); };
  const handleNext = () => { step(1); restartAuto(); };

  return (
    <section id="features" className="py-20 snap-start overflow-hidden">
      <div className="max-w-5xl mx-auto px-6 mb-12 text-center">
        <h2 className="font-display text-4xl md:text-5xl text-text mb-3">
          Naše řešení
        </h2>
      </div>

      <div className="relative w-[808px] mx-auto">
        {/* Arrows */}
        <button
          onClick={handlePrev}
          aria-label="Předchozí"
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[calc(100%+8px)] z-20 w-10 h-10  flex items-center justify-center text-text-mid hover:text-text transition-all"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          onClick={handleNext}
          aria-label="Další"
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-[calc(100%+8px)] z-20 w-10 h-10 flex items-center justify-center text-text-mid hover:text-text transition-all"
        >
          <ChevronRight size={20} />
        </button>

        {/* Fade edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-bg to-transparent z-10" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-bg to-transparent z-10" />

        <div className="overflow-hidden">
          <div
            className="flex gap-5"
            style={{
              transform: `translateX(${-index * STEP}px)`,
              transition: animated ? `transform ${TRANSITION_MS}ms ease` : "none",
            }}
          >
            {ITEMS.map((model, i) => (
              <div
                key={i}
                className="w-64 shrink-0 bg-fg border border-btn/35 rounded-2xl p-4 flex flex-col items-center gap-3"
              >
                <div className="relative w-full h-56">
                  <Image
                    src={model.topImagePath}
                    alt={model.name}
                    fill
                    className="object-contain"
                    sizes="256px"
                  />
                </div>
                <p className="font-display text-sm text-text text-center leading-tight">
                  {model.name}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
