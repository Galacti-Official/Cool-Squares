"use client";

import { useEffect, useState } from "react";
import StlPreview from "./StlPreview";

const HERO_MODELS = [
  {
    name: "Rostlinná brána",
    modelPath: encodeURI("/Rostliná brána.stl"),
    rotationPeriodMs: 8200,
  },
  {
    name: "Rostlinná stěna",
    modelPath: encodeURI("/Rostliná stěna.stl"),
    rotationPeriodMs: 7000,
  },
];
const HERO_MODEL_SWITCH_INTERVAL_MS = 6500;

export default function Hero() {
  const [activeModelIndex, setActiveModelIndex] = useState(0);
  const activeModel = HERO_MODELS[activeModelIndex];

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveModelIndex((prev) => (prev + 1) % HERO_MODELS.length);
    }, HERO_MODEL_SWITCH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <section className="relative py-16 md:py-28 overflow-hidden snap-start">
      <div className="relative z-10 max-w-6xl mx-auto px-6 flex flex-col lg:flex-row items-center justify-between gap-10">
        <div className="max-w-xl text-center lg:text-left">
          <h1 className="font-display text-4xl sm:text-5xl md:text-[4.2rem] leading-[1.1] text-text mb-5">
            Moderní řešení pro problémy {" "}
            <em className="italic text-text-light">moderního města</em>
          </h1>

          <p className="text-text-mid text-lg max-w-md mb-10 leading-relaxed mx-auto lg:mx-0">
            Neboli naše řešení tepelných ostrovů
          </p>

          <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
            <a href="/map" className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-medium bg-btn text-text shadow-[0_4px_14px_rgba(172,193,138,0.45)] hover:bg-btn-dark hover:-translate-y-0.5 active:translate-y-0 transition-all">
              Vyzkoušet →
            </a>
            <a href="#features" className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-medium text-sm bg-fg text-text-mid hover:bg-fg/80 hover:text-text transition-colors">
              Prozkoumat řešení
            </a>
          </div>
        </div>

        <div className="hidden lg:block w-[430px] h-[430px] shrink-0 -mt-8">
          <StlPreview
            modelPath={activeModel.modelPath}
            zoom={0.9}
            rotationPeriodMs={activeModel.rotationPeriodMs}
          />
          <p className="mt-3 text-center text-sm text-text-light">{activeModel.name}</p>
        </div>
      </div>
    </section>
  );
}
