import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: ONE_DAY_MS,
      gcTime: 2 * ONE_DAY_MS,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const queryPersister =
  typeof window === "undefined"
    ? undefined
    : createSyncStoragePersister({
        storage: window.localStorage,
        key: "transparenciabr_query_cache_v2",
        throttleTime: 1000,
      });

export function QueryProvider({ children }) {
  if (!queryPersister) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }

  return createElement(
    PersistQueryClientProvider,
    {
      client: queryClient,
      persistOptions: {
        persister: queryPersister,
        maxAge: ONE_DAY_MS,
        buster: "transparency-reports-v2-politicos-fallback",
      },
    },
    children,
  );
}
