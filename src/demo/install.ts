/**
 * Turns the app into the demo before it starts: its requests to /jmap and /api go to the demo
 * server in the page (./server.ts) instead of the network. The live connection (EventSource on
 * /api/live: chat, calls, tasks) and notifications are left out; the app does without them.
 */
import { seedPim } from "./pim-seed";
import { createDemoServer } from "./server";
import { createStore } from "./store";

const store = createStore();
seedPim(store, Date.now());
const handle = createDemoServer(store, window.location.origin);
const networkFetch = window.fetch.bind(window);

const demoFetch = async (input: RequestInfo | URL, init?: RequestInit) =>
  (await handle(new Request(input, init))) ?? networkFetch(input, init);
// Whatever else the browser hangs on fetch stays.
window.fetch = Object.assign(demoFetch, window.fetch);

Reflect.deleteProperty(window, "EventSource");
// Nor are there notifications to offer: nothing would ever send them.
Reflect.deleteProperty(window, "Notification");
