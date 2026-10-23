import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { JmapClient } from "@/jmap/client";

export type RouterContext = { client: JmapClient | null; queryClient: QueryClient };

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});
