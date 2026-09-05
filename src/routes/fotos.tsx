import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Download, Pencil, Share2, Trash2 } from "lucide-react";
import { deletePhoto, listPhotos, putPhoto, retouchEstaca, type StoredPhoto } from "@/lib/photoStore";
import { savePhoto, sharePhoto } from "@/lib/savePhoto";
import { addExif } from "@/lib/exif";

export const Route = createFileRoute("/fotos")({
  head: () => ({
    meta: [
      { title: "Fotos capturadas — Estaca GPS" },
      {
        name: "description",
        content:
          "Todas as fotos tiradas no campo com mapa da localização, data, coordenadas, rua e estaca, com opção de retocar a estaca.",
      },
      { property: "og:title", content: "Fotos capturadas — Estaca GPS" },
      {
        property: "og:description",
        content: "Galeria das fotos do Estaca GPS com mapa, dados de GPS e retoque da estaca.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FotosPage,
});

function staticMapUrl(lat: number, lng: number) {
  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=17&size=240x240&scale=2&maptype=hybrid&markers=color:yellow%7C${lat},${lng}&key=${key}`;
}

function fmt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function FotosPage() {
  const [photos, setPhotos] = useState<StoredPhoto[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void listPhotos().then(setPhotos);
  }, []);

  const refresh = () => void listPhotos().then(setPhotos);

  const applyRetouch = async (photo: StoredPhoto) => {
    const value = draft.trim();
    try {
      const stamped = await retouchEstaca(photo, value);
      await putPhoto({
        ...photo,
        estaca: value || null,
        stamped: addExif(stamped, {
          lat: photo.lat,
          lng: photo.lng,
          estaca: value || null,
          street: photo.street,
          date: new Date(photo.stampDate),
        }),
      });
      setEditing(null);
      setStatus("Estaca atualizada na foto.");
      refresh();
    } catch {
      setStatus("Não foi possível retocar a estaca.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-slate-950/95 px-4 py-4 backdrop-blur">
        <Link
          to="/"
          aria-label="Voltar ao mapa"
          className="grid h-10 w-10 place-items-center rounded-full bg-slate-900 text-yellow-300"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-black leading-tight">Fotos</h1>
          <p className="text-[11px] text-slate-400">
            {photos ? `${photos.length} foto(s) salvas no aparelho` : "Carregando…"}
          </p>
        </div>
      </header>

      {status && <p className="px-4 pb-2 text-[12px] text-yellow-300">{status}</p>}

      <div className="space-y-4 px-4 pb-16">
        {photos && photos.length === 0 && (
          <p className="rounded-2xl bg-slate-900 p-6 text-center text-sm text-slate-400">
            Nenhuma foto ainda. Tire uma foto pela câmera do mapa.
          </p>
        )}

        {photos?.map((p) => (
          <article key={p.id} className="overflow-hidden rounded-2xl bg-slate-900">
            <img
              src={p.stamped}
              alt={`Foto ${p.file} com carimbo da estaca ${p.estaca ?? "sem estaca"}`}
              className="w-full"
              loading="lazy"
            />
            <div className="flex gap-3 p-3">
              {p.lat !== null && p.lng !== null && (
                <img
                  src={staticMapUrl(p.lat, p.lng)}
                  alt="Mapa da localização da foto"
                  className="h-24 w-24 shrink-0 rounded-xl object-cover"
                  loading="lazy"
                />
              )}
              <dl className="min-w-0 flex-1 space-y-0.5 text-[12px] text-slate-300">
                <div className="text-base font-black text-yellow-300">{p.estaca ?? "Sem estaca"}</div>
                <div className="truncate font-semibold text-white">{p.street ?? "Rua não identificada"}</div>
                <div>Carimbo: {fmt(p.stampDate)}</div>
                <div>Capturada: {fmt(p.timestamp)}</div>
                <div className="tabular-nums">
                  GPS: {p.lat !== null ? p.lat.toFixed(6) : "--"}, {p.lng !== null ? p.lng.toFixed(6) : "--"}
                </div>
                <div className="truncate text-slate-500">{p.file}</div>
              </dl>
            </div>

            {editing === p.id ? (
              <div className="flex items-center gap-2 px-3 pb-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="E-1127"
                  className="min-w-0 flex-1 rounded-xl bg-slate-800 px-3 py-2 text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => void applyRetouch(p)}
                  aria-label="Salvar estaca retocada"
                  className="grid h-10 w-10 place-items-center rounded-full bg-yellow-300 text-slate-900"
                >
                  <Check size={18} />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 px-3 pb-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(p.id);
                    setDraft(p.estaca ?? "");
                  }}
                  className="flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-2 text-[12px] font-semibold"
                >
                  <Pencil size={14} /> Retocar estaca
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await savePhoto(p.stamped, p.file.replace(/\.jpg$/, ""));
                    setStatus(r.message);
                  }}
                  className="flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-2 text-[12px] font-semibold"
                >
                  <Download size={14} /> Salvar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await sharePhoto(
                      p.stamped,
                      p.file.replace(/\.jpg$/, ""),
                      [p.estaca, p.street, fmt(p.stampDate)].filter(Boolean).join(" · "),
                    );
                    setStatus(r.message);
                  }}
                  className="flex items-center gap-1.5 rounded-full bg-green-500 px-3 py-2 text-[12px] font-bold text-white"
                >
                  <Share2 size={14} /> Enviar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await deletePhoto(p.id);
                    refresh();
                  }}
                  aria-label="Apagar foto"
                  className="ml-auto grid h-10 w-10 place-items-center rounded-full bg-slate-800 text-red-300"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
