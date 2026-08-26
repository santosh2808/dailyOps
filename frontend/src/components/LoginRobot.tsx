import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getDotGreeting } from "@/lib/dotMessages";
import { toast } from "@/lib/toast";
import "./LoginRobot.css";

// D.O.T. (DailyOps Operations Assistant) — ported from the user's own
// reference HTML/CSS/JS (a neubrutalist login card guarded by a robot
// that watches you type, turns around and shows a password-strength
// meter on the back of its head while you type your password, and throws
// confetti on success). The interaction logic below is a close port of
// that vanilla JS into a single mount-time effect operating on refs,
// rather than being rebuilt as declarative React state — that mirrors
// the original's structure and keeps the animation timing identical.
// Colors remapped to SRM green/red (see LoginRobot.css); the three demo
// fields (name/email/password) are collapsed into the app's real two
// fields (username-or-email/password), and the fake "log in" on submit
// is replaced with a real call to AuthContext.login().
//
// The one-time greeting shown in the speech bubble on load is sourced
// from getDotGreeting() (see lib/dotMessages.ts) rather than being a
// literal string here — that's the seam where a future AI-generated
// response can be swapped in without touching this component's
// interaction logic. Everything else the robot says (the reactive quips
// below, keyed to focus/typing/submit events) stays as scripted
// personality, same as before.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function LoginRobot() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const sceneRef = useRef<HTMLDivElement>(null);
  const robotRef = useRef<HTMLDivElement>(null);
  const head3dRef = useRef<HTMLDivElement>(null);
  const eyesRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const bubbleTextRef = useRef<HTMLSpanElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const panelLabelRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const rememberRef = useRef<HTMLInputElement>(null);
  const peekBtnRef = useRef<HTMLButtonElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const btnLabelRef = useRef<HTMLSpanElement>(null);

  const [notice, setNotice] = useState("");
  // Picked once per mount (i.e. once per page load/refresh) — see the
  // import comment above and lib/dotMessages.ts for why this is a
  // function call rather than a literal string.
  const [greeting] = useState(() => getDotGreeting());

  useEffect(() => {
    if (
      !robotRef.current || !head3dRef.current || !eyesRef.current || !bubbleRef.current ||
      !bubbleTextRef.current || !meterRef.current || !panelLabelRef.current || !formRef.current ||
      !identifierRef.current || !passwordRef.current || !peekBtnRef.current || !btnRef.current ||
      !btnLabelRef.current || !sceneRef.current
    ) {
      return;
    }
    const robot = robotRef.current;
    const head3d = head3dRef.current;
    const eyes = eyesRef.current;
    const bubble = bubbleRef.current;
    const bubbleText = bubbleTextRef.current;
    const meter = meterRef.current;
    const panelLabel = panelLabelRef.current;
    const form = formRef.current;
    const identifierI = identifierRef.current;
    const passI = passwordRef.current;
    const peekBtn = peekBtnRef.current;
    const btn = btnRef.current;
    const btnLabel = btnLabelRef.current;
    const scene = sceneRef.current;

    const meterBars = Array.from(meter.children) as HTMLElement[];
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let done = false;
    let lastSaid = "";

    function setMood(mood: string) {
      if (!done) robot.dataset.mood = mood;
    }
    function say(text: string) {
      if (text === lastSaid) return;
      lastSaid = text;
      bubbleText.textContent = text;
      bubble.classList.remove("volt-pop");
      void bubble.offsetWidth;
      bubble.classList.add("volt-pop");
    }
    function look(x: number, y: number) {
      eyes.style.setProperty("--lx", `${x}px`);
      eyes.style.setProperty("--ly", `${y}px`);
    }
    function tilt(ry: number, rx: number) {
      head3d.style.setProperty("--ry", `${ry}deg`);
      head3d.style.setProperty("--rx", `${rx}deg`);
    }
    function followTyping(input: HTMLInputElement) {
      const ratio = Math.min(input.value.length / 22, 1);
      look(-6 + 12 * ratio, 5);
      tilt(-5 + 10 * ratio, -8);
    }
    function turnAway(on: boolean) {
      robot.classList.toggle("is-turned", on);
    }

    function onIdentifierFocus() {
      turnAway(false);
      setMood("watching");
      say(pick(["A visitor. Who goes there?", "Typing detected. Go on, I'm watching."]));
      followTyping(identifierI);
    }
    function onIdentifierInput() {
      followTyping(identifierI);
      const v = identifierI.value.trim();
      if (EMAIL_RE.test(v)) {
        setMood("happy");
        say(pick(["Now that's a proper email. Respect.", "Valid address detected. Quietly delighted."]));
      } else if (v.includes("@")) {
        setMood("watching");
        say("Close. My sensors say: not yet.");
      } else if (v.length >= 2) {
        setMood("watching");
        say("I'm watching every keystroke...");
      } else {
        setMood("idle");
        say("Blank slate. I forget everything instantly.");
      }
    }

    function onPasswordFocus() {
      setMood("shy");
      turnAway(true);
      look(0, 0);
      tilt(0, 0);
      say("A secret? Say no more. *turns around*");
      panelLabel.textContent = "NOT LOOKING";
    }
    function onPasswordBlur(e: FocusEvent) {
      if (e.relatedTarget === peekBtn) return;
      turnAway(false);
    }
    function onPasswordInput() {
      const v = passI.value;
      let score = 0;
      if (v.length >= 8) score++;
      if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
      if (/\d/.test(v)) score++;
      if (/[^a-zA-Z0-9]/.test(v)) score++;
      if (v.length > 0 && score === 0) score = 1;
      meter.dataset.lvl = String(score);
      meterBars.forEach((bar, i) => bar.classList.toggle("on", i < score));
      panelLabel.textContent =
        v.length === 0
          ? "NOT LOOKING"
          : ["NOT LOOKING", "TOO SHORT", "GETTING THERE", "STRONG", "FORT KNOX"][score];
    }

    function onPeekClick() {
      const show = passI.type === "password";
      passI.type = show ? "text" : "password";
      peekBtn.setAttribute("aria-pressed", String(show));
      peekBtn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      if (show) say("Revealing it? Good thing I'm facing the wall.");
      passI.focus();
    }

    function hype(on: boolean) {
      if (done) return;
      if (on && robot.classList.contains("is-pressed")) return;
      robot.classList.toggle("is-hyped", on);
      if (on) {
        turnAway(false);
        setMood("excited");
        say(pick(["Ooh. Do it. Press it.", "This is my favorite part."]));
      } else {
        setMood("idle");
        say("The button misses you already.");
      }
    }

    let pressTimer: ReturnType<typeof setTimeout>;
    function onPointerDown() {
      clearTimeout(pressTimer);
      robot.classList.add("is-pressed");
      robot.dataset.mood = "pressed";
      say(pick(["Ahh. That's the stuff.", "Mmm. Satisfying.", "Beep. Do that again."]));
    }
    function releasePress() {
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        robot.classList.remove("is-pressed");
        if (robot.dataset.mood === "pressed") {
          robot.dataset.mood = done ? "success" : "excited";
        }
      }, 340);
    }
    function onPointerLeave() {
      if (robot.classList.contains("is-pressed")) releasePress();
    }

    function confetti() {
      const colors = ["#ED3525", "#9BBB3D", "#ffc53d", "#23252d", "#fffdf8"];
      const origin = btn.getBoundingClientRect();
      const hostRect = scene.getBoundingClientRect();
      const ox = origin.left - hostRect.left + origin.width / 2;
      const oy = origin.top - hostRect.top;
      for (let i = 0; i < 70; i++) {
        const bit = document.createElement("span");
        bit.className = "volt-confetti";
        bit.style.background = pick(colors);
        if (Math.random() > 0.5) bit.style.borderRadius = "50%";
        scene.appendChild(bit);
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        const speed = 240 + Math.random() * 380;
        const tx = Math.cos(angle) * speed;
        const ty = Math.sin(angle) * speed;
        bit
          .animate(
            [
              { transform: `translate(${ox}px, ${oy}px) rotate(0deg) scale(1)`, opacity: 1 },
              {
                transform: `translate(${ox + tx}px, ${oy + ty + 320}px) rotate(${
                  540 * (Math.random() > 0.5 ? 1 : -1)
                }deg) scale(.6)`,
                opacity: 0,
              },
            ],
            { duration: 1100 + Math.random() * 700, easing: "cubic-bezier(.15,.6,.35,1)" }
          )
          .addEventListener("finish", () => bit.remove());
      }
    }

    async function onSubmit(e: Event) {
      e.preventDefault();
      if (done) return;
      const idVal = identifierI.value.trim();
      const pwVal = passI.value;

      let complaint: [string, HTMLInputElement] | null = null;
      if (!idVal) complaint = ["Still don't know who you are.", identifierI];
      else if (!pwVal) complaint = ["A password would help.", passI];

      if (complaint) {
        const [msg, field] = complaint;
        setTimeout(() => {
          say(msg);
          setMood("watching");
        }, 380);
        form!.classList.remove("volt-shake");
        void form!.offsetWidth;
        form!.classList.add("volt-shake");
        field.focus();
        return;
      }

      btn.disabled = true;
      try {
        await login(idVal, pwVal, rememberRef.current?.checked ?? true);
        done = true;
        turnAway(false);
        robot.classList.remove("is-hyped");
        setTimeout(() => {
          robot.dataset.mood = "success";
          say(`Access granted. Welcome, ${idVal}.`);
          btn.classList.add("is-success");
          btnLabel.textContent = "ACCESS GRANTED ✓";
          look(0, 0);
          tilt(0, 0);
          if (!reduceMotion) {
            robot.classList.add("is-spinning");
            setTimeout(() => robot.classList.remove("is-spinning"), 950);
            confetti();
          }
        }, 420);
        // ProtectedRoute takes over from here — it redirects to
        // /change-password instead if this account still has
        // mustChangePassword set (e.g. first login as the seeded admin).
        setTimeout(() => navigate("/dashboard"), 1400);
      } catch {
        btn.disabled = false;
        toast.error("Incorrect username/email or password.");
        setTimeout(() => {
          say("Nope, that's not it. Try again?");
          setMood("watching");
        }, 380);
        form!.classList.remove("volt-shake");
        void form!.offsetWidth;
        form!.classList.add("volt-shake");
        passI.focus();
      }
    }

    const onBtnHypeOn = () => hype(true);
    const onBtnHypeOff = () => hype(false);

    identifierI.addEventListener("focus", onIdentifierFocus);
    identifierI.addEventListener("input", onIdentifierInput);
    passI.addEventListener("focus", onPasswordFocus);
    passI.addEventListener("blur", onPasswordBlur);
    passI.addEventListener("input", onPasswordInput);
    peekBtn.addEventListener("click", onPeekClick);
    btn.addEventListener("mouseenter", onBtnHypeOn);
    btn.addEventListener("mouseleave", onBtnHypeOff);
    btn.addEventListener("focus", onBtnHypeOn);
    btn.addEventListener("blur", onBtnHypeOff);
    btn.addEventListener("pointerdown", onPointerDown);
    btn.addEventListener("pointerup", releasePress);
    btn.addEventListener("pointercancel", releasePress);
    btn.addEventListener("pointerleave", onPointerLeave);
    form.addEventListener("submit", onSubmit);

    let blinkTimer: ReturnType<typeof setTimeout>;
    function blinkLoop() {
      blinkTimer = setTimeout(() => {
        if (robot.dataset.mood !== "success" && !robot.classList.contains("is-turned")) {
          eyes.classList.add("volt-blink");
          setTimeout(() => eyes.classList.remove("volt-blink"), 150);
        }
        blinkLoop();
      }, 2600 + Math.random() * 2600);
    }
    blinkLoop();

    let rafPending = false;
    function onMouseMove(e: MouseEvent) {
      const active = document.activeElement;
      if (done || (active && active.tagName === "INPUT")) return;
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        const rect = robot.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = Math.max(-1, Math.min(1, (e.clientX - cx) / 260));
        const dy = Math.max(-1, Math.min(1, (e.clientY - cy) / 260));
        look(dx * 7, dy * 6);
        if (!robot.classList.contains("is-turned")) tilt(dx * 12, -dy * 9);
      });
    }
    document.addEventListener("mousemove", onMouseMove);

    say(greeting);

    return () => {
      clearTimeout(blinkTimer);
      clearTimeout(pressTimer);
      document.removeEventListener("mousemove", onMouseMove);
      identifierI.removeEventListener("focus", onIdentifierFocus);
      identifierI.removeEventListener("input", onIdentifierInput);
      passI.removeEventListener("focus", onPasswordFocus);
      passI.removeEventListener("blur", onPasswordBlur);
      passI.removeEventListener("input", onPasswordInput);
      peekBtn.removeEventListener("click", onPeekClick);
      form.removeEventListener("submit", onSubmit);
      btn.removeEventListener("mouseenter", onBtnHypeOn);
      btn.removeEventListener("mouseleave", onBtnHypeOff);
      btn.removeEventListener("focus", onBtnHypeOn);
      btn.removeEventListener("blur", onBtnHypeOff);
      btn.removeEventListener("pointerdown", onPointerDown);
      btn.removeEventListener("pointerup", releasePress);
      btn.removeEventListener("pointercancel", releasePress);
      btn.removeEventListener("pointerleave", onPointerLeave);
    };
    // Runs once on mount, exactly like the original <script> tag — all the
    // wiring above operates on refs/DOM directly rather than React state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="volt-scene h-full w-full" ref={sceneRef}>
      <main className="volt-stage">
        <div className="volt-robot" ref={robotRef} data-mood="idle">
          <div className="volt-bubble" ref={bubbleRef} role="status" aria-live="polite">
            <span ref={bubbleTextRef}>{greeting}</span>
          </div>
          <div className="volt-antenna" aria-hidden="true">
            <span className="volt-antenna-rod" />
            <span className="volt-antenna-tip" />
          </div>
          <div className="volt-head3d" ref={head3dRef} aria-hidden="true">
            <div className="volt-head">
              <span className="volt-ear volt-ear--l" />
              <span className="volt-ear volt-ear--r" />
              <div className="volt-face volt-face--front">
                <div className="volt-visor">
                  <div className="volt-eyes" ref={eyesRef}>
                    <span className="volt-eye volt-eye--l" />
                    <span className="volt-eye volt-eye--r" />
                  </div>
                  <span className="volt-cheek volt-cheek--l" />
                  <span className="volt-cheek volt-cheek--r" />
                  <span className="volt-mouth" />
                </div>
              </div>
              <div className="volt-face volt-face--back">
                <div className="volt-panel">
                  <span className="volt-panel-lights">
                    <i />
                    <i />
                    <i />
                  </span>
                  <div className="volt-meter" ref={meterRef}>
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <p className="volt-panel-label" ref={panelLabelRef}>
                    NOT LOOKING
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <form className="volt-card" ref={formRef} noValidate>
          <span className="volt-hand volt-hand--l" aria-hidden="true" />
          <span className="volt-hand volt-hand--r" aria-hidden="true" />
          <h1 className="volt-title">
            Welcome to <span style={{ color: "#9BBB3D" }}>SR</span> DailyOps
          </h1>
          <p className="volt-subtitle">Smart Rotamac Operations Platform</p>
          <p className="volt-description">Manage your complete business from Lead to Dispatch.</p>

          <label className="volt-field">
            <svg className="volt-field-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Zm0 2c-3.9 0-8 2-8 5v1.5h16V19c0-3-4.1-5-8-5Z" />
            </svg>
            <input
              ref={identifierRef}
              type="text"
              placeholder="Username or email"
              autoComplete="username"
              aria-label="Username or email"
              required
            />
          </label>

          <label className="volt-field">
            <svg className="volt-field-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 0 1 6 0v3H9Zm3 4a2 2 0 0 1 1 3.7V19h-2v-1.3a2 2 0 0 1 1-3.7Z" />
            </svg>
            <input
              ref={passwordRef}
              type="password"
              placeholder="Super secret password"
              autoComplete="current-password"
              aria-label="Password"
              required
            />
            <button
              ref={peekBtnRef}
              className="volt-peek"
              type="button"
              aria-label="Show password"
              aria-pressed="false"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5c-5 0-9.3 3.1-11 7.5C2.7 16.9 7 20 12 20s9.3-3.1 11-7.5C21.3 8.1 17 5 12 5Zm0 12.5a5 5 0 1 1 5-5 5 5 0 0 1-5 5Zm0-8a3 3 0 1 0 3 3 3 3 0 0 0-3-3Z" />
              </svg>
            </button>
          </label>

          <div className="volt-row">
            <label className="volt-remember">
              <input ref={rememberRef} type="checkbox" defaultChecked />
              Remember me
            </label>
            <button
              type="button"
              className="volt-forgot"
              onClick={() => setNotice("Contact your administrator to reset your password.")}
            >
              Forgot password?
            </button>
          </div>
          {notice && <p className="volt-notice">{notice}</p>}

          <button className="volt-btn" ref={btnRef} type="submit">
            <span className="volt-btn-bolt" aria-hidden="true">
              ⚡
            </span>
            <span className="volt-btn-label" ref={btnLabelRef}>
              LOG ME IN
            </span>
          </button>

          <p className="volt-footer">
            Powered by Smart Rotamac
            <span className="volt-footer-version">Version 1.0</span>
          </p>

          <span className="volt-foot volt-foot--l" aria-hidden="true" />
          <span className="volt-foot volt-foot--r" aria-hidden="true" />
        </form>
      </main>
    </div>
  );
}
