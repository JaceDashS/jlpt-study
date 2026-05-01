import React from "react";
import { cx } from "../styles.ts";
import { getExpressionStrict } from "./expression.ts";

export function renderKanjiWithReading(item, options: { showReading?: boolean } = {}) {
  const showReading = options.showReading !== false;
  const readingClass = showReading ? "ruby-reading" : "ruby-reading-hidden";
  const word = getExpressionStrict(item, "renderKanjiWithReading");
  const reading = String(item?.reading ?? "");
  const mapping = item?.kanjiToKana ?? {};
  const entries = Object.entries(mapping)
    .filter(([base, reading]) => base && reading)
    .sort((a, b) => b[0].length - a[0].length);

  if (!word) return null;

  if (entries.length === 0) {
    return (
      <ruby className={cx("ruby-kanji")}>
        <span className={cx("ruby-base")}>{word}</span>
        <rt className={cx(readingClass)}>{reading}</rt>
      </ruby>
    );
  }

  const nodes = [];
  let index = 0;

  while (index < word.length) {
    const matched = entries.find(([base]) => word.startsWith(base, index));
    if (matched) {
      const [base, reading] = matched;
      nodes.push(
        <ruby key={`ruby-${index}`} className={cx("ruby-piece")}>
          <span className={cx("ruby-base")}>{base}</span>
          <rt className={cx(readingClass)}>{reading}</rt>
        </ruby>,
      );
      index += base.length;
      continue;
    }

    nodes.push(
      <span key={`plain-${index}`} className={cx("ruby-plain ruby-base")}>
        {word[index]}
      </span>,
    );
    index += 1;
  }

  return <span className={cx("ruby-group ruby-base")}>{nodes}</span>;
}

export function renderSentenceWithTarget(sentence, target) {
  const text = String(sentence ?? "");
  const needle = String(target ?? "").trim();
  if (!text) return "";
  if (!needle) return text;

  const index = text.indexOf(needle);
  if (index < 0) return text;

  const before = text.slice(0, index);
  const match = text.slice(index, index + needle.length);
  const after = text.slice(index + needle.length);

  return (
    <>
      {before}
      <span className={cx("target-underline")}>{match}</span>
      {after}
    </>
  );
}
