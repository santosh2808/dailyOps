import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Cloud, Lock, ShieldCheck, User, Zap } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Login page's feature-highlight strip, under the card — purely informational,
// no data or state behind these.
const FEATURE_HIGHLIGHTS = [
  {
    icon: ShieldCheck,
    title: "Trusted & Secure",
    description: "Your data is protected with enterprise grade security.",
  },
  {
    icon: Cloud,
    title: "Access Anywhere",
    description: "Access your operations from anywhere, on any device.",
  },
  {
    icon: Zap,
    title: "Built for Growth",
    description: "Scalable solutions designed to grow with your business.",
  },
];

export default function Login() {
  // Enterprise RBAC: login accepts either Username or Email in this one
  // field — the backend resolves which one was typed (see LoginDto).
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(identifier, password, remember);
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
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{
        // One continuous diagonal wash across the whole page (blue near the
        // overview graphic, fading through green into a soft red/pink on
        // the login side) so the two panels read as one background. Only
        // three stops, evenly spaced — extra in-between stops caused a
        // visible seam where the interpolation rate changed.
        backgroundImage: "linear-gradient(135deg, #eaf1fb 0%, #eef7ec 50%, #fbe6e4 100%)",
      }}
    >
      {/* Left panel — business overview, flush against the viewport edge like a fixed sidebar.
          Percentage-based (not a fixed pixel width) so it keeps roughly the same proportion
          of the screen — and the image stays large — at any window size. */}
      <div className="hidden flex-shrink-0 items-center justify-center lg:flex lg:w-[55%] xl:w-[58%]">
        <img
          src="/dailyops-overview.jpg"
          alt="DailyOps — all your business operations in one place"
          className="h-full w-full object-contain"
        />
      </div>

      {/* Right side — login card + feature highlights, centered together in the remaining space */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-8">
        {/* Soft brand-color glows behind the card */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-srm-green/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-14 h-72 w-72 rounded-full bg-srm-red/20 blur-3xl" />

        <div className="relative z-10 flex w-full max-w-xl flex-col items-center gap-6">
          <Card className="w-full max-w-md overflow-hidden rounded-2xl border-none shadow-2xl">
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
              <CardDescription className="!mt-4 text-base">
                Sign in to your account
              </CardDescription>
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

                <div className="flex items-center justify-between">
                  <label htmlFor="remember" className="flex items-center gap-2 text-sm text-slate-600">
                    <Checkbox
                      id="remember"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="checked:border-srm-green checked:bg-srm-green"
                    />
                    Remember me
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setNotice("Contact your administrator to reset your password.")
                    }
                    className="text-sm font-medium text-srm-red hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>
                {notice && <p className="text-sm text-slate-500">{notice}</p>}

                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button
                  type="submit"
                  className="group h-12 w-full gap-2 bg-gradient-to-r from-srm-green to-[#7ea82f] text-base font-semibold text-white shadow-lg shadow-srm-green/30 transition-all hover:shadow-xl hover:shadow-srm-green/40"
                  disabled={loading}
                >
                  {loading ? "Signing in..." : "Sign In"}
                  {!loading && (
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Feature highlights — wider than the card so the titles stay on one line and stay aligned */}
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
            {FEATURE_HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex items-start gap-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white text-srm-green shadow-sm">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="leading-snug">
                  <p className="whitespace-nowrap text-sm font-semibold text-slate-800">
                    {title}
                  </p>
                  <p className="text-xs text-slate-500">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
