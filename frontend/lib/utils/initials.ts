const ZWNJ = "\u200C";

export function initialsFromName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0][0] ?? "؟";
  return (parts[0][0] ?? "") + ZWNJ + (parts[parts.length - 1][0] ?? "");
}
