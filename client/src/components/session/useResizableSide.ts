import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

// PC 세션 화면의 오른쪽 패널 너비 조절. 드래그 중에는 텍스트 선택을 막는다.
export function useResizableSide({
  maxWidth,
  minWidth,
  setWidth,
  width,
}: {
  maxWidth: number;
  minWidth: number;
  setWidth: (width: number) => void;
  width: number;
}) {
  const [isResizing, setIsResizing] = useState(false);
  const stateRef = useRef({ startX: 0, startWidth: 0 });

  useEffect(() => {
    if (!isResizing) return undefined;

    const onMouseMove = (event: MouseEvent) => {
      const delta = stateRef.current.startX - event.clientX;
      const maxByViewport = Math.max(minWidth, window.innerWidth - 360);
      setWidth(Math.max(minWidth, Math.min(Math.min(maxWidth, maxByViewport), stateRef.current.startWidth + delta)));
    };

    const onMouseUp = () => {
      setIsResizing(false);
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing, maxWidth, minWidth, setWidth]);

  const startResize = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      stateRef.current = { startX: event.clientX, startWidth: width };
      document.body.style.userSelect = "none";
      setIsResizing(true);
    },
    [width],
  );

  return { isResizing, startResize };
}
