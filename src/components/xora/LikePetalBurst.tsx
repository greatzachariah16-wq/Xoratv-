import { useEffect } from "react";

type Origin = {
  x: number;
  y: number;
};

type Props = {
  active: boolean;
  origin: Origin | null;
  onDone?: () => void;
};

const PETALS = [
  { dx: -150, dy: -90, rotate: -45, scale: 1 },
  { dx: -105, dy: -145, rotate: 20, scale: 0.9 },
  { dx: -35, dy: -175, rotate: 70, scale: 0.8 },
  { dx: 45, dy: -160, rotate: 115, scale: 1 },
  { dx: 120, dy: -115, rotate: 150, scale: 0.85 },
  { dx: 165, dy: -35, rotate: 190, scale: 0.75 },
  { dx: 150, dy: 55, rotate: 235, scale: 0.95 },
  { dx: 95, dy: 125, rotate: 280, scale: 0.8 },
  { dx: 25, dy: 155, rotate: 320, scale: 0.9 },
  { dx: -60, dy: 145, rotate: 350, scale: 0.75 },
  { dx: -125, dy: 95, rotate: 25, scale: 1 },
  { dx: -175, dy: 25, rotate: 65, scale: 0.85 },
];

export function LikePetalBurst({ active, origin, onDone }: Props) {
  useEffect(() => {
    if (!active || !origin) return;
    const timer = window.setTimeout(() => onDone?.(), 1200);
    return () => window.clearTimeout(timer);
  }, [active, origin, onDone]);

  if (!active || !origin) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[110] overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes xoraLikePetalBurst {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.15) rotate(0deg);
          }
          12% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1) rotate(20deg);
          }
          100% {
            opacity: 0;
            transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y)))
              scale(var(--s)) rotate(var(--r));
          }
        }

        @keyframes xoraLikeCoreBurst {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
          18% { opacity: 1; transform: translate(-50%, -50%) scale(1.25); }
          55% { opacity: 0.35; transform: translate(-50%, -50%) scale(2.2); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(2.8); }
        }
      `}</style>

      <div
        className="absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/80 shadow-[0_0_22px_rgba(255,255,255,0.9)]"
        style={{
          left: origin.x,
          top: origin.y,
          animation: "xoraLikeCoreBurst 900ms ease-out both",
        }}
      />

      {PETALS.map((petal, index) => (
        <span
          key={index}
          className="absolute left-0 top-0 h-3.5 w-2 origin-center rounded-[100%_0_100%_0] border border-white/80 bg-primary/70 shadow-[0_0_10px_rgba(255,255,255,0.55)]"
          style={{
            left: origin.x,
            top: origin.y,
            "--x": `${petal.dx}px`,
            "--y": `${petal.dy}px`,
            "--r": `${petal.rotate}deg`,
            "--s": petal.scale,
            animation: `xoraLikePetalBurst 1000ms cubic-bezier(.2,.75,.25,1) ${index * 18}ms both`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
