import { apiFetch, apiUrl } from "../api.ts";

export function createSourcePersistence(fetchImpl = apiFetch) {
  const persistSourceField = async (item, field, value) => {
    const sourceRef = item?.sourceRef;
    if (!sourceRef || !sourceRef.sourcePath) {
      console.warn("Skip source persist: missing sourceRef", item?.id, field);
      return;
    }

    try {
      const response = await fetchImpl(apiUrl("save-item-field"), {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourcePath: sourceRef.sourcePath,
          unitPath: sourceRef.unitPath ?? null,
          dayIndex: sourceRef.dayIndex,
          itemIndex: sourceRef.itemIndex,
          field,
          value,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to persist source JSON:", response.status, errorText);
      }
    } catch (error) {
      console.error("Failed to persist source JSON:", error);
    }
  };

  const persistSourceDayField = async (day, field, value) => {
    const sourceItem = day?.items?.find((item) => item?.sourceRef?.sourcePath);
    const sourceRef = sourceItem?.sourceRef;
    if (!sourceRef || !sourceRef.sourcePath) {
      console.warn("Skip source persist(day): missing sourceRef", field);
      return;
    }

    try {
      const response = await fetchImpl(apiUrl("save-item-field"), {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourcePath: sourceRef.sourcePath,
          unitPath: sourceRef.unitPath ?? null,
          dayIndex: sourceRef.dayIndex,
          field,
          value,
          targetType: "day",
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to persist day field:", response.status, errorText);
      }
    } catch (error) {
      console.error("Failed to persist day field:", error);
    }
  };

  return {
    persistSourceField,
    persistSourceDayField,
  };
}
