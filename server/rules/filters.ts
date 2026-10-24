/**
 * The rules and the out-of-office reply as one setting, because Stalwart runs one Sieve script per
 * account and switching VacationResponse on activates its own script (crates/jmap/src/vacation/
 * set.rs), which would switch the rules off:
 * - without rules: VacationResponse alone, as RFC 8621 means it;
 * - with rules: the rules script runs and includes the reply; VacationResponse keeps the text and
 *   the dates and stays "off", and the script stores whether the reply is on.
 * The JMAP access is passed in, so the app (through the server's proxy) and the server (with its
 * own key) do the same.
 */
import { isEffective, parseRules, RULES_SCRIPT, type Rule, rulesScript } from "./script";

export type Invocation = [string, Record<string, unknown>, string];

export type FilterAccess = {
  request: (calls: Invocation[], using: string[]) => Promise<Invocation[]>;
  upload: (accountId: string, script: string) => Promise<string>;
  download: (accountId: string, blobId: string) => Promise<string>;
};

/** RFC 8621 VacationResponse; `isEnabled` here means "the reply goes out". */
export type Vacation = {
  isEnabled: boolean;
  fromDate: string | null;
  toDate: string | null;
  subject: string | null;
  textBody: string | null;
  htmlBody: string | null;
};

export type Filters = { rules: Rule[]; vacation: Vacation };

type Script = { id: string; name: string; isActive: boolean; blobId: string };

const USING = [
  "urn:ietf:params:jmap:core",
  "urn:ietf:params:jmap:vacationresponse",
  "urn:ietf:params:jmap:sieve",
];

/** Rules and reply from what Stalwart holds; pure. */
export const readFilters = (
  vacation: Vacation,
  script: Script | undefined,
  content: string | null,
): Filters => {
  const stored = content ? parseRules(content) : null;
  return {
    rules: stored?.rules ?? [],
    vacation: {
      ...vacation,
      isEnabled: vacation.isEnabled || Boolean(script?.isActive && stored?.vacation),
    },
  };
};

/**
 * The calls that store `filters`, in this order: VacationResponse first (switching it off
 * deactivates its script), then the rules script, activated or not. `blobId` is the uploaded
 * script, or null when there are no rules and never were.
 */
export const saveCalls = (
  accountId: string,
  { rules, vacation }: Filters,
  script: Script | undefined,
  blobId: string | null,
): Invocation[] => {
  const rulesRun = rules.some(isEffective);
  const reply: Invocation = [
    "VacationResponse/set",
    {
      accountId,
      update: { singleton: { ...vacation, isEnabled: rulesRun ? false : vacation.isEnabled } },
    },
    "vacation",
  ];
  if (!blobId) return [reply];
  const target = script
    ? { update: { [script.id]: { blobId } } }
    : { create: { rules: { name: RULES_SCRIPT, blobId } } };
  const activation = rulesRun
    ? { onSuccessActivateScript: script?.id ?? "#rules" }
    : script?.isActive && !vacation.isEnabled
      ? { onSuccessDeactivateScript: true }
      : {};
  return [reply, ["SieveScript/set", { accountId, ...target, ...activation }, "rules"]];
};

const listScripts = async (access: FilterAccess, accountId: string) => {
  const [vacation, scripts] = await access.request(
    [
      ["VacationResponse/get", { accountId }, "vacation"],
      ["SieveScript/get", { accountId, properties: ["name", "isActive", "blobId"] }, "rules"],
    ],
    USING,
  );
  return {
    vacation: (vacation![1].list as Vacation[])[0]!,
    script: (scripts![1].list as Script[]).find((candidate) => candidate.name === RULES_SCRIPT),
  };
};

export const loadFilters = async (access: FilterAccess, accountId: string): Promise<Filters> => {
  const { vacation, script } = await listScripts(access, accountId);
  const content = script ? await access.download(accountId, script.blobId) : null;
  return readFilters(vacation, script, content);
};

type SetError = { type: string; description?: string };

/** Stalwart's reason when a call did not go through, e.g. a script it would not compile. */
const failure = (responses: Invocation[]): string | null => {
  for (const [, result] of responses) {
    const failed = { ...(result.notCreated as object), ...(result.notUpdated as object) };
    const error = Object.values(failed)[0] as SetError | undefined;
    if (error) return error.description ?? error.type;
  }
  return null;
};

/** Stores rules and reply together; Stalwart's reason when it refused. */
export const saveFilters = async (
  access: FilterAccess,
  accountId: string,
  filters: Filters,
): Promise<string | null> => {
  const { script } = await listScripts(access, accountId);
  const blobId =
    filters.rules.length || script
      ? await access.upload(
          accountId,
          rulesScript({ vacation: filters.vacation.isEnabled, rules: filters.rules }),
        )
      : null;
  return failure(await access.request(saveCalls(accountId, filters, script, blobId), USING));
};
