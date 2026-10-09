"use client";

// Text box with a mic. Chrome / Android / Safari: the browser's speech recognition writes words
// live as you speak. If that isn't there or fails (no speech service, language not supported,
// Brave, Firefox), it records audio instead and Gemini transcribes it.

import { useEffect, useRef, useState } from "react";
import { blobToDataUrl, toWavDataUrl } from "@/lib/audio";
import { Spinner, field } from "./ui";

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

const LANGS = [
  { code: "en-IN", label: "English" },
  { code: "kn-IN", label: "Kannada" },
  { code: "hi-IN", label: "Hindi" },
];

// Speech-service errors where recording + Gemini still works.
const USE_RECORDER = new Set(["network", "service-not-allowed", "language-not-supported", "bad-grammar"]);
const MAX_RECORD_SECONDS = 60;

function getRecognition(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const join = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join(" ");

export function VoiceInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  const [lang, setLang] = useState("en-IN");
  const [state, setState] = useState<"idle" | "listening" | "recording" | "transcribing">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Rec | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const wantRef = useRef(false); // user hasn't pressed Stop yet
  const recorderOnlyRef = useRef(false); // speech service failed once: record from now on
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(
    () => () => {
      wantRef.current = false;
      recRef.current?.abort();
      if (mediaRef.current?.state === "recording") mediaRef.current.stop();
    },
    [],
  );

  async function start() {
    setError(null);
    if (!window.isSecureContext) {
      setError("Voice only works on a secure (https) page. Type the note, or open the app over https.");
      return;
    }
    const Recognition = getRecognition();
    if (Recognition && !recorderOnlyRef.current) listen(Recognition);
    else await record();
  }

  /* Browser speech recognition, live text. Android Chrome stops after each pause and repeats
     words in continuous mode, so there it runs one phrase at a time and restarts until Stop. */
  function listen(Recognition: new () => Rec) {
    const android = /android/i.test(navigator.userAgent);
    wantRef.current = true;
    let base = valueRef.current;
    let quietRuns = 0;

    const run = () => {
      const rec = new Recognition();
      rec.lang = lang;
      rec.continuous = !android;
      rec.interimResults = true;
      let heard = "";
      rec.onresult = (e) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) text = join(text, e.results[i][0].transcript);
        heard = text;
        onChange(join(base, text));
      };
      rec.onerror = (e) => {
        if (USE_RECORDER.has(e.error)) {
          recorderOnlyRef.current = true;
          wantRef.current = false;
          setError("Live voice isn't available here, so it will record instead. Tap Speak again.");
        } else if (e.error === "not-allowed") {
          wantRef.current = false;
          setError("Microphone is blocked. Allow it for this site in the browser settings.");
        } else if (e.error === "audio-capture") {
          wantRef.current = false;
          setError("No microphone found. Type the note instead.");
        }
      };
      rec.onend = () => {
        base = join(base, heard);
        quietRuns = heard ? 0 : quietRuns + 1;
        if (wantRef.current && android && quietRuns < 2) {
          run(); // next phrase; keeps going until Stop or two quiet pauses
          return;
        }
        if (wantRef.current && !heard && quietRuns > 0 && !valueRef.current) setError("Didn't hear anything. Tap Speak and try again.");
        wantRef.current = false;
        recRef.current = null;
        setState("idle");
      };
      recRef.current = rec;
      try {
        rec.start();
      } catch {
        // Couldn't start (already running or blocked): fall back to recording.
        recorderOnlyRef.current = true;
        wantRef.current = false;
        recRef.current = null;
        setState("idle");
        void record();
      }
    };

    setState("listening");
    run();
  }

  /* Fallback: record, convert to WAV, Gemini transcribes. Stops by itself after a minute. */
  async function record() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser can't record voice. Type the note instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError("Microphone is blocked. Allow it for this site in the browser settings.");
      return;
    }
    const media = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    const startedAt = Date.now();
    const tick = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(s);
      if (s >= MAX_RECORD_SECONDS && media.state === "recording") media.stop();
    }, 500);
    media.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    media.onstop = async () => {
      clearInterval(tick);
      stream.getTracks().forEach((t) => t.stop());
      mediaRef.current = null;
      if (chunks.length === 0) {
        setState("idle");
        return;
      }
      setState("transcribing");
      try {
        const blob = new Blob(chunks, { type: media.mimeType || "audio/webm" });
        const audio = await toWavDataUrl(blob).catch(() => blobToDataUrl(blob));
        const resp = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio, lang }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.message);
        if (data.text) onChange(join(valueRef.current, data.text));
        else setError("Didn't catch that. Speak a little closer to the phone and try again.");
      } catch (err) {
        const msg = (err as Error).message ?? "";
        setError(
          /GEMINI_API_KEY|quota/i.test(msg) ? msg : "Couldn't turn the voice note into text. Type instead, or try again.",
        );
      }
      setState("idle");
    };
    mediaRef.current = media;
    media.start();
    setSeconds(0);
    setState("recording");
  }

  function stop() {
    wantRef.current = false;
    recRef.current?.stop();
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
    if (state === "listening") setState("idle");
  }

  const active = state === "listening" || state === "recording";

  return (
    <div>
      <label className="mb-1.5 block font-semibold" htmlFor={`voice-${label}`}>
        {label}
      </label>
      <textarea
        id={`voice-${label}`}
        className={`${field} min-h-[104px] resize-y leading-relaxed`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={active ? stop : start}
          disabled={state === "transcribing"}
          aria-pressed={active}
          className={`inline-flex min-h-12 items-center gap-2 rounded-full px-5 py-2.5 font-semibold transition-[background-color,transform] duration-200 active:scale-[0.98] ${
            active ? "pulse-ring bg-chilli text-white" : "bg-leaf text-white shadow-glow hover:bg-leaf-dark"
          }`}
        >
          {state === "transcribing" ? (
            <Spinner />
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
            </svg>
          )}
          {active ? "Stop" : state === "transcribing" ? "Writing it down" : "Speak"}
        </button>
        <select
          aria-label="Voice language"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          disabled={active}
          className="min-h-12 rounded-full border border-line bg-white px-4 text-[15px] transition-colors duration-200 hover:border-leaf-200"
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        {state === "listening" ? <span className="text-[14.5px] font-semibold text-chilli">Listening</span> : null}
        {state === "recording" ? (
          <span className="nums text-[14.5px] font-semibold text-chilli">
            Recording 0:{String(seconds).padStart(2, "0")}, tap Stop when done
          </span>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-[14.5px] text-chilli">{error}</p> : null}
    </div>
  );
}
