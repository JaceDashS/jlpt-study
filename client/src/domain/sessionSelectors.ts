import { useMemo } from "react";
import type { LearningPath, SessionView, StudyDay, StudyItem, StudyUnit } from "./studyTypes.ts";

type SessionSelectionOptions = {
  getPathDay: (curriculum: StudyUnit[], path: LearningPath) => StudyDay | null;
  isQuizTarget: (item: StudyItem) => boolean;
  session: SessionView | null;
  stateCurriculum: StudyUnit[];
};

export function useSessionSelection({ getPathDay, isQuizTarget, session, stateCurriculum }: SessionSelectionOptions) {
  const sessionDay = session
    ? getPathDay(stateCurriculum, {
        unitId: session.unitId,
        dayId: session.dayId,
      })
    : null;

  const sessionItems = useMemo(() => {
    if (!sessionDay || !session) return [];

    const targetItems = sessionDay.items.filter(isQuizTarget);
    const itemIds = Array.isArray(session.itemIds) ? session.itemIds : [];

    if (itemIds.length === 0) {
      return targetItems;
    }

    const byId = new Map(targetItems.map((item) => [item.id, item]));
    return itemIds.map((id) => byId.get(id)).filter((item): item is StudyItem => Boolean(item));
  }, [isQuizTarget, sessionDay, session]);

  const currentItem = session && sessionItems.length > 0 ? sessionItems[session.index] : null;

  return { currentItem, sessionDay, sessionItems };
}
