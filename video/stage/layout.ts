import type { Layout, Point, Rect, Screen } from "../types";

/** The stage is a 1080p frame; everything on it is placed in these pixels. */
export const STAGE = { width: 1920, height: 1080 };

/** Where a screen's content sits on the stage: its top left corner and how much it is scaled. */
export type Placement = { x: number; y: number; scale: number };

/** The height of a window's or a panel's title bar above the content. */
export const BAR = 40;

const TOP = 210;

const fitWidth = (screen: Screen, x: number, y: number, width: number): Placement => ({
  x,
  y,
  scale: width / screen.width,
});

const fitHeight = (screen: Screen, x: number, y: number, height: number): Placement => ({
  x,
  y,
  scale: height / screen.height,
});

const centred = (screen: Screen, y: number, width: number): Placement =>
  fitWidth(screen, (STAGE.width - width) / 2, y, width);

/** A row of phones of the same height, centred. */
const phoneRow = (screens: Screen[]): Placement[] => {
  const height = 800;
  const gap = 70;
  const widths = screens.map((screen) => (screen.width * height) / screen.height);
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * (screens.length - 1);
  let x = (STAGE.width - total) / 2;
  return screens.map((screen, index) => {
    const placement = fitHeight(screen, x, TOP + 30, height);
    x += widths[index]! + gap;
    return placement;
  });
};

/**
 * window: one browser window under the title. duo: a window and a phone beside it. panel: a card
 * (the agent, the server) on the left, a window on the right. phones: phones in a row.
 */
export const place = (layout: Layout, screens: Screen[]): Map<string, Placement> => {
  const byKind = (kind: Screen["kind"]) => screens.filter((screen) => screen.kind === kind);
  const placements = new Map<string, Placement>();
  const put = (screen: Screen | undefined, placement: Placement) => {
    if (screen) placements.set(screen.id, placement);
  };
  const [desktop] = byKind("desktop");
  const [phone] = byKind("phone");
  const [panel] = byKind("panel");
  if (layout === "window" && desktop) put(desktop, centred(desktop, TOP + BAR, 1180));
  if (layout === "duo") {
    put(desktop, fitWidth(desktop!, 150, TOP + BAR, 1200));
    put(phone, fitHeight(phone!, 1430, TOP + 10, 800));
  }
  if (layout === "panel") {
    put(panel, fitHeight(panel!, 110, TOP + BAR, 780));
    const left = panel ? 110 + panel.width * (780 / panel.height) + 60 : 110;
    put(desktop, fitWidth(desktop!, left, TOP + BAR + 60, STAGE.width - left - 110));
  }
  if (layout === "phones") {
    const phones = byKind("phone");
    phoneRow(phones).forEach((placement, index) => {
      put(phones[index], placement);
    });
  }
  return placements;
};

export const toStage = (placement: Placement, point: Point): Point => ({
  x: placement.x + point.x * placement.scale,
  y: placement.y + point.y * placement.scale,
});

export const rectToStage = (placement: Placement, rect: Rect): Rect => ({
  ...toStage(placement, rect),
  width: rect.width * placement.scale,
  height: rect.height * placement.scale,
});
