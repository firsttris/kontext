/**
 * "Die Suche wird noch aufgebaut": while Stalwart builds its search index (after the move to 1.0
 * it starts from nothing), a search finds only part of the mail. Asked again every minute while
 * something waits; nothing is shown once it is done or when the key may not read it.
 */
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { LOCALE } from "@/lib/locale";
import { m } from "@/paraglide/messages";
import { getSearchIndex } from "./api";

export const SearchIndexNotice = () => {
  const { data } = useQuery({
    queryKey: ["company", "search-index"],
    queryFn: getSearchIndex,
    refetchInterval: (query) => (query.state.data?.pending ? 60_000 : false),
    retry: false,
  });
  if (!data?.known || (!data.pending && !data.failed)) return null;
  const Icon = data.failed ? CircleAlert : LoaderCircle;
  return (
    <p
      role="status"
      className="m-0 flex items-start gap-2 rounded-lg bg-subtle px-3 py-2 text-[13px] text-muted"
    >
      <Icon size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
      {data.failed
        ? m.company_search_index_failed()
        : m.company_search_index_pending({ count: data.pending.toLocaleString(LOCALE) })}
    </p>
  );
};
