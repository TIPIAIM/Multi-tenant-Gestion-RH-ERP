import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, Play, Pause } from "lucide-react";
import { useAuth } from "../../features/auth/auth.context";
import { getCommunicationAttachmentPreview } from "../../features/piece-transfers/piece-transfer.api";

export default function CommunicationAudioAttachment({ transferId, messageId, index, attachment, onDownload }: {
  transferId: string; messageId?: string; index: number;
  attachment: { originalFileName: string; mimeType?: string; status?: string; canView: boolean; canDownload: boolean };
  onDownload: () => void;
}) {
  const { user } = useAuth();
  const [preview, setPreview] = useState<{ key: string; url: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [wave, setWave] = useState<number[]>([]);
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);
  const wantedRef = useRef(false);
  const key = `${user?.id}:${transferId}:${messageId}:${index}`;
  const url = preview?.key === key ? preview.url : null;
  const allowed = attachment.canView && attachment.status !== "DELETED";
  const time = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
  useEffect(() => {
    wantedRef.current = false; setPreview(null); setError(false); setLoading(false); setSpeed(1); setPlaying(false); setPosition(0); setDuration(0); setWave([]);
    return () => { controllerRef.current?.abort(); audioRef.current?.pause(); if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = null; };
  }, [transferId, messageId, index, user?.id, allowed]);
  useEffect(() => {
    if (url && allowed && wantedRef.current) void audioRef.current?.play()?.catch(() => { wantedRef.current = false; setPlaying(false); setError(true); });
  }, [url, allowed]);
  async function load() {
    if (!allowed || loading) return;
    controllerRef.current?.abort(); const controller = new AbortController(); controllerRef.current = controller;
    setLoading(true); setError(false);
    try {
      const blob = await getCommunicationAttachmentPreview(transferId, messageId, index, controller.signal);
      if (controller.signal.aborted) return;
      const next = URL.createObjectURL(new Blob([blob], { type: attachment.mimeType?.split(";")[0] || blob.type }));
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = next; setPreview({ key, url: next });
      // Decode only on demand. Failure leaves a neutral line, never a fabricated waveform.
      if (typeof AudioContext !== "undefined") {
        const context = new AudioContext();
        try {
          const decoded = await context.decodeAudioData(await blob.arrayBuffer());
          if (controller.signal.aborted) return;
          const samples = decoded.getChannelData(0);
          const values = Array.from({ length: 32 }, (_, bar) => {
            const start = Math.floor(bar * samples.length / 32), end = Math.floor((bar + 1) * samples.length / 32);
            let peak = 0;
            const stride = Math.max(1, Math.floor((end - start) / 600));
            for (let point = start; point < end; point += stride) peak = Math.max(peak, Math.abs(samples[point] ?? 0));
            return peak;
          });
          const maximum = Math.max(...values, .001);
          setWave(values.map(value => value / maximum)); setDuration(decoded.duration);
        } catch { /* Playback can remain available when waveform decoding is unsupported. */ }
        finally { await context.close().catch(() => {}); }
      }
    } catch { if (!controller.signal.aborted) { wantedRef.current = false; setError(true); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  function toggle() {
    if (!allowed) return;
    wantedRef.current = !wantedRef.current;
    setError(false);
    if (!url) { if (!loading) void load(); return; }
    const audio = audioRef.current;
    if (!audio) return;
    if (wantedRef.current) void audio.play().catch(() => { wantedRef.current = false; setPlaying(false); setError(true); });
    else audio.pause();
  }
  const bars = wave.length ? wave : Array.from({ length: 32 }, () => 0);
  const label = playing ? "Mettre le vocal en pause" : "Lire le vocal";
  return <div className="communication-audio-card communication-audio-compact" onClick={toggle}>
    {allowed && url && <audio ref={audioRef} src={url} preload="metadata" aria-label={`Écouter ${attachment.originalFileName}`} onLoadedMetadata={event => { if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration); }} onDurationChange={event => { if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration); }} onTimeUpdate={event => setPosition(event.currentTarget.currentTime)} onPause={() => { wantedRef.current = false; setPlaying(false); }} onEnded={() => { wantedRef.current = false; setPlaying(false); }} onError={() => setError(true)} onPlay={event => { wantedRef.current = true; setPlaying(true); document.querySelectorAll<HTMLAudioElement>(".communication-audio-card audio").forEach(audio => { if (audio !== event.currentTarget) audio.pause(); }); }}/>}
    <div className="communication-audio-compact-row">
      <button type="button" className="communication-audio-play" aria-label={label} disabled={!allowed} onClick={event => { event.stopPropagation(); toggle(); }}>{loading && !url ? <LoaderCircle size={18} className="is-spinning"/> : playing ? <Pause size={18}/> : <Play size={18}/>}</button>
      <button type="button" className="communication-audio-wave" aria-label={label + " · forme d’onde"} disabled={!allowed} onClick={event => { event.stopPropagation(); toggle(); }}>
        <svg viewBox="0 0 128 28" preserveAspectRatio="none" aria-hidden="true">{bars.map((value, bar) => { const height = 3 + value * 23; return <rect key={bar} x={bar * 4} y={(28 - height) / 2} width={2.5} height={height} rx={1.25} className={duration > 0 && bar / 32 < position / duration ? "is-played" : ""}/>; })}</svg>
      </button>
      <button type="button" className="communication-audio-speed" aria-label={`Vitesse de lecture ${speed} fois`} disabled={!url} onClick={event => { event.stopPropagation(); const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1; setSpeed(next); if (audioRef.current) audioRef.current.playbackRate = next; }}>{speed}×</button>
      {attachment.canDownload && attachment.status !== "DELETED" && <button type="button" className="communication-audio-download" aria-label={`Télécharger ${attachment.originalFileName}`} title="Télécharger" onClick={event => { event.stopPropagation(); onDownload(); }}><Download size={15}/></button>}
    </div>
    <div className="communication-audio-compact-meta" onClick={event => event.stopPropagation()}><span>{!allowed ? "Vocal indisponible" : loading && !url ? "Chargement…" : `${time(position)} / ${duration ? time(duration) : "—"}`}</span><input type="range" aria-label="Position dans le vocal" min={0} max={duration || 1} step={.1} value={Math.min(position, duration || 1)} disabled={!allowed || !url || !duration} onChange={event => { const value = Number(event.target.value); if (audioRef.current) audioRef.current.currentTime = value; setPosition(value); }}/></div>
    {error && <small role="alert">Lecture indisponible. Cliquez pour réessayer ou téléchargez le vocal.</small>}
  </div>;
}
