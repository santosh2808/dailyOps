import LoginRobot from "@/components/LoginRobot";

export default function Login() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-[#eef6da] via-white to-[#f4f8ec]">
      {/* Left panel — business overview, flush against the viewport edge like a fixed sidebar.
          Percentage-based (not a fixed pixel width) so it keeps roughly the same proportion
          of the screen — and the image stays large — at any window size. */}
      <div className="hidden flex-shrink-0 items-center justify-center lg:flex lg:w-[55%] xl:w-[58%]">
        {/* Live animated business-flow diagram (self-contained HTML/CSS/JS,
            served as a static asset) — replaces the old static
            dailyops-overview.jpg screenshot. Runs in its own iframe document
            so its DOM queries / resize listener / animation loop never
            collide with the React app's DOM. */}
        <iframe
          src="/business-flow-animated.html"
          title="DailyOps — all your business operations in one place"
          className="h-full w-full border-0"
          scrolling="no"
        />
      </div>

      {/* Right side — D.O.T., the login robot, with the app's real fields */}
      <div className="relative h-full flex-1 overflow-hidden">
        <LoginRobot />
      </div>
    </div>
  );
}
