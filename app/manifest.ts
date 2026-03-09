import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AnnS Crane CRM",
    short_name: "AnnS CRM",
    description: "AnnS Crane Hire Management System",
    start_url: "/login",
    display: "standalone",
    background_color: "#f3f7ff",
    theme_color: "#f3f7ff",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
