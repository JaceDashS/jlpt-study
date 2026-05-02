import fs from "node:fs/promises";
import { stripBom, writeFileAtomically } from "./asset-services.js";

const ALLOWED_ITEM_FIELDS = ["memoDecomposition", "memoPersonal", "problem", "lastResult", "lastAttemptDate"];
const ALLOWED_DAY_FIELDS = ["stage", "stageCompleteDate", "nextReviewDate", "lastAttemptDate"];

export function getAllowedSourceFields(targetType) {
  return targetType === "day" ? ALLOWED_DAY_FIELDS : ALLOWED_ITEM_FIELDS;
}

function resolveCombinedRoot(json, unitPath) {
  if (json?.format !== "combined" || !unitPath) return json;

  if (Array.isArray(json?.days)) {
    const index = Number(unitPath);
    return Number.isInteger(index) && index >= 0 ? json.days[index] ?? null : null;
  }

  const slash = unitPath.indexOf("/");
  const units = Array.isArray(json?.units) ? json.units : [];
  if (slash >= 0) {
    const chapterId = unitPath.slice(0, slash);
    const unitId = unitPath.slice(slash + 1);
    return units.find((unit) => unit?.chapterId === chapterId && unit?.unitId === unitId) ?? null;
  }
  return units.find((unit) => unit?.unitId === unitPath) ?? null;
}

function findWriteTarget(root, { dayIndex, itemIndex, targetType }) {
  if (Array.isArray(root?.day)) {
    return targetType === "day" ? root.day?.[dayIndex] ?? null : root.day?.[dayIndex]?.items?.[itemIndex] ?? null;
  }
  if (Array.isArray(root?.unitSteps)) {
    return targetType === "day" ? root.unitSteps?.[dayIndex] ?? null : root.unitSteps?.[dayIndex]?.items?.[itemIndex] ?? null;
  }
  if (Array.isArray(root?.days)) {
    return targetType === "day" ? root.days?.[dayIndex] ?? null : root.days?.[dayIndex]?.items?.[itemIndex] ?? null;
  }
  if (Array.isArray(root)) {
    return targetType === "day" ? root?.[dayIndex] ?? null : root?.[dayIndex]?.items?.[itemIndex] ?? null;
  }
  if (Array.isArray(root?.items)) {
    return targetType === "day" ? root : root.items?.[itemIndex] ?? null;
  }
  return null;
}

export async function writeSourceField(filePath, request) {
  const raw = await fs.readFile(filePath, "utf8");
  const json = JSON.parse(stripBom(raw));
  const root = resolveCombinedRoot(json, request.unitPath);

  if (!root || typeof root !== "object") {
    throw new Error(`Unit not found in combined file: ${request.unitPath}`);
  }

  const target = findWriteTarget(root, request);
  if (!target || typeof target !== "object") {
    throw new Error("Target item not found");
  }

  target[request.field] = request.value;
  await writeFileAtomically(filePath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
}
