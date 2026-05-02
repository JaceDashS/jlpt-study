import { useEffect, useState } from "react";
import type { AssetFileMap, AvailableBook } from "./curriculumFiles.ts";
import { getDefaultBookId, listAvailableBooks, loadCurriculumFiles } from "./curriculumFiles.ts";

type BootState =
  | { status: "loading"; files: null; availableBooks: AvailableBook[]; selectedBookId: "" }
  | { status: "ready"; files: AssetFileMap; availableBooks: AvailableBook[]; selectedBookId: string }
  | { status: "error"; files: null; availableBooks: AvailableBook[]; selectedBookId: ""; error: unknown };

export function useAppBoot() {
  const [boot, setBoot] = useState<BootState>({
    status: "loading",
    files: null,
    availableBooks: [],
    selectedBookId: "",
  });

  useEffect(() => {
    let cancelled = false;
    loadCurriculumFiles()
      .then((files) => {
        if (cancelled) return;
        const availableBooks = listAvailableBooks(files);
        const defaultBookId = getDefaultBookId(availableBooks);
        const savedBookId = localStorage.getItem("jlpt-selected-book");
        const selectedBookId = availableBooks.some((book) => book.id === savedBookId) ? savedBookId : defaultBookId;
        if (!selectedBookId) {
          throw new Error("No curriculum books found");
        }
        setBoot({ status: "ready", files, availableBooks, selectedBookId });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to boot app:", error);
        setBoot({ status: "error", files: null, availableBooks: [], selectedBookId: "", error });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return boot;
}
