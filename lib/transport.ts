import { haversineKm, roadKm } from "./geo";
import type { Destination, Place, TransportOption } from "./types";

/** Minimum safety score for an option to be auto-selected. */
export const SAFE_THRESHOLD = 75;
/** Longest journey we offer a road-trip cab for. */
export const CAB_MAX_KM = 1400;

const round50 = (n: number) => Math.round(n / 50) * 50;

/**
 * Generates bookable options between a place and a destination.
 * `toDest` = travelling towards the destination; otherwise leaving it for `place`.
 * Prices are estimates; swap this for real inventory APIs (IRCTC, redBus, airline GDS).
 */
export function transportOptions(
  place: Place,
  dest: Destination,
  date: string,
  travellers: number,
  toDest: boolean,
): TransportOption[] {
  const km = roadKm(place.coords, dest.coords);
  const straight = haversineKm(place.coords, dest.coords);
  const from = toDest ? place.name : dest.name;
  const to = toDest ? dest.name : place.name;
  const hills = dest.terrain === "hills";
  const opts: TransportOption[] = [];
  const id = (s: string) => `${toDest ? "out" : "in"}-${s}-${date}`;

  if (km < 1600) {
    opts.push({
      id: id("bus-state"),
      mode: "bus",
      operator: "State Transport Volvo AC",
      travelClass: "AC Seater",
      from,
      to,
      date,
      depart: "18:00",
      durationHrs: +(km / 45).toFixed(1),
      totalPrice: round50(Math.max(500, km * 2.1) * travellers),
      safetyScore: 86,
      safetyNotes: ["Government operator", "GPS tracked", "Two drivers on long routes"],
      cancellationFeePct: 15,
    });
    opts.push({
      id: id("bus-private"),
      mode: "bus",
      operator: "Private Sleeper Coach",
      travelClass: "Non-AC Sleeper",
      from,
      to,
      date,
      depart: "22:30",
      durationHrs: +(km / 42).toFixed(1),
      totalPrice: round50(Math.max(400, km * 1.4) * travellers),
      safetyScore: hills ? 62 : 70,
      safetyNotes: [
        "Unverified operator record",
        ...(hills ? ["Late-night driving on mountain roads"] : ["Overnight departure"]),
      ],
      cancellationFeePct: 25,
    });
  }

  if (dest.railhead && straight > 150) {
    const rh = dest.railhead;
    opts.push({
      id: id("train-3ac"),
      mode: "train",
      operator: `Indian Railways → ${rh.name}`,
      travelClass: "3AC",
      from,
      to,
      date,
      depart: "07:15",
      durationHrs: +(km / 55 + rh.transferHrs).toFixed(1),
      totalPrice: round50(km * 1.35 * travellers + rh.transferCost),
      safetyScore: 92,
      safetyNotes: ["Reserved berths", "RPF coverage", `Includes transfer from ${rh.name}`],
      cancellationFeePct: 25,
    });
    opts.push({
      id: id("train-sl"),
      mode: "train",
      operator: `Indian Railways → ${rh.name}`,
      travelClass: "Sleeper",
      from,
      to,
      date,
      depart: "21:40",
      durationHrs: +(km / 50 + rh.transferHrs).toFixed(1),
      totalPrice: round50(km * 0.55 * travellers + rh.transferCost),
      safetyScore: 80,
      safetyNotes: ["Crowded on peak dates", `Includes transfer from ${rh.name}`],
      cancellationFeePct: 25,
    });
  }

  if (dest.airport && straight > 350) {
    const ap = dest.airport;
    opts.push({
      id: id("flight"),
      mode: "flight",
      operator: `Economy flight → ${ap.name}`,
      travelClass: "Economy",
      from,
      to,
      date,
      depart: "09:40",
      durationHrs: +(1 + straight / 700 + ap.transferHrs).toFixed(1),
      totalPrice: round50((2800 + straight * 3.2) * travellers + ap.transferCost),
      safetyScore: 96,
      safetyNotes: ["Fastest option", `Includes transfer from ${ap.name}`],
      cancellationFeePct: 40,
    });
  }

  if (km < CAB_MAX_KM) {
    const vehicles = Math.ceil(travellers / 4);
    opts.push({
      id: id("cab"),
      mode: "cab",
      operator: "Verified road-trip cab (driver ID-checked)",
      travelClass: vehicles > 1 ? `${vehicles} sedans` : "Sedan",
      from,
      to,
      date,
      depart: "06:00",
      durationHrs: +(km / 40).toFixed(1),
      totalPrice: round50((km * 14 + Math.ceil(km / 400) * 400) * vehicles),
      safetyScore: hills ? 80 : 84,
      safetyNotes: ["Stops at scenic places on the way", "Daylight driving", "Live location sharing"],
      cancellationFeePct: 10,
    });
  }

  return opts.sort((x, y) => x.totalPrice - y.totalPrice);
}

/** Balanced pick: safe options only, trading money against hours on the road. */
export function bestOption(opts: TransportOption[], travellers: number): TransportOption {
  const safe = opts.filter((o) => o.safetyScore >= SAFE_THRESHOLD);
  const pool = safe.length ? safe : opts;
  return pool.reduce((best, o) => {
    const cost = (x: TransportOption) => x.totalPrice + x.durationHrs * 200 * travellers;
    return cost(o) < cost(best) ? o : best;
  });
}

export function cheapestSafe(opts: TransportOption[]): TransportOption {
  const safe = opts.filter((o) => o.safetyScore >= SAFE_THRESHOLD);
  return (safe.length ? safe : opts).reduce((m, o) => (o.totalPrice < m.totalPrice ? o : m));
}

export const MODE_ICON: Record<TransportOption["mode"], string> = {
  bus: "🚌",
  train: "🚆",
  flight: "✈️",
  cab: "🚗",
};
