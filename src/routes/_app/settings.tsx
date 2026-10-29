import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SettingsPage } from "@/features/settings/settings-page";

export const settingsSections = [
  "profile",
  "signature",
  "accounts",
  "vacation",
  "rules",
  "snippets",
  "sync",
  "security",
  "encryption",
  "agents",
  "appearance",
  "employees",
  "mailboxes",
  "company-signature",
  "company-chat",
  "company-security",
  "company-external",
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
