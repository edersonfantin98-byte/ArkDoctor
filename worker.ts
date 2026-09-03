// Entrypoint do Cloudflare Worker.
// - `fetch`: delega para o worker gerado pelo OpenNext (Next.js).
// - `scheduled`: Cron Trigger diário que dispara a retenção de mídia do WhatsApp.
//   O worker do OpenNext não exporta `scheduled`; por isso este wrapper.
import openNextWorker from "./.open-next/worker.js";

export * from "./.open-next/worker.js";

interface CronEnv {
  APP_URL: string;
  MEDIA_RETENTION_SECRET: string;
}

export default {
  fetch: (request: Request, env: unknown, ctx: unknown) =>
    (openNextWorker as { fetch: (r: Request, e: unknown, c: unknown) => Promise<Response> }).fetch(
      request,
      env,
      ctx,
    ),

  async scheduled(_event: unknown, env: CronEnv, ctx: { waitUntil: (p: Promise<unknown>) => void }) {
    ctx.waitUntil(
      fetch(`${env.APP_URL}/api/whatsapp/media-retention`, {
        method: "POST",
        headers: { "x-cron-secret": env.MEDIA_RETENTION_SECRET },
      })
        .then(async (r) => console.log("[cron] media-retention:", r.status, await r.text()))
        .catch((err) => console.error("[cron] media-retention falhou:", err)),
    );
  },
};
