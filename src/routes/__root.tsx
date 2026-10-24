import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { useApplyTheme } from "@/components/theme/use-theme";
import type { JmapClient } from "@/jmap/client";
import { PwaStatus } from "@/pwa/pwa-status";

export type RouterContext = { client: JmapClient | null; queryClient: QueryClient };

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Root,
});

function Root() {
  useApplyTheme();
  return (
    <>
      <Outlet />
      <PwaStatus />
    </>
  );
}
