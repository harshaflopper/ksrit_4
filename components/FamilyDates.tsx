"use client";

// The donor's family occasions: own birthday, anniversary, children's birthdays.
// Stored as profile.dates ({label, date, kind}); other saved dates are kept as they are.

import type { SavedDate } from "@/lib/types";
import { field } from "./ui";

export interface FamilyForm {
  birthday: string;
  anniversary: string;
  children: { name: string; date: string }[];
}

export function familyFromDates(dates: SavedDate[], birthday: string | null): FamilyForm {
  return {
    birthday: dates.find((d) => d.kind === "self")?.date ?? birthday ?? "",
    anniversary: dates.find((d) => d.kind === "anniversary")?.date ?? "",
    children: dates
      .filter((d) => d.kind === "child")
      .map((d) => ({ name: d.label.replace(/'s birthday$/, ""), date: d.date })),
  };
}

/** Family form back to saved dates, keeping any other dates (past donations, other occasions). */
export function datesFromFamily(f: FamilyForm, keep: SavedDate[] = []): SavedDate[] {
  const out: SavedDate[] = keep.filter((d) => d.kind !== "self" && d.kind !== "anniversary" && d.kind !== "child" && d.label !== "My birthday");
  if (f.birthday) out.push({ label: "My birthday", date: f.birthday, kind: "self" });
  if (f.anniversary) out.push({ label: "Our anniversary", date: f.anniversary, kind: "anniversary" });
  for (const c of f.children)
    if (c.date && c.name.trim()) out.push({ label: `${c.name.trim()}'s birthday`, date: c.date, kind: "child" });
  return out;
}

export function FamilyDates({ value, onChange }: { value: FamilyForm; onChange: (f: FamilyForm) => void }) {
  const setChild = (i: number, patch: Partial<{ name: string; date: string }>) =>
    onChange({ ...value, children: value.children.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block font-semibold">Your birthday</span>
        <input type="date" className={field} value={value.birthday} onChange={(e) => onChange({ ...value, birthday: e.target.value })} />
      </label>
      <label className="block">
        <span className="mb-1 block font-semibold">Wedding anniversary (optional)</span>
        <input type="date" className={field} value={value.anniversary} onChange={(e) => onChange({ ...value, anniversary: e.target.value })} />
      </label>
      <div>
        <span className="mb-1 block font-semibold">Children&apos;s birthdays (optional)</span>
        <div className="space-y-2">
          {value.children.map((c, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={`${field} min-w-0 flex-1`}
                placeholder="Name"
                value={c.name}
                onChange={(e) => setChild(i, { name: e.target.value })}
                aria-label={`Child ${i + 1} name`}
              />
              <input
                type="date"
                className={`${field} w-[46%]`}
                value={c.date}
                onChange={(e) => setChild(i, { date: e.target.value })}
                aria-label={`Child ${i + 1} birthday`}
              />
              <button
                type="button"
                onClick={() => onChange({ ...value, children: value.children.filter((_, j) => j !== i) })}
                className="shrink-0 rounded-lg px-2 text-mute hover:bg-page"
                aria-label={`Remove child ${i + 1}`}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        {value.children.length < 6 ? (
          <button
            type="button"
            onClick={() => onChange({ ...value, children: [...value.children, { name: "", date: "" }] })}
            className="mt-2 font-semibold text-leaf hover:underline"
          >
            Add a child
          </button>
        ) : null}
      </div>
    </div>
  );
}
