import { scoreHotel } from "./credibility";
import { destinationById, originById } from "./data";
import { addDays, haversineKm, roadKm } from "./geo";
import { CAB_MAX_KM, bestOption, cheapestSafe, transportOptions } from "./transport";
import type {
  Attraction,
  CostBreakdown,
  DayPlan,
  Destination,
  Hotel,
  Interest,
  LatLng,
  Place,
  Trip,
  TripInput,
} from "./types";

export const FOOD_PER_PERSON_PER_DAY = 900;
export const SAFETY_RESERVE_PCT = 0.08;

export function interestScore(a: Attraction, interests: Interest[]): number {
  if (!interests.length) return 1;
  return a.tags.filter((t) => interests.includes(t)).length;
}

/** Hotels the planner is allowed to book, most credible first. */
export function bookableHotels(dest: Destination): Hotel[] {
  return dest.hotels
    .map((h) => ({ h, r: scoreHotel(h) }))
    .filter(({ r }) => r.verdict === "trusted" || r.verdict === "caution")
    .sort((x, y) => y.r.score - x.r.score)
    .map(({ h }) => h);
}

/**
 * Groups attractions into days with a nearest-neighbour walk from the hotel,
 * so each day covers places that are close to each other.
 */
export function buildDays(
  pool: Attraction[],
  interests: Interest[],
  hotel: LatLng,
  dayNumbers: number[],
  startDate: string,
  destinationId: string,
  totalDays: number,
): DayPlan[] {
  const remaining = [...pool].sort((x, y) => interestScore(y, interests) - interestScore(x, interests));
  return dayNumbers.map((day) => {
    const isEdge = day === 1 || day === totalDays;
    const budgetHrs = totalDays === 1 ? 5 : isEdge ? 3.5 : 7.5;
    const stops: DayPlan["stops"] = [];
    let used = 0;
    let here = hotel;
    while (remaining.length) {
      let bestIdx = -1;
      let bestVal = Infinity;
      remaining.forEach((a, i) => {
        const travel = haversineKm(here, a.coords) / 25;
        if (used + a.hours + travel > budgetHrs) return;
        const val = (haversineKm(here, a.coords) + 2) / (1 + 2 * interestScore(a, interests));
        if (val < bestVal) {
          bestVal = val;
          bestIdx = i;
        }
      });
      if (bestIdx < 0) break;
      const [next] = remaining.splice(bestIdx, 1);
      used += next.hours + haversineKm(here, next.coords) / 25;
      here = next.coords;
      stops.push({ attraction: next });
    }
    return {
      day,
      date: addDays(startDate, day - 1),
      destinationId,
      stops,
      notes: day === 1 ? ["Arrival & check-in"] : day === totalDays ? ["Check-out & departure"] : [],
    };
  });
}

/** Scenic places that sit roughly on the line between origin and destination. */
export function scenicStops(origin: Place, dest: Destination): Attraction[] {
  const direct = haversineKm(origin.coords, dest.coords);
  if (roadKm(origin.coords, dest.coords) >= CAB_MAX_KM) return [];
  return dest.enRoute
    .filter((a) => haversineKm(origin.coords, a.coords) + haversineKm(a.coords, dest.coords) <= direct * 1.08 + 20)
    .sort((x, y) => haversineKm(origin.coords, x.coords) - haversineKm(origin.coords, y.coords));
}

export function computeCost(trip: Trip): CostBreakdown {
  const dest = destinationById(trip.destinationId);
  const hotel = findHotel(trip.hotelId);
  const guide = trip.guideId ? dest.guides.find((g) => g.id === trip.guideId) : undefined;
  const t = trip.input.travellers;
  const activeStops = trip.days.flatMap((d) => (d.cancelled ? [] : d.stops.filter((s) => !s.cancelled)));
  const enRoute = trip.outbound.mode === "cab" ? trip.enRoute : [];
  const transport = trip.outbound.totalPrice + trip.inbound.totalPrice;
  const stay = hotel.pricePerNight * trip.nights * trip.rooms;
  const guideCost = guide ? guide.perDay * trip.days.filter((d) => !d.cancelled && d.stops.length).length : 0;
  const entryFees = [...activeStops.map((s) => s.attraction), ...enRoute].reduce((s, a) => s + a.entryFee * t, 0);
  const localTransport = dest.localTransportPerDay * trip.input.days;
  const food = FOOD_PER_PERSON_PER_DAY * t * trip.input.days;
  const subtotal = transport + stay + guideCost + entryFees + localTransport + food;
  const safetyReserve = Math.round(subtotal * SAFETY_RESERVE_PCT);
  return {
    transport,
    stay,
    guide: guideCost,
    entryFees,
    localTransport,
    food,
    safetyReserve,
    total: subtotal + safetyReserve,
  };
}

