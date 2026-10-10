export interface NavLink {
  href: string;
  label: string;
}

export const PRIMARY_NAV: NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/menu", label: "Menu" },
  { href: "/offers", label: "Offers" },
  { href: "/careers", label: "Careers" },
];

export const MORE_NAV: NavLink[] = [
  { href: "/#reviews", label: "Reviews" },
  { href: "/contact", label: "Contact" },
];

export const FOOTER_NAV: { heading: string; links: NavLink[] }[] = [
  {
    heading: "Order & Dine",
    links: [
      { href: "/menu", label: "Menu" },
      { href: "/order", label: "Order Online" },
      { href: "/book", label: "Book a Table" },
    ],
  },
  {
    heading: "Rewards",
    links: [
      { href: "/offers", label: "Offers & Vouchers" },
      { href: "/wheel", label: "Fortune Wheel" },
    ],
  },
  {
    heading: "About",
    links: [
      { href: "/account", label: "My Account" },
      { href: "/#reviews", label: "Reviews" },
      { href: "/contact", label: "Contact" },
    ],
  },
];
