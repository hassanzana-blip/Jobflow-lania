import type { MetadataRoute } from "next";
export const dynamic = "force-static";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "JobbFlow",
    short_name: "JobbFlow",
    description: "Jobben som passar dig. Hittade åt dig.",
    lang: "sv",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#f3f4e9",
    theme_color: "#f3f4e9",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
