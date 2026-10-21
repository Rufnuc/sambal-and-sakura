import { telHref } from "@/lib/site-content";

/**
 * Said once at the top of a menu page rather than on every dish: dishes show their allergens once the
 * kitchen has confirmed them (Admin -> Menu); for any other dish, customers are asked to phone.
 */
export function AllergyNotice({ phone, allListed }: { phone: string; allListed: boolean }) {
  return (
    <p className="mt-2 max-w-2xl text-sm text-sambal">
      {allListed ? "Food allergy or intolerance?" : "Allergens are shown on dishes once our kitchen has confirmed them. For any other dish, or if you have an allergy or intolerance,"}{" "}
      {allListed ? "Please phone us on" : "please phone us on"}{" "}
      <a href={telHref(phone)} className="font-medium underline">{phone}</a> to confirm before ordering.
    </p>
  );
}
