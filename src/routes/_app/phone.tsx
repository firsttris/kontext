import { createFileRoute } from "@tanstack/react-router";
import { PhonePage } from "@/features/phone/phone-page";

export const Route = createFileRoute("/_app/phone")({
  component: PhonePage,
});
