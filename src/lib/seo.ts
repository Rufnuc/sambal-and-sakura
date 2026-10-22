/**
 * Keep a meta description within what search engines show (about 155 characters): cut at the last
 * whole word and add an ellipsis. Shorter text is returned unchanged.
 */
export function fitDescription(text: string, max = 155): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\s]+$/, "") + "…";
}
