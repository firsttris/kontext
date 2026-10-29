/**
 * /api/calendar-subscriptions: a person's subscribed calendars (iCal, webcal). Adding fetches the
 * file first, so a wrong address is told at once and nothing is created; then a calendar of its
 * own in the person's account takes the events. Removing takes the calendar with it.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { SessionAccount } from "../categories/routes";
import type { SubscribedCalendars } from "./calendars";
import { type FetchDeps, fetchCalendar } from "./fetch-calendar";
import type { SubscriptionRunner } from "./runner";
import type { Subscription, SubscriptionStore } from "./store";

/** More than this per person is no longer a calendar one reads. */
export const MAX_SUBSCRIPTIONS = 20;

const adding = z.object({
  url: z.string().trim().min(1).max(2000),
  name: z.string().trim().min(1).max(100),
});

const shown = (subscription: Subscription) => ({
  id: subscription.id,
  name: subscription.name,
  url: subscription.url,
  accountId: subscription.accountId,
  calendarId: subscription.calendarId,
  lastSyncAt: subscription.lastSyncAt?.toISOString() ?? null,
  lastError: subscription.lastError,
});

export type ShownSubscription = ReturnType<typeof shown>;

export const createSubscriptionRoutes = ({
  store,
  calendars,
  runner,
  fetchDeps = {},
  accountsOf,
  newId = () => crypto.randomUUID(),
}: {
  store: SubscriptionStore;
  calendars: SubscribedCalendars;
  runner: SubscriptionRunner;
  fetchDeps?: FetchDeps;
  accountsOf: (request: Request) => Promise<SessionAccount[] | null>;
  newId?: () => string;
}) => {
  const app = new Hono<{ Variables: { me: string } }>();
  app.use(async (c, next) => {
    const me = (await accountsOf(c.req.raw))?.find((account) => account.isPersonal)?.id;
    if (!me) return c.json({ error: "Nicht angemeldet" }, 401);
    c.set("me", me);
    await next();
  });

  app.get("/", async (c) => c.json({ subscriptions: (await store.of(c.get("me"))).map(shown) }));

  app.post("/", async (c) => {
    const parsed = adding.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Adresse und Name angeben." }, 400);
    const me = c.get("me");
    if ((await store.of(me)).length >= MAX_SUBSCRIPTIONS) {
      return c.json({ error: `Höchstens ${MAX_SUBSCRIPTIONS} abonnierte Kalender.` }, 400);
    }
    const fetched = await fetchCalendar(parsed.data.url, fetchDeps);
    if (!fetched.ok) return c.json({ error: fetched.error }, 400);
    const calendarId = await calendars.create(me, parsed.data.name);
    const id = newId();
    await store.add({
      id,
      memberId: me,
      accountId: me,
      calendarId,
      name: parsed.data.name,
      url: parsed.data.url,
      createdAt: new Date(),
    });
    await runner.write((await store.get(me, id))!, fetched.text);
    return c.json(shown((await store.get(me, id))!), 201);
  });

  app.post("/:id/refresh", async (c) => {
    const subscription = await store.get(c.get("me"), c.req.param("id"));
    if (!subscription) return c.json({ error: "Unbekanntes Abo" }, 404);
    if ((await runner.sync(subscription)) === "gone")
      return c.json({ error: "Unbekanntes Abo" }, 404);
    return c.json(shown((await store.get(c.get("me"), subscription.id))!));
  });

  app.delete("/:id", async (c) => {
    const subscription = await store.get(c.get("me"), c.req.param("id"));
    if (!subscription) return c.json({ error: "Unbekanntes Abo" }, 404);
    await calendars.remove(subscription.accountId, subscription.calendarId);
    await store.remove(c.get("me"), subscription.id);
    return c.body(null, 204);
  });

  return app;
};
