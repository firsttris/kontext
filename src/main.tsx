// First: the language choice must be known before any module formats a date.
import "@/lib/locale";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHashHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider, createAppClient, hasSession } from "@/auth/auth";
import { ToastProvider } from "@/components/ui/toast";
import type { JmapClient } from "@/jmap/client";
import { getLocale } from "@/paraglide/runtime";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

// The demo answers /jmap and /api in the page (src/demo); before the first request. Written out,
// not as a shared constant: Vite replaces it, so other builds leave the demo out entirely.
if (import.meta.env.MODE === "demo") await import("@/demo/install");

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

/** The session ended on the server (signed out elsewhere, expired): back to the login. */
const onUnauthorized = () => {
  if (!window.location.pathname.startsWith("/login")) window.location.assign("/login");
};
const makeClient = () => createAppClient(onUnauthorized);

const routerContext: { client: JmapClient | null; queryClient: QueryClient } = {
  client: (await hasSession()) ? makeClient() : null,
  queryClient,
};

const router = createRouter({
  routeTree,
  context: routerContext,
  defaultPreload: "intent",
  // The demo is static files under a path of GitHub Pages: the route lives after the "#".
  ...(import.meta.env.MODE === "demo" ? { history: createHashHistory() } : {}),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const App = () => {
  const onAuthChange = useCallback((client: JmapClient | null) => {
    routerContext.client = client;
    queryClient.clear();
    void router.invalidate();
  }, []);
  return (
    <AuthProvider
      initialClient={routerContext.client}
      makeClient={makeClient}
      onChange={onAuthChange}
    >
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
};

// index.html says German; screen readers and hyphenation follow the language in use.
document.documentElement.lang = getLocale();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
