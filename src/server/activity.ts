// When this server last saw order activity (an order placed, paid or changed). The every-minute
// order checks (print retries, "order not started" alerts) only run in the 3 hours after that, so
// when the restaurant is quiet nothing queries the database and a free-tier database can sleep.
//
// Kept on globalThis, not in a module variable: in a production build Next loads the background
// worker (instrumentation) and the request handlers as separate copies of this module, but they
// run in the same Node process, so globalThis is the one place both can see.
const state = ((globalThis as unknown as { __ssActivity?: { lastOrder: number; campaignWork: boolean } }).__ssActivity ??= { lastOrder: 0, campaignWork: true });

export const noteOrderActivity = () => { state.lastOrder = Date.now(); };
export const orderActivityRecently = (ms = 3 * 60 * 60 * 1000) => Date.now() - state.lastOrder < ms;

/** A promotion was queued (or might be, right after start-up): the worker should check the database. */
export const markCampaignWork = () => { state.campaignWork = true; };
export const campaignWorkPending = () => state.campaignWork;
export const clearCampaignWork = () => { state.campaignWork = false; };
