"use client";

import { useState, useEffect } from "react";

const links = [
  { href: "#features", label: "Řešení" },
  { href: "#how", label: "Jak to funguje?" },
  { href: "#data", label: "Data" }
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
<<<<<<< Updated upstream
    const onScroll = () => setScrolled(window.scrollY > 0);
=======
    const onScroll = () => {
      setScrolled(window.scrollY > 0);
    };
>>>>>>> Stashed changes
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`sticky top-0 z-50 transition-colors backdrop-blur-md border-b border-btn/30 ${
<<<<<<< Updated upstream
      scrolled ? "bg-[#ACC18A]" : "bg-bg/88"
    }`}>      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
=======
      scrolled ? "bg-green-500" : "bg-bg/88"
    }`}>      
    <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
>>>>>>> Stashed changes
        {/* Logo */}
        <a href="#" className="flex items-center gap-2 font-display text-xl text-text">
          CoolSquares
        </a>

        {/* Desktop links */}
        <ul className="hidden md:flex items-center gap-1 list-none">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="px-4 py-1.5 rounded-full text-sm text-text-mid hover:bg-fg hover:text-text transition-colors"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        {/* CTA buttons */}
        <div className="hidden md:flex items-center gap-2">
          <button
            className={`px-5 py-2 rounded-full text-sm font-medium shadow-[0_4px_14px_rgba(172,193,138,0.45)] transition-all hover:-translate-y-0.5 active:translate-y-0 ${
              scrolled
                ? "bg-white text-[#ACC18A] shadow-lg scale-105 hover:shadow-xl"
                : "bg-btn text-text hover:bg-btn-dark hover:shadow-[0_6px_20px_rgba(172,193,138,0.55)]"
            }`}
          >
            Začít
          </button>
        </div>
      </div>
    </nav>
  );
}
