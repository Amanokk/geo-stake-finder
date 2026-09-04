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

/**
 * Compartilha a foto carimbada (ideal para WhatsApp):
 * - No app Android: salva em arquivo temporário e abre o compartilhamento nativo,
 *   onde o usuário escolhe o WhatsApp.
 * - No navegador: usa Web Share com arquivos (abre a lista de apps, incluindo WhatsApp).
 */
export async function sharePhoto(
  dataUrl: string,
  fileName: string,
  text?: string,
): Promise<SaveResult> {
  const name = `${sanitize(fileName)}.jpg`;

  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const base64 = dataUrl.split(",")[1] ?? "";
      const written = await Filesystem.writeFile({
        path: `share/${name}`,
        data: base64,
        directory: Directory.Cache,
        recursive: true,
      });
      await Share.share({ title: name, text, url: written.uri, dialogTitle: "Enviar para o WhatsApp" });
      return { ok: true, message: "Escolha o WhatsApp para enviar." };
    } catch (e) {
      if (e instanceof Error && /cancel/i.test(e.message)) {
        return { ok: false, message: "Compartilhamento cancelado." };
      }
      return { ok: false, message: e instanceof Error ? e.message : "Falha ao compartilhar." };
    }
  }

  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], name, { type: "image/jpeg" });
    const nav = navigator as Navigator & {
      canShare?: (data: { files?: File[] }) => boolean;
      share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
    };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: name, text });
      return { ok: true, message: "Compartilhado." };
    }
    return { ok: false, message: "Seu navegador não permite enviar fotos para outros apps." };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, message: "Compartilhamento cancelado." };
    }
    return { ok: false, message: e instanceof Error ? e.message : "Falha ao compartilhar." };
  }
}
