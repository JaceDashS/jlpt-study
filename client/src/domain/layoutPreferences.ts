import { useEffect, useRef, useState } from "react";

const LAYOUT_MAX_WIDTH_STORAGE_KEY = "jlpt-n1-layout-max-width-v1";
const DEFAULT_LAYOUT_MAX_WIDTH = 1200;

export function normalizeLayoutMaxWidth(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LAYOUT_MAX_WIDTH;
  return Math.max(720, Math.min(2400, Math.round(parsed)));
}

function readSavedLayoutMaxWidth() {
  try {
    const raw = localStorage.getItem(LAYOUT_MAX_WIDTH_STORAGE_KEY);
    return normalizeLayoutMaxWidth(raw);
  } catch (error) {
    return DEFAULT_LAYOUT_MAX_WIDTH;
  }
}

export function useLayoutMaxWidth() {
  const [layoutMaxWidth, setLayoutMaxWidth] = useState(readSavedLayoutMaxWidth);
  const [layoutMaxWidthDraft, setLayoutMaxWidthDraft] = useState(String(layoutMaxWidth));
  const layoutWidthSpinnerRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(LAYOUT_MAX_WIDTH_STORAGE_KEY, String(layoutMaxWidth));
  }, [layoutMaxWidth]);

  useEffect(() => {
    setLayoutMaxWidthDraft(String(layoutMaxWidth));
  }, [layoutMaxWidth]);

  const handleLayoutWidthChange = (nextDraft) => {
    setLayoutMaxWidthDraft(nextDraft);
    if (!layoutWidthSpinnerRef.current) return;
    setLayoutMaxWidth(normalizeLayoutMaxWidth(nextDraft));
  };

  const handleLayoutWidthMouseDown = (event) => {
    const input = event.currentTarget;
    const rect = input.getBoundingClientRect();
    layoutWidthSpinnerRef.current = rect.right - event.clientX <= 20;
  };

  const stopLayoutWidthSpinner = () => {
    layoutWidthSpinnerRef.current = false;
  };

  const commitLayoutWidthDraft = () => {
    layoutWidthSpinnerRef.current = false;
    setLayoutMaxWidth(normalizeLayoutMaxWidth(layoutMaxWidthDraft));
  };

  return {
    commitLayoutWidthDraft,
    handleLayoutWidthChange,
    handleLayoutWidthMouseDown,
    layoutMaxWidth,
    layoutMaxWidthDraft,
    stopLayoutWidthSpinner,
  };
}
