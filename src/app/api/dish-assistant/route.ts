import { NextResponse } from "next/server";
import { getEffectiveMenu } from "@/server/config";
import { RESTAURANT } from "@/lib/data/site";
import { getSiteContent } from "@/server/site-content";
import { gbp } from "@/lib/format";

// "Ask about this dish" — a Groq-powered helper grounded in the dish's own data.
// Configure GROQ_API_KEY in .env. Without it, returns a friendly fallback.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

export async function POST(req: Request) {
  const key = process.env.GROQ_API_KEY;
  const body = await req.json().catch(() => null);
  const itemId = typeof body?.itemId === "string" ? body.itemId : "";
  const question = typeof body?.question === "string" ? body.question.slice(0, 500).trim() : "";
  const localeName = typeof body?.localeName === "string" ? body.localeName : "English";
  if (!itemId || !question) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });

  const { business: b } = await getSiteContent();
  const menu = await getEffectiveMenu();
  const dish = menu.find((m) => m.id === itemId);
  if (!dish) return NextResponse.json({ error: "Dish not found." }, { status: 404 });

  if (!key) {
    return NextResponse.json({
      answer: `For details on "${dish.name}" — including ingredients, allergens or any changes like removing or adding something — please call us on ${b.phone} and the kitchen will be happy to help.`,
    });
  }

  const facts = [
    `Name: ${dish.name}`,
    `Category: ${dish.category}`,
    `Description: ${dish.description}`,
    `Price: ${gbp(dish.price)}`,
    dish.allergens.length ? `Listed allergens: ${dish.allergens.join(", ")}` : "Listed allergens: none noted",
    dish.tags.length ? `Tags: ${dish.tags.join(", ")}` : "",
    typeof dish.spiceLevel === "number" ? `Spice level: ${dish.spiceLevel}/3` : "",
    dish.aiNotes ? `Extra details from the restaurant: ${dish.aiNotes}` : "",
  ].filter(Boolean).join("\n");

  const system = [
    `You are a warm, concise assistant for ${RESTAURANT.name}, a Chinese & Japanese restaurant in Middlesbrough.`,
    `Answer the customer's question about THIS dish using only the details below. Keep it to 2-4 short sentences.`,
    `If they ask to change the dish (remove/add an ingredient, extra spice, no onions, extra sauce, larger portion, etc.), tell them yes — they can add the request as a note at checkout and the kitchen will do their best (some changes may affect the price, which staff confirm).`,
    `For certainty about allergens or exact ingredients, advise phoning ${b.phone} before ordering.`,
    `Never invent prices, ingredients, or other menu items. If the question isn't about food or this dish, gently steer back to the dish.`,
    `Reply in ${localeName}.`,
    ``,
    `DISH DETAILS:\n${facts}`,
  ].join("\n");

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 500,
        reasoning_effort: "low", // gpt-oss models reason internally; keep it light for fast, concise replies
        messages: [
          { role: "system", content: system },
          { role: "user", content: question },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Groq ${res.status}`);
    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error("empty");
    return NextResponse.json({ answer });
  } catch {
    return NextResponse.json({
      answer: `Sorry, I couldn't answer that just now. For anything about "${dish.name}", please call us on ${b.phone}.`,
    });
  }
}
