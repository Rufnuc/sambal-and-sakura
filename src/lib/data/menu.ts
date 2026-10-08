// Sambal & Sakura - real menu (rebranded from Kung Fu Panda, Middlesbrough).
// Dishes & prices sourced from the restaurant's live menu. Photos pending, so
// <DishImage> renders branded placeholders. Big protein-matrix sections (Main
// Course, Rice, Noodles, Omelette, Honey Chilli/Kung Po/Sweet & Sour) are modelled
// as one customisable item with a protein picker that sets the price.

export type Allergen =
  | "gluten" | "soy" | "shellfish" | "fish" | "egg" | "peanut" | "treenut" | "sesame" | "dairy" | "crustaceans" | "molluscs";

export type DietTag = "vegetarian" | "vegan" | "popular" | "chef" | "spicy" | "new";

export type MenuCategory =
  | "starters" | "japanese" | "salt-pepper" | "soup" | "ribs" | "wrapping"
  | "mains" | "honey-chilli" | "kung-po" | "sweet-sour" | "chef-special"
  | "omelette" | "crispy-noodle" | "rice" | "chow-mein" | "udon"
  | "combo" | "sides" | "desserts" | "set-meals" | "preorder";

export interface ModifierOption { id: string; label: string; priceDelta: number }
export interface ModifierGroup {
  id: string;
  label: string;
  type: "single" | "multi";
  required?: boolean;
  options: ModifierOption[];
}

export interface MenuItem {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;            // GBP - base/"from" price
  description: string;
  allergens: Allergen[];
  tags: DietTag[];
  spiceLevel?: 0 | 1 | 2 | 3;
  image: string;
  soldOut?: boolean;
  leadTimeHours?: number;   // >0 = pre-order / advance-notice dish (e.g. 24 = order a day ahead)
  aiNotes?: string;         // admin-written extra context the dish AI assistant can draw on
  modifiers?: ModifierGroup[];
}

/* ---------------------------------------------------- shared modifiers */

// Main Course sauce dishes: base £6.50; House Special / King Prawn / Duck +£0.40.
const proteinMains: ModifierGroup = {
  id: "protein", label: "Choose your protein", type: "single", required: true,
  options: [
    { id: "chicken", label: "Chicken", priceDelta: 0 },
    { id: "beef", label: "Beef", priceDelta: 0 },
    { id: "pork", label: "Roast Pork", priceDelta: 0 },
    { id: "veg", label: "Vegetable", priceDelta: 0 },
    { id: "house", label: "House Special", priceDelta: 0.4 },
    { id: "kingprawn", label: "King Prawn", priceDelta: 0.4 },
    { id: "duck", label: "Duck", priceDelta: 0.4 },
  ],
};

// Crispy sauce dishes (Honey Chilli / Kung Po / Sweet & Sour): base £6.50; Mixed/Prawn +£0.40.
const proteinCrispy: ModifierGroup = {
  id: "protein", label: "Choose your protein", type: "single", required: true,
  options: [
    { id: "chicken", label: "Crispy Chicken", priceDelta: 0 },
    { id: "pork", label: "Crispy Pork", priceDelta: 0 },
    { id: "beef", label: "Crispy Beef", priceDelta: 0 },
    { id: "mixed", label: "Crispy Mixed (prawn, chicken, pork)", priceDelta: 0.4 },
    { id: "prawn", label: "Crispy Prawn", priceDelta: 0.4 },
  ],
};

// Rice / Chow Mein / Udon: base £6.90 (veg/mushroom); +£0.60 meats; +£1.00 premium.
const proteinRiceNoodle: ModifierGroup = {
  id: "protein", label: "Choose your protein", type: "single", required: true,
  options: [
    { id: "veg", label: "Mixed Veg", priceDelta: 0 },
    { id: "mushroom", label: "Mushroom", priceDelta: 0 },
    { id: "chicken", label: "Chicken", priceDelta: 0.6 },
    { id: "beef", label: "Beef", priceDelta: 0.6 },
    { id: "pork", label: "Roast Pork", priceDelta: 0.6 },
    { id: "shrimp", label: "Shrimp", priceDelta: 0.6 },
    { id: "house", label: "House Special", priceDelta: 1.0 },
    { id: "kingprawn", label: "King Prawn", priceDelta: 1.0 },
    { id: "duck", label: "Duck", priceDelta: 1.0 },
  ],
};

// Chow Mein / Udon style surcharge.
const noodleStyle: ModifierGroup = {
  id: "style", label: "Style", type: "single", required: true,
  options: [
    { id: "classic", label: "Classic", priceDelta: 0 },
    { id: "blackbean", label: "Black Bean", priceDelta: 0.5 },
    { id: "singapore", label: "Singapore (spicy)", priceDelta: 0.5 },
  ],
};

// Crispy Noodle (wet): base £7.90; premium +£0.60.
const proteinCrispyNoodle: ModifierGroup = {
  id: "protein", label: "Choose your protein", type: "single", required: true,
  options: [
    { id: "veg", label: "Mixed Veg", priceDelta: 0 },
    { id: "mushroom", label: "Mushrooms", priceDelta: 0 },
    { id: "chicken", label: "Chicken", priceDelta: 0 },
    { id: "beef", label: "Beef", priceDelta: 0 },
    { id: "pork", label: "Roast Pork", priceDelta: 0 },
    { id: "shrimp", label: "Shrimps", priceDelta: 0 },
    { id: "house", label: "House Special", priceDelta: 0.6 },
    { id: "kingprawn", label: "King Prawn", priceDelta: 0.6 },
    { id: "duck", label: "Duck", priceDelta: 0.6 },
  ],
};

