import { useEffect, useRef, useState } from "react";
import {
  useAnimatedDrawer,
  useDrawerOutsideDismiss,
  useResizableDrawer,
  useStudyPopupShortcut,
  useStudyTopAutoFit,
} from "./useSessionDrawers.ts";
import type { SessionDayView, SessionItemView, SessionView, SetSession } from "./sessionViewTypes.ts";

type SessionPanelLayout = {
  dayListDrawerWidth: number;
  setDayListDrawerWidth: (width: number) => void;
  setStudyDrawerWidth: (width: number) => void;
  studyDrawerWidth: number;
};

type UseSessionPanelStateOptions = {
  currentItem: SessionItemView | null;
  layout: SessionPanelLayout;
  session: SessionView;
  sessionDay: SessionDayView;
  sessionItems: SessionItemView[];
  setSession: SetSession;
};

export function useSessionPanelState({
  currentItem,
  layout,
  session,
  sessionDay,
  sessionItems,
  setSession,
}: UseSessionPanelStateOptions) {
  const { dayListDrawerWidth, setDayListDrawerWidth, setStudyDrawerWidth, studyDrawerWidth } = layout;
  const studyDrawer = useAnimatedDrawer();
  const dayListDrawer = useAnimatedDrawer();
  const [isDecompositionVisible, setIsDecompositionVisible] = useState(false);
  const [showFurigana, setShowFurigana] = useState(true);
  const [showMeaning, setShowMeaning] = useState(true);
  const drawerRef = useRef<HTMLElement | null>(null);
  const dayListDrawerRef = useRef<HTMLElement | null>(null);
  const studyTopInlineRef = useRef<HTMLElement | null>(null);

  const { isResizing, startResize } = useResizableDrawer({
    defaultWidth: 520,
    maxWidth: 980,
    minWidth: 360,
    resizeFrom: "left",
    setWidth: setStudyDrawerWidth,
    width: studyDrawerWidth,
  });
  const { isResizing: isDayListResizing, startResize: startDayListResize } = useResizableDrawer({
    defaultWidth: 420,
    maxWidth: 860,
    minWidth: 280,
    resizeFrom: "right",
    setWidth: setDayListDrawerWidth,
    width: dayListDrawerWidth,
  });

  const openStudyPopup = () => {
    studyDrawer.open();
    setIsDecompositionVisible(false);
  };
  const closeStudyPopup = studyDrawer.close;
  const openDayListDrawer = dayListDrawer.open;
  const closeDayListDrawer = dayListDrawer.close;

  useStudyTopAutoFit({
    currentItemId: currentItem?.id,
    itemCount: sessionItems.length,
    phase: session.phase,
    studyTopInlineRef,
  });
  useDrawerOutsideDismiss({
    dayListDrawer,
    dayListDrawerRef,
    drawerRef,
    studyDrawer,
  });
  useStudyPopupShortcut({
    currentItemId: currentItem?.id,
    onClose: closeStudyPopup,
    onOpen: openStudyPopup,
    phase: session.phase,
    studyDrawer,
  });

  useEffect(() => {
    studyDrawer.reset();
    setIsDecompositionVisible(false);
  }, [session.phase, currentItem?.id]);

  useEffect(() => {
    if (session.phase === "study") return;
    dayListDrawer.reset();
  }, [session.phase]);

  const shouldRenderDrawer = session.phase === "quiz" && currentItem && (studyDrawer.isOpen || studyDrawer.isClosing);
  const shouldRenderDayListDrawer = session.phase === "study" && (dayListDrawer.isOpen || dayListDrawer.isClosing);
  const dayItems = Array.isArray(sessionDay?.items) ? sessionDay.items.filter((item): item is SessionItemView => Boolean(item)) : [];

  const jumpToDayItem = (itemId: string) => {
    const indexInCurrentSession = sessionItems.findIndex((item) => item?.id === itemId);
    if (indexInCurrentSession >= 0) {
      setSession((prev) => prev && ({
        ...prev,
        index: indexInCurrentSession,
      }));
      closeDayListDrawer();
      return;
    }

    const allIds = dayItems.map((item) => item.id);
    const nextIndex = allIds.findIndex((id) => id === itemId);
    setSession((prev) => prev && ({
      ...prev,
      itemIds: allIds,
      index: nextIndex >= 0 ? nextIndex : 0,
    }));
    closeDayListDrawer();
  };

  return {
    closeDayListDrawer,
    closeStudyPopup,
    dayItems,
    dayListDrawer,
    dayListDrawerRef,
    drawerRef,
    isDayListResizing,
    isDecompositionVisible,
    isResizing,
    jumpToDayItem,
    openDayListDrawer,
    openStudyPopup,
    setIsDecompositionVisible,
    setShowFurigana,
    setShowMeaning,
    shouldRenderDayListDrawer,
    shouldRenderDrawer,
    showFurigana,
    showMeaning,
    startDayListResize,
    startResize,
    studyDrawer,
    studyTopInlineRef,
  };
}
