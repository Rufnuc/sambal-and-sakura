// When this server last saw order activity (an order placed, paid or changed). The every-minute
// order checks (print retries, "order not started" alerts) only run in the 3 hours after that, so
// when the restaurant is quiet nothing queries the database and a free-tier database can sleep.
// One server instance handles every order, so in-memory is enough.
let lastOrderActivity = 0;
export const noteOrderActivity = () => { lastOrderActivity = Date.now(); };
export const orderActivityRecently = (ms = 3 * 60 * 60 * 1000) => Date.now() - lastOrderActivity < ms;
