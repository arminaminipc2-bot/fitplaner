import { useEffect, useState } from "react";

/**
 * Media query as state. Used to mount exactly one navigation surface instead of
 * rendering both and hiding one, so the accessibility tree never contains two
 * competing sets of destinations.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export const DESKTOP_QUERY = "(min-width: 1080px)";
