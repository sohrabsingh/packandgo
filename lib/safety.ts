/**
 * On-the-spot disaster protocol. Every function takes a trip and returns a NEW trip plus a
 * human-readable list of what changed, so the UI can show and undo-proof each decision.
 */
import { DESTINATIONS, destinationById } from "./data";
import { addDays, haversineKm } from "./geo";
import { bookableHotels, buildDays, computeCost, findHotel, interestScore, planTrip, initialLedger } from "./planner";
import { bestOption, transportOptions } from "./transport";
import type { Attraction, Destination, HazardType, LatLng, SafetyAlert, Severity, Trip } from "./types";

export const HAZARDS: Record<HazardType, { label: string; icon: string; radiusKm: number }> = {
  riot: { label: "Riot / civil unrest", icon: "🔥", radiusKm: 3 },
  curfew: { label: "Curfew", icon: "🚫", radiusKm: 6 },
  strike: { label: "Bandh / transport strike", icon: "✋", radiusKm: 15 },
  flood: { label: "Flash flood", icon: "🌊", radiusKm: 8 },
  landslide: { label: "Landslide / road block", icon: "⛰️", radiusKm: 4 },
  earthquake: { label: "Earthquake", icon: "📳", radiusKm: 40 },
  cyclone: { label: "Cyclone", icon: "🌀", radiusKm: 60 },
  wildfire: { label: "Forest fire", icon: "🌲", radiusKm: 6 },
};

export const SEVERITY_STYLE: Record<Severity, string> = {
  advisory: "badge-info",
  warning: "badge-warning",
  severe: "badge-error",
};

export type Change = { kind: "info" | "reroute" | "refund" | "charge" | "danger"; text: string };

const clone = (t: Trip): Trip => structuredClone(t);
const actionable = (a: SafetyAlert) => a.severity !== "advisory";
export const covers = (a: SafetyAlert, p: LatLng) => haversineKm(a.coords, p) <= a.radiusKm;
const hitBy = (alerts: SafetyAlert[], p: LatLng) => alerts.find((a) => actionable(a) && covers(a, p));

/** First day that can still be changed. */
const firstOpenDay = (t: Trip) => Math.max(1, t.currentDay);

export interface Assessment {
  level: "safe" | "caution" | "danger";
  affectedStops: { day: number; attraction: Attraction; alert: SafetyAlert }[];
  hotelAlert?: SafetyAlert;
  destinationUnsafe: boolean;
  advisories: SafetyAlert[];
}

export function assessTrip(trip: Trip, alerts: SafetyAlert[]): Assessment {
  const open = firstOpenDay(trip);
  const affectedStops: Assessment["affectedStops"] = [];
  for (const d of trip.days) {
    if (d.day < open || d.cancelled) continue;
    for (const s of d.stops) {
      if (s.cancelled) continue;
      const al = hitBy(alerts, s.attraction.coords);
      if (al) affectedStops.push({ day: d.day, attraction: s.attraction, alert: al });
    }
  }
  const hotel = findHotel(trip.hotelId);
  const hotelAlert = hitBy(alerts, hotel.coords);
  const dest = destinationById(trip.destinationId);
  const destinationUnsafe =
    !!alerts.find((a) => a.severity === "severe" && (covers(a, hotel.coords) || covers(a, dest.coords)));
  const advisories = alerts.filter(
    (a) => a.severity === "advisory" && haversineKm(a.coords, dest.coords) <= a.radiusKm + 25,
  );
  const level = destinationUnsafe ? "danger" : affectedStops.length || hotelAlert ? "caution" : advisories.length ? "caution" : "safe";
  return { level, affectedStops, hotelAlert, destinationUnsafe, advisories };
}

/**
 * Automatic reroute: swaps unsafe stops for safe unused attractions with similar interests,
 * moves the group to a safe credible hotel if theirs is in the danger zone, and refunds
 * entry fees for anything dropped. Never shortens the trip on its own.
 */
