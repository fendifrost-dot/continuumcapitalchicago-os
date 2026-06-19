import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, Copy, ExternalLink, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface AccountRow {
  id: string;
  label: string;
  category: string;
  provider: string | null;
  login_url: string | null;
  username: string | null;
  account_identifier: string | null;
  status: string | null;
  has_secret: boolean | null;
  vault_reference: string | null;
}

function copy(text: string, what: string) {
  navigator.clipboard.writeText(text);
  toast.success(`${what} copied`);
}

function RevealButton({ credentialId }: { credentialId: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [loading, setLoading] = useState(false);

  const reveal = async () => {
    if (value) {
      setShown((s) => !s);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("reveal_credential_secret", {
      _credential_id: credentialId,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data) {
      toast.message("No password stored for this account");
      return;
    }
    setValue(data as string);
    setShown(true);
  };

  return (
    <div className="flex items-center gap-1.5">
      {shown && value ? (
        <code className="rounded bg-muted px-2 py-1 text-xs font-mono">{value}</code>
      ) : (
        <span className="text-xs text-muted-foreground">••••••••</span>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2"
        onClick={reveal}
        disabled={loading}
        title={shown ? "Hide" : "Reveal password"}
      >
        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
      {value && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={() => copy(value, "Password")}
          title="Copy password"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export function AccountsPanel({ companyId }: { companyId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["accounts", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("credentials")
        .select(
          "id, label, category, provider, login_url, username, account_identifier, status, has_secret, vault_reference",
        )
        .eq("company_id", companyId)
        .order("category")
        .order("label");
      return (data ?? []) as AccountRow[];
    },
  });

  if (isLoading)
    return <div className="py-10 text-center text-sm text-muted-foreground">Loading accounts…</div>;
  if (!data?.length)
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        No accounts or logins saved yet
      </div>
    );

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {data.map((a) => (
        <Card key={a.id} className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 shrink-0 text-accent" />
                <span className="truncate font-medium">{a.label}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="capitalize text-[10px]">
                  {a.category}
                </Badge>
                {a.provider && (
                  <Badge variant="outline" className="text-[10px]">
                    {a.provider}
                  </Badge>
                )}
                {a.status && a.status !== "active" && (
                  <Badge variant="outline" className="capitalize text-[10px]">
                    {a.status}
                  </Badge>
                )}
              </div>
            </div>
            {a.login_url && (
              <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" asChild>
                <a href={a.login_url} target="_blank" rel="noopener noreferrer">
                  Open <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              </Button>
            )}
          </div>

          <dl className="space-y-1.5 text-sm">
            {a.username && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">User</dt>
                <dd className="flex items-center gap-1.5 truncate">
                  <span className="truncate">{a.username}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5"
                    onClick={() => copy(a.username!, "Username")}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </dd>
              </div>
            )}
            {a.account_identifier && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">Account</dt>
                <dd className="font-mono text-xs">{a.account_identifier}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Password</dt>
              <dd>
                {a.has_secret ? (
                  <RevealButton credentialId={a.id} />
                ) : (
                  <span className="text-xs text-muted-foreground">Not stored</span>
                )}
              </dd>
            </div>
            {a.vault_reference && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">Vault</dt>
                <dd className="truncate font-mono text-[11px] text-muted-foreground">
                  {a.vault_reference}
                </dd>
              </div>
            )}
          </dl>
        </Card>
      ))}
    </div>
  );
}
