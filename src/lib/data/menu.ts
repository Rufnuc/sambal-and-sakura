// Sambal & Sakura - the restaurant's printed menu (Chinese, Japanese and Malaysian), as built-in dishes.
// The owner edits prices, photos, allergens and availability in Admin -> Menu (saved in the database,
// layered on top of this file). Dishes with several sizes or fillings are one dish with a choice that
// sets the price.

export type Allergen =
  | "gluten" | "soy" | "shellfish" | "fish" | "egg" | "peanut" | "treenut" | "sesame" | "dairy" | "crustaceans" | "molluscs"
  | "celery" | "lupin" | "mustard" | "sulphites";

/** The 14 UK allergens (plus "shellfish", used by older built-in dishes), as shown in the admin dish editor. */
export const ALLERGEN_LABELS: Record<Allergen, string> = {
  gluten: "Gluten (cereals)", crustaceans: "Crustaceans", egg: "Eggs", fish: "Fish", peanut: "Peanuts", soy: "Soya",
  dairy: "Milk", treenut: "Tree nuts", celery: "Celery", mustard: "Mustard", sesame: "Sesame", sulphites: "Sulphites",
  lupin: "Lupin", molluscs: "Molluscs", shellfish: "Shellfish",
};
export const ALLERGENS = Object.keys(ALLERGEN_LABELS) as Allergen[];

export type DietTag = "vegetarian" | "vegan" | "popular" | "chef" | "spicy" | "new";
export const DIET_TAGS: { id: DietTag; label: string }[] = [
  { id: "vegetarian", label: "Vegetarian" }, { id: "vegan", label: "Vegan" }, { id: "spicy", label: "Spicy" },
  { id: "popular", label: "Popular" }, { id: "chef", label: "Chef's pick" }, { id: "new", label: "New" },
];

// Categories are data: the owner can add, rename, reorder and hide them (Admin -> Menu -> Categories,
// Setting "menuCategories"). These are the built-in ones the printed menu uses.
export type MenuCategory = string;
export type BuiltInCategory =
  | "salt-pepper" | "tempura" | "starters" | "skewers" | "bao" | "fish" | "seafood" | "king-prawn"
  | "beef" | "chicken" | "vegetables" | "rice" | "ho-fun" | "vermicelli" | "udon" | "ramen"
  | "sushi-rolls" | "sashimi" | "hosomaki" | "poke" | "nigiri" | "platters" | "desserts" | "drinks";
export interface MenuCategoryCfg { id: string; label: string; hidden?: boolean }

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
  image: string;            // main photo (the first of `images` when the owner has uploaded some)
  images?: string[];        // all photos, main first (Admin → Menu); customers can swipe through them
  soldOut?: boolean;
  leadTimeHours?: number;   // >0 = pre-order / advance-notice dish (e.g. 24 = order a day ahead)
  aiNotes?: string;         // admin-written extra context the dish AI assistant can draw on
  modifiers?: ModifierGroup[];
  custom?: boolean;         // added by the owner in Admin -> Menu (not part of the built-in menu)
  hidden?: boolean;         // hidden from customers (Admin -> Menu); only the admin list shows it
  allergensChecked?: boolean; // owner-added dish: the owner confirmed its allergen list when saving it
}


/* ------------------------------------------------------------ helpers */

// Allergens are deliberately left empty: the kitchen enters them from the real recipes in Admin -> Menu.
// Until a dish has a list, the website tells customers to ask before ordering (it never shows "none").
// Diet tags (vegetarian / vegan) are also left for the kitchen to confirm: several dishes in the printed
// "Vegetarian" section use oyster sauce, shrimp or egg.
type DishExtra = Partial<Pick<MenuItem, "spiceLevel" | "tags" | "modifiers" | "leadTimeHours">>;
function dish(id: string, name: string, category: BuiltInCategory, price: number, description: string, extra: DishExtra = {}): MenuItem {
  const spiceLevel = extra.spiceLevel ?? 0;
  const tags: DietTag[] = [...(extra.tags ?? []), ...(spiceLevel > 0 ? (["spicy"] as DietTag[]) : [])];
  return { id, name, category, price, description, allergens: [], image: "", ...extra, tags, spiceLevel };
}