export function autoReroute(trip: Trip, alerts: SafetyAlert[]): { trip: Trip; changes: Change[] } {
  const t = clone(trip);
  const changes: Change[] = [];
  const dest = destinationById(t.destinationId);
  const open = firstOpenDay(t);
  const travellers = t.input.travellers;

  // 1. Hotel
  const hotel = findHotel(t.hotelId);
  const hotelAlert = hitBy(alerts, hotel.coords);
  if (hotelAlert) {
    const alt = bookableHotels(dest).find((h) => h.id !== hotel.id && !hitBy(alerts, h.coords));
    if (alt) {
      const nightsLeft = Math.max(0, t.nights - (open - 1));
      const refund = nightsLeft * hotel.pricePerNight * t.rooms * (hotel.freeCancellation ? 1 : 0.8);
      const charge = nightsLeft * alt.pricePerNight * t.rooms;
      t.hotelId = alt.id;
      t.ledger.push({ label: `Refund: ${hotel.name} (${nightsLeft} nights, disaster cancellation)`, amount: -Math.round(refund) });
      t.ledger.push({ label: `Booked: ${alt.name} (${nightsLeft} nights)`, amount: charge });
      changes.push({ kind: "reroute", text: `Moved you from ${hotel.name} to ${alt.name} — outside the ${HAZARDS[hotelAlert.type].label.toLowerCase()} zone.` });
    } else {
      changes.push({ kind: "danger", text: `No credible hotel in ${dest.name} is outside the danger zone.` });
    }
  }
  const base = findHotel(t.hotelId).coords;

  // 2. Stops
  const used = new Set(t.days.flatMap((d) => d.stops.filter((s) => !s.cancelled).map((s) => s.attraction.id)));
  const pool = dest.attractions.filter((a) => !used.has(a.id) && !hitBy(alerts, a.coords));
  for (const d of t.days) {
    if (d.day < open || d.cancelled || d.destinationId !== dest.id) continue;
    let freedHrs = 0;
    for (const s of d.stops) {
      if (s.cancelled) continue;
      const al = hitBy(alerts, s.attraction.coords);
      if (!al) continue;
      s.cancelled = true;
      s.reason = `${HAZARDS[al.type].icon} ${al.title}`;
      freedHrs += s.attraction.hours;
      if (s.attraction.entryFee) {
        t.ledger.push({ label: `Refund: ${s.attraction.name} tickets`, amount: -s.attraction.entryFee * travellers });
      }
      changes.push({ kind: "reroute", text: `Day ${d.day}: dropped ${s.attraction.name} (${HAZARDS[al.type].label.toLowerCase()}).` });
    }
    if (!freedHrs) continue;
    d.rerouted = true;
    pool.sort(
      (x, y) =>
        interestScore(y, t.input.interests) - interestScore(x, t.input.interests) ||
        haversineKm(base, x.coords) - haversineKm(base, y.coords),
    );
    while (freedHrs > 0.5 && pool.length) {
      const idx = pool.findIndex((a) => a.hours <= freedHrs + 0.5);
      if (idx < 0) break;
      const [rep] = pool.splice(idx, 1);
      freedHrs -= rep.hours;
      d.stops.push({ attraction: rep, replacement: true });
      if (rep.entryFee) t.ledger.push({ label: `Booked: ${rep.name} tickets`, amount: rep.entryFee * travellers });
      changes.push({ kind: "reroute", text: `Day ${d.day}: added ${rep.name} instead (safe area).` });
    }
    if (!d.stops.some((s) => !s.cancelled)) {
      d.notes.push("Safe free day — stay near the hotel, follow local advisories.");
    }
  }

  const a = assessTrip(t, alerts);
  if (a.destinationUnsafe) {
    changes.push({
      kind: "danger",
      text: `${dest.name} is under a severe alert. Choose: return home now, or continue the trip somewhere safe.`,
    });
  }
  if (!changes.length && a.advisories.length) {
    changes.push({ kind: "info", text: "Advisory only — your plan is unchanged, but stay alert." });
  }
  t.cost = computeCost(t);
  return { trip: t, changes };
}

/** Safe destinations to continue the trip in, nearest first. */
export function relocationOptions(trip: Trip, alerts: SafetyAlert[]): { dest: Destination; km: number }[] {
  const here = destinationById(trip.destinationId);
  return DESTINATIONS.filter(
    (d) =>
      d.id !== here.id &&
      !alerts.some((a) => a.severity !== "advisory" && haversineKm(a.coords, d.coords) <= a.radiusKm + 20) &&
      bookableHotels(d).length,
  )
    .map((d) => ({ dest: d, km: Math.round(haversineKm(here.coords, d.coords)) }))
    .sort((x, y) => x.km - y.km)
    .slice(0, 3);
}

