// Small helpers shared by API routes.
import "server-only";
import { NextResponse } from "next/server";
import { GeminiError } from "./gemini";
import { SetupError } from "./store";

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function fail(err: unknown) {
  if (err instanceof GeminiError) {
    const status = err.code === "no_key" ? 503 : err.code === "rate_limited" ? 429 : 502;
    return json({ code: err.code, message: err.message }, status);
  }
  if (err instanceof SetupError) {
    console.error(err.message);
    return json({ code: "setup", message: err.message }, 503);
  }
  console.error(err);
  return json({ code: "failed", message: "Something went wrong on the server. Try again." }, 500);
}

export const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
