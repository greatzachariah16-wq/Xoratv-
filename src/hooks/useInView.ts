import { useEffect, useState, type RefObject } from "react";

export function useInView(
  ref: RefObject<HTMLElement>,
  options?: IntersectionObserverInit,
): boolean {
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const target = ref.current;
    if (!target || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting);
    }, options);

    observer.observe(target);
    return () => observer.disconnect();
  }, [ref, options]);

  return inView;
}