function releaseFromDay(t: Trip, fromDay: number, changes: Change[], reason: string) {
  const dest = destinationById(t.destinationId);
  const hotel = findHotel(t.hotelId);
  const travellers = t.input.travellers;
  const guide = t.guideId ? dest.guides.find((g) => g.id === t.guideId) : undefined;
  let entryRefund = 0;
  let guideDays = 0;
  for (const d of t.days) {
    if (d.day < fromDay || d.cancelled) continue;
    for (const s of d.stops) {
      if (s.cancelled) continue;
      s.cancelled = true;
      s.reason = reason;
      entryRefund += s.attraction.entryFee * travellers;
    }
    if (d.stops.length) guideDays++;
    d.cancelled = true;
  }
  if (entryRefund) t.ledger.push({ label: "Refund: unused entry tickets", amount: -entryRefund });
  if (guide && guideDays) {
    t.ledger.push({ label: `Refund: guide ${guide.name} (${guideDays} days)`, amount: -guide.perDay * guideDays });
  }
  const unusedNights = Math.max(0, t.nights - (fromDay - 1));
  if (unusedNights) {
    const chargeable = hotel.freeCancellation ? 0 : 1;
    const refund = (unusedNights - Math.min(chargeable, unusedNights)) * hotel.pricePerNight * t.rooms;
    t.ledger.push({ label: `Refund: ${hotel.name} (${unusedNights} unused nights${chargeable ? ", 1 night retained" : ""})`, amount: -refund });
    changes.push({ kind: "refund", text: `${hotel.name}: ${unusedNights} unused night(s) cancelled.` });
  }
  const unusedDays = t.input.days - fromDay + 1;
  const allowance = (dest.localTransportPerDay + 900 * travellers) * unusedDays;
  t.ledger.push({ label: `Released: food & local transport (${unusedDays} days)`, amount: -allowance });
}

/** Cancel everything after today, refund what can be refunded and book the safest ticket home today. */
export function returnNow(trip: Trip, alerts: SafetyAlert[]): { trip: Trip; changes: Change[] } {
  if (trip.currentDay === 0) return cancelTrip(trip);
  const t = clone(trip);
  const changes: Change[] = [];
  const dest = destinationById(t.destinationId);
  const today = t.currentDay;
  const date = addDays(t.input.startDate, today - 1);

  releaseFromDay(t, today, changes, "Trip ended early for your safety");
  const oldIn = t.inbound;
  t.ledger.push({
    label: `Refund: original return ${oldIn.operator} (−${oldIn.cancellationFeePct}% fee)`,
    amount: -Math.round(oldIn.totalPrice * (1 - oldIn.cancellationFeePct / 100)),
  });
  const opts = transportOptions(t.origin, dest, date, t.input.travellers, false)
    .filter((o) => o.mode !== "cab" || !alerts.some((a) => a.type === "landslide" || a.type === "flood"));
  const ticket = bestOption(opts, t.input.travellers);
  const surge = Math.round(ticket.totalPrice * 1.15);
  t.inbound = { ...ticket, totalPrice: surge, depart: "Next available" };
  t.ledger.push({ label: `Booked: emergency return ${ticket.operator} (${date})`, amount: surge });
  changes.push({ kind: "charge", text: `Booked ${ticket.operator} home today (${date}), safety score ${ticket.safetyScore}.` });
  t.status = "returning";
  t.days.forEach((d) => {
    if (d.day === today) d.notes.push("Departing early — emergency return booked.");
  });
  return { trip: t, changes };
}

