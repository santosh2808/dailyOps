import { useEffect, useRef, useState } from "react";

interface LoginMascotProps {
  // Which field currently has focus — drives the "covers its eyes while you
  // type your password" behavior, and the speech-bubble caption below.
  focusField: "identifier" | "password" | null;
  // Lights up the mouth/speech bubble once the Username/Email field looks
  // like a valid email — purely a fun visual touch, no validation logic
  // elsewhere depends on this.
  isValidEmail: boolean;
}

// The little robot that peeks over the top of the Login card — inspired by
// the "watches you type, closes its eyes for your password" CodePen the user
// linked (codepen.io/itayko, pen 019fc70d-b75a-73b9-a643-f75d58b3199b). That
// pen's editor is client-rendered so its source couldn't be fetched; this is
// an original implementation of the same idea, in SRM's own colors, built
// from the screenshot the user shared rather than a copy of its code.
export default function LoginMascot({ focusField, isValidEmail }: LoginMascotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pupil, setPupil] = useState({ x: 0, y: 0 });
  const covered = focusField === "password";

  useEffect(() => {
    function handleMove(e: MouseEvent) {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
      const maxOffset = 3.2;
      setPupil({ x: Math.cos(angle) * maxOffset, y: Math.sin(angle) * maxOffset });
    }
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  let speech = "Beep boop. Ready when you are.";
  if (focusField === "password") speech = "My eyes are shut, promise!";
  else if (focusField === "identifier" && isValidEmail) speech = "That looks like a real email!";
  else if (focusField === "identifier") speech = "I'm watching you type...";

  const eyelidTransform = covered ? "translate(0,0)" : "translate(0,30)";

  return (
    <div className="flex flex-col items-center">
      {/* speech bubble */}
      <div className="relative mb-1 rounded-xl border-2 border-slate-900 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-[3px_3px_0_0_#0f172a]">
        {speech}
        <div className="absolute -bottom-[7px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b-2 border-r-2 border-slate-900 bg-white" />
      </div>

      <div ref={containerRef} className="relative mt-2 h-20 w-20 select-none">
        {/* ears */}
        <div className="absolute -left-2.5 top-6 h-6 w-3 rounded-full border-2 border-slate-900 bg-white" />
        <div className="absolute -right-2.5 top-6 h-6 w-3 rounded-full border-2 border-slate-900 bg-white" />

        {/* head */}
        <div className="h-20 w-20 overflow-hidden rounded-2xl border-2 border-slate-900 bg-slate-900 shadow-[3px_3px_0_0_#0f172a]">
          <svg viewBox="0 0 80 80" className="h-full w-full">
            {/* eyes */}
            <circle cx="27" cy="40" r="10" fill="#f8fafc" />
            <circle cx="53" cy="40" r="10" fill="#f8fafc" />
            <circle
              cx={27 + pupil.x}
              cy={40 + pupil.y}
              r="4"
              fill="#0f172a"
              style={{ opacity: covered ? 0 : 1, transition: "opacity 0.15s ease" }}
            />
            <circle
              cx={53 + pupil.x}
              cy={40 + pupil.y}
              r="4"
              fill="#0f172a"
              style={{ opacity: covered ? 0 : 1, transition: "opacity 0.15s ease" }}
            />
            {/* eyelids covering the eyes while the password is focused */}
            <rect
              x="15"
              y="30"
              width="24"
              height="20"
              rx="10"
              fill="#0f172a"
              transform={eyelidTransform}
              style={{ transition: "transform 0.35s ease" }}
            />
            <rect
              x="41"
              y="30"
              width="24"
              height="20"
              rx="10"
              fill="#0f172a"
              transform={eyelidTransform}
              style={{ transition: "transform 0.35s ease" }}
            />
            {/* mouth */}
            <rect
              x="33"
              y={isValidEmail ? "56" : "58"}
              width={isValidEmail ? "14" : "10"}
              height="3"
              rx="1.5"
              fill="#f8fafc"
              style={{ transition: "all 0.2s ease" }}
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
