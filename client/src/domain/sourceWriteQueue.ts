export type SourceWriteFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type SourceWriteLearningPath = {
  unitId: string;
  dayId: string;
};

export type SourceWriteRequest = {
  input: RequestInfo | URL;
  init?: RequestInit;
  learningPath?: SourceWriteLearningPath;
  label?: string;
};

export type SourceWriteQueueStatus = "pending" | "retrying" | "failed";

export type SourceWriteQueueItem = {
  id: number;
  learningPath?: SourceWriteLearningPath;
  label: string;
  status: SourceWriteQueueStatus;
  createdAt: number;
  retryCount: number;
  nextAttemptAt: number | null;
  lastError: string;
};

export type SourceWriteQueueSnapshot = {
  isReady: boolean;
  isPersistent: boolean;
  items: SourceWriteQueueItem[];
};

type QueueEntry = {
  record: StoredQueueRecord;
  request: SourceWriteRequest;
  resolve: (ok: boolean) => void;
};

type SourceWriteQueueOptions = {
  initialRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  logger?: Pick<Console, "error" | "warn">;
};

type StoredRequestInit = {
  method?: string;
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
  body?: string;
};

type StoredQueueRecord = SourceWriteQueueItem & {
  input: string;
  init: StoredRequestInit;
  retryDelayMs: number;
};

type NewStoredQueueRecord = Omit<StoredQueueRecord, "id">;

type QueueStorage = {
  persistent: boolean;
  list: () => Promise<StoredQueueRecord[]>;
  add: (record: NewStoredQueueRecord) => Promise<StoredQueueRecord>;
  update: (id: number, patch: Partial<StoredQueueRecord>) => Promise<void>;
  remove: (id: number) => Promise<void>;
};

const DEFAULT_INITIAL_RETRY_DELAY_MS = 1_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 60_000;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429]);
const QUEUE_DB_NAME = "jpc-source-write-queue";
const QUEUE_DB_VERSION = 1;
const QUEUE_STORE_NAME = "requests";

export class SourceWriteQueue {
  private readonly pending: QueueEntry[] = [];
  private readonly records = new Map<number, StoredQueueRecord>();
  private readonly listeners = new Set<() => void>();
  private readonly idleWaiters = new Set<() => void>();
  private readonly initialRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly logger: Pick<Console, "error" | "warn">;
  private readonly storage: QueueStorage;
  private readonly ready: Promise<void>;
  private persistChain: Promise<void>;
  private active = false;
  private initialized = false;
  private pumpScheduled = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelayMs: number;
  private nextMemoryId = -1;
  private snapshot: SourceWriteQueueSnapshot;

  constructor(
    private readonly fetchImpl: SourceWriteFetch,
    options: SourceWriteQueueOptions = {},
  ) {
    this.initialRetryDelayMs = normalizeDelay(options.initialRetryDelayMs, DEFAULT_INITIAL_RETRY_DELAY_MS);
    this.maxRetryDelayMs = Math.max(
      this.initialRetryDelayMs,
      normalizeDelay(options.maxRetryDelayMs, DEFAULT_MAX_RETRY_DELAY_MS),
    );
    this.retryDelayMs = this.initialRetryDelayMs;
    this.logger = options.logger ?? console;
    this.storage = createQueueStorage();
    this.snapshot = {
      isReady: false,
      isPersistent: this.storage.persistent,
      items: [],
    };
    this.ready = this.restore().catch((error) => {
      this.logger.error("[jpc persistence] failed to restore source write queue:", error);
      this.initialized = true;
      this.publish();
    });
    this.persistChain = this.ready;
  }