/** A required "pick one" choice; `deltas` are added to the dish's base (lowest) price. */
function choose(id: string, label: string, options: [string, string, number?][]): ModifierGroup {
  return { id, label, type: "single", required: true, options: options.map(([oid, olabel, d]) => ({ id: oid, label: olabel, priceDelta: d ?? 0 })) };
}

const fishCut = choose("cut", "Fillet or whole fish", [["fillet", "Fillet"], ["whole", "Whole fish", 2]]);

/* ------------------------------------------------------------- the menu */

// Dish ids start with the printed menu number (m12-...), so staff and customers can match the paper menu,
// and so no setting saved for the previous menu's dishes can attach to these.
export const MENU: MenuItem[] = [
  /* SALT & PEPPER */
  dish("m12-sp-chips", "Salt & Pepper Chips", "salt-pepper", 4.5, "Chips wok-tossed with salt & pepper."),
  dish("m13-sp-chicken-wings", "Salt & Pepper Chicken Wings (6)", "salt-pepper", 6.5, "Six chicken wings, salt & pepper style."),
  dish("m14-sp-shredded-chicken", "Salt & Pepper Shredded Chicken", "salt-pepper", 7.9, "Crispy shredded chicken, salt & pepper style."),
  dish("m15-sp-tofu", "Salt & Pepper Tofu", "salt-pepper", 8.5, "Crispy tofu, salt & pepper style."),
  dish("m16-sp-squid", "Salt & Pepper Squid", "salt-pepper", 8.9, "Crispy squid, salt & pepper style."),
  dish("m17-sp-king-prawn", "Salt & Pepper King Prawn", "salt-pepper", 8.9, "King prawns, salt & pepper style."),

  /* TEMPURA - crispy batter, served with homemade sauce */
  dish("m18-tempura-king-prawn", "King Prawn Tempura (4)", "tempura", 6.5, "Four king prawns in crispy tempura batter, served with homemade sauce."),
  dish("m19-tempura-salmon", "Salmon Tempura (5)", "tempura", 6.5, "Five pieces of salmon in crispy tempura batter, served with homemade sauce."),
  dish("m20-tempura-seabass", "Seabass Tempura (5)", "tempura", 6.5, "Five pieces of seabass in crispy tempura batter, served with homemade sauce."),
  dish("m21-tempura-sweet-potato", "Sweet Potato Tempura (5)", "tempura", 5.5, "Five pieces of sweet potato in crispy tempura batter, served with homemade sauce."),
  dish("m22-tempura-moriawase", "Tempura Moriawase (8)", "tempura", 8.9, "Mixed tempura: 2 king prawn, 2 seabass, 2 salmon and 2 sweet potato, served with homemade sauce."),

  /* STARTERS */
  dish("m23-calamari", "Deep Fried Calamari", "starters", 6.5, "Crispy fried calamari rings."),
  dish("m24-chicken-karaage", "Chicken Karaage", "starters", 6.5, "Japanese-style fried chicken pieces."),
  dish("m25-pumpkin-croquette", "Pumpkin Croquette (2)", "starters", 4.5, "Two crisp pumpkin croquettes."),
  dish("m26-takoyaki", "Takoyaki Balls (6)", "starters", 6.2, "Six octopus balls."),
  dish("m27-soft-shell-crab-salad", "Soft Shell Crab Salad", "starters", 8.5, "A whole soft shell crab fried golden and crisp, on cool fresh salad with our homemade yuzu dressing."),
  dish("m28-beef-salad", "Pan-Seared Tender Beef Salad", "starters", 9.5, "Pan-seared tender beef over seasonal fresh salad, tossed in our signature homemade sauce."),
  dish("m29-aromatic-duck", "Aromatic Crispy Duck", "starters", 13.5, "Served with cucumber, spring onion, pancakes and hoi sin sauce.", {
    modifiers: [choose("size", "Size", [["quarter", "Quarter"], ["half", "Half", 11.4]])],
  }),
  dish("m30-veg-spring-rolls", "Green Vegetable Spring Rolls (6)", "starters", 5.9, "Six vegetable spring rolls."),
  dish("m31-sesame-prawn-toast", "Sesame Prawn on Toast (8)", "starters", 6.5, "Eight pieces of sesame prawn toast."),

  /* SKEWERS */
  dish("m32-satay-chicken", "Satay Chicken Skewers (6)", "skewers", 6.5, "Six chicken satay skewers."),
  dish("m33-okonomiyaki-squid", "Okonomiyaki Squid Skewers", "skewers", 5.9, "Japanese-style squid skewers."),

  /* BAO BUNS - 1 for £4.50, 2 for £7.90 (both the same filling) */
  dish("m34-bao-bun", "Bao Bun", "bao", 4.5, "Soft steamed bao. Order one, or two with the same filling.", {
    modifiers: [
      choose("filling", "Filling", [
        ["sambal-chicken", "Sambal Chicken Katsu"],
        ["chicken-mayo", "Chicken Katsu Mayonnaise"],
        ["duck", "Duck with cucumber, hoi sin and spring onion"],
        ["prawn-wasabi", "Prawn Katsu with wasabi mayo"],
      ]),
      choose("count", "How many", [["one", "1 bun"], ["two", "2 buns (same filling)", 3.4]]),
    ],
  }),

  /* SEAFOOD - FISH */
  dish("m35-seabass-thai", "Steamed Seabass Thai Style", "fish", 17.9, "Spicy, with spring onion, lemongrass and chilli.", { spiceLevel: 1, modifiers: [fishCut] }),
  dish("m36-seabass-ginger", "Steamed Seabass with Ginger & Spring Onion", "fish", 17.9, "Steamed with ginger and spring onion.", { modifiers: [fishCut] }),
  dish("m37-sambal-pomfret", "Sambal Pomfret in Banana Leaf", "fish", 19.9, "Whole pomfret coated in rich, aromatic sambal (chillies, garlic, ginger, lemongrass and lime), wrapped in banana leaf and grilled. Served with chips & salad. About 25 minutes.", { spiceLevel: 2 }),
  dish("m38-chilli-oil-fish", "Chilli Oil Fish", "fish", 15.5, "Silky slices of white fish, gently poached, topped with dried red chillies and Sichuan peppercorns for a fiery, tingling kick. Served over fresh sweet cabbage.", { spiceLevel: 3 }),

  /* SEAFOOD - RICE BOWLS */
  dish("m39-salmon-teriyaki-don", "Salmon Teriyaki Donburi", "seafood", 13.9, "Teriyaki salmon over rice, with a half boiled egg, pickles and mixed salad."),
  dish("m40-unagi-don", "Unagi Don - Grilled Eel Rice Bowl", "seafood", 14.9, "Tender grilled eel glazed in our homemade alcohol-free sweet-savoury soy sauce. Served with pickles, a half boiled egg and seasonal veg. Please note: views on eel differ between schools of Islamic thought."),

  /* KING PRAWN */
  dish("m41-sweet-sour-king-prawn", "Sweet & Sour King Prawn (10)", "king-prawn", 9.9, "With onion, pepper, pineapple and carrot."),
  dish("m42-thai-red-king-prawn", "Thai Red Curry King Prawn (10)", "king-prawn", 9.9, "Green pepper, pineapple and coconut milk.", { spiceLevel: 1 }),
  dish("m43-black-bean-king-prawn", "Black Bean King Prawn", "king-prawn", 9.9, "Green pepper, onion, black bean and chilli.", { spiceLevel: 1 }),
  dish("m44-kung-po-king-prawn", "Kung Po Crispy King Prawn", "king-prawn", 9.9, "Pineapple, nuts, onion, pepper and chilli.", { spiceLevel: 1 }),
  dish("m45-katsu-curry-king-prawn-don", "Katsu Curry King Prawn Donburi (6)", "king-prawn", 11.9, "Six katsu king prawns with curry, carrot and potato, pickles and a half boiled egg."),
  dish("m46a-la-zi-king-prawn", "La Zi King Prawn (shell on)", "king-prawn", 14.9, "Shell-on king prawns, La Zi style.", { spiceLevel: 1 }),
  dish("m46b-la-zi-crab", "La Zi Crab", "king-prawn", 15.0, "Crab, La Zi style."),
  dish("m47-typhoon-king-prawn", "Typhoon Shelter King Prawn (10)", "king-prawn", 15.9, "Onion, garlic, ginger and herbs."),
  dish("m48-cereal-king-prawn", "Cereal King Prawn (10)", "king-prawn", 14.9, "Ten king prawns, cereal style."),

  /* BEEF */
  dish("m49-crispy-chilli-beef", "Crispy Shredded Chilli Beef", "beef", 12.9, "Crispy shredded beef in sweet chilli.", { spiceLevel: 1 }),
  dish("m50-hot-chilli-oil-beef", "Hot Chilli Oil Beef", "beef", 15.9, "With dried chilli and Sichuan peppercorns.", { spiceLevel: 2 }),
  dish("m51-rendang-beef", "Rendang Beef Curry", "beef", 13.9, "Rendang beef curry.", { spiceLevel: 2 }),
  dish("m52-beef-brisket", "Slow Cooked Beef Brisket", "beef", 13.9, "Slow cooked beef brisket."),
  dish("m53-ginger-spring-onion-beef", "Beef with Ginger & Spring Onion", "beef", 12.9, "Beef with ginger and spring onion."),
  dish("m54-thai-red-beef", "Thai Red Beef Curry", "beef", 12.9, "Thai red beef curry.", { spiceLevel: 2 }),
  dish("m55-sizzling-black-pepper-beef", "Sizzling Beef Fillet Steak in Black Pepper Sauce", "beef", 16.9, "Beef fillet on a sizzling plate with black peppercorn sauce.", { spiceLevel: 2 }),
  dish("m56-sizzling-peking-beef", "Sizzling Beef Fillet Steak, Peking Style", "beef", 16.9, "Beef fillet on a sizzling plate, Peking style."),
  dish("m57-sirloin-steak", "Sirloin Steak", "beef", 18.9, "Served with chips and salad."),

  /* CHICKEN */
  dish("m58-chicken-katsu-curry", "Japanese Chicken Katsu Curry", "chicken", 11.9, "Breaded chicken with Japanese curry, served with rice."),
  dish("m59-thai-red-chicken", "Thai Red Chicken Curry", "chicken", 8.9, "Thai red chicken curry.", { spiceLevel: 2 }),
  dish("m60-rendang-chicken", "Rendang Chicken Curry", "chicken", 12.5, "Rendang chicken curry.", { spiceLevel: 1 }),
  dish("m61-sesame-oil-chicken", "Ginger & Sesame Oil Chicken", "chicken", 12.5, "Chicken with ginger and sesame oil."),
  dish("m62-kung-po-chicken", "Kung Po Chicken", "chicken", 9.9, "Kung po chicken.", { spiceLevel: 1 }),
  dish("m63-sweet-sour-chicken", "Sweet & Sour Chicken", "chicken", 8.9, "Sweet and sour chicken."),
  dish("m64-black-bean-chicken", "Chicken & Green Pepper in Black Bean Sauce", "chicken", 8.9, "Chicken and green pepper in black bean sauce.", { spiceLevel: 1 }),
  dish("m65-szechuan-chicken", "Szechuan Chicken", "chicken", 8.9, "Szechuan-style diced chicken.", { spiceLevel: 1 }),
  dish("m66-ginger-spring-onion-chicken", "Chicken with Ginger & Spring Onion", "chicken", 8.9, "Diced chicken with ginger and spring onion."),
  dish("m67-chicken-teriyaki-don", "Chicken Teriyaki Donburi", "chicken", 12.5, "Pan-fried fresh chicken breast in teriyaki, served with sushi rice."),
  dish("m68-banana-leaf-chicken", "Pan-Fried Chicken Thigh in Banana Leaf", "chicken", 19.9, "Traditional Malay grill, served with chips. About 25 minutes.", { spiceLevel: 1 }),

  /* VEGETABLES & TOFU (the printed "Vegetarian" page) */
  dish("m69-super-greens", "Stir-Fried Mixed Super Greens", "vegetables", 9.8, "Stir-fried mixed greens."),
  dish("m70-seasonal-veg", "Stir-Fried Seasonal Veg", "vegetables", 9.8, "The vegetable of the day - ask us what it is today.", {
    modifiers: [choose("sauce", "Sauce", [["oyster", "Oyster sauce"], ["garlic", "Garlic sauce"]])],
  }),
  dish("m71-salted-egg-tofu-dry", "Salted Egg Yolk Tofu (dry)", "vegetables", 11.9, "Egg tofu stir-fried dry with salted egg yolk."),
  dish("m72-tomato-egg", "Tomato with Golden Egg", "vegetables", 8.8, "Tomato stir-fried with egg."),
  dish("m73-yu-xiang-aubergine", "Sea Spice Aubergine", "vegetables", 10.8, "Yu xiang (sea spice) aubergine."),
  dish("m74-salted-egg-tofu-wet", "Salted Egg Yolk Tofu (wet)", "vegetables", 11.9, "Braised tofu with salted egg yolk."),
  dish("m75-mapo-tofu", "Mapo Tofu (with shrimp)", "vegetables", 10.9, "Mapo tofu with shrimp."),

  /* RICE */
  dish("m76-nasi-lemak", "Signature Nasi Lemak", "rice", 9.9, "Fragrant coconut-pandan rice, slow-steamed, with our house-made sambal, crispy fried anchovies, toasted peanuts, fresh cucumber and a boiled egg.", {
    spiceLevel: 1, tags: ["chef"],
    modifiers: [choose("style", "Choose your nasi lemak", [["classic", "Classic"], ["fried-chicken", "With fried chicken", 3], ["rendang-beef", "With rendang beef", 4], ["crispy-prawn", "With crispy prawn", 4]])],
  }),
  dish("m78-special-egg-fried-rice", "Special Egg Fried Rice", "rice", 11.9, "Prawn and chicken with onion, carrot, spring onion and egg."),
  dish("m79-singapore-fried-rice", "Singapore Fried Rice", "rice", 12.9, "Prawn, chicken, onion, carrot, spring onion, egg and curry paste.", { spiceLevel: 1 }),
  dish("m80-sambal-fried-rice", "Sambal Special Fried Rice", "rice", 12.9, "Prawn, chicken, onion, carrot, spring onion and egg with sambal.", { spiceLevel: 1 }),
  dish("m81-king-prawn-fried-rice", "King Prawn Fried Rice", "rice", 12.9, "King prawn fried rice."),
  dish("m82-chicken-fried-rice", "Chicken Fried Rice", "rice", 11.9, "Chicken fried rice."),
  dish("m83-coconut-rice", "Coconut Rice", "rice", 3.0, "Rice cooked with coconut milk."),
  dish("m84-egg-fried-rice", "Egg Fried Rice", "rice", 3.5, "Egg fried rice."),
  dish("m85-sushi-rice", "Sushi Rice", "rice", 3.0, "A portion of sushi rice."),

  /* HO FUN (flat rice noodles) */
  dish("m86-wat-tan-ho", "Wat Tan Ho (wet ho fun)", "ho-fun", 13.9, "Flat rice noodles in a silky egg gravy.", {
    modifiers: [choose("protein", "Choose your protein", [["beef", "Beef"], ["prawn", "Prawn"], ["chicken", "Chicken"]])],
  }),
  dish("m87-dry-ho-fun", "Dry-Fried Ho Fun", "ho-fun", 12.5, "Flat rice noodles, wok-fried dry.", {
    modifiers: [choose("protein", "Choose your protein", [["veg", "Vegetables"], ["beef", "Beef", 0.4], ["prawn", "Prawn", 0.4], ["chicken", "Chicken", 0.4]])],
  }),

  /* VERMICELLI (thin rice noodles) */
  dish("m88-special-vermicelli", "Special Vermicelli", "vermicelli", 13.9, "Prawn, chicken, egg, green pepper, beansprouts, onion and spring onion."),
  dish("m89-prawn-vermicelli", "Prawn Vermicelli (10 pcs)", "vermicelli", 12.9, "Thin rice noodles with ten prawns."),
  dish("m90-chicken-vermicelli", "Chicken Vermicelli", "vermicelli", 12.5, "Thin rice noodles with chicken."),
  dish("m91-veg-vermicelli", "Vegetable Vermicelli", "vermicelli", 12.0, "Thin rice noodles with mixed vegetables."),
  dish("m92-singapore-vermicelli", "Singapore Vermicelli", "vermicelli", 13.9, "Singapore-style thin rice noodles.", { spiceLevel: 2 }),

  /* UDON */
  dish("m93-special-udon", "Special Udon", "udon", 12.9, "Thick, soft, bouncy udon noodles, house special."),
  dish("m94-prawn-udon", "Prawn Udon", "udon", 12.9, "Udon noodles with prawn."),
  dish("m95-beef-udon", "Beef Udon", "udon", 12.9, "Udon noodles with beef."),
  dish("m96-chicken-udon", "Chicken Udon", "udon", 12.9, "Udon noodles with chicken."),
  dish("m97-veg-udon", "Vegetable Udon", "udon", 11.5, "Udon noodles with mixed vegetables."),

  /* RAMEN BAR - build your own (98-100) */
  dish("m98-ramen-bar", "Ramen Bar - Build Your Own Bowl", "ramen", 11.5, "Choose your noodle, broth and protein. Every bowl comes with bamboo shoots, half a boiled egg, broccoli, seaweed, spring onion and fish cake.", {
    modifiers: [
      choose("noodle", "Step 1 - Noodle", [["ramen", "Ramen (springy wheat noodles)"], ["udon", "Udon (thick, soft, bouncy)"], ["ho-fun", "Ho Fun (wide, silky rice noodles)"]]),
      choose("broth", "Step 2 - Broth", [["miso", "Miso (fermented soybean)"], ["soya", "Soya (bright and clean)"], ["tom-yum", "Tom Yum (spicy, sour and zesty)"], ["tori-paitan", "Tori Paitan (rich chicken)"]]),
      choose("protein", "Step 3 - Protein", [["veg", "Mixed vegetables"], ["chicken", "Chicken"], ["duck", "Duck"], ["brisket", "Beef brisket", 1], ["seafood", "Seafood", 2]]),
    ],
  }),

  /* SPECIAL SUSHI ROLLS */
  dish("m101-signature-salmon-roll", "Signature Salmon Roll", "sushi-rolls", 12.5, "Fresh salmon, avocado, cheese, homemade chilli sauce and yuzu sauce.", { tags: ["chef"] }),
  dish("m102-glorious-melty-roll", "Glorious Melty Roll", "sushi-rolls", 12.5, "Cucumber, avocado, eel, orange tobiko, sesame and bonito flakes."),
  dish("m103-murky-roll", "Murky Roll", "sushi-rolls", 12.8, "Eel, cucumber, avocado, yellow pickle, orange tobiko, chilli threads and spring onion."),
  dish("m104-soft-shell-crab-futomaki", "Soft Shell Crab Futomaki", "sushi-rolls", 12.8, "Soft shell crab, cucumber, avocado, spicy mayo and sesame."),
  dish("m105-salmon-skin-uramaki", "Salmon Skin Teriyaki Uramaki", "sushi-rolls", 7.5, "Cooked salmon skin, cucumber, yellow pickle, eel sauce, spring onion and sesame."),
  dish("m106-crunchy-salmon-roll", "Crunchy Salmon Roll", "sushi-rolls", 9.5, "Fresh salmon, cucumber, avocado, eel sauce, spicy mayo and fried onion."),
  dish("m107-dragon-roll", "Dragon Roll", "sushi-rolls", 12.8, "Fresh salmon, cucumber, avocado, prawn tempura, homemade chilli sauce, chilli threads, spring onion, wasabi tobiko and sesame."),
  dish("m108-wassuprawn-roll", "Wassuprawn Roll", "sushi-rolls", 11.8, "Prawn katsu, cucumber, yellow pickle, avocado, wasabi mayo and orange tobiko."),
  dish("m109-california-roll", "California Roll", "sushi-rolls", 5.9, "Crabstick, orange tobiko, cucumber, avocado and mayo."),
  dish("m110-sweet-potato-futomaki", "Sweet Potato Futomaki", "sushi-rolls", 6.5, "Sweet potato and sesame."),

  /* SASHIMI (4 pcs) */
  dish("m111-salmon-sashimi", "Salmon Sashimi (4)", "sashimi", 5.7, "Four slices of salmon sashimi."),
  dish("m112-arctic-clam-sashimi", "Arctic Clam Sashimi (4)", "sashimi", 6.5, "Four pieces of arctic clam sashimi."),
  dish("m113-seabass-sashimi", "Seabass Sashimi (4)", "sashimi", 6.5, "Four slices of seabass sashimi."),
  dish("m114-octopus-sashimi", "Octopus Sashimi (4)", "sashimi", 5.7, "Four slices of octopus sashimi."),
  dish("m115-trio-sashimi", "Trio Sashimi", "sashimi", 13.5, "Salmon, seabass and octopus sashimi."),

  /* HOSOMAKI */
  dish("m116-salmon-hosomaki", "Salmon Hosomaki", "hosomaki", 2.9, "Thin salmon roll."),
  dish("m117-cucumber-hosomaki", "Cucumber Hosomaki", "hosomaki", 2.5, "Thin cucumber roll."),
  dish("m118-avocado-hosomaki", "Avocado Hosomaki", "hosomaki", 2.5, "Thin avocado roll."),
  dish("m119-pickle-hosomaki", "Yellow Pickle Hosomaki", "hosomaki", 2.5, "Thin yellow pickle roll."),

  /* POKE BOWLS */
  dish("m120-salmon-poke", "Salmon Poke Bowl", "poke", 9.9, "Thin-cut fresh salmon over rice."),
  dish("m121-sashimi-poke", "Sashimi Poke Bowl", "poke", 13.5, "Sashimi-grade salmon and tobiko on a bed of sushi rice."),

  /* NIGIRI (2 pcs) */
  dish("m122-salmon-nigiri", "Salmon Nigiri (2)", "nigiri", 3.9, "Two pieces of salmon nigiri."),
  dish("m123-salmon-salmoniri", "Salmon Salmoniri (10)", "nigiri", 16.9, "Ten pieces of salmon nigiri."),
  dish("m124-seabass-nigiri", "Seabass Nigiri (2)", "nigiri", 4.2, "Two pieces of seabass nigiri."),
  dish("m125-prawn-nigiri", "Prawn Nigiri (2)", "nigiri", 3.5, "Two pieces of prawn nigiri."),
  dish("m126-octopus-nigiri", "Octopus Nigiri (2)", "nigiri", 3.9, "Two pieces of octopus nigiri."),
  dish("m127-eel-nigiri", "Eel Nigiri (2)", "nigiri", 3.9, "Two pieces of eel nigiri."),
  dish("m128-tamago-nigiri", "Egg Omelette Nigiri (2)", "nigiri", 3.2, "Two pieces of tamago (egg omelette) nigiri."),
  dish("m129-tofu-nigiri", "Tofu Nigiri (2)", "nigiri", 3.2, "Two pieces of tofu nigiri."),

  /* SUSHI PLATTERS */
  dish("m130-sashimi-platter", "Assorted Sashimi Platter (20)", "platters", 24.0, "4 pieces each of salmon, arctic clam, squid, seabass and octopus."),
  dish("m131-salmon-kura", "Salmon Kura (20)", "platters", 25.0, "4 salmon nigiri, 8 salmon sashimi and a Dragon roll."),
  dish("m132-osaka", "Osaka Platter (10)", "platters", 11.0, "1 piece each of salmon, prawn, egg omelette, octopus and seabass nigiri, and 6 cucumber hosomaki."),
  dish("m133-tokyo", "Tokyo Platter (19)", "platters", 16.0, "4 salmon nigiri; 1 each of prawn, octopus and egg omelette nigiri; 6 cucumber and 6 salmon hosomaki."),
  dish("m134-sapporo", "Sapporo Platter (29)", "platters", 32.0, "3 pieces each of salmon, seabass and octopus sashimi; 2 each of salmon, octopus, prawn and egg omelette nigiri; 6 salmon and 6 cucumber hosomaki."),
  dish("m135-asahi", "Asahi Platter (34)", "platters", 23.0, "6 chicken katsu & avocado uramaki, 6 duck & cucumber uramaki, 2 each of salmon and egg omelette nigiri, 6 salmon and 6 cucumber hosomaki."),

  /* DESSERTS */
  dish("m136-bubur-cha-cha", "Bubur Cha Cha", "desserts", 4.5, "A beloved Nyonya-Malay dessert: tender yam and sweet potato with chewy sago pearls in rich, fragrant coconut milk. Warm or chilled."),
  dish("m137-cheesecake", "Cheesecake", "desserts", 4.9, "Ask us for today's cake selection."),
  dish("m138-brownie", "Brownie", "desserts", 4.9, "Chocolate brownie."),
  dish("m139-ice-cream", "Ice Cream", "desserts", 4.9, "Ask us for today's flavours."),
  dish("m140-roti-canai", "Roti Canai", "desserts", 4.9, "Flaky flatbread with curry or condensed milk.", {
    modifiers: [choose("with", "Served with", [["curry", "Curry"], ["condensed-milk", "Condensed milk"]])],
  }),

  /* DRINKS (kept from the previous menu, same ids so their photos and settings carry over) */
  { id: "matcha-latte", name: "Strawberry Matcha Latte", category: "drinks", price: 5.5, description: "Iced strawberry matcha latte.", allergens: ["dairy"], tags: ["new", "popular"], spiceLevel: 0, image: "/menu/matcha-latte.jpg" },
  { id: "boba-tea", name: "Signature Brown Sugar Boba Tea", category: "drinks", price: 4.5, description: "Brown sugar milk tea with chewy pearls.", allergens: ["dairy"], tags: ["popular", "new"], spiceLevel: 0, image: "/menu/boba-tea.jpg" },
  { id: "mango-passion-tea", name: "Mango & Passion Fruit Tea", category: "drinks", price: 4.5, description: "Fruit tea with mango popping balls.", allergens: [], tags: ["new"], spiceLevel: 0, image: "/menu/mango-tea.jpg" },
  { id: "soft-drink", name: "Soft Drink Can (330ml)", category: "drinks", price: 1.5, description: "Chilled canned soft drink.", allergens: [], tags: [], spiceLevel: 0, image: "/menu/soft-drink.jpg" },
];

