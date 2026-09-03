import type { WhatsappMediaStorage } from "./storage";

export function createFakeWhatsappMediaStorage(): WhatsappMediaStorage & {
  objects: Map<string, { bytes: Uint8Array; mime: string }>;
} {
  const objects = new Map<string, { bytes: Uint8Array; mime: string }>();
  return {
    objects,
    async upload(path, bytes, mime) {
      objects.set(path, { bytes, mime });
    },
    async createSignedUrls(paths) {
      return paths.map((p) => (objects.has(p) ? `https://signed.test/${p}` : null));
    },
    async remove(paths) {
      paths.forEach((p) => objects.delete(p));
    },
  };
}
