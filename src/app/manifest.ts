import type { MetadataRoute } from "next";
import { RESTAURANT } from "@/lib/data/site";

// Lets phones show the right name, colours and icon when someone adds the site to their home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: RESTAURANT.name,
    short_name: RESTAURANT.name,
    description: "Order online, book a table and see the menu.",
    start_url: "/",
    display: "standalone",
    background_color: "#1b1812",
    theme_color: "#211d17",
    icons: [
      { src: "/logo-mark.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/apple-icon", type: "image/png", sizes: "180x180" },
      { src: "/app-icon/192", type: "image/png", sizes: "192x192" },
      { src: "/app-icon/512", type: "image/png", sizes: "512x512" },
    ],
  };
}
