export function extractBookId(modulePath: string): string {
  const normalized = String(modulePath).split("\\").join("/");
  const marker = "/asset/";
  const markerIndex = normalized.indexOf(marker);
  const filename = markerIndex >= 0 ? normalized.slice(markerIndex + marker.length) : normalized;
  return filename.replace(/\.json$/, "");
}

export function extractAssetPath(modulePath: string): string {
  const normalized = String(modulePath).split("\\").join("/");
  const marker = "/asset/";
  const markerIndex = normalized.indexOf(marker);
  const relPath = markerIndex >= 0 ? normalized.slice(markerIndex + marker.length) : normalized;
  return `asset/${relPath}`;
}

export function normalizeAssetPath(value: unknown) {
  return String(value ?? "").split("\\").join("/").replace(/^\.\/+/, "");
}

export function toModulePath(assetPath: string) {
  const normalized = normalizeAssetPath(assetPath);
  return normalized.startsWith("../../") ? normalized : `../../${normalized}`;
}

export function getAssetModules(files: Record<string, unknown> | undefined, predicate: (assetPath: string) => boolean) {
  if (!files || typeof files !== "object") return {};
  return Object.fromEntries(
    Object.entries(files).filter(([assetPath]) => predicate(normalizeAssetPath(assetPath))).map(([assetPath, value]) => [
      toModulePath(assetPath),
      value,
    ]),
  );
}

export function getCombinedModules(files?: Record<string, unknown>) {
  return getAssetModules(files, (assetPath) => {
    const parts = assetPath.split("/").filter(Boolean);
    return parts.length === 2 && parts[0] === "asset" && parts[1].toLowerCase().endsWith(".json");
  });
}
