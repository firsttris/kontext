import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/features/settings/settings-page";
import { z } from "@/lib/zod";

export const settingsSections = [
  "profile",
  "signature",
  "accounts",
  "vacation",
  "deputy",
  "rules",
  "snippets",
  "sync",
  "security",
  "access",
  "encryption",
  "agents",
  "appearance",
  "employees",
  "mailboxes",
  "company-signature",
  "company-legal",
  "company-chat",
  "company-security",
  "company-idle",
  "company-external",
  "company-smime",
  "company-backup",
  "phone",
  "migration",
] as const;

export const Route = createFileRoute("/_app/settings")({
  validateSearch: z.object({ section: z.enum(settingsSections).optional() }),
  component: SettingsRoute,
});

function SettingsRoute() {
  return <SettingsPage section={Route.useSearch().section} />;
}
