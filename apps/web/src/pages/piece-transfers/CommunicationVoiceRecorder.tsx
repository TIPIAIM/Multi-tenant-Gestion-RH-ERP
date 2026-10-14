import { useEffect, useRef, useState } from "react";
import { Mic, Send, Square, Trash2, LoaderCircle } from "lucide-react";

const MAX_SECONDS = 300;
const formats = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];
function clock(seconds: number) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }

export default function CommunicationVoiceRecorder({ disabled, remainingBytes, remainingFiles, onSend, onBusyChange }: {
  disabled: boolean; remainingBytes: number; remainingFiles: number;
  onSend: (file: File) => Promise<void>; onBusyChange: (busy: boolean) => void;
}) {
  const [phase, setPhase] = useState<"IDLE" | "PERMISSION" | "RECORDING" | "REVIEW">("IDLE");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState<{ file: File; url: string } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const urlRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const startedRef = useRef(0);
  const budgetRef = useRef(remainingBytes);
  budgetRef.current = remainingBytes;
  const onBusyRef = useRef(onBusyChange); onBusyRef.current = onBusyChange;

  function release() {
    const recorder = recorderRef.current;
    if (recorder) { recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null; if (recorder.state !== "inactive") recorder.stop(); }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null;
    chunksRef.current = [];
  }
  function cancel() {
    generationRef.current++; release();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null; setRecording(null); setSending(false); setPhase("IDLE"); setSeconds(0); setError(null); onBusyRef.current(false);
  }
  useEffect(() => () => { generationRef.current++; release(); if (urlRef.current) URL.revokeObjectURL(urlRef.current); onBusyRef.current(false); }, []);
  useEffect(() => {
    if (phase !== "RECORDING") return;
    const timer = window.setInterval(() => {
      const elapsed = Math.min(MAX_SECONDS, Math.floor((Date.now() - startedRef.current) / 1000));
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS && recorderRef.current?.state === "recording") recorderRef.current.stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [phase]);

  async function start() {
    if (disabled || phase !== "IDLE" || remainingFiles < 1 || remainingBytes <= 0) return;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("Enregistrement indisponible. Utilisez un navigateur récent et une connexion HTTPS (ou localhost)."); return; }
    const mimeType = formats.find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { setError("Ce navigateur ne prend pas en charge les formats vocaux proposés."); return; }
    const generation = ++generationRef.current;
    setPhase("PERMISSION"); onBusyRef.current(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (generation !== generationRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 });
      recorderRef.current = recorder; chunksRef.current = [];
      recorder.ondataavailable = event => {
        if (generation !== generationRef.current || !event.data.size) return;
        chunksRef.current.push(event.data);
        if (chunksRef.current.reduce((size, chunk) => size + chunk.size, 0) > budgetRef.current) { cancel(); setError("Le vocal dépasse la taille disponible. Enregistrez un message plus court."); }
      };
      recorder.onerror = () => { if (generation === generationRef.current) { cancel(); setError("L’enregistrement a été interrompu. Vous pouvez réessayer."); } };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop()); streamRef.current = null;
        if (generation !== generationRef.current) return;
        recorderRef.current = null;
        const type = (recorder.mimeType.split(";")[0] ?? "audio/webm").toLowerCase();
        const blob = new Blob(chunksRef.current, { type }); chunksRef.current = [];
        if (!blob.size || blob.size > budgetRef.current) { cancel(); setError("Vocal vide ou trop volumineux. Réessayez."); return; }
        const extension = type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm";
        const file = new File([blob], `Vocal-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`, { type });
        const url = URL.createObjectURL(blob); urlRef.current = url;
        setRecording({ file, url }); setPhase("REVIEW"); onBusyRef.current(true);
      };
      startedRef.current = Date.now(); setSeconds(0); recorder.start(1000); setPhase("RECORDING");
    } catch (cause) {
      if (generation !== generationRef.current) return;
      cancel();
      const name = (cause as { name?: string }).name;
      setError(name === "NotAllowedError" ? "Accès au microphone refusé. Autorisez-le dans les réglages du navigateur puis réessayez." : name === "NotFoundError" ? "Aucun microphone détecté." : "Le microphone est indisponible. Réessayez après avoir fermé les autres applications audio.");
    }
  }
  async function send() {
    if (!recording || disabled || sending) return;
    if (remainingFiles < 1 || recording.file.size > remainingBytes) { setError("Les pièces jointes dépassent la limite. Retirez un fichier ou raccourcissez le vocal."); return; }
    const generation = generationRef.current;
    setSending(true); setError(null);
    try { await onSend(recording.file); if (generation === generationRef.current) cancel(); }
    catch { if (generation === generationRef.current) setError("Envoi échoué. Le vocal est conservé ; vous pouvez réessayer."); }
    finally { if (generation === generationRef.current) setSending(false); }
  }
  return <div className={`communication-voice-recorder phase-${phase.toLowerCase()}`}>
    {phase === "IDLE" ? <button type="button" className="communication-voice-start" aria-label="Enregistrer un message vocal" title="Enregistrer un vocal" disabled={disabled || remainingFiles < 1 || remainingBytes <= 0} onClick={() => void start()}><Mic size={20}/></button> : <>
      <div className="communication-voice-status" role="status">{phase === "PERMISSION" ? <><LoaderCircle size={17} className="is-spinning"/> Autorisez le microphone…</> : phase === "RECORDING" ? <><span className="communication-recording-dot"/> Enregistrement <time>{clock(seconds)}</time><small>5 min maximum</small></> : <>Écoutez votre vocal avant l’envoi</>}</div>
      {phase === "REVIEW" && recording && <audio src={recording.url} controls preload="metadata" aria-label="Écouter le vocal avant envoi"/>}
      <div className="communication-voice-actions">
        <button type="button" onClick={cancel} disabled={sending} aria-label="Annuler le vocal" title="Annuler"><Trash2 size={17}/></button>
        {phase === "RECORDING" && <button type="button" onClick={() => recorderRef.current?.state === "recording" && recorderRef.current.stop()} aria-label="Arrêter l’enregistrement"><Square size={17}/> Arrêter</button>}
        {phase === "REVIEW" && <button type="button" disabled={disabled || sending} onClick={() => void send()} aria-label="Envoyer le vocal">{sending ? <LoaderCircle size={17} className="is-spinning"/> : <Send size={17}/>} Envoyer le vocal</button>}
      </div>
    </>}
    {error && <p className="communication-voice-error" role="alert">{error}</p>}
  </div>;
}
