const KEY = "estacagps:photos";

export type PhotoLogEntry = {
  file: string;
  timestamp: string; // ISO
  lat: number | null;
  lng: number | null;
  street: string | null;
  estaca: string | null;
};

export function getPhotoLog(): PhotoLogEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as PhotoLogEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addPhotoLog(entry: PhotoLogEntry) {
  if (typeof localStorage === "undefined") return;
  const list = getPhotoLog();
  list.push(entry);
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-2000)));
  } catch {
    /* armazenamento cheio: ignora */
  }
}

function cell(v: string | number | null) {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function fmt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Gera e baixa um CSV com data/hora, GPS, rua e estaca de todas as fotos salvas. */
export function exportPhotoLogCsv(): number {
  const list = getPhotoLog();
  const header = ["Arquivo", "Data/hora", "Latitude", "Longitude", "Rua", "Estaca"];
  const rows = list.map((e) =>
    [cell(e.file), cell(fmt(e.timestamp)), cell(e.lat), cell(e.lng), cell(e.street), cell(e.estaca)].join(","),
  );
  const csv = "\uFEFF" + [header.map(cell).join(","), ...rows].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `estacas-fotos-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return list.length;
}
