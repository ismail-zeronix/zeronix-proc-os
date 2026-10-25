import type { Instrumentation } from "next";

/** Starts the background parse worker inside the Next.js server (set RUN_WORKER=false to run it separately). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.RUN_WORKER === "false") return;
  const { startWorker } = await import("./worker/index");
  startWorker().catch((e) => console.error("[worker] failed to start", e));
}

/** Every server error (page, route, server action) goes to Admin › Errors with the page and the user. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logServerError } = await import("./lib/error-log");
  await logServerError(err, request, context);
};
