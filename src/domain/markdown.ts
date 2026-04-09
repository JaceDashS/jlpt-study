function escapeHtml(text) {
  return text
    .split("&")
    .join("&amp;")
    .split("<")
    .join("&lt;")
    .split(">")
    .join("&gt;")
    .split('"')
    .join("&quot;")
    .split("'")
    .join("&#39;");
}

function renderInline(text) {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/&lt;br\s*\/?&gt;/gi, "<br />");
}

function isTableRow(line) {
  const trimmed = line.trim();
  return trimmed.includes("|") && trimmed.split("|").join("").trim().length > 0;
}

function isTableSeparator(line) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  const cells = parseTableCells(trimmed);
  if (cells.length === 0) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseTableCells(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function renderTable(lines, startIndex) {
  const headerCells = parseTableCells(lines[startIndex]);
  let cursor = startIndex + 2;
  const bodyRows = [];

  while (cursor < lines.length && isTableRow(lines[cursor])) {
    bodyRows.push(parseTableCells(lines[cursor]));
    cursor += 1;
  }

  const thead = `<thead><tr>${headerCells.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead>`;
  const tbody = bodyRows.length
    ? `<tbody>${bodyRows
        .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
        .join("")}</tbody>`
    : "";

  return {
    html: `<table>${thead}${tbody}</table>`,
    nextIndex: cursor,
  };
}

export function renderSimpleMarkdown(markdown) {
  const normalized = String(markdown ?? "").split("\\r\\n").join("\n").split("\\n").join("\n");
  const escaped = escapeHtml(normalized);
  const lines = escaped.split(/\r?\n/);
  const out = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      out.push("<br />");
      index += 1;
      continue;
    }

    if (index + 1 < lines.length && isTableRow(lines[index]) && isTableSeparator(lines[index + 1])) {
      const table = renderTable(lines, index);
      out.push(table.html);
      index = table.nextIndex;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      out.push("<hr />");
      index += 1;
      continue;
    }
    if (/^###\s+/.test(trimmed)) {
      out.push(`<h3>${renderInline(trimmed.replace(/^###\s+/, ""))}</h3>`);
      index += 1;
      continue;
    }
    if (/^##\s+/.test(trimmed)) {
      out.push(`<h2>${renderInline(trimmed.replace(/^##\s+/, ""))}</h2>`);
      index += 1;
      continue;
    }
    if (/^#\s+/.test(trimmed)) {
      out.push(`<h1>${renderInline(trimmed.replace(/^#\s+/, ""))}</h1>`);
      index += 1;
      continue;
    }

    out.push(`<p>${renderInline(line)}</p>`);
    index += 1;
  }

  return out.join("");
}
