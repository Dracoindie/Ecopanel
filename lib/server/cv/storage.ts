import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getCvStorageDir } from "@/lib/server/config";
import type { CvKind } from "@/lib/server/cv/validation";

export interface StoredCvObject {
  key: string;
  sizeBytes: number;
}

export interface PrivateCvStorage {
  put(input: { organizationId: string; kind: CvKind; buffer: Buffer }): Promise<StoredCvObject>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

const SAFE_KEY = /^cv\/[A-Za-z0-9-]+\/[a-f0-9-]{36}\.(pdf|doc|docx)$/;

export class InvalidStorageKeyError extends Error {
  constructor() {
    super("Invalid private storage key.");
    this.name = "InvalidStorageKeyError";
  }
}

export class LocalPrivateCvStorage implements PrivateCvStorage {
  private readonly root: string;

  constructor(root = getCvStorageDir()) {
    this.root = path.resolve(process.cwd(), root);
  }

  private resolveKey(key: string) {
    if (!SAFE_KEY.test(key)) throw new InvalidStorageKeyError();
    const resolved = path.resolve(this.root, key);
    if (resolved !== this.root && !resolved.startsWith(`${this.root}${path.sep}`)) {
      throw new InvalidStorageKeyError();
    }
    return resolved;
  }

  async put(input: { organizationId: string; kind: CvKind; buffer: Buffer }) {
    if (!/^[A-Za-z0-9-]+$/.test(input.organizationId)) throw new InvalidStorageKeyError();
    const extension = input.kind;
    const key = `cv/${input.organizationId}/${randomUUID()}.${extension}`;
    const target = this.resolveKey(key);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, input.buffer, { mode: 0o600, flag: "wx" });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
    return { key, sizeBytes: input.buffer.length };
  }

  async read(key: string) {
    return readFile(this.resolveKey(key));
  }

  async delete(key: string) {
    await rm(this.resolveKey(key), { force: true });
  }
}

let storage: PrivateCvStorage | null = null;

export function getCvStorage(): PrivateCvStorage {
  if (!storage) storage = new LocalPrivateCvStorage();
  return storage;
}

export function getCvStorageBackendName() {
  return "local-private-filesystem";
}