export function findHotel(id: string): Hotel {
  const destId = id.split("-h")[0];
  return destinationById(destId).hotels.find((h) => h.id === id)!;
}

export function initialLedger(cost: CostBreakdown) {
  return [
    { label: "Transport tickets (both ways)", amount: cost.transport },
    { label: "Hotel booking", amount: cost.stay },
    ...(cost.guide ? [{ label: "Tourist guide", amount: cost.guide }] : []),
    { label: "Entry fees", amount: cost.entryFees },
    { label: "Local transport", amount: cost.localTransport },
    { label: "Food allowance", amount: cost.food },
    { label: "Safety reserve (held for emergencies)", amount: cost.safetyReserve },
  ];
}

export function planTrip(input: TripInput): Trip {
  const dest = destinationById(input.destinationId);
  const origin = originById(input.originId);
  const days = Math.max(1, Math.min(14, input.days));
  const nights = Math.max(1, days - 1);
  const rooms = Math.ceil(input.travellers / 2);
  const returnDate = addDays(input.startDate, days - 1);
  const warnings: string[] = [];

  const outOpts = transportOptions(origin, dest, input.startDate, input.travellers, true);
  const inOpts = transportOptions(origin, dest, returnDate, input.travellers, false);
  const hotels = bookableHotels(dest);
  const guide = input.withGuide
    ? [...dest.guides].filter((g) => g.licensed).sort((x, y) => y.rating - x.rating)[0]
    : undefined;

  const build = (hotel: Hotel, outbound = bestOption(outOpts, input.travellers), inbound = bestOption(inOpts, input.travellers), withGuide = !!guide): Trip => {
    const dayPlans = buildDays(
      dest.attractions,
      input.interests,
      hotel.coords,
      Array.from({ length: days }, (_, i) => i + 1),
      input.startDate,
      dest.id,
      days,
    );
    const trip: Trip = {
      id: `trip-${Date.now().toString(36)}`,
      input: { ...input, days },
      origin,
      destinationId: dest.id,
      hotelId: hotel.id,
      guideId: withGuide ? guide?.id : undefined,
      outbound,
      inbound,
      enRoute: scenicStops(origin, dest),
      days: dayPlans,
      nights,
      rooms,
      cost: {} as CostBreakdown,
      ledger: [],
      warnings: [],
      status: "planned",
      currentDay: 0,
    };
    trip.cost = computeCost(trip);
    return trip;
  };

  // Try the best plan first, then progressively cheaper credible configurations.
  const attempts: (() => Trip)[] = [
    () => build(hotels[0]),
    ...[...hotels].sort((x, y) => x.pricePerNight - y.pricePerNight).map((h) => () => build(h)),
    ...[...hotels].sort((x, y) => x.pricePerNight - y.pricePerNight).map((h) => () => build(h, cheapestSafe(outOpts), cheapestSafe(inOpts))),
    ...[...hotels].sort((x, y) => x.pricePerNight - y.pricePerNight).map((h) => () => build(h, cheapestSafe(outOpts), cheapestSafe(inOpts), false)),
  ];
  let trip = attempts[0]();
  if (trip.cost.total > input.budget) {
    const fit = attempts.slice(1).map((f) => f()).find((t) => t.cost.total <= input.budget);
    if (fit) {
      trip = fit;
      if (input.withGuide && !fit.guideId) warnings.push("Guide dropped to stay within budget.");
      warnings.push("Adjusted hotel/transport to fit your budget — only credible hotels and safe tickets were considered.");
    } else {
      trip = attempts.map((f) => f()).reduce((m, t) => (t.cost.total < m.cost.total ? t : m));
      warnings.push(
        `Even the leanest safe plan costs ₹${trip.cost.total.toLocaleString("en-IN")}, above your ₹${input.budget.toLocaleString("en-IN")} budget. Try fewer days or a closer destination.`,
      );
    }
  }
  const skipped = dest.hotels.length - hotels.length;
  if (skipped) warnings.push(`${skipped} hotel(s) excluded for failing the credibility check.`);
  trip.warnings = warnings;
  trip.ledger = initialLedger(trip.cost);
  return trip;
}
