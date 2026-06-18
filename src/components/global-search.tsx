import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Building2, FileText, Receipt, Search, Users } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{
    clients: { id: string; name: string }[];
    companies: { id: string; legal_name: string }[];
    transactions: {
      id: string;
      payee: string | null;
      description: string | null;
      company_id: string;
    }[];
    funding: { id: string; lender: string }[];
    documents: { id: string; file_name: string; company_id: string | null }[];
  }>({ clients: [], companies: [], transactions: [], funding: [], documents: [] });
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults({ clients: [], companies: [], transactions: [], funding: [], documents: [] });
      return;
    }
    const t = setTimeout(async () => {
      const q = `%${query}%`;
      const [clients, companies, transactions, funding, documents] = await Promise.all([
        supabase.from("clients").select("id, name").ilike("name", q).limit(5),
        supabase.from("companies").select("id, legal_name").ilike("legal_name", q).limit(5),
        supabase
          .from("transactions")
          .select("id, payee, description, company_id")
          .or(`payee.ilike.${q},description.ilike.${q}`)
          .limit(5),
        supabase.from("funding_applications").select("id, lender").ilike("lender", q).limit(5),
        supabase
          .from("documents")
          .select("id, file_name, company_id")
          .ilike("file_name", q)
          .limit(5),
      ]);
      setResults({
        clients: clients.data ?? [],
        companies: companies.data ?? [],
        transactions: transactions.data ?? [],
        funding: funding.data ?? [],
        documents: documents.data ?? [],
      });
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const go = (to: string, params?: Record<string, string>) => {
    setOpen(false);
    setQuery("");
    navigate({ to: to as never, params: params as never });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative max-w-md flex-1 text-left"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <div className="h-9 w-full rounded-md bg-muted/40 pl-9 pr-16 text-sm text-muted-foreground flex items-center">
          Search clients, companies, transactions…
        </div>
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search…" value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {results.clients.length > 0 && (
            <CommandGroup heading="Clients">
              {results.clients.map((c) => (
                <CommandItem key={c.id} onSelect={() => go("/clients/$id", { id: c.id })}>
                  <Users className="h-4 w-4" />
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.companies.length > 0 && (
            <CommandGroup heading="Companies">
              {results.companies.map((c) => (
                <CommandItem key={c.id} onSelect={() => go("/companies/$id", { id: c.id })}>
                  <Building2 className="h-4 w-4" />
                  {c.legal_name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.transactions.length > 0 && (
            <CommandGroup heading="Transactions">
              {results.transactions.map((t) => (
                <CommandItem key={t.id} onSelect={() => go("/companies/$id", { id: t.company_id })}>
                  <Receipt className="h-4 w-4" />
                  {t.payee || t.description || "Transaction"}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.funding.length > 0 && (
            <CommandGroup heading="Funding">
              {results.funding.map((f) => (
                <CommandItem key={f.id} onSelect={() => go("/funding")}>
                  <FileText className="h-4 w-4" />
                  {f.lender}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.documents.length > 0 && (
            <CommandGroup heading="Documents">
              {results.documents.map((d) => (
                <CommandItem
                  key={d.id}
                  onSelect={() => d.company_id && go("/companies/$id", { id: d.company_id })}
                >
                  <FileText className="h-4 w-4" />
                  {d.file_name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
