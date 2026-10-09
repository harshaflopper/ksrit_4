// The donor's yearly occasions (birthdays, anniversary, children's birthdays): when each one
// comes round next, nearest first. Plain date maths, no AI.

import { daysBetween, isISODate, todayIST } from "./dates";
import type { SavedDate } from "./types";

export interface Upcoming {
  label: string;
  kind: NonNullable<SavedDate["kind"]>;
  date: string; // next time it falls, YYYY-MM-DD
  daysAway: number;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Next time a yearly date comes round, today included. 29 Feb falls on 28 Feb in other years. */
export function nextOccurrence(iso: string, today: string = todayIST()): string {
  const [, m, d] = iso.split("-").map(Number);
  const on = (y: number) => {
    const day = m === 2 && d === 29 && !isLeap(y) ? 28 : d;
    return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
  const y = Number(today.slice(0, 4));
  return on(y) >= today ? on(y) : on(y + 1);
}

/** Family occasions, nearest first. Past one-off donations ("Donation") are left out. */
export function upcomingOccasions(dates: SavedDate[], birthday: string | null, today: string = todayIST()): Upcoming[] {
  const all: SavedDate[] = [...dates];
  if (birthday && !all.some((d) => d.kind === "self" || d.label === "My birthday")) all.push({ label: "My birthday", date: birthday, kind: "self" });
  const seen = new Set<string>();
  const out: Upcoming[] = [];
  for (const d of all) {
    if (!isISODate(d.date) || d.label === "Donation") continue;
    const kind = d.kind ?? (d.label === "My birthday" ? "self" : "other");
    const key = `${d.label.toLowerCase()}|${d.date.slice(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const date = nextOccurrence(d.date, today);
    out.push({ label: d.label, kind, date, daysAway: daysBetween(today, date) });
  }
  return out.sort((a, b) => a.daysAway - b.daysAway || a.label.localeCompare(b.label));
}
