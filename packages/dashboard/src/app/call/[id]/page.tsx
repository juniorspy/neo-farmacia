"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import { Phone, PhoneOff, Loader2, PhoneMissed, CheckCircle2, AlertCircle, Mic } from "lucide-react";

/**
 * Public customer call surface: /call/:id?t=<signed token>.
 * v3 (LiveKit pipeline): answering mints a scoped LiveKit room token from our
 * backend; the browser joins the room and the Python agent worker joins the
 * same room with the pharmacy's voice_config. Audio flows browser ⇄ LiveKit.
 *
 * Authed ONLY by the link token, so it does NOT use the JWT api client.
 */

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

type Phase =
  | "loading"
  | "ringing"
  | "answering"
  | "connecting"
  | "active"
  | "rejected"
  | "ended"
  | "missed"
  | "expired"
  | "mic_denied"
  | "error";

interface SessionView {
  sessionId: string;
  status: string;
  reason: string;
  storeName?: string;
}

interface TokenView {
  token: string;
  url: string;
  room: string;
}

function statusToPhase(status: string): Phase {
  switch (status) {
    case "ringing": return "ringing";
    case "connecting":
    case "active": return "connecting";
    case "rejected": return "rejected";
    case "missed": return "missed";
    case "expired": return "expired";
    case "ended":
    case "failed": return "ended";
    default: return "error";
  }
}

