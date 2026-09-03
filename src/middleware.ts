import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/pipeline", "/financeiro", "/agenda", "/dashboard", "/whatsapp", "/agendamento", "/procedimentos", "/configuracoes", "/pacientes"];

// Cloudflare Turnstile (bot check on the public /agendar booking form) loads a
// script and an iframe from this origin. Only relaxed for that route.
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

function buildCsp(nonce: string, allowTurnstile: boolean) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // React's dev-mode debugging features (e.g. reconstructing stack traces) use eval();
  // it never runs eval() in production, so this stays scoped to development.
  const devEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  const turnstileScript = allowTurnstile ? ` ${TURNSTILE_ORIGIN}` : "";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}${turnstileScript}`,
    "style-src 'self' 'unsafe-inline'",
    // heic-to/csp converte foto de iPhone (HEIC) num Web Worker criado via blob:
    "worker-src 'self' blob:",
    `img-src 'self' data: blob: ${supabaseUrl}`,
    `media-src 'self' ${supabaseUrl}`,
    `connect-src 'self' ${supabaseUrl}${allowTurnstile ? ` ${TURNSTILE_ORIGIN}` : ""}`,
    "frame-ancestors 'none'",
  ];
  if (allowTurnstile) directives.push(`frame-src ${TURNSTILE_ORIGIN}`);
  return directives.join("; ");
}

export const runtime = "experimental-edge";

export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const allowTurnstile = request.nextUrl.pathname.startsWith("/agendar");
  const csp = buildCsp(nonce, allowTurnstile);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(`${prefix}/`),
  );
  if (isProtected) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request: { headers: requestHeaders } });
            response.headers.set("Content-Security-Policy", csp);
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
