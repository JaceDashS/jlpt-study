import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from "react";

const DRAWER_ANIMATION_MS = 240;

export function useAnimatedDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    if (!isOpen || isClosing) return;
    setIsClosing(true);
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      closeTimerRef.current = null;
    }, DRAWER_ANIMATION_MS);
  }, [clearCloseTimer, isClosing, isOpen]);

  const open = useCallback(() => {
    clearCloseTimer();
    setIsClosing(false);
    setIsOpen(true);
  }, [clearCloseTimer]);

  const reset = useCallback(() => {
    clearCloseTimer();
    setIsOpen(false);
    setIsClosing(false);
  }, [clearCloseTimer]);

  useEffect(() => clearCloseTimer, []);

  return { clearCloseTimer, close, isClosing, isOpen, open, reset };
}

type ResizableDrawerOptions = {
  defaultWidth: number;
  maxWidth: number;
  minWidth: number;
  resizeFrom: "left" | "right";
  setWidth: (width: number) => void;
  width: number;
};

export function useResizableDrawer({ defaultWidth, maxWidth, minWidth, resizeFrom, setWidth, width }: ResizableDrawerOptions) {
  const [isResizing, setIsResizing] = useState(false);
  const resizeStateRef = useRef({ active: false, startX: 0, startWidth: 0 });

  useEffect(() => {
    if (!isResizing) return undefined;

    const onMouseMove = (event: MouseEvent) => {
      const state = resizeStateRef.current;
      if (!state.active) return;
      const delta = resizeFrom === "left" ? state.startX - event.clientX : event.clientX - state.startX;
      const maxByViewport = Math.max(minWidth, window.innerWidth - 24);
      const nextWidth = Math.max(minWidth, Math.min(Math.min(maxWidth, maxByViewport), state.startWidth + delta));
      setWidth(nextWidth);
    };

    const onMouseUp = () => {
      resizeStateRef.current.active = false;
      setIsResizing(false);
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing, maxWidth, minWidth, resizeFrom, setWidth]);

  const startResize = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    resizeStateRef.current = {
      active: true,
      startX: event.clientX,
      startWidth: Number(width) || defaultWidth,
    };
    document.body.style.userSelect = "none";
    setIsResizing(true);
  }, [defaultWidth, width]);

  return { isResizing, startResize };
}

type AnimatedDrawerState = ReturnType<typeof useAnimatedDrawer>;

export function useDrawerOutsideDismiss({
  dayListDrawer,
  dayListDrawerRef,
  drawerRef,
  studyDrawer,
}: {
  dayListDrawer: AnimatedDrawerState;
  dayListDrawerRef: RefObject<HTMLElement>;
  drawerRef: RefObject<HTMLElement>;
  studyDrawer: AnimatedDrawerState;
}) {
  useEffect(() => {
    if ((!studyDrawer.isOpen || studyDrawer.isClosing) && (!dayListDrawer.isOpen || dayListDrawer.isClosing)) return undefined;

    const onDocumentMouseDown = (event: MouseEvent) => {
      if (drawerRef.current?.contains(event.target as Node) || dayListDrawerRef.current?.contains(event.target as Node)) {
        return;
      }
      if (studyDrawer.isOpen && !studyDrawer.isClosing) {
        studyDrawer.close();
      }
      if (dayListDrawer.isOpen && !dayListDrawer.isClosing) {
        dayListDrawer.close();
      }
    };

    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDown);
    };
  }, [
    dayListDrawer.close,
    dayListDrawer.isClosing,
    dayListDrawer.isOpen,
    dayListDrawerRef,
    drawerRef,
    studyDrawer.close,
    studyDrawer.isClosing,
    studyDrawer.isOpen,
  ]);
}

export function useStudyPopupShortcut({
  currentItemId,
  onClose,
  onOpen,
  phase,
  studyDrawer,
}: {
  currentItemId?: string | number;
  onClose: () => void;
  onOpen: () => void;
  phase: string;
  studyDrawer: AnimatedDrawerState;
}) {
  useEffect(() => {
    if (phase !== "quiz" || !currentItemId) return undefined;

    const isTextInputTarget = (target: EventTarget | null) => {
      if (!target || !(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      return target.isContentEditable;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTextInputTarget(event.target)) return;
      if (event.code !== "Backquote") return;

      event.preventDefault();
      if (studyDrawer.isOpen && !studyDrawer.isClosing) {
        onClose();
        return;
      }
      onOpen();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [currentItemId, onClose, onOpen, phase, studyDrawer.isClosing, studyDrawer.isOpen]);
}

export function useStudyTopAutoFit({
  currentItemId,
  itemCount,
  phase,
  studyTopInlineRef,
}: {
  currentItemId?: string | number;
  itemCount: number;
  phase: string;
  studyTopInlineRef: RefObject<HTMLElement>;
}) {
  useEffect(() => {
    if (phase !== "study" || !currentItemId) return undefined;
    const el = studyTopInlineRef.current;
    if (!el) return undefined;

    const applyBestSize = () => {
      const maxSize = 16;
      const minSize = 10;
      const step = 0.25;

      let selected = maxSize;
      for (let size = maxSize; size >= minSize; size -= step) {
        el.style.setProperty("--study-top-size", `${size}px`);
        const fitsWidth = el.scrollWidth <= el.clientWidth + 1;
        const fitsHeight = el.scrollHeight <= el.clientHeight + 1;
        if (fitsWidth && fitsHeight) {
          selected = size;
          break;
        }
        selected = Math.max(minSize, size - step);
      }

      el.style.setProperty("--study-top-size", `${selected}px`);
    };

    applyBestSize();

    const observer = new ResizeObserver(() => {
      applyBestSize();
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [currentItemId, itemCount, phase, studyTopInlineRef]);
}
