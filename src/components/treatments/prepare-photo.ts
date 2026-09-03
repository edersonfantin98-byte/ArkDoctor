import imageCompression from "browser-image-compression";

export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 400 * 1024;

function isHeic(file: File): boolean {
  return (
    /image\/heic|image\/heif/i.test(file.type) ||
    /\.(heic|heif)$/i.test(file.name)
  );
}

export function assertAcceptableInput(file: File): void {
  if (!file.type.startsWith("image/") && !isHeic(file)) {
    throw new Error("O arquivo não é uma imagem.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("A imagem é muito grande (máx. 25 MB).");
  }
}

export function assertAcceptableOutput(bytes: number): void {
  if (bytes > MAX_OUTPUT_BYTES) {
    throw new Error("Não foi possível reduzir esta foto o suficiente. Tente outra imagem.");
  }
}

export async function prepareTreatmentPhoto(file: File): Promise<Blob> {
  assertAcceptableInput(file);

  let working: Blob = file;
  if (isHeic(file)) {
    try {
      // heic-to/csp: build sem eval/Function nem WebAssembly (wasm2js),
      // compatível com o CSP restrito. Precisa de `worker-src blob:`.
      const { heicTo } = await import("heic-to/csp");
      working = await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
    } catch {
      throw new Error(
        "Não foi possível processar esta foto. Exporte como JPEG e tente de novo.",
      );
    }
  }

  const asFile =
    working instanceof File
      ? working
      : new File([working], "photo.jpg", { type: "image/jpeg" });

  const compressed = await imageCompression(asFile, {
    maxWidthOrHeight: 800,
    maxSizeMB: 0.2,
    initialQuality: 0.8,
    useWebWorker: true,
  });

  assertAcceptableOutput(compressed.size);
  return compressed;
}
