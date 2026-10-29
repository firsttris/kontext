/**
 * How a call's tiles share the space. Pure; drawn by features/calls/call-tiles.tsx.
 *
 * - A shared screen takes the stage, everyone else goes into a strip below it.
 * - Two people: the other one fills the space, one's own camera sits small in its corner (as on a
 *   phone call with video), not two small pictures side by side.
 * - Otherwise a grid whose cells fill the space, with as many columns as make the pictures largest.
 */

export type TileLayout<T> =
  | { kind: "grid"; tiles: T[] }
  | { kind: "stage"; main: T; inset: T | null; strip: T[] };

export const arrangeTiles = <T>(
  tiles: T[],
  { isScreen, isLocal }: { isScreen: (tile: T) => boolean; isLocal: (tile: T) => boolean },
): TileLayout<T> => {
  const screens = tiles.filter(isScreen);
  const cameras = tiles.filter((tile) => !isScreen(tile));
  const [screen, ...otherScreens] = screens;
  if (screen)
    return { kind: "stage", main: screen, inset: null, strip: [...otherScreens, ...cameras] };
  const own = cameras.find(isLocal);
  const other = cameras.find((tile) => !isLocal(tile));
  if (cameras.length === 2 && own && other)
    return { kind: "stage", main: other, inset: own, strip: [] };
  return { kind: "grid", tiles: cameras };
};

/** Cameras are mostly 4:3 or 16:9; 4:3 keeps faces whole when a cell crops the picture. */
const PICTURE_ASPECT = 4 / 3;

/** The column count that makes `count` pictures largest in a `width` × `height` space. */
export const gridColumns = (count: number, width: number, height: number): number => {
  if (count <= 1 || width <= 0 || height <= 0) return 1;
  const pictureArea = (columns: number) => {
    const rows = Math.ceil(count / columns);
    const pictureWidth = Math.min(width / columns, (height / rows) * PICTURE_ASPECT);
    return pictureWidth * (pictureWidth / PICTURE_ASPECT);
  };
  let best = 1;
  for (let columns = 2; columns <= count; columns++) {
    if (pictureArea(columns) > pictureArea(best)) best = columns;
  }
  return best;
};
