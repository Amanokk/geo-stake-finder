import { Capacitor } from "@capacitor/core";

export const GALLERY_FOLDER = "EstacaGPS";

function sanitize(name: string) {
  const clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return (clean || "foto").slice(0, 60);
}

export type SaveResult = { ok: boolean; message: string };

/**
 * Salva a foto carimbada:
 * - No app Android (Capacitor): grava em Pictures/EstacaGPS, visível na galeria.
 * - No navegador: usa o compartilhamento nativo (permite "Salvar imagem") ou baixa o arquivo.
 */
export async function savePhoto(dataUrl: string, fileName: string): Promise<SaveResult> {
  const name = `${sanitize(fileName)}.jpg`;

  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const base64 = dataUrl.split(",")[1] ?? "";
      try {
        await Filesystem.writeFile({
          path: `Pictures/${GALLERY_FOLDER}/${name}`,
          data: base64,
          directory: Directory.ExternalStorage,
          recursive: true,
        });
        return { ok: true, message: `Salvo na galeria em Pictures/${GALLERY_FOLDER}/${name}` };
      } catch {
        await Filesystem.writeFile({
          path: `${GALLERY_FOLDER}/${name}`,
          data: base64,
          directory: Directory.Documents,
          recursive: true,
        });
        return { ok: true, message: `Salvo em Documentos/${GALLERY_FOLDER}/${name}` };
      }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Falha ao salvar a foto." };
    }
  }

  // Navegador: tenta o compartilhamento nativo (Android/iOS permitem salvar na galeria)
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], name, { type: "image/jpeg" });
    const nav = navigator as Navigator & {
      canShare?: (data: { files?: File[] }) => boolean;
      share?: (data: { files?: File[]; title?: string }) => Promise<void>;
    };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: name });
      return { ok: true, message: "Escolha “Salvar imagem” para guardar na galeria." };
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, message: "Salvamento cancelado." };
    }
  }

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = name;
  a.click();
  return { ok: true, message: `Baixado como ${name}` };
}
