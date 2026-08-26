import { useEffect, useRef, useState } from "react";

interface LoginMascotProps {
  // Which field currently has focus — drives the "covers its eyes while you
  // type your password" behavior, and the speech-bubble caption below.
  focusField: "identifier" | "password" | null;
  // Lights up the power light/speech bubble once the Username/Email field
  // looks like a valid email — purely a fun visual touch, no validation
  // logic elsewhere depends on this.
  isValidEmail: boolean;
}

// The little PC/monitor character that peeks over the top of the Login
// card — same interaction idea as the "watches you type, closes its eyes
// for your password" CodePen the user linked (codepen.io/itayko, pen
// 019fc70d-b75a-73b9-a643-f75d58b3199b), redrawn as a computer/monitor face
// in SRM's white + green palette instead of the original's dark robot head.
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
      const maxOffset = 2.6;
      setPupil({ x: Math.cos(angle) * maxOffset, y: Math.sin(angle) * maxOffset });
    }
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  let speech = "Beep boop. Ready when you are.";
  if (focusField === "password") speech = "My eyes are shut, promise!";
  else if (focusField === "identifier" && isValidEmail) speech = "That looks like a real email!";
  else if (focusField === "identifier") speech = "I'm watching you type...";

  const eyelidTransform = covered ? "translate(0,0)" : "translate(0,26)";

  return (
    <div className="flex flex-col items-center">
      {/* speech bubble */}
      <div className="relative mb-1 rounded-xl border-2 border-srm-green bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-[3px_3px_0_0_#7a9633]">
        {speech}
        <div className="absolute -bottom-[7px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b-2 border-r-2 border-srm-green bg-white" />
      </div>

      <div ref={containerRef} className="relative mt-2 h-[92px] w-24 select-none">
        <svg viewBox="0 0 90 92" className="h-full w-full">
          {/* monitor bezel */}
          <rect x="8" y="4" width="74" height="56" rx="12" fill="#ffffff" stroke="#9BBB3D" strokeWidth="3" />
          {/* screen */}
          <rect x="17" y="13" width="56" height="38" rx="7" fill="#eef6e2" stroke="#9BBB3D" strokeWidth="2" />

          {/* eyes */}
          <circle cx="36" cy="32" r="8" fill="#ffffff" />
          <circle cx="54" cy="32" r="8" fill="#ffffff" />
          <circle
            cx={36 + pupil.x}
            cy={32 + pupil.y}
            r="3.5"
            fill="#4c6321"
            style={{ opacity: covered ? 0 : 1, transition: "opacity 0.15s ease" }}
          />
          <circle
            cx={54 + pupil.x}
            cy={32 + pupil.y}
            r="3.5"
            fill="#4c6321"
            style={{ opacity: covered ? 0 : 1, transition: "opacity 0.15s ease" }}
          />
          {/* eyelids covering the eyes while the password is focused */}
          <rect
            x="26"
            y="23"
            width="20"
            height="17"
            rx="8"
            fill="#9BBB3D"
            transform={eyelidTransform}
            style={{ transition: "transform 0.35s ease" }}
          />
          <rect
            x="44"
            y="23"
            width="20"
            height="17"
            rx="8"
            fill="#9BBB3D"
            transform={eyelidTransform}
            style={{ transition: "transform 0.35s ease" }}
          />

          {/* mouth */}
          <rect
            x={isValidEmail ? "38" : "40"}
            y="42"
            width={isValidEmail ? "14" : "10"}
            height="3"
            rx="1.5"
            fill="#4c6321"
            style={{ transition: "all 0.2s ease" }}
          />

          {/* power light — lights up srm green once the email looks valid */}
          <circle
            cx="75"
            cy="52"
            r="2.6"
            fill={isValidEmail ? "#9BBB3D" : "#cbd5e1"}
            style={{ transition: "fill 0.3s ease" }}
          />

          {/* stand + base */}
          <rect x="37" y="60" width="16" height="10" fill="#ffffff" stroke="#9BBB3D" strokeWidth="3" />
          <rect x="24" y="70" width="42" height="8" rx="4" fill="#ffffff" stroke="#9BBB3D" strokeWidth="3" />
        </svg>
      </div>
    </div>
  );
}
