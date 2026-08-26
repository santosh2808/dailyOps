// D.O.T. (DailyOps Operations Assistant) — the login robot's message pool.
//
// getDotGreeting() is the one seam between "the robot has something to
// say when the login page loads" and "where that something comes from".
// Today it's a random pick from the static list below. When D.O.T.
// becomes a real AI assistant, this is the only function that needs to
// change — e.g. swap the body for an async call to an assistant endpoint
// (`/api/v1/assistant/greeting` or similar) and return whatever it says,
// optionally still passing these 7 categories along as a hint instead of
// a lookup table. LoginRobot.tsx just calls this once per mount and hands
// the result to its existing `say()` function — it doesn't know or care
// whether the string came from a random pick or a live model, so no other
// file needs to change when that swap happens. The only likely follow-up
// edit at that point: this becomes `async function getDotGreeting():
// Promise<string>` and its one call site gains an `await`.

export type DotMessageCategory =
  | "welcome"
  | "productivity"
  | "sales"
  | "manufacturing"
  | "operations"
  | "growth"
  | "motivation";

export interface DotMessage {
  text: string;
  category: DotMessageCategory;
}

// At least 10 required; kept at 14 (2 per category) so no single category
// repeats too often across refreshes.
export const DOT_MESSAGES: DotMessage[] = [
  { category: "welcome", text: "Hi, I'm D.O.T. — your DailyOps Operations Assistant." },
  { category: "welcome", text: "Welcome back. D.O.T. online and ready to help." },
  { category: "productivity", text: "Fewer clicks, faster dispatch — that's the plan for today." },
  { category: "productivity", text: "Let's turn today's to-do list into today's done list." },
  { category: "sales", text: "Somewhere out there, a lead is waiting to become a customer." },
  { category: "sales", text: "Every quotation sent is a sales order in the making." },
  { category: "manufacturing", text: "From raw material to ready-to-dispatch — I keep an eye on it all." },
  { category: "manufacturing", text: "Shop floor running smooth today? Let's find out together." },
  { category: "operations", text: "Lead to Dispatch — one platform, zero chaos." },
  { category: "operations", text: "Operations don't run themselves. Well... almost." },
  { category: "growth", text: "Small steps in operations, big leaps in growth." },
  { category: "growth", text: "A customer served well today is a customer who returns tomorrow." },
  { category: "motivation", text: "You've got this. I've got the dashboard." },
  { category: "motivation", text: "Great businesses are built one dispatch at a time." },
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

// Returns one random message's text. Deliberately typed as plain
// `string` rather than `Promise<string>` even though it's a trivial
// synchronous pick today — see the file comment above on why.
export function getDotGreeting(): string {
  return pickRandom(DOT_MESSAGES).text;
}
