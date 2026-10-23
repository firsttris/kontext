/** Splits text into the parts that match search words and the rest, case-insensitively. */
export const splitHighlight = (
  text: string,
  terms: string[] | undefined,
): { text: string; hit: boolean }[] => {
  const words = (terms ?? []).filter(Boolean);
  if (!text || words.length === 0) return [{ text, hit: false }];
  const escaped = words
    .sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  // With one capturing group, every second part is a match.
  return text
    .split(pattern)
    .map((part, index) => ({ text: part, hit: index % 2 === 1 }))
    .filter((part) => part.text);
};
