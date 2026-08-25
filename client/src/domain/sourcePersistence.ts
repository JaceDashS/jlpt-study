import { useSyncExternalStore } from "react";
import { apiFetch, apiUrl } from "../api.ts";
import {
  SourceWriteQueue,
  type SourceWriteFetch,
  type SourceWriteQueueSnapshot,
} from "./sourceWriteQueue.ts";
import type { LearningPath, QuizResult, StudyDay } from "./studyTypes.ts";

export type PersistSourceDayResult = (
  sourceDay: StudyDay,
  nextDay: StudyDay,
  learningPath: LearningPath,
) => Promise<boolean>;

const sourceWriteQueues = new WeakMap<SourceWriteFetch, SourceWriteQueue>();

export type SourceWriteQueueController = SourceWriteQueueSnapshot & {
  retryItem: (id: number) => Promise<void>;
  discardItem: (id: number) => Promise<void>;
  discardFailed: () => Promise<void>;
  waitForIdle: () => Promise<void>;
};

export function useSourceWriteQueue(fetchImpl = apiFetch): SourceWriteQueueController {
  const queue = getSourceWriteQueue(fetchImpl);
  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  return {
    ...snapshot,
    retryItem: (id) => queue.retryItem(id),
    discardItem: (id) => queue.discardItem(id),
    discardFailed: () => queue.discardFailed(),
    waitForIdle: () => queue.whenIdle(),
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

  const persistSourceDayField = async (day, field, value, learningPath?: LearningPath) => {
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
    }, `day ${day?.id ?? "unknown"}.${field}`, learningPath);
  };

  const persistSourceDayResult: PersistSourceDayResult = async (sourceDay, nextDay, learningPath) => {
    const groups = new Map();
    for (const item of nextDay.items ?? []) {
      const sourceRef = item?.sourceRef;
      if (!sourceRef?.sourcePath || !Number.isInteger(sourceRef.dayIndex) || !Number.isInteger(sourceRef.itemIndex)) {
        continue;
      }
      if (!isQuizResult(item.lastResult)) continue;

      const key = JSON.stringify([sourceRef.sourcePath, sourceRef.unitPath ?? null, sourceRef.dayIndex]);
      const group = groups.get(key) ?? {
        sourcePath: sourceRef.sourcePath,
        unitPath: sourceRef.unitPath ?? null,
        dayIndex: sourceRef.dayIndex,
        items: new Map(),
      };
      group.items.set(sourceRef.itemIndex, {
        itemIndex: sourceRef.itemIndex,
        lastResult: item.lastResult,
      });
      groups.set(key, group);
    }

    if (groups.size === 0) {
      console.warn("Skip source persist(day result): missing sourceRef", sourceDay?.id ?? nextDay?.id);
      return false;
    }

    const stage = Number(nextDay.stage ?? sourceDay.stage);
    const lastAttemptDate = nextDay.lastAttemptDate ?? "";
    if (!Number.isInteger(stage) || stage < 1 || !isYmd(lastAttemptDate)) {
      console.warn("Skip source persist(day result): invalid schedule", nextDay?.id, stage, lastAttemptDate);
      return false;
    }

    const day = {
      stage,
      stageCompleteDate: nextDay.stageCompleteDate ?? null,
      nextReviewDate: nextDay.nextReviewDate ?? null,
      lastAttemptDate,
    };
    const results = await Promise.all([...groups.values()].map((group) => enqueueSourceWrite(
      writeQueue,
      {
        sourcePath: group.sourcePath,
        unitPath: group.unitPath,
        dayIndex: group.dayIndex,
        items: [...group.items.values()],
        day,
      },
      `day ${nextDay?.id ?? "unknown"} result`,
      learningPath,
      "save-day-result",
    )));
    return results.every(Boolean);
  };

  return {
    persistSourceField,
    persistSourceDayField,
    persistSourceDayResult,
  };
}

function getSourceWriteQueue(fetchImpl: SourceWriteFetch) {
  const existing = sourceWriteQueues.get(fetchImpl);
  if (existing) return existing;

  const next = new SourceWriteQueue(fetchImpl);
  sourceWriteQueues.set(fetchImpl, next);
  return next;
}

function isQuizResult(value: unknown): value is QuizResult {
  return value === "PASS" || value === "FAIL" || value === "NEUTRAL";
}

function isYmd(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function enqueueSourceWrite(writeQueue: SourceWriteQueue, body: Record<string, unknown>, label: string, learningPath?: LearningPath, endpoint = "save-item-field") {
  try {
    return writeQueue.enqueue({
      input: apiUrl(endpoint),
      init: {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      label,
      learningPath,
    });
  } catch (error) {
    console.error(`[jpc persistence] failed to queue ${label}:`, error);
    return Promise.resolve(false);
  }
}
