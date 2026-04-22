"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

const links = [
  { href: "/#features", label: "Řešení" },
  { href: "/#how", label: "Jak to funguje?" },
  { href: "/features", label: "Součásti" },
  { href: "/map", label: "Plánovač" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 0);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <nav className={`sticky top-0 z-50 transition-colors backdrop-blur-md border-b border-btn/30 ${
      scrolled ? "bg-[#ACC18A]" : "bg-bg/88"
    }`}>
      <div className="w-full px-4 md:px-8 h-16 flex justify-between items-center md:grid md:grid-cols-[1fr_auto_1fr]">
        <Link href="/#" onClick={() => setMenuOpen(false)} className={`justify-self-start flex items-center gap-2 font-display text-xl font-bold ${scrolled ? "text-black" : "text-text"}`}>
          <Image src={"/logo.svg"} alt="Logo" width={28} height={28} />
          CoolSquares
        </Link>

        <ul className="hidden md:flex items-center justify-center gap-10 list-none">
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

        <div className="justify-self-end flex items-center gap-3">
          <Link
            href="https://github.com/Galacti-Official/Cool-Squares"
            aria-label="GitHub"
            className={`hidden sm:inline-flex items-center justify-center px-4 py-2 rounded-full shadow-[0_4px_14px_rgba(172,193,138,0.45)] transition-all hover:-translate-y-0.5 active:translate-y-0 ${
              scrolled
                ? "bg-[#f4f5e0] text-black shadow-lg scale-105 hover:shadow-xl"
                : "bg-btn text-text hover:bg-btn-dark hover:shadow-[0_6px_20px_rgba(172,193,138,0.55)]"
            }`}
          >
            <Image
              src="/GitHub_Lockup_Black_Clearspace.svg"
              alt="GitHub"
              width={92}
              height={20}
            />
          </Link>

          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Zavřít menu" : "Otevřít menu"}
            className="md:hidden flex flex-col justify-center items-center w-10 h-10 gap-1.5 rounded-xl hover:bg-fg/60 transition-colors"
          >
            <span className={`block w-5 h-0.5 bg-text transition-transform duration-200 ${menuOpen ? "rotate-45 translate-y-2" : ""}`} />
            <span className={`block w-5 h-0.5 bg-text transition-opacity duration-200 ${menuOpen ? "opacity-0" : ""}`} />
            <span className={`block w-5 h-0.5 bg-text transition-transform duration-200 ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-btn/30 bg-bg/98 backdrop-blur-md">
          <ul className="flex flex-col list-none px-4 py-3">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-3 rounded-xl text-sm text-text-mid hover:bg-fg hover:text-text transition-colors"
                >
                  {l.label}
                </a>
              </li>
            ))}
            <li className="mt-2 pt-2 border-t border-btn/20">
              <Link
                href="https://github.com/Galacti-Official/Cool-Squares"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm text-text-mid hover:bg-fg hover:text-text transition-colors"
              >
                <Image src="/GitHub_Lockup_Black_Clearspace.svg" alt="GitHub" width={80} height={18} />
              </Link>
            </li>
          </ul>
        </div>
      )}
    </nav>
  );
}
