/**
 * Turns the app into the demo before it starts: its requests to /jmap and /api go to the demo
 * server in the page (./server.ts) instead of the network. The live connection (EventSource on
 * /api/live: what others do in chat and tasks while one looks) and notifications are left out;
 * the app does without them, and in the demo only one person is signed in at a time. Players
 * that load their sound themselves get it from the demo server too (./media.ts).
 */

import { serveMedia } from "./media";
import { seedPim } from "./pim-seed";
import { createDemoServer } from "./server";
import { createStore } from "./store";
import { fillTeam } from "./team";

const store = createStore();
seedPim(store, Date.now());
const handle = createDemoServer(store, window.location.origin);
await fillTeam(store, handle, window.location.origin);
const networkFetch = window.fetch.bind(window);

const demoFetch = async (input: RequestInfo | URL, init?: RequestInit) =>
  (await handle(new Request(input, init))) ?? networkFetch(input, init);
// Whatever else the browser hangs on fetch stays.
window.fetch = Object.assign(demoFetch, window.fetch);
serveMedia(handle, window.location.origin);

Reflect.deleteProperty(window, "EventSource");
// Nor are there notifications to offer: nothing would ever send them.
Reflect.deleteProperty(window, "Notification");
