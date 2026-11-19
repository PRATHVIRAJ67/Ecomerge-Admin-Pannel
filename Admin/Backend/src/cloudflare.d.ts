// Minimal declarations for Cloudflare runtime modules (resolved by Wrangler at build time).
declare module 'cloudflare:node' {
  export function httpServerHandler(options: { port: number } | import('node:http').Server): { fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> };
}
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}
