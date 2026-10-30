/**
 * Tasks and chat for the pictures and the film: the demo of dev/demo-data.ts, made in the e2e
 * setup's Kontext (the app on 5174, see playwright.config.ts) and Stalwart.
 */
import { fillDemo as fill } from "../dev/demo-data";
import { STALWART } from "./helpers";

const APP = "http://localhost:5174";

/**
 * Where the app answers this test process. Vite listens on what `localhost` resolves to first; in
 * the CI container that is ::1 only, while Node's fetch went to 127.0.0.1 and was refused (the
 * browser tries both). The origin stays `localhost`, which the server checks (server/csrf.ts).
 */
const answers = (url: string) =>
  fetch(url).then(
    () => true,
    () => false,
  );

const reachableApp = async (): Promise<string> => {
  for (const url of ["http://127.0.0.1:5174", "http://[::1]:5174"]) {
    if (await answers(url)) return url;
  }
  return APP;
};

export const fillDemo = async () =>
  (await fill({ app: await reachableApp(), origin: APP, stalwart: STALWART }))!;
