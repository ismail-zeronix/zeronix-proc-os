import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** Where uploaded files live on disk. In Docker this is a volume, so files survive a rebuild. */
export const FILES_DIR = path.resolve(process.env.FILES_DIR ?? path.join(process.cwd(), "data", "files"));

/** Stored names are random (uuid + allowed extension), never the name people gave the file. */
const STORED = /^[0-9a-f-]{36}\.[a-z0-9]{1,8}$/;

function fullPath(storedName: string): string {
  if (!STORED.test(storedName)) throw new Error("Bad file name");
  return path.join(FILES_DIR, storedName);
}

export async function saveFile(data: Buffer, ext: string): Promise<string> {
  await mkdir(FILES_DIR, { recursive: true });
  const storedName = `${randomUUID()}.${ext}`;
  await writeFile(fullPath(storedName), data, { flag: "wx" });
  return storedName;
}

export function readStoredFile(storedName: string): Promise<Buffer> {
  return readFile(fullPath(storedName));
}

export async function removeStoredFile(storedName: string) {
  await unlink(fullPath(storedName)).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "ENOENT") throw e;
  });
}
