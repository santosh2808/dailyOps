import { useEffect, useRef, useState } from "react";

interface LoginMascotProps {
  // Which field currently has focus — drives the "covers its eyes while you
  // type your password" behavior. `identifier`/null both just track the mouse.
  focusField: "identifier" | "password" | null;
  // Lights up the antenna and grows the smile once the Username/Email field
  // looks like a valid email — purely a fun visual touch, no validation
  // logic elsewhere depends on this.
  isValidEmail: boolean;
}

// A small original character (not a copy of any third-party design) that
// watches the mouse, and covers its eyes while the password is being typed —
// the same idea the user pointed to as a CodePen reference. Pure inline SVG,
// no external assets or animation libraries.
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
      const maxOffset = 3.5;
      setPupil({ x: Math.cos(angle) * maxOffset, y: Math.sin(angle) * maxOffset });
    }
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  const eyelidTransform = covered ? "translate(0,0)" : "translate(0,34)";

  return (
    <div ref={containerRef} className="mx-auto h-20 w-20 select-none">
      <svg viewBox="0 0 100 100" className="h-full w-full">
        {/* head */}
        <circle cx="50" cy="52" r="40" fill="#ffffff" stroke="#e2e8f0" strokeWidth="2" />
        {/* antenna — lights up SRM green once the email looks valid */}
        <line x1="50" y1="13" x2="50" y2="3" stroke="#9BBB3D" strokeWidth="3" strokeLinecap="round" />
        <circle
          cx="50"
          cy="3"
          r="4"
          fill={isValidEmail ? "#9BBB3D" : "#cbd5e1"}
          style={{ transition: "fill 0.3s ease" }}
        />
        {/* ears */}
        <circle cx="11" cy="55" r="7" fill="#9BBB3D" />
        <circle cx="89" cy="55" r="7" fill="#9BBB3D" />

        {/* eye sockets */}
        <circle cx="34" cy="50" r="13" fill="#f1f5f9" />
        <circle cx="66" cy="50" r="13" fill="#f1f5f9" />

        {/* pupils — follow the mouse, hidden while the password field is focused */}
        <circle
          cx={34 + pupil.x}
          cy={50 + pupil.y}
          r="5"
          fill="#1e293b"
          style={{ opacity: covered ? 0 : 1, transition: "opacity 0.2s ease" }}
        />
        <circle
          cx={66 + pupil.x}
          cy={50 + pupil.y}
          r="5"
          fill="#1e293b"
          style={{ opacity: covered ? 0 : 1, transition: "opacity 0.2s ease" }}
        />

        {/* eyelid covers — slide up from the chin to shut the eyes while typing the password */}
        <rect
          x="18"
          y="38"
          width="32"
          height="24"
          rx="12"
          fill="#ffffff"
          transform={eyelidTransform}
          style={{ transition: "transform 0.4s ease" }}
        />
        <rect
          x="50"
          y="38"
          width="32"
          height="24"
          rx="12"
          fill="#ffffff"
          transform={eyelidTransform}
          style={{ transition: "transform 0.4s ease" }}
        />

        {/* mouth — small smile that grows once the email looks valid */}
        <path
          d={isValidEmail ? "M 37 70 Q 50 80 63 70" : "M 40 71 Q 50 75 60 71"}
          stroke="#1e293b"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