  enqueue(request: SourceWriteRequest) {
    return new Promise<boolean>((resolve) => {
      this.persistChain = this.persistChain
        .then(async () => {
          const record = await this.addRecord(request);
          const entry = { record, request: restoreRequest(record), resolve };
          this.records.set(record.id, record);
          this.pending.push(entry);
          this.publish();
          this.schedulePump();
        })
        .catch((error) => {
          this.logger.error("[jpc persistence] failed to persist source write; using memory fallback:", error);
          const record = createMemoryRecord(request, this.nextMemoryId--);
          const entry = { record, request, resolve };
          this.records.set(record.id, record);
          this.pending.push(entry);
          this.publish();
          this.schedulePump();
        });
    });
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  async retryItem(id: number) {
    await this.ready;
    const record = this.records.get(id);
    if (!record || record.status !== "failed") return;

    Object.assign(record, {
      status: "pending" as const,
      retryCount: 0,
      retryDelayMs: this.initialRetryDelayMs,
      nextAttemptAt: null,
      lastError: "",
    });
    await this.storage.update(id, record);
    this.pending.push({ record, request: restoreRequest(record), resolve: () => undefined });
    this.publish();
    this.schedulePump();
  }
  async whenIdle() {
    await this.ready;
    await this.persistChain;
    if (this.pending.length === 0) return;
    await new Promise<void>((resolve) => {
      this.idleWaiters.add(resolve);
    });
  }

  async discardItem(id: number) {
    await this.ready;
    const record = this.records.get(id);
    if (!record || record.status !== "failed") return;
    await this.storage.remove(id);
    this.records.delete(id);
    this.publish();
  }

  async discardFailed() {
    await this.ready;
    const failedIds = [...this.records.values()]
      .filter((record) => record.status === "failed")
      .map((record) => record.id);
    for (const id of failedIds) {
      await this.storage.remove(id);
      this.records.delete(id);
    }
    if (failedIds.length > 0) this.publish();
  }

  private async restore() {
    const records = (await this.storage.list()).sort(compareRecords);
    for (const record of records) {
      this.records.set(record.id, record);
      if (record.status !== "failed") {
        this.pending.push({ record, request: restoreRequest(record), resolve: () => undefined });
      }
    }
    this.initialized = true;
    this.publish();

    const first = this.pending[0]?.record;
    if (first?.status === "retrying") {
      this.retryDelayMs = normalizeDelay(first.retryDelayMs, this.initialRetryDelayMs);
      this.scheduleRetryTimer(Math.max(0, (first.nextAttemptAt ?? 0) - Date.now()));
    } else {
      this.schedulePump();
    }
  }

  private async addRecord(request: SourceWriteRequest) {
    return this.storage.add({
      ...serializeRequest(request),
      label: request.label ?? "source write",
      status: "pending",
      createdAt: Date.now(),
      retryCount: 0,
      nextAttemptAt: null,
      lastError: "",
      retryDelayMs: this.initialRetryDelayMs,
    });
  }

  private schedulePump() {
    if (!this.initialized || this.active || this.retryTimer || this.pumpScheduled || this.pending.length === 0) return;

    this.pumpScheduled = true;
    Promise.resolve().then(() => {
      this.pumpScheduled = false;
      if (!this.active && !this.retryTimer && this.pending.length > 0) {
        void this.processFront();
      }
    });
  }

  private async processFront() {
    if (!this.initialized || this.active || this.retryTimer || this.pending.length === 0) return;

    const entry = this.pending[0];
    this.active = true;

    try {
      const response = await this.fetchImpl(entry.request.input, entry.request.init);
      if (response.ok) {
        await this.completeFront(true);
        return;
      }

      const responseText = await readResponseText(response);
      const detail = `HTTP ${response.status}${responseText ? `: ${responseText}` : ""}`;
      if (isRetryableStatus(response.status)) {
        await this.scheduleRetry(entry.request.label, detail);
        return;
      }

      await this.completeFront(false, entry.request.label, detail);
    } catch (error) {
      await this.scheduleRetry(entry.request.label, error);
    }
  }

  private async completeFront(ok: boolean, label = "source write", detail = "") {
    const entry = this.pending.shift();
    this.active = false;
    this.retryDelayMs = this.initialRetryDelayMs;
    if (!entry) return;

    try {
      if (ok) {
        await this.storage.remove(entry.record.id);
        this.records.delete(entry.record.id);
      } else {
        Object.assign(entry.record, {
          status: "failed" as const,
          nextAttemptAt: null,
          lastError: detail,
        });
        await this.storage.update(entry.record.id, entry.record);
        this.logger.error(`[jpc persistence] ${label ?? "source write"} was rejected${detail ? ` (${detail})` : ""}`);
      }
    } catch (error) {
      this.logger.error("[jpc persistence] failed to update source write queue:", error);
    }

    entry.resolve(ok);
    this.publish();
    this.schedulePump();
  }

  private async scheduleRetry(label = "source write", error: unknown) {
    this.active = false;
    const entry = this.pending[0];
    if (!entry || this.retryTimer) return;

    const delayMs = this.retryDelayMs;
    const nextDelayMs = Math.min(this.retryDelayMs * 2, this.maxRetryDelayMs);
    const detail = error instanceof Error ? error.message : String(error ?? "request failed");
    Object.assign(entry.record, {
      status: "retrying" as const,
      retryCount: entry.record.retryCount + 1,
      retryDelayMs: nextDelayMs,
      nextAttemptAt: Date.now() + delayMs,
      lastError: detail,
    });
    this.retryDelayMs = nextDelayMs;

    try {
      await this.storage.update(entry.record.id, entry.record);
    } catch (storageError) {
      this.logger.error("[jpc persistence] failed to save retry state:", storageError);
    }

    this.logger.warn(
      `[jpc persistence] ${label ?? "source write"} failed; retrying in ${delayMs}ms`,
      error instanceof Error ? error.message : error,
    );
    this.publish();
    this.scheduleRetryTimer(delayMs);
  }

  private scheduleRetryTimer(delayMs: number) {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      const entry = this.pending[0];
      if (entry) {
        entry.record.status = "pending";
        entry.record.nextAttemptAt = null;
        void this.storage.update(entry.record.id, entry.record).catch((error) => {
          this.logger.error("[jpc persistence] failed to clear retry state:", error);
        });
        this.publish();
      }
      void this.processFront();
    }, Math.max(0, delayMs));
  }

  private publish() {
    this.snapshot = {
      isReady: this.initialized,
      isPersistent: this.storage.persistent,
      items: [...this.records.values()].sort(compareRecords).map(toSnapshotItem),
    };
    if (this.pending.length === 0) {
      for (const resolve of this.idleWaiters) resolve();
      this.idleWaiters.clear();
    }
    for (const listener of this.listeners) listener();
  }
}