// Omelette: base £5.50 plain; +£0.40 mushroom; +£1.00 meats; +£1.40 premium.
const proteinOmelette: ModifierGroup = {
  id: "protein", label: "Choose your filling", type: "single", required: true,
  options: [
    { id: "plain", label: "Plain", priceDelta: 0 },
    { id: "mushroom", label: "Mushroom", priceDelta: 0.4 },
    { id: "chicken", label: "Chicken", priceDelta: 1.0 },
    { id: "beef", label: "Beef", priceDelta: 1.0 },
    { id: "pork", label: "Roast Pork", priceDelta: 1.0 },
    { id: "special", label: "Special", priceDelta: 1.4 },
    { id: "kingprawn", label: "King Prawn", priceDelta: 1.4 },
    { id: "duck", label: "Duck", priceDelta: 1.4 },
    { id: "shrimp", label: "Shrimps", priceDelta: 1.4 },
  ],
};

const curryDip: ModifierGroup = {
  id: "sauce", label: "Choose a sauce", type: "single", required: true,
  options: [
    { id: "curry", label: "Curry Sauce", priceDelta: 0 },
    { id: "ss", label: "Sweet & Sour", priceDelta: 0 },
    { id: "bbq", label: "Barbecue", priceDelta: 0 },
    { id: "gravy", label: "Gravy", priceDelta: 0 },
  ],
};

/* ------------------------------------------------------------- the menu */

