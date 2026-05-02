import { useMemo } from "react";

export function useSessionSelection({ getPathDay, isQuizTarget, session, stateCurriculum }) {
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
    return itemIds.map((id) => byId.get(id)).filter(Boolean);
  }, [isQuizTarget, sessionDay, session]);

  const currentItem = session && sessionItems.length > 0 ? sessionItems[session.index] : null;

  return { currentItem, sessionDay, sessionItems };
}
