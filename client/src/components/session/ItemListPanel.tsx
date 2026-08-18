import React from "react";
import { getExpressionStrict } from "../../domain/expression.ts";
import type { SessionItemView } from "./sessionViewTypes.ts";

export function ItemListPanel({
  currentItemId,
  dayItems,
  getDisplayItemId,
  onCopyId,
  onJump,
}: {
  currentItemId?: string;
  dayItems: SessionItemView[];
  getDisplayItemId: (item: SessionItemView) => string;
  onCopyId: (id: string) => void;
  onJump: (itemId: string) => void;
}) {
  if (dayItems.length === 0) {
    return <div className="jc-empty">항목이 없습니다.</div>;
  }

  return (
    <div className="jc-item-grid">
      {dayItems.map((item) => (
        <button
          key={item.id}
          type="button"
          className="jc-item-tile"
          data-active={currentItemId === item.id}
          onClick={() => onJump(item.id)}
        >
          <span className="jc-item-tile-expression">{getExpressionStrict(item, "ItemListPanel.item")}</span>
          <span
            className="jc-item-tile-id"
            role="button"
            tabIndex={0}
            title="ID 복사"
            onClick={(event) => {
              event.stopPropagation();
              onCopyId(getDisplayItemId(item));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onCopyId(getDisplayItemId(item));
              }
            }}
          >
            {getDisplayItemId(item)}
          </span>
        </button>
      ))}
    </div>
  );
}
