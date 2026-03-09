import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AnnS Crane CRM",
    short_name: "AnnS CRM",
    description: "AnnS Crane Hire CRM",
    start_url: "/login",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2c6fa3",
    icons: [
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };
}
