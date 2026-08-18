import React from "react";
import { getExpressionStrict } from "./expression.ts";

// 표현을 한자 단위 루비(후리가나)로 렌더한다. showReading 이 false 면 읽기를 숨긴다.
export function renderKanjiWithReading(item, options: { showReading?: boolean } = {}) {
  const showReading = options.showReading !== false;
  const readingClass = showReading ? "jc-rt" : "jc-rt jc-rt-hidden";
  const word = getExpressionStrict(item, "renderKanjiWithReading");
  const reading = String(item?.reading ?? "");
  const mapping = item?.kanjiToKana ?? {};
  const entries = Object.entries(mapping as Record<string, unknown>)
    .map(([base, kana]) => [base, String(kana ?? "")] as const)
    .filter(([base, kana]) => base && kana)
    .sort((a, b) => b[0].length - a[0].length);

  if (!word) return null;

  if (entries.length === 0) {
    return (
      <ruby>
        <span>{word}</span>
        <rt className={readingClass}>{reading}</rt>
      </ruby>
    );
  }

  const nodes: React.ReactNode[] = [];
  let index = 0;

  while (index < word.length) {
    const matched = entries.find(([base]) => word.startsWith(base, index));
    if (matched) {
      const [base, kana] = matched;
      nodes.push(
        <ruby key={`ruby-${index}`}>
          <span>{base}</span>
          <rt className={readingClass}>{kana}</rt>
        </ruby>,
      );
      index += base.length;
      continue;
    }

    nodes.push(<span key={`plain-${index}`}>{word[index]}</span>);
    index += 1;
  }

  return <span className="jc-ruby-group">{nodes}</span>;
}

export function renderSentenceWithTarget(sentence, target) {
  const text = String(sentence ?? "");
  const needle = String(target ?? "").trim();
  if (!text) return "";
  if (!needle) return text;

  const index = text.indexOf(needle);
  if (index < 0) return text;

  return (
    <>
      {text.slice(0, index)}
      <span className="jc-quiz-target">{text.slice(index, index + needle.length)}</span>
      {text.slice(index + needle.length)}
    </>
  );
}
