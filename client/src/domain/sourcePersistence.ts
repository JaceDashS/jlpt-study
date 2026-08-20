import { useSyncExternalStore } from "react";
import { apiFetch, apiUrl } from "../api.ts";
import {
  SourceWriteQueue,
  type SourceWriteFetch,
  type SourceWriteQueueSnapshot,
} from "./sourceWriteQueue.ts";

const sourceWriteQueues = new WeakMap<SourceWriteFetch, SourceWriteQueue>();

export type SourceWriteQueueController = SourceWriteQueueSnapshot & {
  retryItem: (id: number) => Promise<void>;
  discardItem: (id: number) => Promise<void>;
  discardFailed: () => Promise<void>;
};

export function useSourceWriteQueue(fetchImpl = apiFetch): SourceWriteQueueController {
  const queue = getSourceWriteQueue(fetchImpl);
  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  return {
    ...snapshot,
    retryItem: (id) => queue.retryItem(id),
    discardItem: (id) => queue.discardItem(id),
    discardFailed: () => queue.discardFailed(),
  };
}

export function createSourcePersistence(fetchImpl = apiFetch) {
  const writeQueue = getSourceWriteQueue(fetchImpl);

  const persistSourceField = async (item, field, value) => {
    const sourceRef = item?.sourceRef;
    if (!sourceRef || !sourceRef.sourcePath) {
      console.warn("Skip source persist: missing sourceRef", item?.id, field);
      return false;
    }

    return enqueueSourceWrite(writeQueue, {
      sourcePath: sourceRef.sourcePath,
      unitPath: sourceRef.unitPath ?? null,
      dayIndex: sourceRef.dayIndex,
      itemIndex: sourceRef.itemIndex,
      field,
      value,
    }, `item ${item?.id ?? "unknown"}.${field}`);
  };

  const persistSourceDayField = async (day, field, value) => {
    const sourceItem = day?.items?.find((item) => item?.sourceRef?.sourcePath);
    const sourceRef = sourceItem?.sourceRef;
    if (!sourceRef || !sourceRef.sourcePath) {
      console.warn("Skip source persist(day): missing sourceRef", field);
      return false;
    }

    return enqueueSourceWrite(writeQueue, {
      sourcePath: sourceRef.sourcePath,
      unitPath: sourceRef.unitPath ?? null,
      dayIndex: sourceRef.dayIndex,
      field,
      value,
      targetType: "day",
    }, `day ${day?.id ?? "unknown"}.${field}`);
  };

  return {
    persistSourceField,
    persistSourceDayField,
  };
}

function getSourceWriteQueue(fetchImpl: SourceWriteFetch) {
  const existing = sourceWriteQueues.get(fetchImpl);
  if (existing) return existing;

  const next = new SourceWriteQueue(fetchImpl);
  sourceWriteQueues.set(fetchImpl, next);
  return next;
}

function enqueueSourceWrite(writeQueue: SourceWriteQueue, body: Record<string, unknown>, label: string) {
  try {
    return writeQueue.enqueue({
      input: apiUrl("save-item-field"),
      init: {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      label,
    });
  } catch (error) {
    console.error(`[jpc persistence] failed to queue ${label}:`, error);
    return Promise.resolve(false);
  }
}
