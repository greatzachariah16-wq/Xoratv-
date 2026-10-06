import { useEffect } from "react";

import spiritualLikeMomentImage from "@/assets/xoraSpiritualLikeMoment.svg";

type Props = {
  active: boolean;
  onDone?: () => void;
};

export function SpiritualLikeMoment({ active, onDone }: Props) {
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => onDone?.(), 1650);
    return () => window.clearTimeout(timer);
  }, [active, onDone]);

  if (!active) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-black/20 px-3 py-4 animate-[xoraLikeOverlay_1650ms_ease-out_forwards]"
      aria-hidden="true"
    >
      <div className="relative h-[50vh] w-[min(94vw,760px)] overflow-hidden rounded-3xl border border-white/25 bg-black shadow-2xl">
        <img
          src={spiritualLikeMomentImage}
          alt=""
          className="block h-full w-full object-cover animate-[xoraSpiritBreath_1650ms_ease-in-out_forwards]"
        />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_27%_68%,rgba(220,255,231,0.35),transparent_20%),radial-gradient(circle_at_65%_38%,rgba(200,255,230,0.10),transparent_35%)]" />

      <div className="absolute left-[27%] top-[69%] size-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30 blur-md animate-[xoraBloomGlow_900ms_ease-out_350ms_forwards]" />
      <div className="absolute left-[27%] top-[69%] size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-white/30 shadow-[0_0_18px_rgba(220,255,231,0.9)] animate-[xoraBloom_900ms_ease-out_350ms_forwards]" />

      <span className="absolute left-[27%] top-[69%] h-5 w-2 origin-bottom -translate-x-1/2 -translate-y-full rounded-[100%] border border-white/70 bg-white/30 animate-[xoraPetalOne_900ms_ease-out_500ms_forwards]" />
      <span className="absolute left-[27%] top-[69%] h-5 w-2 origin-bottom -translate-x-1/2 -translate-y-full rotate-90 rounded-[100%] border border-white/70 bg-white/30 animate-[xoraPetalTwo_900ms_ease-out_500ms_forwards]" />
      <span className="absolute left-[27%] top-[69%] h-5 w-2 origin-bottom -translate-x-1/2 -translate-y-full -rotate-90 rounded-[100%] border border-white/70 bg-white/30 animate-[xoraPetalThree_900ms_ease-out_500ms_forwards]" />

      <span className="absolute left-[48%] top-[50%] size-1 rounded-full bg-white shadow-[0_0_8px_white] animate-[xoraMagicParticle_900ms_ease-out_forwards]" />
      <span className="absolute left-[43%] top-[53%] size-1.5 rounded-full bg-white/80 shadow-[0_0_8px_white] animate-[xoraMagicParticle_1050ms_ease-out_80ms_forwards]" />
      <span className="absolute left-[38%] top-[56%] size-1 rounded-full bg-white/70 shadow-[0_0_8px_white] animate-[xoraMagicParticle_1000ms_ease-out_140ms_forwards]" />

      </div>

      <style>{`
        @keyframes xoraLikeOverlay {
          0% { opacity: 0; }
          12% { opacity: 1; }
          80% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes xoraLikeScene {
          0% { opacity: 0; transform: translate(-50%, 10px) scale(.96); }
          18% { opacity: 1; transform: translate(-50%, 0) scale(1); }
          78% { opacity: 1; transform: translate(-50%, -1px) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -6px) scale(.985); }
        }
        @keyframes xoraSpiritBreath {
          0%, 100% { transform: scale(1) translate3d(0,0,0); }
          45% { transform: scale(1.018) translate3d(-2px,-1px,0); }
          65% { transform: scale(1.01) translate3d(1px,0,0); }
        }
        @keyframes xoraBloom {
          0% { opacity: 0; transform: translate(-50%,-50%) scale(.35); }
          45% { opacity: 1; transform: translate(-50%,-50%) scale(1.5); }
          100% { opacity: .2; transform: translate(-50%,-50%) scale(2.1); }
        }
        @keyframes xoraBloomGlow {
          0% { opacity: 0; transform: translate(-50%,-50%) scale(.4); }
          50% { opacity: .8; transform: translate(-50%,-50%) scale(1.5); }
          100% { opacity: 0; transform: translate(-50%,-50%) scale(2.5); }
        }
        @keyframes xoraPetalOne {
          0% { opacity: 0; transform: translate(-50%,-100%) scale(.2) rotate(0); }
          45% { opacity: 1; transform: translate(-50%,-100%) scale(1) rotate(-20deg); }
          100% { opacity: 0; transform: translate(-50%,-145%) scale(.8) rotate(-45deg); }
        }
        @keyframes xoraPetalTwo {
          0% { opacity: 0; transform: translate(-50%,-100%) scale(.2) rotate(90deg); }
          45% { opacity: 1; transform: translate(-50%,-100%) scale(1) rotate(125deg); }
          100% { opacity: 0; transform: translate(-50%,-135%) scale(.75) rotate(160deg); }
        }
        @keyframes xoraPetalThree {
          0% { opacity: 0; transform: translate(-50%,-100%) scale(.2) rotate(-90deg); }
          45% { opacity: 1; transform: translate(-50%,-100%) scale(1) rotate(-120deg); }
          100% { opacity: 0; transform: translate(-50%,-140%) scale(.75) rotate(-155deg); }
        }
        @keyframes xoraMagicParticle {
          0% { opacity: 0; transform: translate3d(0,0,0) scale(.5); }
          25% { opacity: 1; }
          100% { opacity: 0; transform: translate3d(-28px,-10px,0) scale(1.3); }
        }
      `}</style>
    </div>
  );
}