export default function CallPage() {
  const params = useParams();
  const id = String(params.id);

  const [token, setToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<SessionView | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const roomRef = useRef<Room | null>(null);
  const endingRef = useRef(false); // true while WE initiate the disconnect
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Read the signed token from the URL (client-only — avoids useSearchParams Suspense).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    if (!t) { setErrorMsg("Enlace inválido: falta el código de acceso."); setPhase("error"); return; }
    setToken(t);
  }, []);

  const call = useCallback(
    async <T,>(path: string, method: "GET" | "POST"): Promise<T> => {
      const res = await fetch(`${API}/api/v1/voice-calls/${id}${path}?t=${encodeURIComponent(token!)}`, { method });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(body.error || `Error ${res.status}`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      return body as T;
    },
    [id, token],
  );

  const teardown = useCallback(() => {
    endingRef.current = true;
    roomRef.current?.disconnect();
    roomRef.current = null;
  }, []);

  // Initial resolve.
  useEffect(() => {
    if (!token) return;
    call<SessionView>("", "GET")
      .then((s) => { setSession(s); setPhase(statusToPhase(s.status)); })
      .catch((e: Error & { status?: number }) => {
        setErrorMsg(e.status === 404 ? "Enlace inválido o vencido." : "No pudimos cargar la llamada.");
        setPhase("error");
      });
  }, [token, call]);

  // Tear down the room on unmount.
  useEffect(() => teardown, [teardown]);

  /** Mic permission → backend LiveKit token → join the room. */
  const startVoice = useCallback(async () => {
    // 1. Ask for the microphone up-front so denial is a handled state (the
    //    browser caches the grant; LiveKit re-acquires its own track below).
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());
    } catch {
      setPhase("mic_denied");
      return;
    }

    // 2. Scoped room token from our backend (carries context + voice_config
    //    in metadata for the agent worker — the browser never sees raw keys).
    let tok: TokenView;
    try {
      tok = await call<TokenView>("/token", "GET");
    } catch (e) {
      const err = e as Error & { status?: number };
      setErrorMsg(
        err.status === 503
          ? "La voz aún no está configurada."
          : `No se pudo iniciar la sesión de voz${err.message ? ` — ${err.message}` : "."}`,
      );
      setPhase("error");
      return;
    }

    // 3. Join the LiveKit room; the agent worker joins on the other side.
    try {
      const room = new Room();
      roomRef.current = room;
      endingRef.current = false;

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio && remoteAudioRef.current) {
          track.attach(remoteAudioRef.current);
          remoteAudioRef.current.play().catch(() => {});
        }
      });
      room.on(RoomEvent.Disconnected, () => {
        if (endingRef.current) return; // we hung up — phase already set
        setPhase("ended");
      });

      await room.connect(tok.url, tok.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setPhase("active");
    } catch {
      setErrorMsg("No se pudo conectar la llamada.");
      setPhase("error");
      teardown();
    }
  }, [call, teardown]);

  async function answer() {
    setPhase("answering");
    try {
      await call<SessionView>("/answer", "POST");
      setPhase("connecting");
      await startVoice();
    } catch (e) {
      const status = (e as Error & { status?: number }).status;
      if (status === 410) setPhase("expired");
      else if (status === 409) {
        const s = await call<SessionView>("", "GET").catch(() => null);
        setPhase(s ? statusToPhase(s.status) : "error");
      } else { setErrorMsg("No se pudo contestar la llamada."); setPhase("error"); }
    }
  }

  async function reject() {
    try { await call("/reject", "POST"); setPhase("rejected"); }
    catch { const s = await call<SessionView>("", "GET").catch(() => null); setPhase(s ? statusToPhase(s.status) : "error"); }
  }

  async function hangup() {
    teardown();
    await call("/end", "POST").catch(() => {});
    setPhase("ended");
  }

  const storeName = session?.storeName || "la farmacia";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800 p-6 text-white">
      {/* Remote audio sink (agent voice) */}
      <audio ref={remoteAudioRef} autoPlay />

      <div className="w-full max-w-sm text-center">
        <div
          className={`mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500/20 ring-4 ring-emerald-500/30 ${
            phase === "active" ? "animate-pulse" : ""
          }`}
        >
          <Phone className="h-10 w-10 text-emerald-400" />
        </div>
        <h1 className="text-xl font-semibold">Asistente de {storeName}</h1>
        {session?.reason && phase !== "error" && (
          <p className="mt-2 text-sm text-slate-300">{session.reason}</p>
        )}

        <div className="mt-10">
          {phase === "loading" && <Spinner text="Cargando…" />}

          {phase === "ringing" && (
            <>
              <p className="mb-8 animate-pulse text-emerald-300">Llamada entrante…</p>
              <div className="flex items-center justify-center gap-10">
                <button onClick={reject} aria-label="Rechazar"
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 transition hover:bg-red-600">
                  <PhoneOff className="h-7 w-7" />
                </button>
                <button onClick={answer} aria-label="Contestar"
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 transition hover:bg-emerald-600">
                  <Phone className="h-7 w-7" />
                </button>
              </div>
              <div className="mt-3 flex justify-between px-2 text-xs text-slate-400">
                <span>Rechazar</span><span>Contestar</span>
              </div>
            </>
          )}

          {phase === "answering" && <Spinner text="Contestando…" />}
          {phase === "connecting" && <Spinner text="Conectando con el asistente…" />}

          {phase === "active" && (
            <div className="space-y-6">
              <div className="flex items-center justify-center gap-2 text-emerald-300">
                <Mic className="h-5 w-5" /> En llamada
              </div>
              <button onClick={hangup} aria-label="Colgar"
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500 transition hover:bg-red-600">
                <PhoneOff className="h-7 w-7" />
              </button>
              <p className="text-xs text-slate-400">Colgar</p>
            </div>
          )}

          {phase === "rejected" && <Result icon={<PhoneOff className="text-slate-400" />} text="Llamada rechazada." />}
          {phase === "ended" && <Result icon={<CheckCircle2 className="text-emerald-400" />} text="Llamada finalizada." />}
          {phase === "missed" && <Result icon={<PhoneMissed className="text-amber-400" />} text="La llamada expiró sin contestar." />}
          {phase === "expired" && <Result icon={<AlertCircle className="text-amber-400" />} text="Este enlace venció. Pide uno nuevo por WhatsApp." />}
          {phase === "mic_denied" && <Result icon={<AlertCircle className="text-amber-400" />} text="Necesitamos permiso del micrófono para la llamada." />}
          {phase === "error" && <Result icon={<AlertCircle className="text-red-400" />} text={errorMsg || "Ocurrió un error."} />}
        </div>
      </div>
    </div>
  );
}

function Spinner({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 text-slate-300">
      <Loader2 className="h-5 w-5 animate-spin" /> {text}
    </div>
  );
}

function Result({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="space-y-3">
      <div className="mx-auto flex h-10 w-10 items-center justify-center [&>svg]:h-8 [&>svg]:w-8">{icon}</div>
      <p className="text-slate-200">{text}</p>
    </div>
  );
}
