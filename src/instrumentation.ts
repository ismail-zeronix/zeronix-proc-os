/** Starts the background parse worker inside the Next.js server (set RUN_WORKER=false to run it separately). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.RUN_WORKER === "false") return;
  const { startWorker } = await import("./worker/index");
  startWorker().catch((e) => console.error("[worker] failed to start", e));
}