export const CATEGORY_LABELS: Record<BuiltInCategory, string> = {
  "salt-pepper": "Salt & Pepper",
  tempura: "Tempura",
  starters: "Starters",
  skewers: "Skewers",
  bao: "Bao Buns",
  fish: "Seafood - Fish",
  seafood: "Seafood Rice Bowls",
  "king-prawn": "King Prawn",
  beef: "Beef",
  chicken: "Chicken",
  vegetables: "Vegetables & Tofu",
  rice: "Rice",
  "ho-fun": "Ho Fun (Flat Noodles)",
  vermicelli: "Vermicelli (Thin Noodles)",
  udon: "Udon",
  ramen: "Ramen Bar",
  "sushi-rolls": "Special Sushi Rolls",
  sashimi: "Sashimi",
  hosomaki: "Hosomaki",
  poke: "Poke Bowls",
  nigiri: "Nigiri",
  platters: "Sushi Platters",
  desserts: "Desserts",
  drinks: "Drinks",
};

// Categories of the previous menu. A category list saved while they existed is upgraded on read
// (server/config.ts getCategories): these are dropped and the new built-in ones are added.
export const RETIRED_CATEGORIES = [
  "japanese", "soup", "ribs", "wrapping", "mains", "honey-chilli", "kung-po", "sweet-sour", "chef-special",
  "omelette", "crispy-noodle", "chow-mein", "combo", "sides", "set-meals", "preorder",
];

/** The name to show for a category: the owner's label, else the built-in one, else the id. */
export function categoryLabel(cats: MenuCategoryCfg[], id: string): string {
  return cats.find((c) => c.id === id)?.label ?? (CATEGORY_LABELS as Record<string, string>)[id] ?? id;
}

/** Ids of dishes the owner adds (built-in dish ids never start with "c-"). */
export const CUSTOM_DISH_ID = /^c-[a-z0-9-]{1,40}$/;

/** The built-in categories in menu order, until the owner saves their own list. */
export const DEFAULT_CATEGORIES: MenuCategoryCfg[] = (Object.keys(CATEGORY_LABELS) as BuiltInCategory[]).map((id) => ({ id, label: CATEGORY_LABELS[id] }));
