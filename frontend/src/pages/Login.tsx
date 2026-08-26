import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Checkbox } from "@/components/ui/checkbox";
import LoginMascot from "@/components/LoginMascot";

// Loose enough to just drive the mascot's smile/antenna — not used for
// actual form validation (the identifier field also accepts a username).
const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  // Enterprise RBAC: login accepts either Username or Email in this one
  // field — the backend resolves which one was typed (see LoginDto).
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [focusField, setFocusField] = useState<"identifier" | "password" | null>(null);
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
    <div className="flex h-screen w-full overflow-hidden bg-white">
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

      {/* Right side — the neubrutalist login card, centered in the remaining space, on a white dotted backdrop */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-8"
        style={{
          backgroundColor: "#ffffff",
          backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      >
        <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
          {/* brand pill */}
          <div className="mb-3 flex flex-col items-center leading-tight">
            <span className="text-lg font-bold tracking-tight text-slate-900">DailyOps</span>
            <span className="text-xs font-medium text-srm-green">by Smart Rotamach</span>
          </div>

          {/* the mascot peeks over the top edge of the card */}
          <div className="relative z-20 -mb-6">
            <LoginMascot
              focusField={focusField}
              isValidEmail={EMAIL_LIKE.test(identifier.trim())}
            />
          </div>

          {/* card */}
          <div className="relative w-full rounded-[28px] border-[3px] border-srm-green bg-white px-7 pb-7 pt-10 shadow-[6px_6px_0_0_#7a9633]">
            {/* little nubs poking out of the card */}
            <div className="absolute -top-3 left-9 h-6 w-3 rounded-full border-2 border-srm-green bg-white" />
            <div className="absolute -top-3 right-9 h-6 w-3 rounded-full border-2 border-srm-green bg-white" />
            <div className="absolute -bottom-3 left-14 h-3 w-9 rounded-full border-2 border-srm-green bg-white" />
            <div className="absolute -bottom-3 right-14 h-3 w-9 rounded-full border-2 border-srm-green bg-white" />

            <h1 className="text-xl font-bold text-slate-900">Hey there! Who's this?</h1>
            <p className="mt-1 text-sm text-slate-500">Sign in to your DailyOps account.</p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-3">
              <div className="relative">
                <label htmlFor="identifier" className="sr-only">
                  Username or Email
                </label>
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="identifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  onFocus={() => setFocusField("identifier")}
                  onBlur={() => setFocusField(null)}
                  placeholder="Your username or email"
                  required
                  className="h-12 w-full rounded-xl border-2 border-srm-green bg-white pl-10 pr-3 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-srm-green/40"
                />
              </div>
              <div className="relative">
                <label htmlFor="password" className="sr-only">
                  Password
                </label>
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusField("password")}
                  onBlur={() => setFocusField(null)}
                  placeholder="Super secret password"
                  required
                  className="h-12 w-full rounded-xl border-2 border-srm-green bg-white pl-10 pr-3 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-srm-green/40"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <label htmlFor="remember" className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  <Checkbox
                    id="remember"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="rounded border-2 border-srm-green checked:bg-srm-green"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setNotice("Contact your administrator to reset your password.")
                  }
                  className="text-xs font-semibold text-srm-red hover:underline"
                >
                  Forgot Password?
                </button>
              </div>
              {notice && <p className="text-xs text-slate-500">{notice}</p>}
              {error && <p className="text-xs font-medium text-destructive">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 h-12 w-full rounded-xl border-2 border-srm-green bg-srm-red text-sm font-bold uppercase tracking-wide text-white shadow-[4px_4px_0_0_#7a9633] transition-all hover:brightness-105 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_0_#7a9633] disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign Me In"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
