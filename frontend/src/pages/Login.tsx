import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Lock, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Login() {
  // Enterprise RBAC: login accepts either Username or Email in this one
  // field — the backend resolves which one was typed (see LoginDto).
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(identifier, password);
      // ProtectedRoute takes over from here — it redirects to
      // /change-password instead if this account still has
      // mustChangePassword set (e.g. first login as the seeded admin).
      navigate("/dashboard");
    } catch {
      setError("Invalid username/email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      {/* Left panel — business overview, flush against the viewport edge like a fixed sidebar.
          Percentage-based (not a fixed pixel width) so it keeps roughly the same proportion
          of the screen — and the image stays large — at any window size. */}
      <div
        className="hidden flex-shrink-0 items-center justify-center lg:flex lg:w-[55%] xl:w-[58%]"
        style={{ backgroundColor: "#f8f9fd" }}
      >
        <img
          src="/dailyops-overview.jpg"
          alt="DailyOps — all your business operations in one place"
          className="h-full w-full object-contain"
        />
      </div>

      {/* Right side — base tone matches the left panel, lifted with soft brand-color gradients so it doesn't read flat */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-8"
        style={{
          backgroundColor: "#f8f9fd",
          backgroundImage:
            "radial-gradient(at 15% 15%, rgba(155,187,61,0.16) 0px, transparent 55%), radial-gradient(at 85% 85%, rgba(237,53,37,0.12) 0px, transparent 55%), radial-gradient(at 85% 15%, rgba(155,187,61,0.08) 0px, transparent 50%)",
        }}
      >
        {/* Soft brand-color glows behind the card */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-srm-green/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-14 h-72 w-72 rounded-full bg-srm-red/25 blur-3xl" />

        <Card className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border-none shadow-2xl">
          {/* Brand accent bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-srm-green via-srm-green to-srm-red" />

          <CardHeader className="space-y-1 text-center px-10 pt-8">
            <img
              src="/logo-smart-rotamach.jpg"
              alt="Smart Rotamach"
              className="mx-auto mb-2 h-32 w-32 rounded-md object-contain"
            />
            <div className="flex flex-col items-center leading-tight">
              <CardTitle className="text-3xl font-bold tracking-tight text-slate-900">
                DailyOps
              </CardTitle>
              <span className="text-sm font-medium text-srm-green">by Smart Rotamach</span>
            </div>
            <CardDescription className="!mt-4 text-base">Sign in to your account</CardDescription>
          </CardHeader>
          <CardContent className="px-10 pb-10">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="identifier" className="text-base">
                  Username or Email
                </Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="identifier"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="admin"
                    required
                    className="h-12 pl-10 text-base border-slate-200 focus-visible:border-srm-green focus-visible:ring-srm-green/30"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-base">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12 pl-10 text-base border-slate-200 focus-visible:border-srm-green focus-visible:ring-srm-green/30"
                  />
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                className="group h-12 w-full gap-2 bg-gradient-to-r from-srm-green to-[#7ea82f] text-base font-semibold text-white shadow-lg shadow-srm-green/30 transition-all hover:shadow-xl hover:shadow-srm-green/40"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign in"}
                {!loading && (
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
