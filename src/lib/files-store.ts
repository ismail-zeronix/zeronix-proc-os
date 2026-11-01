import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** Where uploaded files live on disk. In Docker this is a volume, so files survive a rebuild. */
export const FILES_DIR = path.resolve(process.env.FILES_DIR ?? path.join(process.cwd(), "data", "files"));

/** Stored names are random (uuid + allowed extension), never the name people gave the file. */
const STORED = /^[0-9a-f-]{36}\.[a-z0-9]{1,8}$/;

/** Save, read and remove files in one folder. The Files app uses FILES_DIR; the website keeps its pictures apart. */
export function fileStore(dir: string) {
  const fullPath = (storedName: string) => {
    if (!STORED.test(storedName)) throw new Error("Bad file name");
    return path.join(dir, storedName);
  };
  return {
    async save(data: Buffer, ext: string): Promise<string> {
      await mkdir(dir, { recursive: true });
      const storedName = `${randomUUID()}.${ext}`;
      await writeFile(fullPath(storedName), data, { flag: "wx" });
      return storedName;
    },
    read(storedName: string): Promise<Buffer> {
      return readFile(fullPath(storedName));
    },
    async remove(storedName: string) {
      await unlink(fullPath(storedName)).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== "ENOENT") throw e;
      });
    },
  };
}

const files = fileStore(FILES_DIR);
export const saveFile = files.save;
export const readStoredFile = files.read;
export const removeStoredFile = files.remove;
