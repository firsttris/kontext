import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider, createAppClient, hasSession } from "@/auth/auth";
import { ToastProvider } from "@/components/ui/toast";
import type { JmapClient } from "@/jmap/client";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

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

const router = createRouter({ routeTree, context: routerContext, defaultPreload: "intent" });

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

// Installable app and offline shell; only in the built app, so dev reloads stay plain.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
