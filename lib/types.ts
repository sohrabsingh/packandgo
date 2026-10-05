export type LatLng = [number, number];

export type Interest =
  | "culture"
  | "nature"
  | "adventure"
  | "food"
  | "spiritual"
  | "beach"
  | "nightlife";

export interface Place {
  name: string;
  coords: LatLng;
}

export interface Attraction {
  id: string;
  name: string;
  coords: LatLng;
  tags: Interest[];
  entryFee: number; // per person, INR
  hours: number; // typical time spent
  description: string;
}

export interface Review {
  rating: number; // 1-5
  text: string;
  daysAgo: number;
  verifiedStay: boolean;
  source: string;
}

export interface RatingSource {
  name: string;
  rating: number;
  count: number;
}

/** Raw evidence the credibility engine scores. Anything a user can collect about a hotel. */
export interface HotelEvidence {
  sources: RatingSource[];
  reviews: Review[];
  licenseRegistered: boolean;
  complaints: number; // consumer / police / tourism-board complaints on record
  yearsOperating: number;
}

export interface Hotel extends HotelEvidence {
  id: string;
  destinationId: string;
  name: string;
  coords: LatLng;
  pricePerNight: number; // per room
  stars: number;
  freeCancellation: boolean;
  amenities: string[];
}

export interface Guide {
  id: string;
  name: string;
  languages: string[];
  perDay: number;
  rating: number;
  licensed: boolean;
}

export interface Destination {
  id: string;
  name: string;
  region: string;
  coords: LatLng;
  terrain: "hills" | "plains" | "coast";
  attractions: Attraction[];
  enRoute: Attraction[]; // scenic places that may lie on the way
  hotels: Hotel[];
  guides: Guide[];
  localTransportPerDay: number; // per group
  railhead?: { name: string; transferCost: number; transferHrs: number };
  airport?: { name: string; transferCost: number; transferHrs: number };
}

export type TransportMode = "bus" | "train" | "flight" | "cab";

export interface TransportOption {
  id: string;
  mode: TransportMode;
  operator: string;
  travelClass: string;
  from: string;
  to: string;
  date: string;
  depart: string;
  durationHrs: number;
  totalPrice: number; // for the whole group, incl. transfers
  safetyScore: number; // 0-100
  safetyNotes: string[];
  cancellationFeePct: number;
}

export interface Stop {
  attraction: Attraction;
  cancelled?: boolean;
  reason?: string;
  replacement?: boolean;
}

export interface DayPlan {
  day: number;
  date: string;
  destinationId: string;
  stops: Stop[];
  cancelled?: boolean;
  rerouted?: boolean;
  notes: string[];
}

export interface TripInput {
  originId: string;
  destinationId: string;
  startDate: string; // yyyy-mm-dd
  days: number;
  travellers: number;
  budget: number;
  interests: Interest[];
  withGuide: boolean;
}

export interface CostBreakdown {
  transport: number;
  stay: number;
  guide: number;
  entryFees: number;
  localTransport: number;
  food: number;
  safetyReserve: number;
  total: number;
}

export interface LedgerEntry {
  label: string;
  amount: number; // + charge, - refund
}

export type TripStatus = "planned" | "active" | "returning" | "cancelled";

export interface Trip {
  id: string;
  input: TripInput;
  origin: Place;
  destinationId: string;
  hotelId: string;
  guideId?: string;
  outbound: TransportOption;
  inbound: TransportOption;
  enRoute: Attraction[];
  days: DayPlan[];
  nights: number;
  rooms: number;
  cost: CostBreakdown;
  ledger: LedgerEntry[];
  warnings: string[];
  status: TripStatus;
  currentDay: number; // 0 = not started, 1..n = on that day of the trip
}

export type HazardType =
  | "riot"
  | "curfew"
  | "flood"
  | "landslide"
  | "earthquake"
  | "cyclone"
  | "wildfire"
  | "strike";

export type Severity = "advisory" | "warning" | "severe";

export interface SafetyAlert {
  id: string;
  type: HazardType;
  severity: Severity;
  title: string;
  coords: LatLng;
  radiusKm: number;
  source: string;
  issuedAt: string;
}
