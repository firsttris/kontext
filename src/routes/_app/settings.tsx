import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SettingsPage } from "@/features/settings/settings-page";

export const settingsSections = [
  "profile",
  "signature",
  "vacation",
  "security",
  "appearance",
  "employees",
  "mailboxes",
  "company-signature",
  "migration",
] as const;

export const Route = createFileRoute("/_app/settings")({
  validateSearch: z.object({ section: z.enum(settingsSections).optional() }),
  component: SettingsRoute,
});

function SettingsRoute() {
  return <SettingsPage section={Route.useSearch().section} />;
}
