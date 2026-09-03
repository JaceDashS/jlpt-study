#!/usr/bin/env node
/**
 * Remove redundant kana-only items and repack combined asset days.
 *
 * This is a read-only preview unless --apply is passed. When retained items
 * from a later source day move into an earlier packed day, the packed day
 * inherits all day-level metadata from the latest source day in that chunk.
 */

const fs = require("node:fs");
const path = require("node:path");

const ITEMS_PER_DAY = 20;
const DEFAULT_TARGET = path.resolve(__dirname, "..", "asset", "jlpt-short-term.json");

function parseArgs(argv) {
  const apply = argv.includes("--apply");
  const positional = argv.filter((value) => value !== "--apply");
  if (positional.length > 1) {
    throw new Error("Usage: node scripts/remove-redundant-kana-items.cjs [target] [--apply]");
  }
  return { apply, target: path.resolve(positional[0] ?? DEFAULT_TARGET) };
}

function isRemovalTarget(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const expression = item.expression;
  if (typeof expression !== "string" || !/^[\u3041-\u3096]+$/u.test(expression)) return false;

  const readingParts = item.readingParts;
  if (!readingParts || typeof readingParts !== "object" || Array.isArray(readingParts)) return false;

  const mapping = readingParts.kanjiToKana;
  const mapped = mapping && typeof mapping === "object" && !Array.isArray(mapping)
    ? Object.values(mapping).map(String).join("")
    : "";
  const sum = `${mapped}${readingParts.restKana ?? ""}`;
  return sum === expression;
}

function extractDays(data) {
  if (!data || typeof data !== "object" || data.format !== "combined") {
    throw new Error('Target must be a combined JSON object (format: "combined").');
  }
  if (!Array.isArray(data.days)) throw new Error('Target must contain a "days" array.');

  return data.days.map((group, groupIndex) => {
    if (!group || !Array.isArray(group.day) || group.day.length !== 1) {
      throw new Error(`Day group ${groupIndex + 1} must contain exactly one day object.`);
    }
    const day = group.day[0];
    if (!day || typeof day !== "object" || !Array.isArray(day.items)) {
      throw new Error(`Day group ${groupIndex + 1} has no valid items array.`);
    }
    return day;
  });
}

function transform(data) {
  const sourceDays = extractDays(data);
  const retained = [];
  let removedItems = 0;

  sourceDays.forEach((sourceDay, sourceDayIndex) => {
    sourceDay.items.forEach((item) => {
      if (isRemovalTarget(item)) removedItems += 1;
      else retained.push({ item, sourceDayIndex });
    });
  });

  const packedGroups = [];
  for (let offset = 0; offset < retained.length; offset += ITEMS_PER_DAY) {
    const chunk = retained.slice(offset, offset + ITEMS_PER_DAY);
    const newDayNumber = Math.floor(offset / ITEMS_PER_DAY) + 1;
    const metadataSource = sourceDays[chunk.at(-1).sourceDayIndex];
    const packedItems = chunk.map(({ item }, itemOffset) => ({
      ...item,
      index: itemOffset + 1,
      id: `d${newDayNumber}-i${itemOffset + 1}`,
    }));
    const { items: _discardedItems, ...inheritedMetadata } = metadataSource;
    packedGroups.push({ day: [{ items: packedItems, ...inheritedMetadata }] });
  }

  const transformed = { ...data, days: packedGroups };
  const stats = {
    before_days: sourceDays.length,
    after_days: packedGroups.length,
    before_items: sourceDays.reduce((sum, day) => sum + day.items.length, 0),
    after_items: retained.length,
    removed_items: removedItems,
  };
  return { transformed, stats };
}

function validate(data, stats) {
  const days = extractDays(data);
  const expectedItems = stats.before_items - stats.removed_items;
  const actualItems = days.reduce((sum, day) => sum + day.items.length, 0);
  if (actualItems !== expectedItems) {
    throw new Error(`Validation failed: expected ${expectedItems} items, found ${actualItems}.`);
  }

  const seenIds = new Set();
  days.forEach((day, dayOffset) => {
    const dayNumber = dayOffset + 1;
    const expectedSize = dayNumber < days.length ? ITEMS_PER_DAY : (actualItems % ITEMS_PER_DAY || ITEMS_PER_DAY);
    if (day.items.length !== expectedSize) {
      throw new Error(`Validation failed: Day ${dayNumber} has ${day.items.length} items.`);
    }
    day.items.forEach((item, itemOffset) => {
      const itemIndex = itemOffset + 1;
      const expectedId = `d${dayNumber}-i${itemIndex}`;
      if (item.index !== itemIndex || item.id !== expectedId) {
        throw new Error(`Validation failed: invalid position metadata at ${expectedId}.`);
      }
      if (seenIds.has(expectedId)) throw new Error(`Validation failed: duplicate item id ${expectedId}.`);
      if (isRemovalTarget(item)) throw new Error(`Validation failed: removal target remains at ${expectedId}.`);
      seenIds.add(expectedId);
    });
  });
}

function main() {
  const { apply, target } = parseArgs(process.argv.slice(2));
  const data = JSON.parse(fs.readFileSync(target, "utf8").replace(/^\uFEFF/u, ""));
  const { transformed, stats } = transform(data);
  validate(transformed, stats);

  console.log(`mode=${apply ? "APPLY" : "DRY-RUN"}`);
  Object.entries(stats).forEach(([key, value]) => console.log(`${key}=${value}`));
  console.log(`last_day_items=${extractDays(transformed).at(-1).items.length}`);

  if (apply) {
    fs.writeFileSync(target, `${JSON.stringify(transformed, null, 2)}\n`, "utf8");
    console.log(`written=${target}`);
  }
}

main();
