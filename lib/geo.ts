// Locations, distances and Google Maps links. No API key: plain maps.google.com URLs.

import { BENGALURU_AREAS } from "./types";

export interface Point {
  lat: number;
  lng: number;
}

/** Roads in Bengaluru are rarely straight: road distance is about 1.3x the straight line. */
export const ROAD_FACTOR = 1.3;

export function isPoint(lat: unknown, lng: unknown): boolean {
  return typeof lat === "number" && typeof lng === "number" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0);
}

/** Centre of a Bengaluru area, used when a shop or donor has no exact location. */
export function areaPoint(area: string): Point | null {
  const p = BENGALURU_AREAS[area];
  return p ? { lat: p[0], lng: p[1] } : null;
}

/** Straight-line km (haversine). */
export function straightKm(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Approximate road km, one decimal. */
export function roadKm(a: Point, b: Point): number {
  return Math.round(straightKm(a, b) * ROAD_FACTOR * 10) / 10;
}

const ll = (p: Point) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** Opens Google Maps with a pin on the place. */
export function mapsPin(p: Point): string {
  return `https://www.google.com/maps/search/?api=1&query=${ll(p)}`;
}

/** Opens Google Maps directions from the donor to the shop. */
export function mapsDirections(from: Point | null, to: Point): string {
  return `https://www.google.com/maps/dir/?api=1${from ? `&origin=${ll(from)}` : ""}&destination=${ll(to)}`;
}

/** Small map for an iframe (no API key needed). */
export function mapsEmbed(p: Point): string {
  return `https://maps.google.com/maps?q=${ll(p)}&z=16&output=embed`;
}
