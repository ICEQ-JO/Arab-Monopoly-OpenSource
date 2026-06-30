import { useEffect, useRef } from "react";

const FINE_COUNT = 200;   // small drift particles
const CLUMP_COUNT = 60;   // larger, slower clumps
const COLORS = [
  "rgba(212,175,55,",
  "rgba(194,154,90,",
  "rgba(222,196,120,",
  "rgba(180,140,70,",
  "rgba(240,210,140,",
  "rgba(160,120,55,",
];

function makeFine(w, h) {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    r: Math.random() * 1.8 + 0.2,
    vx: (Math.random() * 0.7 + 0.2) * (Math.random() < 0.88 ? 1 : -1),
    vy: (Math.random() - 0.55) * 0.3,
    alpha: Math.random() * 0.4 + 0.06,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    alphaDelta: (Math.random() * 0.0035 + 0.0006) * (Math.random() < 0.5 ? 1 : -1),
    alphaMin: 0.03,
    alphaMax: Math.random() * 0.38 + 0.18,
    clump: false,
  };
}

function makeClump(w, h) {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    r: Math.random() * 3.5 + 1.6,
    vx: (Math.random() * 0.35 + 0.08) * (Math.random() < 0.82 ? 1 : -1),
    vy: (Math.random() - 0.52) * 0.18,
    alpha: Math.random() * 0.22 + 0.04,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    alphaDelta: (Math.random() * 0.002 + 0.0003) * (Math.random() < 0.5 ? 1 : -1),
    alphaMin: 0.02,
    alphaMax: Math.random() * 0.2 + 0.1,
    clump: true,
  };
}

export default function SandParticles() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let animId;
    let particles = [];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const fine = Array.from({ length: FINE_COUNT }, () => makeFine(canvas.width, canvas.height));
      const clumps = Array.from({ length: CLUMP_COUNT }, () => makeClump(canvas.width, canvas.height));
      particles = [...fine, ...clumps];
    }

    resize();
    window.addEventListener("resize", resize);

    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        ctx.beginPath();
        if (p.clump) {
          // Clumps are ellipses slightly wider than tall
          ctx.ellipse(p.x, p.y, p.r * 1.6, p.r, Math.PI / 6, 0, Math.PI * 2);
        } else {
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        }
        ctx.fillStyle = p.color + p.alpha.toFixed(3) + ")";
        ctx.fill();

        p.x += p.vx;
        p.y += p.vy;

        p.alpha += p.alphaDelta;
        if (p.alpha >= p.alphaMax || p.alpha <= p.alphaMin) p.alphaDelta *= -1;

        if (p.x > canvas.width + 6) p.x = -6;
        if (p.x < -6) p.x = canvas.width + 6;
        if (p.y > canvas.height + 6) p.y = -6;
        if (p.y < -6) p.y = canvas.height + 6;
      }

      animId = requestAnimationFrame(tick);
    }

    tick();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 2,
      }}
    />
  );
}
