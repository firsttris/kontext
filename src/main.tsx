import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider, initialAuthClient } from "@/auth/auth";
import { ToastProvider } from "@/components/ui/toast";
import type { JmapClient } from "@/jmap/client";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

const routerContext: { client: JmapClient | null; queryClient: QueryClient } = {
  client: initialAuthClient(),
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
    <AuthProvider initialClient={routerContext.client} onChange={onAuthChange}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
