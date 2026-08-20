export type SourceWriteFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type SourceWriteRequest = {
  input: RequestInfo | URL;
  init?: RequestInit;
  label?: string;
};

type QueueEntry = {
  request: SourceWriteRequest;
  resolve: (ok: boolean) => void;
};

type SourceWriteQueueOptions = {
  initialRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  logger?: Pick<Console, "error" | "warn">;
};

const DEFAULT_INITIAL_RETRY_DELAY_MS = 1_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 60_000;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429]);

export class SourceWriteQueue {
  private readonly pending: QueueEntry[] = [];
  private readonly initialRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly logger: Pick<Console, "error" | "warn">;
  private active = false;
  private pumpScheduled = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelayMs: number;

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
  }

  enqueue(request: SourceWriteRequest) {
    return new Promise<boolean>((resolve) => {
      this.pending.push({ request, resolve });
      this.schedulePump();
    });
  }

  private schedulePump() {
    if (this.active || this.retryTimer || this.pumpScheduled || this.pending.length === 0) return;

    this.pumpScheduled = true;
    Promise.resolve().then(() => {
      this.pumpScheduled = false;
      if (this.active || this.retryTimer || this.pending.length === 0) return;
      void this.processFront();
    });
  }

  private async processFront() {
    if (this.active || this.retryTimer || this.pending.length === 0) return;

    const entry = this.pending[0];
    this.active = true;

    try {
      const response = await this.fetchImpl(entry.request.input, entry.request.init);
      if (response.ok) {
        this.completeFront(true);
        return;
      }

      const responseText = await readResponseText(response);
      const detail = `HTTP ${response.status}${responseText ? `: ${responseText}` : ""}`;
      if (isRetryableStatus(response.status)) {
        this.scheduleRetry(entry.request.label, detail);
        return;
      }

      this.completeFront(false, entry.request.label, detail);
    } catch (error) {
      this.scheduleRetry(entry.request.label, error);
    }
  }

  private completeFront(ok: boolean, label = "source write", detail = "") {
    const entry = this.pending.shift();
    this.active = false;
    this.retryDelayMs = this.initialRetryDelayMs;

    if (!ok) {
      this.logger.error(`[jpc persistence] ${label} was rejected${detail ? ` (${detail})` : ""}`);
    }

    entry?.resolve(ok);
    this.schedulePump();
  }

  private scheduleRetry(label = "source write", error: unknown) {
    this.active = false;
    if (this.retryTimer || this.pending.length === 0) return;

    const delayMs = this.retryDelayMs;
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, this.maxRetryDelayMs);
    this.logger.warn(
      `[jpc persistence] ${label} failed; retrying in ${delayMs}ms`,
      error instanceof Error ? error.message : error,
    );

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.processFront();
    }, delayMs);
  }
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
