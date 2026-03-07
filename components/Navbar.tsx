"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

const links = [
  { href: "/#features", label: "Řešení" },
  { href: "/#how", label: "Jak to funguje?" },
  { href: "/#data", label: "Data" }
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 0);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`sticky top-0 z-50 transition-colors backdrop-blur-md border-b border-btn/30 ${
      scrolled ? "bg-[#ACC18A]" : "bg-bg/88"
    }`}>
      <div className="w-full px-4 md:px-8 h-16 grid grid-cols-[1fr_auto_1fr] items-center">
        <Link href="/#" className={`justify-self-start flex items-center gap-2 font-display text-xl font-bold ${scrolled ? "text-black" : "text-text"}`}>
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

        <div className="justify-self-end">
          <Link
            href="/map"
            className={`px-5 py-2 rounded-full text-sm font-medium shadow-[0_4px_14px_rgba(172,193,138,0.45)] transition-all hover:-translate-y-0.5 active:translate-y-0 ${
              scrolled
                ? "bg-[#f4f5e0] text-black shadow-lg scale-105 hover:shadow-xl"
                : "bg-btn text-text hover:bg-btn-dark hover:shadow-[0_6px_20px_rgba(172,193,138,0.55)]"
            }`}
          >
            Začít
          </Link>
        </div>
      </div>
    </nav>
  );
}