/** Keep the trip going: move the remaining days to a safe destination instead of going home. */
export function relocate(trip: Trip, alerts: SafetyAlert[], newDestId: string): { trip: Trip; changes: Change[] } {
  const newDest = destinationById(newDestId);
  const changes: Change[] = [];

  if (trip.currentDay === 0) {
    const cancelled = cancelTrip(trip);
    const fresh = planTrip({ ...trip.input, destinationId: newDestId });
    fresh.ledger = [...cancelled.trip.ledger, ...initialLedger(fresh.cost).map((e) => ({ ...e, label: `${newDest.name}: ${e.label}` }))];
    fresh.warnings = [...fresh.warnings, `Rerouted from ${destinationById(trip.destinationId).name} before departure due to safety alerts.`];
    changes.push(...cancelled.changes, { kind: "reroute", text: `Re-planned the whole trip for ${newDest.name} with the same dates and budget.` });
    return { trip: fresh, changes };
  }

  const t = clone(trip);
  const oldDest = destinationById(t.destinationId);
  const today = t.currentDay;
  const remainingDays = t.input.days - today;
  if (remainingDays < 1) return returnNow(trip, alerts);
  const date = addDays(t.input.startDate, today - 1);

  releaseFromDay(t, today, changes, `Moved to ${newDest.name} for safety`);
  // Re-open the allowance for the days we will still travel.
  t.ledger.push({
    label: `${newDest.name}: food & local transport (${remainingDays + 1} days)`,
    amount: (newDest.localTransportPerDay + 900 * t.input.travellers) * (remainingDays + 1),
  });

  const transfer = bestOption(transportOptions({ name: oldDest.name, coords: oldDest.coords }, newDest, date, t.input.travellers, true), t.input.travellers);
  t.ledger.push({ label: `Booked: transfer ${oldDest.name} → ${newDest.name} (${transfer.operator})`, amount: transfer.totalPrice });

  const oldIn = t.inbound;
  t.ledger.push({
    label: `Refund: original return ${oldIn.operator} (−${oldIn.cancellationFeePct}% fee)`,
    amount: -Math.round(oldIn.totalPrice * (1 - oldIn.cancellationFeePct / 100)),
  });
  const lastDate = addDays(t.input.startDate, t.input.days - 1);
  t.inbound = bestOption(transportOptions(t.origin, newDest, lastDate, t.input.travellers, false), t.input.travellers);
  t.ledger.push({ label: `Booked: return ${newDest.name} → ${t.origin.name}`, amount: t.inbound.totalPrice });

  // Closest in price to what the traveller originally chose, among credible hotels outside danger zones.
  const oldPrice = findHotel(t.hotelId).pricePerNight;
  const credible = bookableHotels(newDest);
  const hotel =
    credible
      .filter((h) => !hitBy(alerts, h.coords))
      .sort((x, y) => Math.abs(x.pricePerNight - oldPrice) - Math.abs(y.pricePerNight - oldPrice))[0] ?? credible[0];
  const nights = remainingDays;
  t.ledger.push({ label: `Booked: ${hotel.name} (${nights} nights)`, amount: hotel.pricePerNight * nights * t.rooms });
  t.hotelId = hotel.id;

  let guideNote = "";
  if (t.guideId) {
    const g = newDest.guides.filter((x) => x.licensed).sort((x, y) => y.rating - x.rating)[0];
    t.guideId = g.id;
    t.ledger.push({ label: `Booked: guide ${g.name} (${remainingDays} days)`, amount: g.perDay * remainingDays });
    guideNote = ` with guide ${g.name}`;
  }

  const newDays = buildDays(
    newDest.attractions.filter((a) => !hitBy(alerts, a.coords)),
    t.input.interests,
    hotel.coords,
    Array.from({ length: remainingDays }, (_, i) => today + 1 + i),
    t.input.startDate,
    newDest.id,
    t.input.days,
  );
  const fees = newDays.flatMap((d) => d.stops).reduce((s, x) => s + x.attraction.entryFee * t.input.travellers, 0);
  if (fees) t.ledger.push({ label: `${newDest.name}: entry fees`, amount: fees });
  newDays.forEach((d) => (d.rerouted = true));

  const todayPlan = t.days.find((d) => d.day === today)!;
  todayPlan.cancelled = false;
  todayPlan.notes = todayPlan.notes.filter((n) => !n.startsWith("Safe free day"));
  todayPlan.notes.push(`Transfer to ${newDest.name} by ${transfer.operator} (~${transfer.durationHrs} h).`);
  t.days = [...t.days.filter((d) => d.day <= today), ...newDays];
  t.destinationId = newDest.id;
  t.status = "active";
  t.cost = computeCost(t);
  changes.push({
    kind: "reroute",
    text: `Continuing your last ${remainingDays} day(s) in ${newDest.name} — staying at ${hotel.name}${guideNote}.`,
  });
  return { trip: t, changes };
}

