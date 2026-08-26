import LoginRobot from "@/components/LoginRobot";

export default function Login() {
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

      {/* Right side — Volt, the login robot, with the app's real fields */}
      <div className="relative h-full flex-1 overflow-hidden">
        <div className="absolute left-5 top-5 z-10 flex flex-col leading-tight">
          <span className="text-sm font-bold tracking-tight text-slate-900">DailyOps</span>
          <span className="text-[11px] font-medium text-srm-green">by Smart Rotamach</span>
        </div>
        <LoginRobot />
      </div>
    </div>
  );
}
