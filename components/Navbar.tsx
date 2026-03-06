"use client";

import { useState } from "react";

const links = [
  { href: "#features", label: "Solutions" },
  { href: "#how", label: "How it works" },
  { href: "#data", label: "Data" }
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-bg/88 backdrop-blur-md border-b border-btn/30">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2 font-display text-xl text-text">
          <span>🌿</span> CoolSquares
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
          <button className="px-5 py-2 rounded-full text-sm font-medium bg-btn text-text shadow-[0_4px_14px_rgba(172,193,138,0.45)] hover:bg-btn-dark hover:shadow-[0_6px_20px_rgba(172,193,138,0.55)] hover:-translate-y-0.5 active:translate-y-0 transition-all">
            Get started
          </button>
        </div>
      </div>
    </nav>
  );
}
