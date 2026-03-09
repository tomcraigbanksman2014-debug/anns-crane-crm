import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AnnS Crane CRM",
    short_name: "AnnS CRM",
    description: "Enterprise CRM System",
    start_url: "/login",
    display: "standalone",
    background_color: "#e9f3ff",
    theme_color: "#e9f3ff",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/logo.png",
        sizes: "any",
        type: "image/png",
      },
    ],
  };
}
