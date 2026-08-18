import React, { useEffect, useRef, useState } from "react";
import { renderSimpleMarkdown } from "../../domain/markdown.ts";

export function Card({ title, hint, actions, children }: {
  title?: React.ReactNode;
  hint?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="jc-card">
      {title ? (
        <h2 className="jc-card-title">
          {title}
          {hint ? <small>{hint}</small> : null}
          {actions ? <span style={{ marginLeft: "auto" }}>{actions}</span> : null}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

export function Chip({ tone, children }: {
  tone: "review" | "learning" | "fail" | "pass" | "mute";
  children: React.ReactNode;
}) {
  return (
    <span className="jc-chip" data-tone={tone}>
      {children}
    </span>
  );
}

export function Meter({ ratio, tone }: { ratio: number; tone?: "ai" }) {
  const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  return (
    <div className="jc-meter" data-tone={tone}>
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

export function MeterRow({ label, value, ratio, tone }: {
  label: string;
  value: React.ReactNode;
  ratio: number;
  tone?: "ai";
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div className="jc-meter-row">
        <span>{label}</span>
        <b>{value}</b>
      </div>
      <Meter ratio={ratio} tone={tone} />
    </div>
  );
}

export function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <span className="jc-switch-label">
      {label}
      <button type="button" className="jc-switch" data-on={on} aria-pressed={on} aria-label={label} onClick={onToggle}>
        <span />
      </button>
    </span>
  );
}

export function CopyableId({ id, onCopy }: { id: string; onCopy: (id: string) => void }) {
  return (
    <span
      className="jc-id"
      role="button"
      tabIndex={0}
      title="ID 복사"
      onClick={() => onCopy(id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onCopy(id);
        }
      }}
    >
      {id}
    </span>
  );
}

export function AutoGrowTextarea({
  value,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value?: string }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const safeValue = value ?? "";

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [safeValue]);

  return <textarea ref={ref} value={safeValue} {...props} />;
}

// 미리보기를 누르면 편집으로 바뀌고, 포커스를 잃으면 커밋한다.
export function MemoEditor({
  label,
  value,
  onCommit,
  placeholder,
  requireDoubleClick = false,
}: {
  label?: string;
  value?: string;
  onCommit: (value: string) => void;
  placeholder: string;
  requireDoubleClick?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const startEditing = () => setIsEditing(true);

  return (
    <div className="jc-memo">
      {label ? <span className="jc-memo-label">{label}</span> : null}
      {isEditing ? (
        <AutoGrowTextarea
          className="jc-textarea"
          value={draft}
          autoFocus
          placeholder="Markdown으로 메모를 작성하세요."
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              skipBlurCommitRef.current = true;
              setDraft(value ?? "");
              setIsEditing(false);
              event.currentTarget.blur();
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
        />
      ) : (
        <div
          className="jc-memo-view"
          role="button"
          tabIndex={0}
          onClick={() => {
            if (!requireDoubleClick) startEditing();
          }}
          onDoubleClick={() => {
            if (requireDoubleClick) startEditing();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              startEditing();
            }
          }}
          dangerouslySetInnerHTML={{
            __html: draft ? renderSimpleMarkdown(draft) : `<span class='placeholder'>${placeholder}</span>`,
          }}
        />
      )}
    </div>
  );
}

export function MarkdownView({ text, placeholder }: { text?: string; placeholder: string }) {
  return (
    <div
      className="jc-memo-view"
      dangerouslySetInnerHTML={{
        __html: text ? renderSimpleMarkdown(String(text)) : `<span class='placeholder'>${placeholder}</span>`,
      }}
    />
  );
}

// 폰에서는 바텀시트, PC에서는 가운데 모달로 렌더된다(스타일 분기).
export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="jc-sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="jc-sheet" style={{ position: "relative" }}>
        <span className="jc-sheet-grip" aria-hidden />
        <div className="jc-sheet-head">
          <h3>{title}</h3>
          <span className="jc-spacer" />
          {footer}
          <button type="button" className="jc-btn" data-variant="ghost" data-size="icon" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="jc-sheet-body">{children}</div>
      </div>
    </div>
  );
}
