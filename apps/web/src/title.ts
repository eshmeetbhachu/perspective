import { useEffect } from "react";

// Sets the browser tab's title, e.g. "Questions · Perspective".
export function usePageTitle(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · Perspective` : "Perspective";
  }, [title]);
}
