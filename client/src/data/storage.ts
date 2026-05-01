const LEGACY_STORAGE_KEY = "jlpt-n1-expression-state-v1";
const COMPAT_WORD_STORAGE_KEY = "jlpt-n1-word-state-v1";
const COMPAT_KANJI_STORAGE_KEY = "jlpt-n1-kanji-state-v1";

function bookStorageKey(bookId: string) {
  return `jlpt-state-${bookId}`;
}

export function loadState(bookId: string) {
  const raw = localStorage.getItem(bookStorageKey(bookId));
  // Legacy fallback: old single-book key only for jlpt-one-book-n1
  const legacyRaw =
    bookId === "jlpt-one-book-n1"
      ? (localStorage.getItem(LEGACY_STORAGE_KEY) ??
          localStorage.getItem(COMPAT_WORD_STORAGE_KEY) ??
          localStorage.getItem(COMPAT_KANJI_STORAGE_KEY))
      : null;
  const target = raw ?? legacyRaw;
  if (!target) return null;
  try {
    return JSON.parse(target);
  } catch (error) {
    console.error("Failed to parse saved JSON:", error);
    return null;
  }
}

export function saveState(state, bookId: string) {
  localStorage.setItem(bookStorageKey(bookId), JSON.stringify(state));
}

export function clearState(bookId: string) {
  localStorage.removeItem(bookStorageKey(bookId));
  if (bookId === "jlpt-one-book-n1") {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(COMPAT_WORD_STORAGE_KEY);
    localStorage.removeItem(COMPAT_KANJI_STORAGE_KEY);
  }
}
