import { useEffect } from "react";

type Origin = { x: number; y: number };
type Props = { active: boolean; origin: Origin | null; onDone?: () => void };

const PETALS = [
  [-46, -42, -25, 1.0], [-30, -48, 35, 0.85], [-12, -52, 70, 1.15], [8, -50, 110, 0.9],
  [27, -45, 145, 1.0], [45, -34, 180, 0.8], [49, -12, 220, 1.1], [46, 12, 250, 0.9],
  [38, 31, 285, 1.0], [22, 43, 320, 0.8], [3, 49, 350, 1.1], [-18, 47, 25, 0.9],
  [-35, 37, 60, 1.0], [-47, 22, 95, 0.85], [-50, 0, 135, 1.15], [-48, -20, 170, 0.9],
  [-35, -8, 15, 0.7], [-20, -22, 80, 0.65], [0, -30, 125, 0.75], [20, -18, 205, 0.7],
  [34, -4, 265, 0.8], [28, 18, 305, 0.65], [10, 29, 345, 0.75], [-12, 26, 40, 0.7],
  [-28, 13, 105, 0.8], [-18, 4, 160, 0.6], [4, 8, 220, 0.65], [16, 1, 280, 0.7],
];

export function LikePetalBurst({ active, origin, onDone }: Props) {
  useEffect(() => {
    if (!active || !origin) return;
    const timer = window.setTimeout(() => onDone?.(), 10000);
    return () => window.clearTimeout(timer);
  }, [active, origin, onDone]);

  if (!active || !origin) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[110] overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes xoraLikeFlash {
          0% { opacity: 0; }
          12% { opacity: .9; }
          35% { opacity: .35; }
          100% { opacity: 0; }
        }
        @keyframes xoraLikeRing {
          0% { opacity: 0; transform: translate(-50%,-50%) scale(.1); }
          12% { opacity: .85; }
          100% { opacity: 0; transform: translate(-50%,-50%) scale(28); }
        }
        @keyframes xoraLikePetal {
          0% { opacity: 0; transform: translate(-50%,-50%) scale(.05) rotate(0deg); }
          10% { opacity: 1; transform: translate(-50%,-50%) scale(.9) rotate(20deg); }
          72% { opacity: .85; }
          100% {
            opacity: 0;
            transform: translate(calc(-50% + var(--x)),calc(-50% + var(--y)))
              scale(var(--s)) rotate(var(--r));
          }
        }
        @keyframes xoraLikeSpark {
          0% { opacity: 0; transform: translate(-50%,-50%) scale(.1); }
          15% { opacity: 1; transform: translate(-50%,-50%) scale(1); }
          100% { opacity: 0; transform: translate(calc(-50% + var(--x)),calc(-50% + var(--y))) scale(.2); }
        }
        @keyframes xoraLikeHeart {
          0% { opacity: 0; transform: translate(-50%,-50%) scale(.25); }
          15% { opacity: .95; transform: translate(-50%,-50%) scale(1.1); }
          45% { opacity: .32; transform: translate(-50%,-50%) scale(1.35); }
          100% { opacity: 0; transform: translate(-50%,-50%) scale(1.65); }
        }
      `}</style>

      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,.22),transparent_45%)]"
        style={{ animation: "xoraLikeFlash 9000ms ease-out both" }}
      />

      <div
        className="absolute size-8 rounded-full border-2 border-white/80 shadow-[0_0_35px_rgba(255,255,255,.8)]"
        style={{
          left: origin.x,
          top: origin.y,
          animation: "xoraLikeRing 8000ms cubic-bezier(.15,.75,.2,1) both",
        }}
      />

      <div
        className="absolute text-9xl font-black leading-none text-primary drop-shadow-[0_0_30px_rgba(255,255,255,.8)]"
        style={{
          left: origin.x,
          top: origin.y,
          animation: "xoraLikeHeart 8500ms cubic-bezier(.2,.8,.2,1) both",
        }}
      >
        ♥
      </div>

      {PETALS.map(([x, y, rotate, scale], index) => (
        <span
          key={index}
          className="absolute left-0 top-0 h-6 w-3 rounded-[100%_0_100%_0] border border-white/80 bg-primary/75 shadow-[0_0_18px_rgba(255,255,255,.7)]"
          style={{
            left: origin.x,
            top: origin.y,
            "--x": `${x}vw`,
            "--y": `${y}vh`,
            "--r": `${rotate}deg`,
            "--s": scale,
            animation: `xoraLikePetal 9000ms cubic-bezier(.12,.72,.18,1) ${index * 12}ms both`,
          } as React.CSSProperties}
        />
      ))}

      {PETALS.slice(0, 18).map(([x, y], index) => (
        <i
          key={`spark-${index}`}
          className="absolute left-0 top-0 size-2 rounded-full bg-white shadow-[0_0_14px_rgba(255,255,255,.95)]"
          style={{
            left: origin.x,
            top: origin.y,
            "--x": `${x * 1.05}vw`,
            "--y": `${y * 1.05}vh`,
            animation: `xoraLikeSpark 8000ms cubic-bezier(.2,.7,.2,1) ${80 + index * 22}ms both`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
