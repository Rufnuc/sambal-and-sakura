// Runs once when the Next.js server starts (see node_modules/next/dist/docs/.../instrumentation.md).

export async function register() {
  // Background jobs only in the real Node.js server, never while building.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { startJobs } = await import("@/server/jobs");
  startJobs();
}

// Every unhandled server error becomes one structured log line (searchable in Render's logs).
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  const e = err as Error & { digest?: string };
  console.error(JSON.stringify({
    t: new Date().toISOString(), level: "error", event: "unhandled_error",
    method: request.method, path: request.path.split("?")[0], route: context.routePath, type: context.routeType,
    error: `${e?.name ?? "Error"}: ${e?.message ?? String(err)}`.slice(0, 500), digest: e?.digest,
  }));
}
