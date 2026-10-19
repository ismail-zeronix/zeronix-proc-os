/** Run the parse worker as its own process (`npm run worker`) when RUN_WORKER=false on the web server. */
import "dotenv/config";
import { startWorker } from "./jobs";

startWorker().catch((e) => {
  console.error(e);
  process.exit(1);
});
