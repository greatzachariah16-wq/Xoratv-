import { useEffect } from "react";

/**
 * HilltopAds In-Page Push Ad Component
 * - Executes the provided Hilltop In-Page Push ad script globally
 * - Renders non-intrusive floating in-page push notifications directly on screen
 */
export function HilltopInPagePushAd() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SCRIPT_ID = "hilltop-inpage-push-script";
    if (document.getElementById(SCRIPT_ID)) return;

    try {
      (function (pnooxz: any) {
        var d = document,
          s = d.createElement("script"),
          l = d.currentScript || d.scripts[d.scripts.length - 1];
        s.id = SCRIPT_ID;
        s.settings = pnooxz || {};
        s.src =
          "//untimely-hello.com/bIXqV.std/G/lf0qYuWKcK/-exmD9lupZ/UolXkrPmTzcv0/NQTHQ/0VMyTYMGtUN/z/Qy1uNaDCQ_xMNawR";
        s.async = true;
        s.referrerPolicy = "no-referrer-when-downgrade";
        if (l && l.parentNode) {
          l.parentNode.insertBefore(s, l);
        } else {
          (d.head || d.body).appendChild(s);
        }
      })({});
    } catch (e) {
      console.debug("[HilltopAds In-Page Push] Init notice:", e);
    }
  }, []);

  return null;
}
