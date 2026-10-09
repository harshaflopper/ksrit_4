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
      <span className="hidden font-display text-[22px] font-bold leading-none text-leaf sm:inline">AnnaSetu</span>
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
    <header className="sticky top-0 z-20 border-b border-line bg-card">
      <div className="mx-auto flex h-14 max-w-[1040px] items-center gap-3 px-4">
        <Logo />
        <nav className="ml-auto flex h-full" aria-label="Main">
          {TABS.map((t) => {
            const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full items-center border-b-[3px] px-3 font-semibold sm:px-5 ${
                  active ? "border-leaf text-leaf" : "border-transparent text-mute hover:bg-page"
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
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-leaf-soft font-display font-bold text-leaf"
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
  return <section className={`rounded-xl border border-line bg-card p-4 ${className}`}>{children}</section>;
}

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-leaf px-4 py-2.5 font-semibold text-white hover:bg-leaf-dark disabled:cursor-not-allowed disabled:bg-mute/40";
export const btnQuiet =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-page px-4 py-2.5 font-semibold text-ink hover:bg-line";
export const field =
  "w-full rounded-lg border border-line bg-card px-3 py-2.5 text-ink placeholder:text-mute/70 focus:border-leaf focus:outline-none";
