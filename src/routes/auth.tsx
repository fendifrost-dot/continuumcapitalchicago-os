import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { bootstrapUserSession } from "@/lib/session";

type AuthSearch = { invite?: string };

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    invite: typeof search.invite === "string" ? search.invite : undefined,
  }),
  component: AuthPage,
});

interface InviteInfo {
  valid: boolean;
  expired?: boolean;
  accepted?: boolean;
  email?: string;
  role?: string;
  client_scoped?: boolean;
}

function AuthPage() {
  const navigate = useNavigate();
  const { invite } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate({ to: "/dashboard" });
      }
      setCheckingSession(false);
    });
  }, [navigate]);

  // Resolve the invite token so we can prefill + lock the email and switch the
  // form into account-creation mode.
  useEffect(() => {
    if (!invite) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase.functions.invoke<InviteInfo>("invitation-lookup", {
        body: { token: invite },
      });
      if (!active) return;
      if (error || !data) {
        toast.error("This invitation link could not be verified.");
        return;
      }
      setInviteInfo(data);
      if (data.email) setEmail(data.email);
      if (data.valid) {
        setMode("signup");
      } else if (data.expired) {
        toast.error("This invitation has expired. Ask your Continuum contact to resend it.");
      } else if (data.accepted) {
        toast.message("This invitation was already accepted — please sign in.");
      }
    })();
    return () => {
      active = false;
    };
  }, [invite]);

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

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Email confirmation ON → no session yet. The portal link is applied on first
    // sign-in via bootstrapUserSession (ensure-user-role), so this is safe.
    if (data.session && data.user) {
      await afterSignIn(data.user.id);
      return;
    }
    setConfirmSent(true);
    toast.success("Account created. Check your email to confirm, then sign in.");
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

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary px-4 py-12">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  const isSignup = mode === "signup";
  const emailLocked = isSignup && Boolean(inviteInfo?.valid && inviteInfo?.email);
  const isClientInvite = inviteInfo?.role === "client" || inviteInfo?.client_scoped;

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
          {confirmSent ? (
            <div className="space-y-3 text-center">
              <h2 className="text-lg font-semibold tracking-tight">Confirm your email</h2>
              <p className="text-sm text-muted-foreground">
                We sent a confirmation link to <span className="font-medium">{email}</span>. Open it,
                then sign in — your portal access will be linked automatically.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setConfirmSent(false);
                  setMode("signin");
                }}
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold tracking-tight">
                {isSignup ? "Accept your invitation" : "Sign in"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {isSignup
                  ? isClientInvite
                    ? "Create your account to access your Continuum client portal."
                    : "Create your account to join the Continuum workspace."
                  : "Firm staff and invited clients use separate workspaces after login."}
              </p>

              <form onSubmit={isSignup ? handleSignUp : handleEmailSignIn} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    readOnly={emailLocked}
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
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isSignup ? "At least 8 characters" : undefined}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading
                    ? isSignup
                      ? "Creating account…"
                      : "Signing in…"
                    : isSignup
                      ? "Create account"
                      : "Sign in"}
                </Button>
              </form>

              {!isSignup && (
                <>
                  <div className="my-5 flex items-center gap-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      or
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleGoogle}
                    disabled={loading}
                  >
                    Continue with Google
                  </Button>
                </>
              )}

              {isSignup ? (
                <p className="mt-6 text-center text-xs text-muted-foreground">
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="font-medium text-accent underline-offset-2 hover:underline"
                    onClick={() => setMode("signin")}
                  >
                    Sign in
                  </button>
                </p>
              ) : (
                <p className="mt-6 text-center text-xs text-muted-foreground">
                  Client access requires an invitation from Continuum Capital Group staff.
                </p>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
