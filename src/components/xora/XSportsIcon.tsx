import type { SVGProps } from "react";

export function XSportsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <g fill="currentColor">
        {/* Head and neck */}
        <circle cx="35.5" cy="9" r="5.2" />
        <path d="M31.5 14.2 39.2 15.3 42.2 23.8 36.2 29.1 27.8 23.4Z" />
        {/* Back arm, thrown out for balance */}
        <path d="m31.2 17.1-8.4 1.1-7.2 7.3-4.8-1.4-2.2 3.1 7.8 3.1 3.1-1.1 8.7-7.1 6.1-1.2Z" />
        {/* Forward arm */}
        <path d="m39.3 17.4 6.8 2.8 4.2 7.4 4.5 1.2 1.1 3.3-7.2-.2-2.2-2.2-5.9-6.1-4.9-1.1Z" />
        {/* Torso and shorts */}
        <path d="m29.5 20.2 10.2 1.3 3.1 10.1-5.1 7.2-12.8-3.1-2.3-7.5Z" />
        <path d="m25.4 33.4 13.1 2.1 2.5 6.1-8.5 2.3-9.2-4.1Z" />
        {/* Planted leg */}
        <path d="m26.4 39.1 7.3 2.3-3.8 8.4-1.1 7.6-4.2 1.1-2-2.3 1.1-8.2Z" />
        <path d="m24.9 56.1 5.2.4 2.5 3.2-1.3 1.8-9.8-.2-1.2-1.5Z" />
        {/* Kicking leg extended toward the ball */}
        <path d="m37.4 39.1 5.4-2.3 5.1 5.8 6.2 3.1 4.1 1.2-.5 3.3-6.5-.8-8.2-3.2-7.1-3.4Z" />
        <path d="m54.1 46.4 4.4 1.2 2.1 2.8-1.2 1.7-6.2-1.2-1.5-2Z" />
      </g>
      {/* Football */}
      <circle cx="9.5" cy="47.5" r="7.2" fill="currentColor" />
      <path d="m9.5 42.7 2.8 2-1.1 3.3H7.8l-1.1-3.3 2.8-2Z" fill="none" stroke="var(--background, #fff)" strokeWidth="1.15" strokeLinejoin="round" />
      <path d="m6.7 44.7-2.2-.8M12.3 44.7l2.1-.8M7.8 48h-3M11.2 48h3M7.8 51.3l-1.3 1.4M11.2 51.3l1.3 1.4" stroke="var(--background, #fff)" strokeWidth="1.05" strokeLinecap="round" />
      {/* Motion accents */}
      <path d="m2.5 36.5 6.3-1.3M1.5 40.5l4.1-.7M4.2 55.6l4.3 1.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
