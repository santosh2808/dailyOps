import { useEffect, useRef } from "react";

interface ParticlesBackgroundProps {
  /** CSS color strings for the dots/lines (cycled across particles). */
  colors?: string[];
  /** Roughly how many particles per 10,000px² of canvas area. */
  density?: number;
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
}

// Lightweight, dependency-free "connecting dots" particle effect — the
// classic particles.js look (floating dots, lines drawn between nearby
// ones) without pulling in an external library. Pure canvas + rAF, no
// npm install required. Purely decorative: pointer-events-none, and it
// tears down its rAF loop + resize listener on unmount.
export default function ParticlesBackground({
  colors = ["#9BBB3D", "#ED3525", "#94a3b8"],
  density = 0.9,
  className = "",
}: ParticlesBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let animationFrame = 0;

    function resize() {
      if (!canvas || !parent) return;
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas.width = width;
      canvas.height = height;
      const count = Math.round((width * height) / 10000 * density);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.8 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
      }));
    }

    const maxLinkDistance = 130;

    function tick() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < maxLinkDistance) {
            ctx.strokeStyle = a.color;
            ctx.globalAlpha = (1 - dist / maxLinkDistance) * 0.15;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      ctx.globalAlpha = 0.6;
      for (const p of particles) {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      animationFrame = requestAnimationFrame(tick);
    }

    resize();
    tick();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrame);
    };
    // colors/density are only read at setup time — changing them at runtime
    // isn't a supported use case for this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
