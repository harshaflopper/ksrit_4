// Who is using this phone. For now a random id per role kept in localStorage,
// so one phone can demo both a shop and a donor. Swap for the Clerk user id later.

import type { Profile, Role } from "./types";

export function localId(role: Role): string {
  const key = `annasetu.uid.${role}`;
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = `${role}_${crypto.randomUUID()}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `${role}_guest`;
  }
}

export async function loadProfile(role: Role): Promise<Profile | null> {
  const res = await fetch(`/api/me?id=${encodeURIComponent(localId(role))}`, { cache: "no-store" });
  if (!res.ok) return null;
  const { profile } = (await res.json()) as { profile: Profile | null };
  return profile && profile.role === role ? profile : null;
}

export async function saveMyProfile(
  role: Role,
  data: Omit<Profile, "id" | "created_at" | "role">,
): Promise<Profile> {
  const res = await fetch("/api/me", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, id: localId(role), role }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message ?? "Couldn't save.");
  return body.profile as Profile;
}