export function cancelStop(trip: Trip, day: number, attractionId: string): { trip: Trip; changes: Change[] } {
  const t = clone(trip);
  const d = t.days.find((x) => x.day === day)!;
  const s = d.stops.find((x) => x.attraction.id === attractionId && !x.cancelled);
  if (!s) return { trip, changes: [] };
  s.cancelled = true;
  s.reason = "Cancelled by you";
  if (s.attraction.entryFee) {
    t.ledger.push({ label: `Refund: ${s.attraction.name} tickets`, amount: -s.attraction.entryFee * t.input.travellers });
  }
  t.cost = computeCost(t);
  return { trip: t, changes: [{ kind: "refund", text: `Removed ${s.attraction.name} from day ${day}.` }] };
}

export function cancelDay(trip: Trip, day: number): { trip: Trip; changes: Change[] } {
  const t = clone(trip);
  const d = t.days.find((x) => x.day === day)!;
  const dest = destinationById(d.destinationId);
  const fees = d.stops.filter((s) => !s.cancelled).reduce((s, x) => s + x.attraction.entryFee * t.input.travellers, 0);
  const hadStops = d.stops.some((s) => !s.cancelled);
  d.stops.forEach((s) => {
    if (!s.cancelled) {
      s.cancelled = true;
      s.reason = "Day cancelled by you";
    }
  });
  d.cancelled = true;
  d.notes.push("Free day — route cancelled. Hotel stay kept.");
  if (fees) t.ledger.push({ label: `Refund: day ${day} entry tickets`, amount: -fees });
  const guide = t.guideId ? dest.guides.find((g) => g.id === t.guideId) : undefined;
  if (guide && hadStops) t.ledger.push({ label: `Refund: guide for day ${day}`, amount: -guide.perDay });
  t.cost = computeCost(t);
  return { trip: t, changes: [{ kind: "refund", text: `Day ${day} route cancelled; tickets${guide ? " and guide" : ""} refunded.` }] };
}

/** Cancel the whole trip. Before departure everything is refunded per policy; during it, it's a return home. */
export function cancelTrip(trip: Trip): { trip: Trip; changes: Change[] } {
  if (trip.currentDay > 0) return returnNow(trip, []);
  const t = clone(trip);
  const changes: Change[] = [];
  for (const leg of [t.outbound, t.inbound]) {
    const refund = Math.round(leg.totalPrice * (1 - leg.cancellationFeePct / 100));
    t.ledger.push({ label: `Refund: ${leg.operator} (−${leg.cancellationFeePct}% fee)`, amount: -refund });
  }
  releaseFromDay(t, 1, changes, "Trip cancelled");
  t.ledger.push({ label: "Released: safety reserve", amount: -t.cost.safetyReserve });
  t.status = "cancelled";
  changes.push({ kind: "refund", text: "Trip cancelled. Refunds issued per each provider's policy." });
  return { trip: t, changes };
}

/** Demo helper: drops a hazard near an upcoming stop (or on the hotel for severe alerts). */
export function simulateAlert(trip: Trip, type: HazardType, severity: Severity): SafetyAlert {
  const open = firstOpenDay(trip);
  const upcoming = trip.days
    .filter((d) => d.day >= open && !d.cancelled && d.destinationId === trip.destinationId)
    .flatMap((d) => d.stops.filter((s) => !s.cancelled).map((s) => s.attraction));
  const hotel = findHotel(trip.hotelId);
  const target =
    severity === "severe" || !upcoming.length
      ? hotel.coords
      : upcoming[Math.floor(Math.random() * upcoming.length)].coords;
  const jitter = () => (Math.random() - 0.5) * 0.01;
  const dest = destinationById(trip.destinationId);
  return {
    id: `al-${Date.now().toString(36)}`,
    type,
    severity,
    title: `${HAZARDS[type].label} reported near ${dest.name}`,
    coords: [target[0] + jitter(), target[1] + jitter()],
    radiusKm: HAZARDS[type].radiusKm,
    source: "Simulated feed (demo)",
    issuedAt: new Date().toISOString(),
  };
}

export function ledgerTotal(trip: Trip) {
  return trip.ledger.reduce((s, e) => s + e.amount, 0);
}
