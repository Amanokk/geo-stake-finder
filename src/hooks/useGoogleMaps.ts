import { useEffect, useState } from "react";
import { getGoogleMaps } from "@/lib/googleMapsTypes";

const CALLBACK_NAME = "__initGmap";

export function useGoogleMaps(): boolean {
  const [ready, setReady] = useState<boolean>(
    typeof window !== "undefined" && !!getGoogleMaps(),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (getGoogleMaps()) {
      setReady(true);
      return;
    }
    if (window.__gmapReady) {
      setReady(true);
      return;
    }

    const onReady = () => setReady(true);
    window.addEventListener("gmap:ready", onReady);

    if (!window.__gmapLoading) {
      window.__gmapLoading = true;
      const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
      const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
      window[CALLBACK_NAME] = () => {
        window.__gmapReady = true;
        window.dispatchEvent(new Event("gmap:ready"));
      };
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=${CALLBACK_NAME}${
        channel ? `&channel=${channel}` : ""
      }`;
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }

    return () => window.removeEventListener("gmap:ready", onReady);
  }, []);

  return ready;
}
