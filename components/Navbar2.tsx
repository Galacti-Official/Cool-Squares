"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

export default function Navbar2() {
  useEffect(() => {
    document.body.classList.add("no-scroll");
    return () => {
      document.body.classList.remove("no-scroll");
    };
  }, []);

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md border-b border-btn/30">
      <div className="w-full px-4 md:px-8 h-16 grid grid-cols-[1fr_auto_1fr] items-center">
        <Link href="/" className="flex items-center gap-2 font-display text-xl text-text font-bold">
          <Image src="/logo.svg" alt="Logo" width={28} height={28} />
          CoolSquares Mapa
        </Link>
      </div>
    </nav>
  );
}
