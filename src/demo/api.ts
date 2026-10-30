/**
 * The demo's answers for the Kontext server's own API (/api): the sign-in, the mail categories,
 * and for every other module what a company without it set up gets (server/app.ts). Unknown paths
 * answer 404, as the server does.
 */
import { DEV_DOMAIN } from "../../dev/config";
import { type Category, DEFAULT_CATEGORIES } from "../../server/categories/categories";
import { DEFAULT_COLUMNS } from "../../server/tasks/tasks";
import { json } from "./respond";
import { accountOf, type Store, visibleAccounts } from "./store";

/** Schreibzeug's demo on GitHub Pages; its pages live after the "#". */
const SCHREIBZEUG_DEMO = "https://firsttris.github.io/schreibzeug/demo/#/";

/** Better Auth's session, or null before anyone is signed in. */
const signedIn = (store: Store) => {
  const me = store.user ? accountOf(store, store.user) : undefined;
  if (!me) return null;
  return {
    session: { id: "demo", userId: me.id, expiresAt: "2099-01-01T00:00:00.000Z" },
    user: { id: me.id, email: me.email, name: me.fullName },
  };
};

/** Any of the seed's people, with any password: it is a demo. */
const signIn = async (store: Store, request: Request) => {
  const { email } = (await request.json()) as { email: string };
  const name = email.trim().toLowerCase().replace(`@${DEV_DOMAIN}`, "");
  const account = accountOf(store, name);
  if (!account || account.isGroup) return json({ message: "Invalid email or password" }, 401);
  store.user = account.id;
  return json({ status: "ok" });
};

const categoriesOf = (store: Store) =>
  Object.fromEntries(
    visibleAccounts(store).map((account) => [
      account.id,
      store.categories.get(account.id) ?? DEFAULT_CATEGORIES,
    ]),
  );

const saveCategories = async (store: Store, request: Request, accountId: string) => {
  const { categories } = (await request.json()) as { categories: Category[] };
  store.categories.set(decodeURIComponent(accountId), categories);
  return json({ ok: true });
};

/** What the server answers when a module is not set up, or has nothing yet. */
const FIXED: Record<string, (store: Store) => unknown> = {
  "GET /api/calls": () => ({ enabled: false, calls: [] }),
  "GET /api/phone": () => ({ enabled: false, allowed: false, online: false, calls: [] }),
  // Schreibzeug's own demo (firsttris/schreibzeug, src/demo), static like this one; not connected:
  // files cannot go between mail and documents without both servers.
  "GET /api/documents": () => ({ url: SCHREIBZEUG_DEMO, connected: false }),
  "GET /api/tasks": (store) => ({
    tasks: [],
    boards: Object.fromEntries(visibleAccounts(store).map((a) => [a.id, DEFAULT_COLUMNS])),
  }),
  "GET /api/chat/channels": () => ({ channels: [], online: [], retentionDays: null }),
  "GET /api/photos": () => ({ photos: [] }),
  "GET /api/secure": () => ({ messages: [] }),
  "GET /api/company/idle-logout": () => ({ minutes: 0 }),
  "GET /api/company/external-hint": () => ({ enabled: true, partners: [], domains: [DEV_DOMAIN] }),
  "GET /api/company/legal-footer": () => ({ text: "" }),
  "GET /api/snippets": () => ({ snippets: [] }),
  "GET /api/external-accounts": () => [],
  "GET /api/pgp/me": () => ({ key: null }),
  "GET /api/pgp/keys": () => ({ keys: [] }),
  "GET /api/smime/me": () => ({ cert: null }),
  "GET /api/smime/certs": () => ({ certs: [] }),
  "GET /api/chat/discussed": () => ({ discussions: [] }),
  // Answer pages for attendees outside need the server (server/invitations).
  "POST /api/invitations/links": () => ({ links: {} }),
  "GET /api/image-senders": (store) => ({ senders: store.imageSenders }),
  "GET /api/company/me": (store) => ({
    admin: visibleAccounts(store)[0]?.companyAdmin ?? false,
  }),
};

/** "Immer von …" for pictures from the internet: an address or "@domain" (server/images). */
const imageSenders = async (store: Store, request: Request, add: boolean) => {
  const { address } = (await request.json()) as { address: string };
  const others = store.imageSenders.filter((sender) => sender !== address);
  store.imageSenders = add ? [...others, address] : others;
  return json({ senders: store.imageSenders });
};

export const handleApi = async (store: Store, request: Request, url: URL): Promise<Response> => {
  const route = `${request.method} ${url.pathname}`;
  const fixed = FIXED[route];
  if (fixed) return json(fixed(store));
  if (route === "GET /api/auth/get-session") return json(signedIn(store));
  if (route === "POST /api/auth/sign-in/stalwart") return signIn(store, request);
  if (route === "POST /api/auth/sign-out") {
    store.user = null;
    return json({ success: true });
  }
  if (route === "PUT /api/image-senders") return imageSenders(store, request, true);
  if (route === "POST /api/image-senders/remove") return imageSenders(store, request, false);
  if (route === "GET /api/categories") return json(categoriesOf(store));
  const category = route.match(/^PUT \/api\/categories\/(.+)$/);
  if (category) return saveCategories(store, request, category[1]!);
  console.info(`[demo] ${route}`);
  return json({ error: "Nicht in der Demo" }, 404);
};
