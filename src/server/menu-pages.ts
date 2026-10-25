import { revalidatePath } from "next/cache";
import { getCategories } from "@/server/config";

/**
 * The menu pages (/menu and /menu/<section>) are served from a ready-made copy so they load instantly for
 * customers, search engines and AI tools. Call this after any save that shows on them (dishes, prices,
 * sold out, categories, Deal of the Day, site content such as the phone number in the header/footer) so
 * the next visitor gets a fresh copy straight away. Each section page is refreshed by its own address:
 * a pattern ("/menu/[category]") doesn't match through the (site) route group.
 */
export async function refreshMenuPages(): Promise<void> {
  try {
    revalidatePath("/menu");
    for (const c of await getCategories()) revalidatePath(`/menu/${c.id}`);
  } catch {
    /* outside a request (scripts), or the database is unreachable: the copies still expire within 5 minutes */
  }
}
