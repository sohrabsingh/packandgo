/**
 * Integration seams for live data. The MVP runs entirely on lib/data.ts and the simulated
 * alert feed; implement these against real services to go live. Keep API keys server-side
 * (Next.js route handlers in app/api/*), never in client components.
 */
import type { Destination, HotelEvidence, SafetyAlert, TransportOption, TripInput } from "./types";

export interface HazardFeed {
  /** e.g. NDMA SACHET CAP alerts, IMD warnings, GDACS, USGS earthquakes, curated news. */
  activeAlerts(near: [number, number], radiusKm: number): Promise<SafetyAlert[]>;
}

export interface HotelReputationSource {
  /** Pull ratings/reviews from each platform plus tourism-board registration. */
  evidence(hotelName: string, city: string): Promise<HotelEvidence>;
}

export interface TicketInventory {
  /** Rail (IRCTC partner), bus (redBus / state RTCs), flights (GDS / aggregator). */
  search(fromCity: string, to: Destination, date: string, travellers: number): Promise<TransportOption[]>;
  book(option: TransportOption): Promise<{ pnr: string }>;
  cancel(pnr: string): Promise<{ refund: number }>;
}

export interface ItineraryAI {
  /** Optional LLM pass to personalise descriptions and order stops; the planner stays the source of truth for prices. */
  refine(input: TripInput, draft: unknown): Promise<unknown>;
}
