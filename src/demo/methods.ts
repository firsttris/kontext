/**
 * What every method of the demo shares (RFC 8620 §5): the store's one state, `/get` with the
 * asked properties, and the creation ids of a request.
 */
import type { Store } from "./store";

export type Args = Record<string, unknown>;
export type Result = Record<string, unknown>;
/** Creation ids of this request ("draft" → the new mail's id), for `#draft` (RFC 8620 §5.3). */
export type Created = Map<string, string>;

export const state = (store: Store) => String(store.state);
export const changed = (store: Store) => {
  store.state++;
};

/** Only the asked properties, and always the id (RFC 8620 §5.1). */
export const pick = (object: Record<string, unknown>, properties: unknown): Result =>
  Array.isArray(properties)
    ? Object.fromEntries(
        ["id", ...(properties as string[])].map((property) => [property, object[property] ?? null]),
      )
    : object;

export const getList = <T extends { id: string }>(
  all: T[],
  args: Args,
  toObject: (item: T) => Record<string, unknown>,
) => {
  const ids = args.ids as string[] | null | undefined;
  const byId = new Map(all.map((item) => [item.id, item]));
  // In the order asked for, as Stalwart answers: the app shows a query's ids as they come.
  const found = ids ? ids.flatMap((id) => byId.get(id) ?? []) : all;
  return {
    list: found.map((item) => pick(toObject(item), args.properties)),
    notFound: ids ? ids.filter((id) => !byId.has(id)) : [],
  };
};

/** "#draft" → the id created under that name in this request. */
export const resolveId = (id: string | null | undefined, created: Created) =>
  id?.startsWith("#") ? created.get(id.slice(1)) : id;

export const emailsOf = (store: Store, accountId: string) =>
  [...store.emails.values()].filter((email) => email.accountId === accountId);

/** A JSON pointer's segment as written in a patch: "~1" is "/", "~0" is "~" (RFC 6901). */
const segment = (raw: string) => raw.replaceAll("~1", "/").replaceAll("~0", "~");

const setAt = (object: unknown, path: string[], value: unknown): Record<string, unknown> => {
  const [head, ...rest] = path as [string, ...string[]];
  const current = (object && typeof object === "object" ? object : {}) as Record<string, unknown>;
  const { [head]: inner, ...others } = current;
  if (rest.length) return { ...others, [head]: setAt(inner, rest, value) };
  return value === null ? others : { ...others, [head]: value };
};

/** A patch (RFC 8620 §5.3): whole properties, or a path down to one value ("keywords/$seen"). */
export const applyPatch = <T extends Record<string, unknown>>(object: T, patch: Args): T =>
  Object.entries(patch).reduce(
    (next, [path, value]) => setAt(next, path.split("/").map(segment), value) as T,
    object,
  );
