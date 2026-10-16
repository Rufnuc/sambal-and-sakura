// Table inventory & booking policy. The owner edits the real tables in Admin -> Floor plan (saved in
// the database, Setting "floorTables"); TABLES is only the starting layout until they do.

export type TableShape = "round" | "square" | "long";
export interface Table {
  id: string;            // short name shown on the plan, e.g. "T1" or "Window 2"
  seats: number;
  zone: string;          // area, e.g. Window / Main / Booth
  combinesWith?: string[]; // tables that can be pushed together with this one for a bigger party
  x?: number; y?: number;  // position on the floor plan, as % of its width / height (centre of the table)
  shape?: TableShape;
}

export const TABLES: Table[] = [
  { id: "T1", seats: 2, zone: "Window", x: 12, y: 15, shape: "round" },
  { id: "T2", seats: 2, zone: "Window", x: 30, y: 15, shape: "round" },
  { id: "T3", seats: 2, zone: "Bar", combinesWith: ["T4"], x: 70, y: 15, shape: "square" },
  { id: "T4", seats: 2, zone: "Bar", combinesWith: ["T3"], x: 85, y: 15, shape: "square" },
  { id: "T5", seats: 4, zone: "Main", x: 15, y: 50, shape: "square" },
  { id: "T6", seats: 4, zone: "Main", x: 38, y: 50, shape: "square" },
  { id: "T7", seats: 4, zone: "Main", combinesWith: ["T8"], x: 62, y: 50, shape: "square" },
  { id: "T8", seats: 4, zone: "Main", combinesWith: ["T7"], x: 82, y: 50, shape: "square" },
  { id: "T9", seats: 6, zone: "Booth", x: 25, y: 83, shape: "long" },
  { id: "T10", seats: 6, zone: "Booth", x: 70, y: 83, shape: "long" },
];

export const totalSeats = (tables: Table[]) => tables.reduce((n, t) => n + t.seats, 0);
export const TOTAL_SEATS = totalSeats(TABLES); // the default layout's 36 (live total: totalSeats(tables))
export const MAX_ONLINE_PARTY = 10; // above this → phone + deposit

export const BOOKING_POLICY = {
  // % of seats held back for walk-ins. Higher on peak nights.
  walkInReservePct: { peak: 0.3, standard: 0.15 },
  peakDays: [5, 6], // Fri, Sat (0 = Sun)
  turnTimeMins: { small: 90, large: 120 }, // small = party <= 4
  bufferMins: 15,
  slotStepMins: 30,
  depositThresholdParty: 7, // parties this size+ need a deposit
  depositPerHead: 10,
};
