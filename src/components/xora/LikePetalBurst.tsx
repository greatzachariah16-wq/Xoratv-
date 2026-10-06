import { useEffect, useRef } from "react";

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
  const refs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    if (!active || !origin) return;

    const animations = refs.current.map((el, index) => {
      if (!el) return null;
      const petal = PETALS[index];
      const delay = index * 18;

      return el.animate(
        [
          {
            transform: "translate(-50%, -50%) scale(0.25) rotate(0deg)",
            opacity: 0,
          },
          {
            transform: "translate(-50%, -50%) scale(1) rotate(20deg)",
            opacity: 0.95,
            offset: 0.14,
          },
          {
            transform: `translate(calc(-50% + ${petal.dx}px), calc(-50% + ${petal.dy}px)) scale(${petal.scale}) rotate(${petal.rotate}deg)`,
            opacity: 0,
          },
        ],
        {
          duration: 980,
          delay,
          easing: "cubic-bezier(.2,.75,.25,1)",
          fill: "forwards",
        },
      );
    });

    const timer = window.setTimeout(() => onDone?.(), 1150);
    return () => {
      animations.forEach((animation) => animation?.cancel());
      window.clearTimeout(timer);
    };
  }, [active, origin, onDone]);

  if (!active || !origin) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[110] overflow-hidden" aria-hidden="true">
      <div
        className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/80 shadow-[0_0_18px_rgba(255,255,255,0.75)]"
        style={{ left: origin.x, top: origin.y }}
      />
      {PETALS.map((_, index) => (
        <span
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          className="absolute left-0 top-0 h-3.5 w-2 origin-center rounded-[100%_0_100%_0] border border-white/70 bg-primary/55 shadow-[0_0_10px_rgba(255,255,255,0.45)]"
          style={{ left: origin.x, top: origin.y }}
        />
      ))}
    </div>
  );
}
