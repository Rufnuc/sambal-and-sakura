"use client";

import { createContext, useContext } from "react";
import { DEFAULT_SITE_CONTENT, type SiteContent } from "@/lib/site-content";

// Makes the admin-editable BUSINESS DETAILS (phone, address, opening hours) available to client
// components. Deliberately only `business`: anything passed to a client provider is serialised into
// every page's HTML, so hidden reviews / unpublished FAQ text must never be included here.
export type ClientSiteContent = Pick<SiteContent, "business"> & { showReviews: boolean }; // a flag only, never the review text

const SiteContentContext = createContext<ClientSiteContent>({ business: DEFAULT_SITE_CONTENT.business, showReviews: true });

export function SiteContentProvider({ content, children }: { content: ClientSiteContent; children: React.ReactNode }) {
  return <SiteContentContext.Provider value={content}>{children}</SiteContentContext.Provider>;
}

export function useSiteContent(): ClientSiteContent {
  return useContext(SiteContentContext);
}
