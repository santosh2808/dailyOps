import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
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
import ParticlesBackground from "@/components/ParticlesBackground";

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

      {/* Right side — particle background with the login card centered in the remaining whitespace */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-8">
        <ParticlesBackground />

        <Card className="relative z-10 w-full max-w-md border-none shadow-lg">
          <CardHeader className="space-y-1 text-center px-10 pt-10">
            <img
              src="/logo-smart-rotamach.jpg"
              alt="Smart Rotamach"
              className="mx-auto mb-2 h-32 w-32 rounded-md object-contain"
            />
            <CardTitle className="text-3xl">DailyOps</CardTitle>
            <p className="text-sm font-medium text-slate-400">by Smart Rotamach</p>
            <CardDescription className="text-base">Sign in to your account</CardDescription>
          </CardHeader>
          <CardContent className="px-10 pb-10">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="identifier" className="text-base">
                  Username or Email
                </Label>
                <Input
                  id="identifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="admin"
                  required
                  className="h-12 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-base">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12 text-base"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="h-12 w-full text-base" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
