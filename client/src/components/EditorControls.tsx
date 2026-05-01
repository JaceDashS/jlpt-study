import { useEffect, useRef, useState } from "react";
import { renderSimpleMarkdown } from "../domain/markdown.ts";
import { cx } from "../styles.ts";

export function AutoGrowTextarea({ value, ...props }) {
  const ref = useRef(null);
  const safeValue = value ?? "";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [safeValue]);

  return <textarea ref={ref} value={safeValue} {...props} />;
}

export function MemoEditor({
  label,
  value,
  onCommit,
  clickToEdit = false,
  doubleClickToEdit = false,
  emptyPreviewPlaceholder = "클릭해서 입력",
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const moveFocusByTab = (currentElement, reverse = false) => {
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = Array.from(document.querySelectorAll(focusableSelector)).filter(
      (el) => el instanceof HTMLElement && el.offsetParent !== null,
    );
    const currentIndex = focusable.indexOf(currentElement);
    if (currentIndex < 0) return;
    const nextIndex = reverse ? currentIndex - 1 : currentIndex + 1;
    const nextTarget = focusable[nextIndex];
    if (nextTarget instanceof HTMLElement) {
      nextTarget.focus();
    }
  };

  return (
    <div className={cx("memo-block")}>
      {label ? <p className={cx("memo-label")}>{label}</p> : null}
      {clickToEdit ? (
        <>
          {!isEditing && (
            <div
              className={cx("memo-preview memo-preview-button")}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (!doubleClickToEdit) {
                  setIsEditing(true);
                }
              }}
              onDoubleClick={() => {
                if (doubleClickToEdit) {
                  setIsEditing(true);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  setIsEditing(true);
                }
              }}
              dangerouslySetInnerHTML={{
                __html: draft ? renderSimpleMarkdown(draft) : `<span class='placeholder'>${emptyPreviewPlaceholder}</span>`,
              }}
            />
          )}
          {isEditing && (
            <AutoGrowTextarea
              className={cx(`memo-input ${isEditing ? "is-editing" : ""}`)}
              value={draft}
              onChange={(event) => {
                const next = event.target.value;
                setDraft(next);
              }}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  skipBlurCommitRef.current = true;
                  setDraft(value ?? "");
                  setIsEditing(false);
                  event.currentTarget.blur();
                  return;
                }
                if (event.key === "Tab") {
                  event.preventDefault();
                  skipBlurCommitRef.current = true;
                  onCommit(draft);
                  setIsEditing(false);
                  event.currentTarget.blur();
                  moveFocusByTab(event.currentTarget, event.shiftKey);
                }
              }}
              onBlur={() => {
                if (skipBlurCommitRef.current) {
                  skipBlurCommitRef.current = false;
                  return;
                }
                setIsEditing(false);
                onCommit(draft);
              }}
              placeholder="Markdown으로 메모를 작성하세요."
            />
          )}
        </>
      ) : (
        <>
          <AutoGrowTextarea
            className={cx(`memo-input ${isEditing ? "is-editing" : ""}`)}
            value={draft}
            onChange={(event) => {
              const next = event.target.value;
              setDraft(next);
            }}
            onFocus={() => setIsEditing(true)}
            onBlur={() => {
              setIsEditing(false);
              onCommit(draft);
            }}
            placeholder="Markdown으로 메모를 작성하세요."
          />
          <div
            className={cx("memo-preview")}
            dangerouslySetInnerHTML={{
              __html: draft ? renderSimpleMarkdown(draft) : "<span class='placeholder'>미입력</span>",
            }}
          />
        </>
      )}
    </div>
  );
}

export function ProgressButton({ active, disabled = false, ratio, children, onClick }) {
  const width = `${Math.max(0, Math.min(100, Math.round(ratio * 100)))}%`;
  return (
    <button
      type="button"
      className={cx(`progress-button ${active ? "active" : ""}`)}
      disabled={disabled}
      onClick={onClick}
    >
      <span className={cx("bar")} style={{ width }} />
      <span className={cx("label")}>{children}</span>
    </button>
  );
}
