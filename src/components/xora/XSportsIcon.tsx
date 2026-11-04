import type { SVGProps } from "react";

const FOOTBALLER_ICON =
  "https://www.svgrepo.com/download/116703/football-player-kicking-ball.svg";

export function XSportsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <image
        href={FOOTBALLER_ICON}
        x="0"
        y="0"
        width="64"
        height="64"
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  );
}
