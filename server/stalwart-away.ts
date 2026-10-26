/**
 * Stalwart briefly away (down, a limit, a ban): the session's token cannot be renewed now. That is
 * no reason to sign anyone out or forget an agent; the answer is 503 and the app tries again.
 * Kept apart from auth.ts, so routes can use it without the database.
 */
export const stalwartUnavailable = () =>
  Object.assign(new Error("Stalwart antwortet gerade nicht"), { name: "StalwartUnavailable" });

export const isStalwartUnavailable = (error: unknown): boolean =>
  error instanceof Error && error.name === "StalwartUnavailable";

/** The session's token, null to sign in again, or "unavailable" while Stalwart is away. */
export const tokenOrUnavailable = (
  grants: { accessToken: (sessionId: string) => Promise<string | null> },
  sessionId: string,
): Promise<string | null | "unavailable"> =>
  grants.accessToken(sessionId).catch((error: unknown) => {
    if (isStalwartUnavailable(error)) return "unavailable" as const;
    throw error;
  });

/** The answer while Stalwart is unavailable: the session stays, the app tries again. */
export const unavailable = () =>
  Response.json({ error: "Der Mailserver antwortet gerade nicht." }, { status: 503 });
