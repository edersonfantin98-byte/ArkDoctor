"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { prepareTreatmentPhoto } from "./prepare-photo";
import {
  deleteTreatmentPhotoAction,
  listTreatmentPhotosAction,
  updatePhotoMetaAction,
  uploadTreatmentPhotoAction,
} from "@/app/(app)/pacientes/[id]/actions";

type Photo = { id: string; url: string; caption: string | null; takenOn: string | null };

export function TreatmentPhotos({
  treatmentId,
  initialPhotos,
}: {
  treatmentId: string;
  initialPhotos: Photo[];
}) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [meta, setMeta] = useState<Record<string, { caption: string; takenOn: string }>>(() =>
    Object.fromEntries(
      initialPhotos.map((p) => [p.id, { caption: p.caption ?? "", takenOn: p.takenOn ?? "" }]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keep per-photo edit state in sync as photos are added/removed, preserving in-progress edits
    setMeta((prev) =>
      Object.fromEntries(
        photos.map((p) => [
          p.id,
          prev[p.id] ?? { caption: p.caption ?? "", takenOn: p.takenOn ?? "" },
        ]),
      ),
    );
  }, [photos]);

  async function saveMeta(id: string, patch: Partial<{ caption: string; takenOn: string }>) {
    const current = meta[id] ?? { caption: "", takenOn: "" };
    const nextMeta = { ...current, ...patch };
    setMeta((prev) => ({ ...prev, [id]: nextMeta }));
    setError(null);
    const caption = nextMeta.caption.trim() || null;
    const takenOn = nextMeta.takenOn || null;
    try {
      await updatePhotoMetaAction(id, { caption, takenOn });
      setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, caption, takenOn } : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar legenda");
    }
  }

  async function refresh() {
    setPhotos(await listTreatmentPhotosAction(treatmentId));
  }

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const blob = await prepareTreatmentPhoto(file);
      const formData = new FormData();
      formData.set("file", blob, "photo.jpg");
      await uploadTreatmentPhotoAction(treatmentId, formData);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar foto");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteTreatmentPhotoAction(id);
      setPhotos((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover foto");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Fotos</h2>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Enviando…" : "Adicionar foto"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma foto.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p) => (
            <figure key={p.id} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.caption ?? "Foto do tratamento"}
                className="aspect-square w-full rounded-md object-cover"
              />
              <figcaption className="space-y-1 text-xs">
                <input
                  defaultValue={p.caption ?? ""}
                  placeholder="Legenda"
                  className="w-full rounded border px-1 py-0.5"
                  onBlur={(e) => void saveMeta(p.id, { caption: e.target.value })}
                />
                <div className="flex items-center justify-between gap-1">
                  <input
                    type="date"
                    defaultValue={p.takenOn ?? ""}
                    className="rounded border px-1 py-0.5"
                    onBlur={(e) => void saveMeta(p.id, { takenOn: e.target.value })}
                  />
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    onClick={() => handleDelete(p.id)}
                  >
                    remover
                  </button>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
