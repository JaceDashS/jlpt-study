import { useEffect, useState } from "react";

// 폰/PC 셸을 가르는 기준. 이 값 아래면 폰 레이아웃을 쓴다.
export const PHONE_MAX_WIDTH = 768;

const STORAGE_KEY = "jpc-device-mode-v1";

export type DeviceModePreference = "auto" | "phone" | "pc";
export type DeviceMode = "phone" | "pc";

function readStoredPreference(): DeviceModePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "phone" || raw === "pc" ? raw : "auto";
  } catch {
    return "auto";
  }
}

function readViewportMode(): DeviceMode {
  if (typeof window === "undefined") return "pc";
  return window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px)`).matches ? "phone" : "pc";
}

export function useDeviceMode() {
  const [preference, setPreferenceState] = useState<DeviceModePreference>(readStoredPreference);
  const [viewportMode, setViewportMode] = useState<DeviceMode>(readViewportMode);

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px)`);
    const onChange = () => setViewportMode(query.matches ? "phone" : "pc");
    query.addEventListener("change", onChange);
    // 기기 에뮬레이션처럼 matchMedia change 가 오지 않는 환경이 있어 resize 도 함께 본다.
    window.addEventListener("resize", onChange);
    onChange();
    return () => {
      query.removeEventListener("change", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, []);

  const setPreference = (next: DeviceModePreference) => {
    setPreferenceState(next);
    try {
      if (next === "auto") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 저장 실패는 무시한다. 이번 세션에만 적용된다.
    }
  };

  const mode: DeviceMode = preference === "auto" ? viewportMode : preference;

  useEffect(() => {
    document.documentElement.dataset.device = mode;
  }, [mode]);

  return {
    isPhone: mode === "phone",
    mode,
    preference,
    setPreference,
    viewportMode,
  };
}
