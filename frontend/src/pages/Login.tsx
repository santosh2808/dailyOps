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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-8">
      <ParticlesBackground />

      <div className="relative z-10 flex w-full max-w-6xl flex-col items-center gap-10 lg:flex-row lg:items-center lg:justify-center">
        {/* Business overview infographic — a separate section, hidden on small screens to keep mobile clean */}
        <div className="hidden w-full max-w-xl flex-shrink-0 lg:block">
          <img
            src="/dailyops-overview.jpg"
            alt="DailyOps — all your business operations in one place"
            className="w-full rounded-xl shadow-lg"
          />
        </div>

        {/* Login — its own section, to the right of the overview */}
        <Card className="w-full max-w-sm flex-shrink-0 border-none shadow-lg">
          <CardHeader className="space-y-1 text-center">
            <img
              src="/logo-smart-rotamach.jpg"
              alt="Smart Rotamach"
              className="mx-auto mb-2 h-32 w-32 rounded-md object-contain"
            />
            <CardTitle className="text-2xl">DailyOps</CardTitle>
            <p className="text-xs font-medium text-slate-400">by Smart Rotamach</p>
            <CardDescription>Sign in to your account</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="identifier">Username or Email</Label>
                <Input
                  id="identifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="admin"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
