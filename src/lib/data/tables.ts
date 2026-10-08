// Table inventory & booking policy. PLACEHOLDER - tune to the real floor plan.

export interface Table { id: string; seats: number; zone: string; combinesWith?: string[] }

export const TABLES: Table[] = [
  { id: "T1", seats: 2, zone: "Window" },
  { id: "T2", seats: 2, zone: "Window" },
  { id: "T3", seats: 2, zone: "Bar", combinesWith: ["T4"] },
  { id: "T4", seats: 2, zone: "Bar", combinesWith: ["T3"] },
  { id: "T5", seats: 4, zone: "Main" },
  { id: "T6", seats: 4, zone: "Main" },
  { id: "T7", seats: 4, zone: "Main", combinesWith: ["T8"] },
  { id: "T8", seats: 4, zone: "Main", combinesWith: ["T7"] },
  { id: "T9", seats: 6, zone: "Booth" },
  { id: "T10", seats: 6, zone: "Booth" },
];

export const TOTAL_SEATS = TABLES.reduce((n, t) => n + t.seats, 0); // 36
export const LARGEST_TABLE = Math.max(...TABLES.map((t) => t.seats)); // 6
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
  largePartyPhone: "+44 161 496 0137",
};
