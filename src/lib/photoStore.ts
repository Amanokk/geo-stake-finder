// Armazenamento local (IndexedDB) das fotos capturadas, para a tela de Fotos.

export type StoredPhoto = {
  id: string;
  file: string;
  timestamp: string; // ISO do momento da captura
  stampDate: string; // ISO da data carimbada na imagem
  lat: number | null;
  lng: number | null;
  street: string | null;
  estaca: string | null;
  stamped: string; // dataURL com carimbo
  raw: string | null; // dataURL original
  box: { x: number; y: number; w: number; h: number; fontSize: number } | null;
};

const DB = "estacagps";
const STORE = "photos";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function putPhoto(p: StoredPhoto) {
  try {
    await tx("readwrite", (s) => s.put(p) as IDBRequest<IDBValidKey>);
  } catch {
    /* sem espaço / sem IndexedDB */
  }
}

export async function listPhotos(): Promise<StoredPhoto[]> {
  try {
    const all = await tx<StoredPhoto[]>("readonly", (s) => s.getAll() as IDBRequest<StoredPhoto[]>);
    return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch {
    return [];
  }
}

export async function deletePhoto(id: string) {
  try {
    await tx("readwrite", (s) => s.delete(id) as unknown as IDBRequest<undefined>);
  } catch {
    /* ignora */
  }
}

/** Redesenha a etiqueta da estaca no canto superior esquerdo da foto carimbada. */
export function retouchEstaca(photo: StoredPhoto, novaEstaca: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas indisponível"));
      ctx.drawImage(img, 0, 0);
      const box = photo.box ?? {
        x: Math.round(canvas.width * 0.015),
        y: Math.round(canvas.width * 0.015),
        w: Math.round(canvas.width * 0.25),
        h: Math.round(canvas.width * 0.0475),
        fontSize: Math.round(canvas.width * 0.035),
      };
      const text = novaEstaca || "Sem estaca";
      ctx.font = `800 ${box.fontSize}px system-ui, sans-serif`;
      const padX = box.fontSize * 0.43;
      const newW = ctx.measureText(text).width + padX * 2;
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(box.x, box.y, Math.max(box.w, newW), box.h);
      ctx.fillStyle = "#facc15";
      ctx.textBaseline = "middle";
      ctx.fillText(text, box.x + padX, box.y + box.h / 2);
      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = () => reject(new Error("Falha ao carregar a foto"));
    img.src = photo.stamped;
  });
}
