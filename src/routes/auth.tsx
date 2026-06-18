import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { bootstrapUserSession } from "@/lib/session";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const afterSignIn = async (userId: string) => {
    await bootstrapUserSession();
    await supabase.functions.invoke("auth-audit", {
      body: { type: "login", user_id: userId },
    });
    toast.success("Signed in");
    navigate({ to: "/dashboard" });
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data.user) await afterSignIn(data.user.id);
  };

  const handleGoogle = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    setLoading(false);
    if (result.error) {
      toast.error(result.error.message ?? "Sign-in failed");
      return;
    }
    if (!result.redirected) {
      const { data } = await supabase.auth.getUser();
      if (data.user) await afterSignIn(data.user.id);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_oklch(0.22_0.04_265)_0%,_oklch(0.14_0.03_265)_45%,_oklch(0.10_0.02_265)_100%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(oklch(1_0_0)_1px,transparent_1px),linear-gradient(90deg,oklch(1_0_0)_1px,transparent_1px)] [background-size:48px_48px]"
        aria-hidden
      />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-accent/15 ring-1 ring-accent/30">
            <span className="font-serif text-2xl font-bold text-accent">C</span>
          </div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-white">
            Continuum Capital Group
          </h1>
          <p className="mt-1 text-sm text-white/60">Chicago · Client operations platform</p>
        </div>

        <Card className="border-white/10 bg-white/95 p-7 shadow-2xl backdrop-blur-sm">
          <h2 className="text-lg font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Firm staff and invited clients use separate workspaces after login.
          </p>

          <form onSubmit={handleEmailSignIn} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@continuumcapitalchicago.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
            Continue with Google
          </Button>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Client access requires an invitation from Continuum Capital Group staff.
          </p>
        </Card>
      </div>
    </div>
  );
}
