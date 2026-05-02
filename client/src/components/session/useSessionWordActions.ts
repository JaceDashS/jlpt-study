import { useEffect, useState } from "react";
import type { SessionPhase } from "./sessionViewTypes.ts";

export type WordActionType = "copy" | "input" | "resetDecomposition" | "resetProblem";

export function useSessionWordActions({
  canUseDayWordActions,
  copyDayWords,
  importDayDecompositionFromClipboard,
  importDayDecompositionFromText,
  phase,
  resetDayDecompositions,
  resetDayProblems,
}: {
  canUseDayWordActions: boolean;
  copyDayWords: () => void;
  importDayDecompositionFromClipboard: () => Promise<boolean>;
  importDayDecompositionFromText: (text: string) => Promise<boolean>;
  phase: SessionPhase;
  resetDayDecompositions: () => void;
  resetDayProblems: () => void;
}) {
  const [primaryWordAction, setPrimaryWordAction] = useState<"copy" | "input">("copy");
  const [isWordImportOpen, setIsWordImportOpen] = useState(false);
  const [wordImportText, setWordImportText] = useState("");

  useEffect(() => {
    if (phase !== "study") {
      setIsWordImportOpen(false);
      setWordImportText("");
    }
  }, [phase]);

  const runWordAction = (actionType: WordActionType) => {
    if (!canUseDayWordActions) return;
    if (actionType === "copy") {
      setIsWordImportOpen(false);
      copyDayWords();
      setPrimaryWordAction("input");
      return;
    }
    if (actionType === "resetDecomposition") {
      setIsWordImportOpen(false);
      resetDayDecompositions();
      setPrimaryWordAction("copy");
      return;
    }
    if (actionType === "resetProblem") {
      setIsWordImportOpen(false);
      resetDayProblems();
      setPrimaryWordAction("copy");
      return;
    }
    importDayDecompositionFromClipboard().then((applied) => {
      if (applied) {
        setWordImportText("");
        setIsWordImportOpen(false);
      } else {
        setIsWordImportOpen(true);
      }
      setPrimaryWordAction("copy");
    });
  };

  const submitWordImport = async () => {
    const applied = await importDayDecompositionFromText(wordImportText);
    if (!applied) return;
    setWordImportText("");
    setIsWordImportOpen(false);
    setPrimaryWordAction("copy");
  };

  return {
    isWordImportOpen,
    primaryWordAction,
    runWordAction,
    setIsWordImportOpen,
    setWordImportText,
    submitWordImport,
    wordImportText,
  };
}
