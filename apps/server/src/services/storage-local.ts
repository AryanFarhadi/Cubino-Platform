import { mkdir, writeFile, access } from "fs/promises";
import { join } from "path";
import { constants } from "fs";

const DATA_ROOT = process.env.UPLOAD_DIR ?? join(process.cwd(), "data");

/** Absolute path on disk for a storage key like `uploads/{userId}/{file}`. */
export function localPathForKey(key: string): string {
  if (!key.startsWith("uploads/") || key.includes("..")) {
    throw new Error("Invalid upload key");
  }
  return join(DATA_ROOT, key);
}

/** Ensure the authenticated user owns the upload key prefix. */
export function assertKeyOwnedByUser(key: string, userId: string): void {
  const expectedPrefix = `uploads/${userId}/`;
  if (!key.startsWith(expectedPrefix)) {
    throw new Error("Forbidden upload key");
  }
}

export async function saveLocalUpload(key: string, data: Buffer): Promise<void> {
  const path = localPathForKey(key);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, data);
}

export async function localUploadExists(key: string): Promise<boolean> {
  try {
    await access(localPathForKey(key), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export { DATA_ROOT };
