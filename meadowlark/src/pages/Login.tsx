import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (mode === "signup") toast.success("Check your email to confirm your account.");
    navigate("/");
  };

  return (
    <div className="container flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === "signin" ? "Sign in to Meadowlark" : "Create your studio account"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <Input type="email" placeholder="you@studio.example" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            <Button type="submit" className="w-full" disabled={busy}>
              {mode === "signin" ? "Sign in" : "Sign up"}
            </Button>
          </form>
          <button
            className="mt-4 text-sm text-muted-foreground underline"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "New studio? Create an account" : "Already have an account? Sign in"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
