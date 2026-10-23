/** Loads the company for a Firmenverwaltung section, or says why there is nothing to show. */
import type { ReactNode } from "react";
import { m } from "@/paraglide/messages";
import type { Company } from "./api";
import { useCompany } from "./queries";

export const CompanyGate = ({ children }: { children: (company: Company) => ReactNode }) => {
  const { data: company, isPending, error } = useCompany();
  if (isPending) return <p className="m-0 text-[14px] text-muted">{m.common_loading()}</p>;
  if (error || !company) {
    return <p className="m-0 text-[14px] text-muted">{m.company_forbidden()}</p>;
  }
  return <>{children(company)}</>;
};
