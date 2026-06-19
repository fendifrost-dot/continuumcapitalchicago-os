import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";
import { formatSupabaseError } from "@/lib/supabase-errors";

const categories = ["payment", "banking", "irs", "state", "payroll", "software", "utility", "other"];

/**
 * Add an account / login the firm manages for a client (Melio, Stripe, Square,
 * bank portals, IRS, etc.). The password is encrypted at rest in the database and
 * is only ever returned through an access-checked reveal function — never stored
 * or transmitted in plain text from this form beyond the initial save.
 */
export function CredentialFormDialog({
  open,
  onOpenChange,
  companyId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
}) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("payment");
  const [provider, setProvider] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [username, setUsername] = useState("");
  const [accountIdentifier, setAccountIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [vaultReference, setVaultReference] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setLabel("");
    setCategory("payment");
    setProvider("");
    setLoginUrl("");
    setUsername("");
    setAccountIdentifier("");
    setPassword("");
    setVaultReference("");
  };

  const handleSave = async () => {
    if (!label.trim()) {
      toast.error("A label is required (e.g. “Melio – Buzz Genius”)");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("credentials")
      .insert({
        company_id: companyId,
        label: label.trim(),
        category: category as "payment",
        provider: provider || null,
        login_url: loginUrl.trim() || null,
        username: username.trim() || null,
        account_identifier: accountIdentifier.trim() || null,
        vault_reference: vaultReference.trim() || null,
        status: "active",
      })
      .select("id")
      .single();
    if (error) {
      toast.error(formatSupabaseError(error.message));
      setSaving(false);
      return;
    }

    // Encrypt the password server-side via the access-checked RPC.
    if (password.trim()) {
      const { error: secErr } = await supabase.rpc("set_credential_secret", {
        _credential_id: data.id,
        _plaintext: password,
      });
      if (secErr) {
        toast.error(`Saved account, but password encryption failed: ${secErr.message}`);
      }
    }

    await logActivity({
      action: "credential_added",
      summary: `Added account/login: ${label}`,
      entityType: "credential",
      entityId: data.id,
      companyId,
      metadata: { provider, category, hasPassword: !!password.trim() },
    });
    qc.invalidateQueries({ queryKey: ["credentials", companyId] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    toast.success("Account saved");
    setSaving(false);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add account / login</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Store the login for an account you manage for this client. The password is encrypted
          at rest and only revealed to authorized staff and the client.
        </p>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Melio – Buzz Genius"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Input
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="Melio, Stripe, Square…"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Login URL</Label>
            <Input
              value={loginUrl}
              onChange={(e) => setLoginUrl(e.target.value)}
              placeholder="https://app.melio.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Username / email</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="[email protected]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Account ref (optional)</Label>
              <Input
                value={accountIdentifier}
                onChange={(e) => setAccountIdentifier(e.target.value)}
                placeholder="••1234"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Encrypted on save"
              autoComplete="new-password"
            />
            <p className="text-[11px] text-muted-foreground">
              Encrypted with AES via pgcrypto. Leave blank if not storing a password here.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>External vault reference (optional)</Label>
            <Input
              value={vaultReference}
              onChange={(e) => setVaultReference(e.target.value)}
              placeholder="op://continuum/buzz-genius/melio"
              className="font-mono text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
