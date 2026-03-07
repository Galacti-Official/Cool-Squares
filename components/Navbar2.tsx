"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import logo from "@/public/logo.svg";

const links = [
  { href: "/#features", label: "Řešení" },
  { href: "/#how", label: "Jak to funguje?" },
  { href: "/#data", label: "Data" }
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    document.body.classList.add("no-scroll");
    return () => {
      document.body.classList.remove("no-scroll");
    };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 0);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className="sticky top-0 z-50 transition-colors backdrop-blur-md border-b border-btn/30">
      <div className="w-full px-4 md:px-8 h-16 grid grid-cols-[1fr_auto_1fr] items-center">     
        <Link href="/#" className={`flex items-center gap-2 font-display text-xl text-text font-bold ${scrolled ? "text-black" : "text-text"}`}>
          <Image src={"/logo.svg"} alt="Logo" width={28} height={28} />
          CoolSquares Mapa
        </Link>
      </div>
    </nav>
  );
}
