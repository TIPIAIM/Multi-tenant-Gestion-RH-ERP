import { useEffect, useRef, useState } from "react";
import { Camera, Trash2, UserRound } from "lucide-react";
import "./agent-creation-photo.css";

export function validateAgentCreationPhoto(file: Pick<File, "size" | "type">): string | null {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Choisissez une photo JPEG, PNG ou WebP.";
  if (file.size === 0 || file.size > 2 * 1024 * 1024) return "La photo doit contenir des données et ne pas dépasser 2 Mo.";
  return null;
}

export default function AgentCreationPhoto({ file, onChange, disabled }: {
  file: File | null; onChange: (file: File | null) => void; disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <section className="agent-creation-photo" aria-label="Photo de profil facultative">
    <div className="agent-creation-photo-preview">
      {preview?.file === file && preview ? <img src={preview.url} alt="Aperçu de la photo de l’agent" onError={() => {
        if (disabled) return;
        setError("Cette image ne peut pas être affichée. Choisissez un autre fichier."); onChange(null);
      }} /> : <UserRound size={30} aria-hidden="true" />}
    </div>
    <div className="agent-creation-photo-content">
      <strong>Photo de profil <span>Facultative</span></strong>
      <p>JPEG, PNG ou WebP · 2 Mo maximum</p>
      <div className="agent-creation-photo-actions">
        <button type="button" disabled={disabled} onClick={() => input.current?.click()}><Camera size={16} aria-hidden="true" />{file ? "Changer la photo" : "Ajouter une photo"}</button>
        {file && <button type="button" disabled={disabled} onClick={() => { onChange(null); setError(null); }}><Trash2 size={15} aria-hidden="true" />Retirer</button>}
      </div>
      {file && <small className="agent-creation-photo-filename">{file.name}</small>}
      {error && <p role="alert" className="agent-creation-photo-error">{error}</p>}
    </div>
    <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" disabled={disabled}
      aria-label="Choisir la photo de profil" onChange={event => {
        const next = event.currentTarget.files?.[0]; event.currentTarget.value = "";
        if (!next) return;
        const problem = validateAgentCreationPhoto(next);
        setError(problem);
        if (!problem) onChange(next);
      }} />
  </section>;
}
