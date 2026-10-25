import { createFileRoute } from "@tanstack/react-router";

/** A page of Schreibzeug (`/documents/edit/…`); the frame beside the pages shows it. */
export const Route = createFileRoute("/_app/documents/$")({ component: () => null });
