import React from "react";

export type NavKey = "today" | "days" | "progress" | "settings";

const NAV: Array<{ key: NavKey; label: string; icon: string }> = [
  { key: "today", label: "오늘", icon: "◐" },
  { key: "days", label: "Day", icon: "▤" },
  { key: "progress", label: "진행", icon: "◫" },
  { key: "settings", label: "설정", icon: "⚙" },
];

export function TopBar({
  dueCount,
  nav,
  onNavigate,
  today,
}: {
  dueCount: number;
  nav: NavKey;
  onNavigate: (key: NavKey) => void;
  today: string;
}) {
  return (
    <header className="jc-topbar">
      <div className="jc-brand">
        <span className="jc-brand-mark">和</span>
        Japanese Companion
      </div>
      <div className="jc-topnav">
        {NAV.map((item) => (
          <button key={item.key} type="button" data-active={nav === item.key} onClick={() => onNavigate(item.key)}>
            {item.label}
            {item.key === "today" && dueCount > 0 ? ` · ${dueCount}` : ""}
          </button>
        ))}
      </div>
      <span className="jc-spacer" />
      <span className="jc-dim">{today}</span>
    </header>
  );
}

export function PhoneHeader({ subtitle, title }: { subtitle: string; title: string }) {
  return (
    <header className="jc-phone-head">
      <span className="jc-brand-mark">和</span>
      <div className="jc-phone-title">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
    </header>
  );
}

export function TabBar({
  dueCount,
  nav,
  onNavigate,
}: {
  dueCount: number;
  nav: NavKey;
  onNavigate: (key: NavKey) => void;
}) {
  return (
    <nav className="jc-tabbar">
      {NAV.map((item) => (
        <button key={item.key} type="button" data-active={nav === item.key} onClick={() => onNavigate(item.key)}>
          <span className="jc-tab-icon" aria-hidden>
            {item.icon}
          </span>
          {item.label}
          {item.key === "today" && dueCount > 0 ? <span className="jc-tab-dot">{dueCount}</span> : null}
        </button>
      ))}
    </nav>
  );
}