export const MENU: MenuItem[] = [
  /* STARTERS */
  { id: "mixed-platter", name: "Mixed Platter", category: "starters", price: 12.0,
    description: "Chicken gyoza, spring rolls, prawn on toast & BBQ pork ribs - the full opener.",
    allergens: ["gluten", "soy", "sesame", "crustaceans", "egg"], tags: ["popular", "chef"], spiceLevel: 0, image: "/menu/mixed-platter.jpg" },
  { id: "prawn-crackers", name: "Prawn Crackers", category: "starters", price: 1.9,
    description: "Light, crispy prawn crackers.", allergens: ["crustaceans"], tags: [], spiceLevel: 0, image: "/menu/prawn-crackers.jpg" },
  { id: "pancake-rolls", name: "Pancake Rolls", category: "starters", price: 5.5,
    description: "Shrimp & pork pancake rolls with sweet chilli dip.", allergens: ["gluten", "crustaceans", "soy"], tags: ["popular"], spiceLevel: 0, image: "/menu/pancake-rolls.jpg" },
  { id: "veg-spring-rolls", name: "Veg Spring Rolls (10)", category: "starters", price: 4.5,
    description: "Ten crispy vegetable spring rolls with sweet chilli dip.", allergens: ["gluten", "soy"], tags: ["vegetarian"], spiceLevel: 0, image: "/menu/veg-spring-rolls.jpg" },
  { id: "prawn-rolls", name: "Prawn Rolls (6)", category: "starters", price: 5.5,
    description: "Six prawn rolls with sweet chilli dip.", allergens: ["gluten", "crustaceans"], tags: [], spiceLevel: 0, image: "/menu/prawn-rolls.jpg" },
  { id: "won-ton", name: "Deep Fried Won Ton", category: "starters", price: 5.5,
    description: "Crispy pork won tons with sweet & sour dip.", allergens: ["gluten", "soy", "egg"], tags: [], spiceLevel: 0, image: "/menu/won-ton.jpg" },
  { id: "sesame-prawn-toast", name: "Sesame Prawn on Toast (8)", category: "starters", price: 6.5,
    description: "Eight pieces of golden sesame prawn toast.", allergens: ["gluten", "crustaceans", "sesame", "egg"], tags: ["popular"], spiceLevel: 0, image: "/menu/sesame-prawn-toast.jpg" },
  { id: "chicken-wings", name: "Deep Fried Chicken Wings (6)", category: "starters", price: 5.9,
    description: "Six crispy chicken wings.", allergens: ["gluten"], tags: [], spiceLevel: 0, image: "/menu/chicken-wings.jpg" },
  { id: "fried-squid", name: "Deep Fried Squid", category: "starters", price: 7.8,
    description: "Crispy squid with sweet & sour sauce.", allergens: ["molluscs", "gluten"], tags: [], spiceLevel: 0, image: "/menu/fried-squid.jpg" },
  { id: "duck-rolls", name: "Duck Rolls (4)", category: "starters", price: 5.5,
    description: "Four crispy aromatic duck rolls.", allergens: ["gluten", "soy"], tags: ["chef"], spiceLevel: 0, image: "/menu/duck-rolls.jpg" },
  { id: "har-gow", name: "Dim Sum - Har Gow (6)", category: "starters", price: 6.9,
    description: "Six delicate steamed prawn dumplings.", allergens: ["crustaceans", "soy", "sesame"], tags: ["chef"], spiceLevel: 0, image: "/menu/har-gow.jpg" },
  { id: "sui-mai", name: "Dim Sum - Sui Mai (8)", category: "starters", price: 6.9,
    description: "Eight steamed pork dumplings.", allergens: ["gluten", "soy", "sesame"], tags: [], spiceLevel: 0, image: "/menu/sui-mai.jpg" },
  { id: "soft-shell-crab", name: "Fried Soft Shell Crab", category: "starters", price: 5.5,
    description: "One whole crispy soft shell crab.", allergens: ["crustaceans", "gluten"], tags: ["chef"], spiceLevel: 0, image: "/menu/soft-shell-crab.jpg" },
  { id: "onion-rings", name: "Onion Rings", category: "starters", price: 4.0,
    description: "Golden battered onion rings.", allergens: ["gluten"], tags: ["vegetarian"], spiceLevel: 0, image: "/menu/onion-rings.jpg" },
  { id: "satay-skewers", name: "Satay Chicken Skewers (6)", category: "starters", price: 6.9,
    description: "Six grilled chicken skewers with peanut satay.", allergens: ["peanut", "soy"], tags: ["popular"], spiceLevel: 1, image: "/menu/satay-skewers.jpg" },

  /* JAPANESE SPECIAL */
  { id: "chicken-gyoza", name: "Chicken Gyoza (6)", category: "japanese", price: 5.5,
    description: "Six pan-fried chicken dumplings.", allergens: ["gluten", "soy", "sesame"], tags: ["popular"], spiceLevel: 0, image: "/menu/chicken-gyoza.jpg" },
  { id: "veg-gyoza", name: "Vegetable Gyoza (6)", category: "japanese", price: 6.5,
    description: "Six pan-fried vegetable dumplings.", allergens: ["gluten", "soy", "sesame"], tags: ["vegetarian"], spiceLevel: 0, image: "/menu/veg-gyoza.jpg" },
  { id: "okonomiyaki-skewer", name: "Okonomiyaki Skewer (4)", category: "japanese", price: 5.5,
    description: "Four savoury Japanese pancake skewers.", allergens: ["gluten", "egg", "soy"], tags: [], spiceLevel: 0, image: "/menu/okonomiyaki.jpg" },
  { id: "takoyaki", name: "Takoyaki - Octopus Balls (6)", category: "japanese", price: 5.9,
    description: "Six deep-fried octopus dough balls.", allergens: ["molluscs", "gluten", "egg"], tags: ["new"], spiceLevel: 0, image: "/menu/takoyaki.jpg" },
  { id: "seaweed", name: "Japanese Seaweed (Wet)", category: "japanese", price: 3.5,
    description: "Seasoned wet seaweed salad.", allergens: ["soy", "sesame"], tags: ["vegan"], spiceLevel: 0, image: "/menu/seaweed.jpg" },
  { id: "chicken-katsu-don", name: "Chicken Katsu Curry Don", category: "japanese", price: 10.8,
    description: "Panko chicken, Japanese curry over rice.", allergens: ["gluten", "egg", "soy"], tags: ["popular", "chef"], spiceLevel: 1, image: "/menu/chicken-katsu-don.jpg" },
  { id: "prawn-katsu-don", name: "Prawn Katsu Curry Don", category: "japanese", price: 10.8,
    description: "Panko king prawns, Japanese curry over rice.", allergens: ["gluten", "egg", "crustaceans"], tags: ["chef"], spiceLevel: 1, image: "/menu/prawn-katsu-don.jpg" },
  { id: "chicken-teriyaki-don", name: "Chicken Teriyaki Don", category: "japanese", price: 10.8,
    description: "Glazed teriyaki chicken over rice.", allergens: ["gluten", "soy", "sesame"], tags: ["popular"], spiceLevel: 0, image: "/menu/chicken-teriyaki-don.jpg" },
  { id: "salmon-teriyaki-don", name: "Salmon Teriyaki Don", category: "japanese", price: 10.8,
    description: "Glazed teriyaki salmon over rice.", allergens: ["fish", "gluten", "soy", "sesame"], tags: ["chef"], spiceLevel: 0, image: "/menu/salmon-teriyaki-don.jpg" },
  { id: "dorayaki", name: "Dorayaki Pancake", category: "japanese", price: 3.0,
    description: "Fluffy red-bean filled pancake.", allergens: ["gluten", "egg", "dairy"], tags: [], spiceLevel: 0, image: "/menu/dorayaki.jpg" },
  { id: "pumpkin-croquette", name: "Pumpkin Croquette (2)", category: "japanese", price: 4.5,
    description: "Two crisp pumpkin croquettes.", allergens: ["gluten", "dairy"], tags: ["vegetarian"], spiceLevel: 0, image: "/menu/pumpkin-croquette.jpg" },

  /* SALT & PEPPER */
  { id: "sp-chips", name: "Salt & Pepper Chips", category: "salt-pepper", price: 3.5,
    description: "Wok-tossed chips with salt, pepper, chilli & onion.", allergens: [], tags: ["vegetarian", "popular"], spiceLevel: 1, image: "/menu/sp-chips.jpg" },
  { id: "sp-shredded-chicken", name: "Salt & Pepper Shredded Chicken", category: "salt-pepper", price: 6.9,
    description: "Crispy shredded chicken, salt & pepper spice.", allergens: ["gluten"], tags: ["popular"], spiceLevel: 1, image: "/menu/sp-shredded-chicken.jpg" },
  { id: "sp-diced-chicken", name: "Salt & Pepper Diced Chicken", category: "salt-pepper", price: 6.9,
    description: "Diced chicken tossed with salt & pepper.", allergens: ["gluten"], tags: [], spiceLevel: 1, image: "/menu/sp-diced-chicken.jpg" },
  { id: "sp-king-prawns", name: "Salt & Pepper King Prawns", category: "salt-pepper", price: 7.8,
    description: "King prawns with salt & pepper spice.", allergens: ["crustaceans", "gluten"], tags: ["chef"], spiceLevel: 1, image: "/menu/sp-king-prawns.jpg" },
  { id: "sp-squids", name: "Salt & Pepper Squid", category: "salt-pepper", price: 7.8,
    description: "Crispy squid, salt & pepper.", allergens: ["molluscs", "gluten"], tags: [], spiceLevel: 1, image: "/menu/sp-squid.jpg" },
  { id: "sp-shredded-beef", name: "Salt & Pepper Shredded Beef", category: "salt-pepper", price: 6.9,
    description: "Crispy shredded beef, salt & pepper.", allergens: ["gluten"], tags: [], spiceLevel: 1, image: "/menu/sp-shredded-beef.jpg" },
  { id: "sp-ribs", name: "Salt & Pepper Spare Ribs", category: "salt-pepper", price: 7.5,
    description: "Spare ribs tossed with salt & pepper.", allergens: ["gluten"], tags: [], spiceLevel: 1, image: "/menu/sp-ribs.jpg" },
  { id: "sp-wings", name: "Salt & Pepper Chicken Wings", category: "salt-pepper", price: 6.9,
    description: "Crispy wings, salt & pepper.", allergens: ["gluten"], tags: [], spiceLevel: 1, image: "/menu/sp-wings.jpg" },

  /* SOUP */
  { id: "soup-veg", name: "Mixed Veg Soup", category: "soup", price: 2.5, description: "Light mixed vegetable soup.", allergens: ["soy"], tags: ["vegan"], spiceLevel: 0, image: "/menu/soup-veg.jpg" },
  { id: "soup-seafood", name: "Mixed Seafood Soup", category: "soup", price: 3.5, description: "Seafood broth.", allergens: ["crustaceans", "molluscs", "fish"], tags: [], spiceLevel: 0, image: "/menu/soup-seafood.jpg" },
  { id: "soup-sweetcorn", name: "Plain Sweet Corn Soup", category: "soup", price: 2.5, description: "Classic sweet corn soup.", allergens: [], tags: ["vegetarian"], spiceLevel: 0, image: "/menu/soup-sweetcorn.jpg" },
  { id: "soup-chicken-mushroom", name: "Chicken & Mushroom Soup", category: "soup", price: 2.9, description: "Chicken and mushroom broth.", allergens: ["soy"], tags: [], spiceLevel: 0, image: "/menu/soup-chicken-mushroom.jpg" },
  { id: "soup-chicken-sweetcorn", name: "Chicken & Sweet Corn Soup", category: "soup", price: 2.9, description: "Comforting chicken sweet corn soup.", allergens: ["egg"], tags: ["popular"], spiceLevel: 0, image: "/menu/soup-chicken-sweetcorn.jpg" },
  { id: "soup-crab-sweetcorn", name: "Crab Meat & Sweet Corn Soup", category: "soup", price: 3.5, description: "Crab meat sweet corn soup.", allergens: ["crustaceans", "egg"], tags: [], spiceLevel: 0, image: "/menu/soup-crab.jpg" },
  { id: "soup-hot-sour", name: "Hot & Sour Soup", category: "soup", price: 2.9, description: "Pork & shrimp, spicy and tangy.", allergens: ["soy", "crustaceans", "egg"], tags: ["spicy"], spiceLevel: 1, image: "/menu/soup-hot-sour.jpg" },
  { id: "soup-tom-yum", name: "Tom Yum Soup", category: "soup", price: 3.5, description: "Fragrant, spicy prawn tom yum.", allergens: ["crustaceans", "fish"], tags: ["spicy"], spiceLevel: 2, image: "/menu/soup-tom-yum.jpg" },

  /* RIBS */
  { id: "ribs-bbq", name: "Spare Ribs - BBQ Sauce", category: "ribs", price: 7.5, description: "Spare ribs in rich barbecue sauce.", allergens: ["gluten", "soy"], tags: ["popular"], spiceLevel: 0, image: "/menu/ribs-bbq.jpg" },
  { id: "ribs-honey", name: "Spare Ribs - Honey Chilli", category: "ribs", price: 7.5, description: "Sticky honey chilli spare ribs.", allergens: ["gluten", "soy"], tags: ["spicy"], spiceLevel: 1, image: "/menu/ribs-honey.jpg" },
  { id: "ribs-peking", name: "Spare Ribs - Peking Sauce", category: "ribs", price: 7.5, description: "Spare ribs in Peking sauce.", allergens: ["gluten", "soy"], tags: [], spiceLevel: 0, image: "/menu/ribs-peking.jpg" },
  { id: "ribs-ss", name: "Spare Ribs - Sweet & Sour", category: "ribs", price: 7.5, description: "Spare ribs in sweet & sour sauce.", allergens: ["gluten"], tags: [], spiceLevel: 0, image: "/menu/ribs-ss.jpg" },
  { id: "ribs-dry", name: "Dry Spare Ribs", category: "ribs", price: 7.5, description: "Crispy dry spare ribs.", allergens: ["gluten"], tags: [], spiceLevel: 0, image: "/menu/ribs-dry.jpg" },

  /* WRAPPING */
  { id: "duck-quarter", name: "Aromatic Crispy Duck (Quarter)", category: "wrapping", price: 9.5,
    description: "With spring onions, cucumber, pancakes & hoi sin sauce.", allergens: ["gluten", "soy", "sesame"], tags: ["chef", "popular"], spiceLevel: 0, image: "/menu/duck-quarter.jpg" },
  { id: "duck-half", name: "Aromatic Crispy Duck (Half)", category: "wrapping", price: 17.0,
    description: "With spring onions, cucumber, pancakes & hoi sin sauce.", allergens: ["gluten", "soy", "sesame"], tags: ["chef"], spiceLevel: 0, image: "/menu/duck-half.jpg" },

  /* MAIN COURSE (sauce + protein picker) */
  { id: "main-curry", name: "Curry", category: "mains", price: 6.5, description: "Popular homemade curry sauce. Choose your protein.", allergens: ["gluten", "soy"], tags: ["popular"], spiceLevel: 1, image: "/menu/main-curry.jpg", modifiers: [proteinMains] },
  { id: "main-broccoli", name: "Broccoli Dishes", category: "mains", price: 6.5, description: "Stir-fried with fresh broccoli. Choose your protein.", allergens: ["gluten", "soy"], tags: [], spiceLevel: 0, image: "/menu/main-broccoli.jpg", modifiers: [proteinMains] },
  { id: "main-blackbean", name: "Black Bean Sauce", category: "mains", price: 6.5, description: "Black bean sauce, pepper, onion & carrots. Choose your protein.", allergens: ["gluten", "soy"], tags: ["popular"], spiceLevel: 1, image: "/menu/main-blackbean.jpg", modifiers: [proteinMains] },
  { id: "main-blackpepper", name: "Black Pepper Sauce", category: "mains", price: 6.5, description: "Stir-fried in black pepper sauce. Choose your protein.", allergens: ["gluten", "soy"], tags: [], spiceLevel: 1, image: "/menu/main-blackpepper.jpg", modifiers: [proteinMains] },
  { id: "main-cantonese", name: "Cantonese Style", category: "mains", price: 6.5, description: "On a bed of beansprouts, topped with BBQ sauce. Choose your protein.", allergens: ["gluten", "soy"], tags: [], spiceLevel: 0, image: "/menu/main-cantonese.jpg", modifiers: [proteinMains] },
  { id: "main-fooyung", name: "Foo Yung", category: "mains", price: 6.5, description: "Chinese-style scrambled egg with onion. Choose your protein.", allergens: ["egg", "soy"], tags: [], spiceLevel: 0, image: "/menu/main-fooyung.jpg", modifiers: [proteinMains] },
  { id: "main-ginger", name: "Ginger & Spring Onion", category: "mains", price: 6.5, description: "Fragrant ginger & spring onion. Choose your protein.", allergens: ["gluten", "soy"], tags: [], spiceLevel: 0, image: "/menu/main-ginger.jpg", modifiers: [proteinMains] },
  { id: "main-garlicbutter", name: "Garlic Butter", category: "mains", price: 6.5, description: "Homemade garlic butter. Choose your protein.", allergens: ["gluten", "soy", "dairy"], tags: ["chef"], spiceLevel: 0, image: "/menu/main-garlicbutter.jpg", modifiers: [proteinMains] },
  { id: "main-hoisin", name: "Hoi Sin Sauce", category: "mains", price: 6.5, description: "Sweet, savoury hoi sin. Choose your protein.", allergens: ["gluten", "soy", "sesame"], tags: [], spiceLevel: 0, image: "/menu/main-hoisin.jpg", modifiers: [proteinMains] },
  { id: "main-mushroom", name: "Mushroom", category: "mains", price: 6.5, description: "Stir-fried with mushrooms. Choose your protein.", allergens: ["gluten", "soy"], tags: [], spiceLevel: 0, image: "/menu/main-mushroom.jpg", modifiers: [proteinMains] },
  { id: "main-mushroom-blackbean", name: "Mushroom in Black Bean Sauce", category: "mains", price: 6.5, description: "Mushrooms in black bean sauce. Choose your protein.", allergens: ["gluten", "soy"], tags: [], spiceLevel: 1, image: "/menu/main-mushroom-blackbean.jpg", modifiers: [proteinMains] },
  { id: "main-peking", name: "Peking Sauce", category: "mains", price: 6.5, description: "Classic Peking sauce. Choose your protein.", allergens: ["gluten", "soy"], tags: [], spiceLevel: 0, image: "/menu/main-peking.jpg", modifiers: [proteinMains] },
  { id: "main-pineapple", name: "Pineapple", category: "mains", price: 6.5, description: "Sweet pineapple stir-fry. Choose your protein.", allergens: ["gluten", "soy"], tags: [], spiceLevel: 0, image: "/menu/main-pineapple.jpg", modifiers: [proteinMains] },
  { id: "main-szechuan", name: "Szechuan Sauce", category: "mains", price: 6.5, description: "Popular spicy dish from central China. Choose your protein.", allergens: ["gluten", "soy"], tags: ["spicy", "popular"], spiceLevel: 2, image: "/menu/main-szechuan.jpg", modifiers: [proteinMains] },
  { id: "main-satay", name: "Satay Sauce", category: "mains", price: 6.5, description: "Peanut satay sauce. Choose your protein.", allergens: ["peanut", "soy"], tags: [], spiceLevel: 1, image: "/menu/main-satay.jpg", modifiers: [proteinMains] },
  { id: "main-tomato", name: "Tomato", category: "mains", price: 6.5, description: "Tangy tomato sauce. Choose your protein.", allergens: ["gluten", "soy"], tags: [], spiceLevel: 0, image: "/menu/main-tomato.jpg", modifiers: [proteinMains] },
  { id: "main-thai-red", name: "Thai Red Curry", category: "mains", price: 6.5, description: "Thai red curry paste, coconut, fish sauce, peppers & pineapple. Choose your protein.", allergens: ["fish", "soy"], tags: ["spicy", "chef"], spiceLevel: 2, image: "/menu/main-thai-red.jpg", modifiers: [proteinMains] },

  /* HONEY CHILLI */
  { id: "honey-chilli", name: "Honey Chilli Crispy", category: "honey-chilli", price: 6.5, description: "Crispy, sticky honey chilli. Choose your protein.", allergens: ["gluten", "soy"], tags: ["spicy", "popular"], spiceLevel: 1, image: "/menu/honey-chilli.jpg", modifiers: [proteinCrispy] },

  /* KUNG PO */
  { id: "kung-po", name: "Kung Po Crispy", category: "kung-po", price: 6.5, description: "Crispy pieces in spicy kung po sauce. Choose your protein.", allergens: ["gluten", "soy", "peanut"], tags: ["spicy"], spiceLevel: 2, image: "/menu/kung-po.jpg", modifiers: [proteinCrispy] },

  /* SWEET & SOUR */
  { id: "sweet-sour", name: "Sweet & Sour Crispy", category: "sweet-sour", price: 6.5, description: "Crispy pieces in classic sweet & sour. Choose your protein.", allergens: ["gluten", "soy"], tags: ["popular"], spiceLevel: 0, image: "/menu/sweet-sour.jpg", modifiers: [proteinCrispy] },
  { id: "chicken-balls", name: "Chicken Balls with Dip (10)", category: "sweet-sour", price: 6.5, description: "Ten deep-fried chicken balls with sweet & sour dip.", allergens: ["gluten", "egg"], tags: ["popular"], spiceLevel: 0, image: "/menu/chicken-balls.jpg" },
  { id: "prawn-balls", name: "Prawn Balls (10)", category: "sweet-sour", price: 6.5, description: "Ten deep-fried prawn balls.", allergens: ["gluten", "crustaceans", "egg"], tags: [], spiceLevel: 0, image: "/menu/prawn-balls.jpg" },
  { id: "pork-balls", name: "Pork Balls (10)", category: "sweet-sour", price: 6.5, description: "Ten deep-fried pork balls.", allergens: ["gluten", "egg"], tags: [], spiceLevel: 0, image: "/menu/pork-balls.jpg" },

  /* CHEF SPECIAL */
  { id: "crispy-shredded-chicken", name: "Crispy Shredded Chicken", category: "chef-special", price: 6.9, description: "Crispy shredded chicken in a sweet chilli glaze.", allergens: ["gluten", "soy"], tags: ["popular", "chef"], spiceLevel: 1, image: "/menu/crispy-shredded-chicken.jpg" },
  { id: "crispy-shredded-beef", name: "Crispy Shredded Beef", category: "chef-special", price: 6.9, description: "Crispy shredded beef in a sweet chilli glaze.", allergens: ["gluten", "soy"], tags: ["popular"], spiceLevel: 1, image: "/menu/crispy-shredded-beef.jpg" },
  { id: "lemon-chicken", name: "Lemon Chicken", category: "chef-special", price: 6.9, description: "Crispy chicken in tangy lemon sauce.", allergens: ["gluten", "egg"], tags: [], spiceLevel: 0, image: "/menu/lemon-chicken.jpg" },
  { id: "lemon-prawn", name: "Lemon Prawn", category: "chef-special", price: 6.9, description: "Crispy prawns in tangy lemon sauce.", allergens: ["gluten", "crustaceans", "egg"], tags: [], spiceLevel: 0, image: "/menu/lemon-prawn.jpg" },
  { id: "mussel-blackbean", name: "Mussels in Black Bean Sauce", category: "chef-special", price: 8.8, description: "Fresh mussels in black bean sauce.", allergens: ["molluscs", "soy", "gluten"], tags: ["chef"], spiceLevel: 1, image: "/menu/mussel-blackbean.jpg" },
  { id: "blackpepper-steak", name: "Black Pepper Fillet Steak", category: "chef-special", price: 10.5, description: "Tender fillet steak in black pepper sauce.", allergens: ["gluten", "soy"], tags: ["chef"], spiceLevel: 1, image: "/menu/blackpepper-steak.jpg" },
  { id: "peking-steak", name: "Fillet Steak in Peking Sauce", category: "chef-special", price: 10.5, description: "Fillet steak in rich Peking sauce.", allergens: ["gluten", "soy"], tags: ["chef"], spiceLevel: 0, image: "/menu/peking-steak.jpg" },
  { id: "duck-orange", name: "Roast Duck in Orange Sauce", category: "chef-special", price: 8.8, description: "Roast duck in zesty orange sauce.", allergens: ["gluten", "soy"], tags: ["chef"], spiceLevel: 0, image: "/menu/duck-orange.jpg" },
  { id: "duck-plum", name: "Roast Duck in Plum Sauce", category: "chef-special", price: 8.8, description: "Roast duck in sweet plum sauce.", allergens: ["gluten", "soy"], tags: [], spiceLevel: 0, image: "/menu/duck-plum.jpg" },
  { id: "tofu-blackbean", name: "Tofu in Black Bean Sauce", category: "chef-special", price: 7.9, description: "Silky bean curd in black bean sauce.", allergens: ["soy", "gluten"], tags: ["vegetarian"], spiceLevel: 1, image: "/menu/tofu-blackbean.jpg" },
  { id: "mapo-tofu", name: "Mapo Tofu", category: "chef-special", price: 8.5, description: "Silken tofu in fiery Sichuan sauce.", allergens: ["soy", "gluten"], tags: ["vegetarian", "spicy", "chef"], spiceLevel: 3, image: "/menu/mapo-tofu.jpg" },

  /* OMELETTE (filling picker) */
  { id: "omelette", name: "Egg Foo Yung Omelette", category: "omelette", price: 5.5, description: "Chinese-style omelette with onion. Choose your filling.", allergens: ["egg", "soy"], tags: [], spiceLevel: 0, image: "/menu/omelette.jpg", modifiers: [proteinOmelette] },

  /* CRISPY NOODLE (WET) */
  { id: "crispy-noodle", name: "Crispy Noodle (Wet)", category: "crispy-noodle", price: 7.9, description: "Deep-fried noodle base with savoury sauce. Choose your protein.", allergens: ["gluten", "soy", "egg"], tags: ["chef"], spiceLevel: 0, image: "/menu/crispy-noodle.jpg", modifiers: [proteinCrispyNoodle] },

  /* RICE */
  { id: "house-rice", name: "House Rice", category: "rice", price: 7.9, description: "Egg rice topped with mixed meat in gravy sauce.", allergens: ["egg", "soy", "gluten"], tags: ["popular", "chef"], spiceLevel: 0, image: "/menu/house-rice.jpg" },
  { id: "fried-rice", name: "Fried Rice", category: "rice", price: 6.9, description: "Wok-fried egg rice. Choose your protein.", allergens: ["egg", "soy"], tags: ["popular"], spiceLevel: 0, image: "/menu/fried-rice.jpg", modifiers: [proteinRiceNoodle] },
  { id: "special-rice", name: "Special Rice (Yang Chow)", category: "rice", price: 7.9, description: "Classic Yang Chow fried rice with prawn, char siu & egg.", allergens: ["egg", "crustaceans", "soy"], tags: ["popular"], spiceLevel: 0, image: "/menu/special-rice.jpg" },
  { id: "egg-fried-rice", name: "Egg Fried Rice", category: "rice", price: 2.9, description: "Classic egg fried rice.", allergens: ["egg"], tags: ["vegetarian"], spiceLevel: 0, image: "/menu/egg-fried-rice.jpg" },
  { id: "boiled-rice", name: "Boiled Rice", category: "rice", price: 2.2, description: "Steamed jasmine rice.", allergens: [], tags: ["vegan"], spiceLevel: 0, image: "/menu/boiled-rice.jpg" },

  /* CHOW MEIN */
  { id: "chow-mein", name: "Chow Mein", category: "chow-mein", price: 6.9, description: "Wok-fried egg noodles. Choose protein & style.", allergens: ["gluten", "soy", "egg"], tags: ["popular"], spiceLevel: 0, image: "/menu/chow-mein.jpg", modifiers: [proteinRiceNoodle, noodleStyle] },
  { id: "singapore-vermicelli", name: "Singapore Vermicelli", category: "chow-mein", price: 7.9, description: "Spicy curried rice noodles.", allergens: ["gluten", "soy", "egg"], tags: ["spicy"], spiceLevel: 2, image: "/menu/singapore-vermicelli.jpg" },
  { id: "plain-noodles", name: "Plain Noodles", category: "chow-mein", price: 3.5, description: "Simple stir-fried noodles.", allergens: ["gluten", "soy"], tags: ["vegan"], spiceLevel: 0, image: "/menu/plain-noodles.jpg" },

  /* UDON */
  { id: "udon", name: "Udon", category: "udon", price: 6.9, description: "Thick wok-fried udon noodles. Choose protein & style.", allergens: ["gluten", "soy"], tags: ["new"], spiceLevel: 0, image: "/menu/udon.jpg", modifiers: [proteinRiceNoodle, noodleStyle] },

  /* COMBO BOX */
  { id: "combo-a", name: "Combo Box A", category: "combo", price: 15.0, description: "Salt & pepper chips, ribs, diced chicken + sauce selection.", allergens: ["gluten", "soy"], tags: ["popular"], spiceLevel: 1, image: "/menu/combo-a.jpg", modifiers: [curryDip] },
  { id: "combo-b", name: "Combo Box B", category: "combo", price: 17.0, description: "Salt & pepper chips, ribs, diced chicken, egg rice + sauce selection.", allergens: ["gluten", "soy", "egg"], tags: [], spiceLevel: 1, image: "/menu/combo-b.jpg", modifiers: [curryDip] },
  { id: "combo-c", name: "Combo Box C", category: "combo", price: 21.0, description: "Chips, ribs, diced chicken, wings, chicken balls, spring rolls, samosas, egg rice + sauce.", allergens: ["gluten", "soy", "egg"], tags: ["chef"], spiceLevel: 1, image: "/menu/combo-c.jpg", modifiers: [curryDip] },
  { id: "combo-veg", name: "Vegetarian Box", category: "combo", price: 19.0, description: "Veg gyoza, aubergine, broccoli, sweet potato, courgette, chips, egg rice & Japanese curry.", allergens: ["gluten", "soy", "egg"], tags: ["vegetarian"], spiceLevel: 0, image: "/menu/combo-veg.jpg" },
  { id: "combo-japanese", name: "Japanese Box", category: "combo", price: 25.0, description: "Prawn katsu, chicken katsu, gyoza, octopus dough, okonomiyaki, pumpkin, sushi rice & sauce.", allergens: ["gluten", "soy", "egg", "crustaceans", "molluscs"], tags: ["chef", "new"], spiceLevel: 1, image: "/menu/combo-japanese.jpg" },

  /* CHIPS BAR & SIDES */
  { id: "chips", name: "Chips", category: "sides", price: 1.9, description: "Golden chips.", allergens: [], tags: ["vegan"], spiceLevel: 0, image: "/menu/chips.jpg" },
  { id: "chips-curry", name: "Chips with Curry Sauce", category: "sides", price: 3.5, description: "Chips smothered in curry sauce.", allergens: ["gluten", "soy"], tags: ["vegetarian", "popular"], spiceLevel: 1, image: "/menu/chips-curry.jpg" },
  { id: "chips-roast-chicken", name: "Chips & Roast Chicken Breast", category: "sides", price: 9.5, description: "Roast chicken breast with chips.", allergens: ["gluten"], tags: [], spiceLevel: 0, image: "/menu/chips-roast-chicken.jpg" },
  { id: "sirloin-steak", name: "Sirloin Steak", category: "sides", price: 10.0, description: "Grilled sirloin steak.", allergens: [], tags: ["chef"], spiceLevel: 0, image: "/menu/sirloin-steak.jpg" },
  { id: "curry-rice-chips", name: "Curry Fried Rice & Chips", category: "sides", price: 4.9, description: "Curry fried rice with chips.", allergens: ["gluten", "soy", "egg"], tags: [], spiceLevel: 1, image: "/menu/curry-rice-chips.jpg" },
  { id: "stir-broccoli", name: "Stir-Fried Broccoli", category: "sides", price: 4.5, description: "Wok-fried fresh broccoli.", allergens: ["soy"], tags: ["vegan"], spiceLevel: 0, image: "/menu/stir-broccoli.jpg" },
  { id: "stir-mixed-veg", name: "Stir-Fried Mixed Veg", category: "sides", price: 3.5, description: "Seasonal mixed vegetables.", allergens: ["soy"], tags: ["vegan"], spiceLevel: 0, image: "/menu/stir-mixed-veg.jpg" },
  { id: "cashew-nut", name: "Cashew Nuts", category: "sides", price: 2.5, description: "Roasted cashew nuts.", allergens: ["treenut"], tags: ["vegan"], spiceLevel: 0, image: "/menu/cashew-nut.jpg" },

  /* DESSERTS & DRINKS */
  { id: "fritters", name: "Fritters (Banana / Pineapple / Apple)", category: "desserts", price: 2.8, description: "Warm battered fruit fritters.", allergens: ["gluten"], tags: ["vegetarian"], spiceLevel: 0, image: "/menu/fritters.jpg" },
  { id: "matcha-latte", name: "Strawberry Matcha Latte", category: "desserts", price: 5.5, description: "Iced strawberry matcha latte.", allergens: ["dairy"], tags: ["new", "popular"], spiceLevel: 0, image: "/menu/matcha-latte.jpg" },
  { id: "boba-tea", name: "Signature Brown Sugar Boba Tea", category: "desserts", price: 4.5, description: "Brown sugar milk tea with chewy pearls.", allergens: ["dairy"], tags: ["popular", "new"], spiceLevel: 0, image: "/menu/boba-tea.jpg" },
  { id: "mango-passion-tea", name: "Mango & Passion Fruit Tea", category: "desserts", price: 4.5, description: "Fruit tea with mango popping balls.", allergens: [], tags: ["new"], spiceLevel: 0, image: "/menu/mango-tea.jpg" },
  { id: "soft-drink", name: "Soft Drink Can (330ml)", category: "desserts", price: 1.5, description: "Chilled canned soft drink.", allergens: [], tags: [], spiceLevel: 0, image: "/menu/soft-drink.jpg" },
  { id: "ben-jerrys", name: "Ben & Jerry's Ice Cream", category: "desserts", price: 6.95, description: "A tub of Ben & Jerry's.", allergens: ["dairy"], tags: [], spiceLevel: 0, image: "/menu/ben-jerrys.jpg" },
  { id: "macaron", name: "Macaron", category: "desserts", price: 0.9, description: "French macaron.", allergens: ["egg", "treenut", "dairy"], tags: [], spiceLevel: 0, image: "/menu/macaron.jpg" },
  { id: "fortune-cookies", name: "Fortune Cookies", category: "desserts", price: 0.5, description: "Crisp fortune cookie.", allergens: ["gluten", "egg"], tags: [], spiceLevel: 0, image: "/menu/fortune-cookies.jpg" },

  /* SET MEALS */
  { id: "set-economy", name: "Economy Feast - 2 People", category: "set-meals", price: 25.0, description: "BBQ ribs, sweet & sour chicken, beef chop suey, special rice, 2 cans of drink.", allergens: ["gluten", "soy", "egg"], tags: ["popular"], spiceLevel: 0, image: "/menu/set-economy.jpg" },
  { id: "set-deluxe", name: "Deluxe Feast - 2 People", category: "set-meals", price: 30.0, description: "Chicken & sweet corn soup, mixed platter, sweet & sour chicken, beef chop suey, special rice.", allergens: ["gluten", "soy", "egg", "crustaceans"], tags: ["chef"], spiceLevel: 0, image: "/menu/set-deluxe.jpg" },
  { id: "set-super", name: "Super Feast - 3 People", category: "set-meals", price: 42.0, description: "Soup, mixed platter, house special mushrooms, sweet & sour chicken, beef in black bean, special rice.", allergens: ["gluten", "soy", "egg", "crustaceans"], tags: ["popular"], spiceLevel: 1, image: "/menu/set-super.jpg" },
  { id: "set-family", name: "Happy Family - 4 People", category: "set-meals", price: 52.0, description: "Soup, mixed platter, house special black bean, sweet & sour prawn, beef with mushroom, mixed veg, special rice.", allergens: ["gluten", "soy", "egg", "crustaceans"], tags: ["chef", "popular"], spiceLevel: 1, image: "/menu/set-family.jpg" },
];

export const CATEGORY_LABELS: Record<MenuCategory, string> = {
  starters: "Starters",
  japanese: "Japanese Special",
  "salt-pepper": "Salt & Pepper",
  soup: "Soup",
  ribs: "Ribs",
  wrapping: "Aromatic Duck",
  mains: "Main Course",
  "honey-chilli": "Honey Chilli",
  "kung-po": "Kung Po",
  "sweet-sour": "Sweet & Sour",
  "chef-special": "Chef Special",
  omelette: "Omelette",
  "crispy-noodle": "Crispy Noodle",
  rice: "Rice",
  "chow-mein": "Chow Mein",
  udon: "Udon",
  combo: "Combo Boxes",
  sides: "Chips & Sides",
  desserts: "Desserts & Drinks",
  "set-meals": "Set Meals",
  preorder: "Pre-order (24h+ notice)",
};
