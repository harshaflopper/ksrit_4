"use client";

// Shared pieces: logo, top bar with tabs, avatar, icons, button and field styles.

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="AnnaSetu home">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
        <rect width="34" height="34" rx="9" fill="#1e6b4e" />
        <path d="M6 22c3.5-7 18.5-7 22 0" stroke="#f2b01e" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M10 22v4M24 22v4M17 16.5v9.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        <ellipse cx="17" cy="11" rx="2.6" ry="4" fill="#fff" />
      </svg>
      <span className="hidden font-display text-[22px] font-bold leading-none text-leaf sm:inline">Ulisu</span>
    </Link>
  );
}

const TABS = [
  { href: "/", label: "Deals" },
  { href: "/shop", label: "My shop" },
  { href: "/donate", label: "Donate" },
];

export function TopBar() {
  const path = usePathname();
  return (
    <header className="glass sticky top-0 z-20 border-b border-line/70">
      <div className="mx-auto flex h-16 max-w-[1040px] items-center gap-3 px-4">
        <Logo />
        <nav className="ml-auto flex items-center gap-1 rounded-full bg-page/80 p-1 ring-1 ring-line/80" aria-label="Main">
          {TABS.map((t) => {
            const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center rounded-full px-3.5 text-[15px] font-semibold transition-colors duration-200 sm:px-5 ${active ? "bg-leaf text-white shadow-glow" : "text-mute hover:bg-white hover:text-ink"
                  }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-leaf-soft to-leaf-200 font-display font-bold text-leaf-dark ring-2 ring-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function CameraIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`spinner ${className}`} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-card border border-transparent bg-card p-5 shadow-card ${className}`}>{children}</section>;
}

export const btnPrimary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-leaf px-5 py-2.5 font-semibold text-white shadow-glow transition-[background-color,transform,box-shadow] duration-200 hover:bg-leaf-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-mute/40 disabled:shadow-none disabled:active:scale-100";
export const btnSecondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 font-semibold text-leaf ring-1 ring-leaf-200 transition-[background-color,transform] duration-200 hover:bg-leaf-50 active:scale-[0.98]";
export const btnQuiet =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-leaf-50 px-5 py-2.5 font-semibold text-ink ring-1 ring-line transition-[background-color,transform] duration-200 hover:bg-leaf-soft active:scale-[0.98]";
export const field =
  "min-h-12 w-full rounded-field border border-line bg-leaf-50/60 px-4 py-3 text-[16px] text-ink transition-[border-color,background-color] duration-200 placeholder:text-mute/70 hover:border-leaf-200 focus:border-leaf focus:bg-white";
