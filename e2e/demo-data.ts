/**
 * Tasks and chat for the pictures and the film: the demo of dev/demo-data.ts, made in the e2e
 * setup's Kontext (the app on 5174, see playwright.config.ts) and Stalwart.
 */
import { fillDemo as fill } from "../dev/demo-data";
import { STALWART } from "./helpers";

export const fillDemo = async () =>
  (await fill({ app: "http://localhost:5174", stalwart: STALWART }))!;
