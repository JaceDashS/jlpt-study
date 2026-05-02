import {
  getSourceDay,
  getSourceExpression,
  getSourceItem,
  getSourceKanjiToKana,
  getSourceReading,
  toLastResult,
  toNullableDate,
  toOptionalString,
  toStage,
} from "./curriculumSourceAccess.ts";
import type { SourceRef, StudyUnit } from "./studyTypes.ts";

export function mergeCurriculumFromSource(curriculum: StudyUnit[], files?: Record<string, unknown>): StudyUnit[] {
  if (!files) return curriculum;

  return curriculum.map((unit) => ({
    ...unit,
    days: unit.days.map((day) => {
      const daySourceRef = day.items.find((item) => item?.sourceRef?.sourcePath)?.sourceRef ?? null;
      const sourceJson = daySourceRef?.sourcePath ? files[daySourceRef.sourcePath] : null;
      const sourceDay = daySourceRef ? getSourceDay(sourceJson, daySourceRef.dayIndex, daySourceRef.unitPath) : null;

      return {
        ...day,
        stage: toStage(sourceDay?.stage, day.stage),
        stageCompleteDate:
          sourceDay && Object.prototype.hasOwnProperty.call(sourceDay, "stageCompleteDate")
            ? toNullableDate(sourceDay.stageCompleteDate, day.stageCompleteDate)
            : day.stageCompleteDate,
        nextReviewDate:
          sourceDay && Object.prototype.hasOwnProperty.call(sourceDay, "nextReviewDate")
            ? toNullableDate(sourceDay.nextReviewDate, day.nextReviewDate)
            : day.nextReviewDate,
        lastAttemptDate: toOptionalString(sourceDay?.lastAttemptDate, day.lastAttemptDate),
        lastCompletedDate: toOptionalString(sourceDay?.lastCompletedDate, day.lastCompletedDate),
        items: day.items.map((item) => {
          const sourceRef = item.sourceRef as SourceRef | null | undefined;
          if (!sourceRef?.sourcePath) return item;

          const sourceItemJson = files[sourceRef.sourcePath];
          const sourceItem = getSourceItem(sourceItemJson, sourceRef.dayIndex, sourceRef.itemIndex, sourceRef.unitPath);
          if (!sourceItem) return item;
          const nextExpression = getSourceExpression(
            sourceItem,
            item.expression,
            `mergeCurriculumFromSource:${sourceRef.sourcePath}:day${sourceRef.dayIndex + 1}:item${sourceRef.itemIndex + 1}`,
          );

          return {
            ...item,
            expression: nextExpression,
            reading: getSourceReading(sourceItem, item.reading),
            meaningKo: String(sourceItem.meaningKo ?? sourceItem.meaning ?? sourceItem.sentence ?? item.meaningKo ?? ""),
            kanjiToKana: getSourceKanjiToKana(sourceItem, item.kanjiToKana),
            stage: toStage(sourceItem.stage, item.stage),
            nextReviewDate: Object.prototype.hasOwnProperty.call(sourceItem, "nextReviewDate")
              ? toNullableDate(sourceItem.nextReviewDate, item.nextReviewDate)
              : item.nextReviewDate,
            lastResult: toLastResult(sourceItem.lastResult, item.lastResult),
            lastAttemptDate: toOptionalString(sourceItem.lastAttemptDate, item.lastAttemptDate),
            memoDecomposition: toOptionalString(sourceItem.memoDecomposition, item.memoDecomposition),
            memoPersonal: toOptionalString(sourceItem.memoPersonal, item.memoPersonal),
            problem: Object.prototype.hasOwnProperty.call(sourceItem, "problem") ? sourceItem.problem : item.problem,
          };
        }),
      };
    }),
  }));
}
