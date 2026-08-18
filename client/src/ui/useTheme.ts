import { useEffect, useState } from "react";

export type ThemeName = "dark" | "light";

const STORAGE_KEY = "jpc-theme-v1";

function readStoredTheme(): ThemeName {
  try {
    // "washi" 는 예전 값. 라이트 모드로 이어받는다.
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "washi" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeName>(readStoredTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // 저장 실패는 무시한다.
    }
  }, [theme]);

  return [theme, setThemeState] as const;
}
