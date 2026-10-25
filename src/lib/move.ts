/** Moves the item at `index` one place up (-1) or down (+1); at the ends it stays. Pure. */
export const moved = <T>(items: T[], index: number, by: -1 | 1): T[] => {
  const target = index + by;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
};
