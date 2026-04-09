export function createProgressActions({
  session,
  stateCurriculum,
  today,
  setState,
  getPathDay,
  replaceDay,
  persistSourceField,
  persistSourceDayField,
}) {
  const markDayAttemptNow = (path) => {
    const day = getPathDay(stateCurriculum, path);
    if (!day || day.lastAttemptDate === today) return;

    const nextDay = {
      ...day,
      lastAttemptDate: today,
    };

    setState((prev) => ({
      ...prev,
      curriculum: replaceDay(prev.curriculum, path, nextDay),
    }));

    persistSourceDayField(day, "lastAttemptDate", today);
  };

  const updateMemo = (itemId, field, value) => {
    if (!session) return;
    const path = {
      unitId: session.unitId,
      dayId: session.dayId,
    };

    const day = getPathDay(stateCurriculum, path);
    if (!day) return;

    const targetItem = day.items.find((item) => item.id === itemId);
    if (!targetItem) return;

    const nextDay = {
      ...day,
      items: day.items.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)),
    };

    setState((prev) => ({
      ...prev,
      curriculum: replaceDay(prev.curriculum, path, nextDay),
    }));
    persistSourceField(targetItem, field, value);
  };

  const updateProblem = (itemId, value) => {
    if (!session) return;
    const path = {
      unitId: session.unitId,
      dayId: session.dayId,
    };

    const day = getPathDay(stateCurriculum, path);
    if (!day) return;

    const targetItem = day.items.find((item) => item.id === itemId);
    if (!targetItem) return;

    const nextDay = {
      ...day,
      items: day.items.map((item) => (item.id === itemId ? { ...item, problem: value } : item)),
    };

    setState((prev) => ({
      ...prev,
      curriculum: replaceDay(prev.curriculum, path, nextDay),
    }));
    persistSourceField(targetItem, "problem", value);
  };

  const updateLastResultNow = (itemId, result) => {
    if (!session) return;
    const path = {
      unitId: session.unitId,
      dayId: session.dayId,
    };

    const day = getPathDay(stateCurriculum, path);
    if (!day) return;
    const targetItem = day.items.find((item) => item.id === itemId);
    if (!targetItem) return;

    const nextDay = {
      ...day,
      items: day.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              lastResult: result,
            }
          : item,
      ),
      lastAttemptDate: today,
    };

    setState((prev) => ({
      ...prev,
      curriculum: replaceDay(prev.curriculum, path, nextDay),
    }));

    persistSourceField(targetItem, "lastResult", result);
    persistSourceDayField(day, "lastAttemptDate", today);
  };

  return {
    markDayAttemptNow,
    updateMemo,
    updateProblem,
    updateLastResultNow,
  };
}
