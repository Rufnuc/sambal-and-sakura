// Base menu data carries placeholder paths (/menu/*.jpg) that don't exist yet.
// Only operator-uploaded (/uploads/) or remote (http) images are rendered as real photos.
// (Plain module, so both server pages and client components can use it.)
export function realPhoto(src?: string): string | undefined {
  if (!src) return undefined;
  return src.startsWith("/uploads/") || src.startsWith("http") ? src : undefined;
}