function createQueueStorage(): QueueStorage {
  if (typeof indexedDB === "undefined") return new MemoryQueueStorage();
  return new IndexedDbQueueStorage();
}

class MemoryQueueStorage implements QueueStorage {
  persistent = false;
  private readonly records = new Map<number, StoredQueueRecord>();
  private nextId = 1;

  async list() {
    return [...this.records.values()].map(cloneRecord);
  }

  async add(record: NewStoredQueueRecord) {
    const next = { ...record, id: this.nextId++ };
    this.records.set(next.id, next);
    return cloneRecord(next);
  }

  async update(id: number, patch: Partial<StoredQueueRecord>) {
    const current = this.records.get(id);
    if (current) this.records.set(id, { ...current, ...patch, id });
  }

  async remove(id: number) {
    this.records.delete(id);
  }
}

class IndexedDbQueueStorage implements QueueStorage {
  persistent = true;
  private readonly fallback = new MemoryQueueStorage();
  private readonly database: Promise<IDBDatabase | null>;

  constructor() {
    this.database = openQueueDatabase().catch(() => {
      this.persistent = false;
      return null;
    });
  }

  async list() {
    const database = await this.database;
    if (!database) return this.fallback.list();
    try {
      return await readAllRecords(database);
    } catch {
      this.persistent = false;
      return this.fallback.list();
    }
  }

  async add(record: NewStoredQueueRecord) {
    const database = await this.database;
    if (!database) return this.fallback.add(record);
    try {
      return await addRecord(database, record);
    } catch {
      this.persistent = false;
      return this.fallback.add(record);
    }
  }

  async update(id: number, patch: Partial<StoredQueueRecord>) {
    const database = await this.database;
    if (!database) {
      await this.fallback.update(id, patch);
      return;
    }
    try {
      await updateRecord(database, id, patch);
    } catch {
      this.persistent = false;
      await this.fallback.update(id, patch);
    }
  }

  async remove(id: number) {
    const database = await this.database;
    if (!database) {
      await this.fallback.remove(id);
      return;
    }
    try {
      await removeRecord(database, id);
    } catch {
      this.persistent = false;
      await this.fallback.remove(id);
    }
  }
}

function openQueueDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(QUEUE_DB_NAME, QUEUE_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(QUEUE_STORE_NAME)) {
        request.result.createObjectStore(QUEUE_STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

function readAllRecords(database: IDBDatabase) {
  return new Promise<StoredQueueRecord[]>((resolve, reject) => {
    const transaction = database.transaction(QUEUE_STORE_NAME, "readonly");
    const request = transaction.objectStore(QUEUE_STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as StoredQueueRecord[]).map(cloneRecord));
    request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
  });
}

function addRecord(database: IDBDatabase, record: NewStoredQueueRecord) {
  return new Promise<StoredQueueRecord>((resolve, reject) => {
    const transaction = database.transaction(QUEUE_STORE_NAME, "readwrite");
    const request = transaction.objectStore(QUEUE_STORE_NAME).add(record);
    let id: number | null = null;
    request.onsuccess = () => {
      id = Number(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB add failed"));
    transaction.oncomplete = () => (id === null ? reject(new Error("IndexedDB add returned no id")) : resolve({ ...record, id }));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB add failed"));
  });
}

function updateRecord(database: IDBDatabase, id: number, patch: Partial<StoredQueueRecord>) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(QUEUE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(QUEUE_STORE_NAME);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      if (!getRequest.result) {
        resolve();
        return;
      }
      store.put({ ...getRequest.result, ...patch, id });
    };
    getRequest.onerror = () => reject(getRequest.error ?? new Error("IndexedDB update read failed"));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB update failed"));
  });
}

function removeRecord(database: IDBDatabase, id: number) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(QUEUE_STORE_NAME, "readwrite");
    const request = transaction.objectStore(QUEUE_STORE_NAME).delete(id);
    request.onsuccess = () => undefined;
    request.onerror = () => reject(request.error ?? new Error("IndexedDB delete failed"));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB delete failed"));
  });
}

function serializeRequest(request: SourceWriteRequest) {
  const input = request.input instanceof URL ? request.input.toString() : String(request.input);
  const init = request.init ?? {};
  const headers = new Headers(init.headers);
  const headerRecord: Record<string, string> = {};
  headers.forEach((value, key) => {
    headerRecord[key] = value;
  });
  const body = typeof init.body === "string" ? init.body : init.body == null ? undefined : String(init.body);
  return {
    input,
    init: {
      method: init.method,
      credentials: init.credentials,
      headers: headerRecord,
      ...(body === undefined ? {} : { body }),
    },
    learningPath: request.learningPath,
  } satisfies Pick<StoredQueueRecord, "input" | "init" | "learningPath">;
}

function restoreRequest(record: StoredQueueRecord): SourceWriteRequest {
  return {
    input: record.input,
    init: {
      ...record.init,
      headers: record.init.headers,
    },
    label: record.label,
    learningPath: record.learningPath,
  };
}

function createMemoryRecord(request: SourceWriteRequest, id: number): StoredQueueRecord {
  return {
    ...serializeRequest(request),
    id,
    label: request.label ?? "source write",
    status: "pending",
    createdAt: Date.now(),
    retryCount: 0,
    nextAttemptAt: null,
    lastError: "",
    retryDelayMs: DEFAULT_INITIAL_RETRY_DELAY_MS,
  };
}

function cloneRecord(record: StoredQueueRecord): StoredQueueRecord {
  return {
    ...record,
    learningPath: record.learningPath ? { ...record.learningPath } : undefined,
    init: {
      ...record.init,
      headers: record.init.headers ? { ...record.init.headers } : undefined,
    },
  };
}

function toSnapshotItem(record: StoredQueueRecord): SourceWriteQueueItem {
  return {
    id: record.id,
    learningPath: record.learningPath,
    label: record.label,
    status: record.status,
    createdAt: record.createdAt,
    retryCount: record.retryCount,
    nextAttemptAt: record.nextAttemptAt,
    lastError: record.lastError,
  };
}

function compareRecords(left: StoredQueueRecord, right: StoredQueueRecord) {
  return left.createdAt - right.createdAt || left.id - right.id;
}

function isRetryableStatus(status: number) {
  return RETRYABLE_STATUS_CODES.has(status) || status >= 500;
}

async function readResponseText(response: Response) {
  try {
    const text = await response.text();
    return text.trim().slice(0, 240);
  } catch {
    return "";
  }
}

function normalizeDelay(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) > 0 ? Math.round(Number(value)) : fallback;
}
