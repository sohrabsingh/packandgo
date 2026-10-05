"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import CredibilityCard from "@/components/CredibilityCard";
import { DAY_COLORS } from "@/components/dayColors";
import { DESTINATIONS, ORIGINS, destinationById } from "@/lib/data";
import { addDays, haversineKm, inr } from "@/lib/geo";
import { computeCost, findHotel, initialLedger, planTrip } from "@/lib/planner";
import {
  HAZARDS,
  SEVERITY_STYLE,
  assessTrip,
  autoReroute,
  cancelDay,
  cancelStop,
  cancelTrip,
  ledgerTotal,
  relocate,
  relocationOptions,
  returnNow,
  simulateAlert,
  type Change,
} from "@/lib/safety";
import { MODE_ICON, SAFE_THRESHOLD, transportOptions } from "@/lib/transport";
import type { HazardType, Interest, LatLng, SafetyAlert, Severity, TransportOption, Trip, TripInput } from "@/lib/types";

const TripMap = dynamic(() => import("@/components/TripMap"), { ssr: false, loading: () => <MapSkeleton /> });
const PickerMap = dynamic(() => import("@/components/TripMap").then((m) => m.PickerMap), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

function MapSkeleton() {
  return <div className="skeleton h-full w-full rounded-xl" />;
}

const INTERESTS: Interest[] = ["culture", "nature", "adventure", "food", "spiritual", "beach", "nightlife"];
const STORAGE_KEY = "packandgo.trip.v1";

type LoggedChange = Change & { at: string };

export default function PlanPage() {
  const [input, setInput] = useState<TripInput>({
    originId: "delhi",
    destinationId: "manali",
    startDate: "",
    days: 4,
    travellers: 2,
    budget: 60000,
    interests: ["nature", "culture", "food"],
    withGuide: true,
  });
  const [trip, setTrip] = useState<Trip | null>(null);
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [autoProtect, setAutoProtect] = useState(true);
  const [log, setLog] = useState<LoggedChange[]>([]);
  const [pickNote, setPickNote] = useState("");
  const [focusDay, setFocusDay] = useState<number | undefined>();
  const [hazard, setHazard] = useState<HazardType>("riot");
  const [severity, setSeverity] = useState<Severity>("warning");

  // Restore a saved trip, and default the start date to two weeks out.
  useEffect(() => {
    setInput((i) => ({ ...i, startDate: i.startDate || addDays(new Date().toISOString().slice(0, 10), 14) }));
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.trip) {
        setTrip(saved.trip);
        setAlerts(saved.alerts ?? []);
        setLog(saved.log ?? []);
        setInput(saved.trip.input);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (trip) localStorage.setItem(STORAGE_KEY, JSON.stringify({ trip, alerts, log }));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, [trip, alerts, log]);

  const push = (changes: Change[]) => {
    const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setLog((l) => [...changes.map((c) => ({ ...c, at })), ...l].slice(0, 40));
  };
  const apply = (r: { trip: Trip; changes: Change[] }) => {
    setTrip(r.trip);
    push(r.changes);
  };

  const onPickLocation = (p: LatLng) => {
    const nearest = [...DESTINATIONS].sort((x, y) => haversineKm(p, x.coords) - haversineKm(p, y.coords))[0];
    const km = Math.round(haversineKm(p, nearest.coords));
    setInput((i) => ({ ...i, destinationId: nearest.id }));
    setPickNote(km > 30 ? `Nearest covered destination: ${nearest.name} (${km} km from where you clicked).` : "");
  };

  const generate = () => {
    const t = planTrip(input);
    setTrip(t);
    setAlerts([]);
    setLog([]);
    setFocusDay(undefined);
  };

  // ---------- planning-mode edits (before departure) ----------
  const repriced = (t: Trip): Trip => {
    const cost = computeCost(t);
    return { ...t, cost, ledger: initialLedger(cost) };
  };
  const editable = trip?.currentDay === 0 && trip.status === "planned" && log.length === 0;

  // ---------- safety ----------
  const addAlert = () => {
    if (!trip) return;
    const al = simulateAlert(trip, hazard, severity);
    const next = [...alerts, al];
    setAlerts(next);
    push([{ kind: "danger", text: `ALERT: ${HAZARDS[al.type].icon} ${al.title} (${al.severity}, ${al.radiusKm} km radius)` }]);
    if (autoProtect && trip.status !== "cancelled" && trip.status !== "returning") apply(autoReroute(trip, next));
  };

  const assessment = useMemo(() => (trip ? assessTrip(trip, alerts) : null), [trip, alerts]);
  const relocations = useMemo(() => (trip ? relocationOptions(trip, alerts) : []), [trip, alerts]);

  if (!trip) {
    return (
      <>
        <Navbar />
        <main className="pt-20 pb-12 px-4 max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mt-4">Plan your trip</h1>
          <p className="opacity-70 mb-6">Click the map or pick a destination. We plan the route, check every hotel and price the whole trip.</p>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body gap-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="form-control">
                    <span className="label-text text-sm mb-1">From</span>
                    <select className="select select-bordered w-full" value={input.originId} onChange={(e) => setInput({ ...input, originId: e.target.value })}>
                      {ORIGINS.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-control">
                    <span className="label-text text-sm mb-1">To</span>
                    <select className="select select-bordered w-full" value={input.destinationId} onChange={(e) => { setInput({ ...input, destinationId: e.target.value }); setPickNote(""); }}>
                      {DESTINATIONS.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}, {d.region}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-control">
                    <span className="label-text text-sm mb-1">Start date</span>
                    <input type="date" className="input input-bordered w-full" value={input.startDate} onChange={(e) => setInput({ ...input, startDate: e.target.value })} />
                  </label>
                  <label className="form-control">
                    <span className="label-text text-sm mb-1">Days</span>
                    <input type="number" min={1} max={14} className="input input-bordered w-full" value={input.days} onChange={(e) => setInput({ ...input, days: Math.max(1, Math.min(14, +e.target.value || 1)) })} />
                  </label>
                  <label className="form-control">
                    <span className="label-text text-sm mb-1">Travellers</span>
                    <input type="number" min={1} max={12} className="input input-bordered w-full" value={input.travellers} onChange={(e) => setInput({ ...input, travellers: Math.max(1, Math.min(12, +e.target.value || 1)) })} />
                  </label>
                  <label className="form-control">
                    <span className="label-text text-sm mb-1">Total budget (₹)</span>
                    <input type="number" min={1000} step={1000} className="input input-bordered w-full" value={input.budget} onChange={(e) => setInput({ ...input, budget: +e.target.value || 0 })} />
                  </label>
                </div>
                <div>
                  <span className="label-text text-sm">Interests</span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {INTERESTS.map((it) => {
                      const on = input.interests.includes(it);
                      return (
                        <button
                          key={it}
                          type="button"
                          className={`btn btn-sm capitalize ${on ? "btn-primary" : "btn-outline"}`}
                          onClick={() => setInput({ ...input, interests: on ? input.interests.filter((x) => x !== it) : [...input.interests, it] })}
                        >
                          {it}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="label cursor-pointer justify-start gap-3">
                  <input type="checkbox" className="toggle toggle-primary" checked={input.withGuide} onChange={(e) => setInput({ ...input, withGuide: e.target.checked })} />
                  <span>Include a licensed tourist guide</span>
                </label>
                {pickNote && <p className="text-sm text-info">{pickNote}</p>}
                <button className="btn btn-primary" onClick={generate} disabled={!input.startDate}>
                  Plan my trip
                </button>
              </div>
            </div>
            <div className="h-[420px] lg:h-auto min-h-[420px]">
              <PickerMap selectedId={input.destinationId} onPick={onPickLocation} />
            </div>
          </div>
        </main>
      </>
    );
  }

  const dest = destinationById(trip.destinationId);
  const hotel = findHotel(trip.hotelId);
  const guide = trip.guideId ? dest.guides.find((g) => g.id === trip.guideId) : undefined;
  const net = ledgerTotal(trip);
  const closed = trip.status === "cancelled" || trip.status === "returning";
  const levelStyle = { safe: "alert-success", caution: "alert-warning", danger: "alert-error" }[assessment!.level];

  return (
    <>
      <Navbar />
      <main className="pt-20 pb-12 px-4 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 mt-4">
          <div>
            <p className="text-sm opacity-70">
              {trip.origin.name} → {dest.name} · {trip.input.startDate} · {trip.input.days} days · {trip.input.travellers} traveller{trip.input.travellers > 1 ? "s" : ""}
            </p>
            <h1 className="text-3xl font-bold">
              Your {dest.name} trip{" "}
              {trip.status !== "planned" && (
                <span className={`badge align-middle ${trip.status === "cancelled" ? "badge-error" : trip.status === "returning" ? "badge-warning" : "badge-info"}`}>
                  {trip.status}
                </span>
              )}
            </h1>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-sm btn-outline" onClick={() => setTrip(null)}>
              New plan
            </button>
          </div>
        </div>

        <div className="stats stats-vertical sm:stats-horizontal shadow w-full bg-base-100">
          <div className="stat">
            <div className="stat-title">Estimated total</div>
            <div className="stat-value text-2xl">{inr(trip.cost.total)}</div>
            <div className={`stat-desc ${trip.cost.total > trip.input.budget ? "text-error" : "text-success"}`}>
              Budget {inr(trip.input.budget)} · {trip.cost.total > trip.input.budget ? `${inr(trip.cost.total - trip.input.budget)} over` : `${inr(trip.input.budget - trip.cost.total)} spare`}
            </div>
          </div>
          <div className="stat">
            <div className="stat-title">Net paid after changes</div>
            <div className="stat-value text-2xl">{inr(net)}</div>
            <div className="stat-desc">Includes refunds & emergency bookings</div>
          </div>
          <div className="stat">
            <div className="stat-title">Per person</div>
            <div className="stat-value text-2xl">{inr(trip.cost.total / trip.input.travellers)}</div>
            <div className="stat-desc">incl. guide, tickets, stay, food</div>
          </div>
          <div className="stat">
            <div className="stat-title">Safety</div>
            <div className={`stat-value text-2xl ${assessment!.level === "safe" ? "text-success" : assessment!.level === "caution" ? "text-warning" : "text-error"}`}>
              {assessment!.level === "safe" ? "All clear" : assessment!.level === "caution" ? "Caution" : "Danger"}
            </div>
            <div className="stat-desc">{alerts.length} active alert{alerts.length === 1 ? "" : "s"}</div>
          </div>
        </div>

        {trip.warnings.map((w) => (
          <div key={w} role="alert" className="alert alert-warning py-2 text-sm">{w}</div>
        ))}

        {assessment!.destinationUnsafe && !closed && (
          <div role="alert" className="alert alert-error flex-col items-start gap-3">
            <div>
              <h3 className="font-bold">🚨 {dest.name} is no longer safe</h3>
              <p className="text-sm">Pick what to do. Refunds are calculated automatically and the remaining budget is reused.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-sm" onClick={() => apply(returnNow(trip, alerts))}>
                {trip.currentDay === 0 ? "Cancel the trip & refund" : "Return home today (book ticket)"}
              </button>
              {relocations.map((r) => (
                <button key={r.dest.id} className="btn btn-sm btn-outline bg-base-100" onClick={() => apply(relocate(trip, alerts, r.dest.id))}>
                  Continue in {r.dest.name} ({r.km} km)
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Map */}
          <div className="lg:col-span-3 space-y-2">
            <div className="flex flex-wrap gap-1">
              <button className={`btn btn-xs ${focusDay === undefined ? "btn-neutral" : "btn-ghost"}`} onClick={() => setFocusDay(undefined)}>All days</button>
              {trip.days.map((d) => (
                <button
                  key={d.day}
                  className={`btn btn-xs ${focusDay === d.day ? "btn-neutral" : "btn-ghost"}`}
                  onClick={() => setFocusDay(d.day)}
                >
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: DAY_COLORS[(d.day - 1) % DAY_COLORS.length] }} />
                  Day {d.day}
                </button>
              ))}
            </div>
            <div className="h-[460px]">
              <TripMap trip={trip} alerts={alerts} focusDay={focusDay} />
            </div>
          </div>

          {/* Safety center */}
          <div className="lg:col-span-2 card bg-base-100 border border-base-300">
            <div className="card-body p-4 gap-3">
              <h2 className="card-title">🛡️ Safety center</h2>
              <div className={`alert ${levelStyle} py-2 text-sm`}>
                {assessment!.level === "safe"
                  ? "No hazards on your route."
                  : [
                      assessment!.affectedStops.length && `${assessment!.affectedStops.length} upcoming stop(s) inside alert zones`,
                      assessment!.hotelAlert && "Your hotel is inside an alert zone",
                      assessment!.advisories.length && `${assessment!.advisories.length} advisory nearby`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Alerts active nearby; your route has been kept clear."}
              </div>

              <label className="form-control">
                <span className="label-text text-sm mb-1">Where are you in the trip?</span>
                <select
                  className="select select-bordered select-sm"
                  value={trip.currentDay}
                  disabled={closed}
                  onChange={(e) => {
                    const d = +e.target.value;
                    setTrip({ ...trip, currentDay: d, status: d === 0 ? (trip.status === "active" ? "active" : "planned") : "active" });
                  }}
                >
                  <option value={0}>Not started yet</option>
                  {trip.days.map((d) => (
                    <option key={d.day} value={d.day} disabled={d.day < trip.currentDay}>
                      On day {d.day} ({d.date})
                    </option>
                  ))}
                </select>
              </label>

              <label className="label cursor-pointer justify-start gap-3 py-0">
                <input type="checkbox" className="toggle toggle-success toggle-sm" checked={autoProtect} onChange={(e) => setAutoProtect(e.target.checked)} />
                <span className="text-sm">Auto-reroute when an alert hits my plan</span>
              </label>

              <div className="bg-base-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold uppercase opacity-70">Test the protocol — simulate an alert</p>
                <div className="flex gap-2">
                  <select className="select select-bordered select-xs flex-1 min-w-0" value={hazard} onChange={(e) => setHazard(e.target.value as HazardType)}>
                    {Object.entries(HAZARDS).map(([k, h]) => (
                      <option key={k} value={k}>{h.icon} {h.label}</option>
                    ))}
                  </select>
                  <select className="select select-bordered select-xs w-28 shrink-0" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
                    <option value="advisory">Advisory</option>
                    <option value="warning">Warning</option>
                    <option value="severe">Severe</option>
                  </select>
                </div>
                <button className="btn btn-xs btn-warning w-full" disabled={closed} onClick={addAlert}>Trigger alert</button>
              </div>

              {alerts.length > 0 && (
                <ul className="space-y-1">
                  {alerts.map((al) => (
                    <li key={al.id} className="flex items-center gap-2 text-sm">
                      <span>{HAZARDS[al.type].icon}</span>
                      <span className="flex-1">{al.title}</span>
                      <span className={`badge badge-xs ${SEVERITY_STYLE[al.severity]}`}>{al.severity}</span>
                      <button className="btn btn-ghost btn-xs" aria-label="Dismiss alert" onClick={() => setAlerts(alerts.filter((x) => x.id !== al.id))}>✕</button>
                    </li>
                  ))}
                </ul>
              )}

              {!autoProtect && assessment!.affectedStops.length > 0 && !closed && (
                <button className="btn btn-sm btn-success" onClick={() => apply(autoReroute(trip, alerts))}>Apply safe reroute</button>
              )}

              <div className="divider my-0" />
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-sm btn-outline" disabled={closed || trip.currentDay === 0} onClick={() => apply(returnNow(trip, alerts))}>
                  Return home now
                </button>
                <button
                  className="btn btn-sm btn-outline btn-error"
                  disabled={closed}
                  onClick={() => {
                    if (confirm(trip.currentDay === 0 ? "Cancel the entire trip? Refunds follow each provider's policy." : "End the trip and return home today?")) apply(cancelTrip(trip));
                  }}
                >
                  Cancel entire trip
                </button>
              </div>
              {!closed && relocations.length > 0 && alerts.length > 0 && !assessment!.destinationUnsafe && (
                <div className="text-xs">
                  <span className="opacity-70">Prefer somewhere else for the remaining days? </span>
                  {relocations.map((r) => (
                    <button key={r.dest.id} className="link link-primary mr-2" onClick={() => apply(relocate(trip, alerts, r.dest.id))}>
                      {r.dest.name}
                    </button>
                  ))}
                </div>
              )}

              {log.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase opacity-70 mb-1">What changed</p>
                  <ul className="space-y-1 max-h-48 overflow-auto text-sm">
                    {log.map((c, i) => (
                      <li key={i} className={c.kind === "danger" ? "text-error" : c.kind === "refund" ? "text-success" : ""}>
                        <span className="opacity-50 text-xs mr-1">{c.at}</span>
                        {c.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs opacity-50">Live feeds (NDMA SACHET, IMD, GDACS, news) plug in via <code>lib/providers.ts</code>; alerts here are simulated.</p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Itinerary */}
          <section className="lg:col-span-3 space-y-3">
            <h2 className="text-xl font-bold">Day-by-day route</h2>

            <div className="card bg-base-100 border border-base-300">
              <div className="card-body p-4">
                <h3 className="font-semibold">
                  {MODE_ICON[trip.outbound.mode]} Getting there — {trip.input.startDate}
                </h3>
                {trip.outbound.mode === "cab" && trip.enRoute.length ? (
                  <p className="text-sm">
                    Scenic stops on the way: {trip.enRoute.map((a) => a.name).join(" → ")}
                  </p>
                ) : trip.enRoute.length ? (
                  <p className="text-sm opacity-70">
                    Travel by road cab to stop at {trip.enRoute.map((a) => a.name).join(", ")} on the way.
                  </p>
                ) : (
                  <p className="text-sm opacity-70">Direct journey.</p>
                )}
              </div>
            </div>

            {trip.days.map((d) => {
              const color = DAY_COLORS[(d.day - 1) % DAY_COLORS.length];
              const done = d.day < trip.currentDay;
              const today = d.day === trip.currentDay;
              const dDest = destinationById(d.destinationId);
              return (
                <div key={d.day} className={`card bg-base-100 border border-base-300 ${done ? "opacity-60" : ""}`} style={{ borderLeft: `4px solid ${color}` }}>
                  <div className="card-body p-4 gap-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h3 className="font-semibold">
                        Day {d.day} · {d.date}
                        {d.destinationId !== trip.input.destinationId && <span className="opacity-70"> · {dDest.name}</span>}
                        {today && <span className="badge badge-info badge-sm ml-2">Today</span>}
                        {done && <span className="badge badge-ghost badge-sm ml-2">Done</span>}
                        {d.rerouted && <span className="badge badge-success badge-sm ml-2">Rerouted for safety</span>}
                        {d.cancelled && <span className="badge badge-error badge-sm ml-2">Cancelled</span>}
                      </h3>
                      {!done && !d.cancelled && !closed && d.stops.some((s) => !s.cancelled) && (
                        <button className="btn btn-xs btn-ghost text-error" onClick={() => apply(cancelDay(trip, d.day))}>Cancel this day&apos;s route</button>
                      )}
                    </div>
                    {d.notes.map((n) => (
                      <p key={n} className="text-xs opacity-70">{n}</p>
                    ))}
                    <ol className="space-y-1">
                      {d.stops.map((s, i) => (
                        <li key={s.attraction.id + i} className="flex items-start gap-2 text-sm">
                          <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full text-white text-xs flex items-center justify-center" style={{ background: s.cancelled ? "#9ca3af" : color }}>
                            {i + 1}
                          </span>
                          <div className="flex-1">
                            <span className={s.cancelled ? "line-through opacity-60" : "font-medium"}>{s.attraction.name}</span>
                            {s.replacement && <span className="badge badge-success badge-xs ml-1">safe swap</span>}
                            <span className="opacity-60">
                              {" "}· {s.attraction.hours}h{s.attraction.entryFee ? ` · ${inr(s.attraction.entryFee)}/person` : " · free"}
                            </span>
                            <p className="text-xs opacity-70">{s.cancelled ? s.reason : s.attraction.description}</p>
                          </div>
                          {!s.cancelled && !done && !closed && (
                            <button className="btn btn-ghost btn-xs" aria-label={`Remove ${s.attraction.name}`} onClick={() => apply(cancelStop(trip, d.day, s.attraction.id))}>✕</button>
                          )}
                        </li>
                      ))}
                      {!d.stops.length && <li className="text-sm opacity-70">Free time / travel.</li>}
                    </ol>
                  </div>
                </div>
              );
            })}
          </section>

          {/* Bookings & cost */}
          <section className="lg:col-span-2 space-y-4">
            <h2 className="text-xl font-bold">Tickets, guide & cost</h2>
            <TicketPicker
              title="Outbound"
              chosen={trip.outbound}
              options={editable ? transportOptions(trip.origin, dest, trip.input.startDate, trip.input.travellers, true) : []}
              onPick={(o) => setTrip(repriced({ ...trip, outbound: o }))}
            />
            <TicketPicker
              title={trip.status === "returning" ? "Emergency return" : "Return"}
              chosen={trip.inbound}
              options={editable ? transportOptions(trip.origin, dest, addDays(trip.input.startDate, trip.input.days - 1), trip.input.travellers, false) : []}
              onPick={(o) => setTrip(repriced({ ...trip, inbound: o }))}
            />

            <div className="card bg-base-100 border border-base-300">
              <div className="card-body p-4 gap-2">
                <h3 className="font-semibold">🧭 Tourist guide</h3>
                {editable ? (
                  <select
                    className="select select-bordered select-sm"
                    value={trip.guideId ?? ""}
                    onChange={(e) => setTrip(repriced({ ...trip, guideId: e.target.value || undefined }))}
                  >
                    <option value="">No guide</option>
                    {dest.guides.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} · {g.rating}★ · {inr(g.perDay)}/day{g.licensed ? " · licensed" : " · UNLICENSED"}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm">{guide ? `${guide.name} · ${guide.rating}★ · ${inr(guide.perDay)}/day` : "No guide"}</p>
                )}
                {guide && <p className="text-xs opacity-70">Speaks {guide.languages.join(", ")}</p>}
              </div>
            </div>

            <div className="card bg-base-100 border border-base-300">
              <div className="card-body p-4 gap-1">
                <h3 className="font-semibold">💰 Cost breakdown</h3>
                {(
                  [
                    ["Transport (both ways)", trip.cost.transport],
                    [`Stay (${trip.nights} nights × ${trip.rooms} room${trip.rooms > 1 ? "s" : ""})`, trip.cost.stay],
                    ["Tourist guide", trip.cost.guide],
                    ["Entry fees", trip.cost.entryFees],
                    ["Local transport", trip.cost.localTransport],
                    ["Food", trip.cost.food],
                    ["Safety reserve (8%)", trip.cost.safetyReserve],
                  ] as [string, number][]
                ).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span className="opacity-80">{k}</span>
                    <span className="tabular-nums">{inr(v)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold border-t border-base-300 pt-1 mt-1">
                  <span>Total</span>
                  <span className="tabular-nums">{inr(trip.cost.total)}</span>
                </div>
                <p className="text-xs opacity-60">The safety reserve pays for emergency tickets or a hotel switch; whatever isn&apos;t used comes back to you.</p>
                <details className="mt-2">
                  <summary className="text-sm cursor-pointer">Payment ledger ({trip.ledger.length} entries)</summary>
                  <ul className="mt-2 space-y-1 max-h-60 overflow-auto">
                    {trip.ledger.map((e, i) => (
                      <li key={i} className="flex justify-between gap-2 text-xs">
                        <span>{e.label}</span>
                        <span className={`tabular-nums ${e.amount < 0 ? "text-success" : ""}`}>{inr(e.amount)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-between text-sm font-semibold mt-2">
                    <span>Net</span>
                    <span>{inr(net)}</span>
                  </div>
                </details>
              </div>
            </div>
          </section>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Hotels in {dest.name} — credibility checked</h2>
          <p className="text-sm opacity-70">
            We only auto-book hotels rated <b>Trusted</b> or <b>Use caution</b>. Scores weigh cross-platform agreement, verified stays, review bursts, complaints and registration — not just star ratings.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            {dest.hotels.map((h) => (
              <CredibilityCard
                key={h.id}
                hotel={h}
                nights={trip.nights}
                rooms={trip.rooms}
                selected={h.id === hotel.id}
                onSelect={editable ? () => setTrip(repriced({ ...trip, hotelId: h.id })) : undefined}
              />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

function TicketPicker({
  title,
  chosen,
  options,
  onPick,
}: {
  title: string;
  chosen: TransportOption;
  options: TransportOption[];
  onPick: (o: TransportOption) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body p-4 gap-2">
        <div className="flex justify-between items-start gap-2">
          <div>
            <h3 className="font-semibold">
              {MODE_ICON[chosen.mode]} {title}: {chosen.from} → {chosen.to}
            </h3>
            <p className="text-sm">
              {chosen.operator} · {chosen.travelClass}
            </p>
            <p className="text-xs opacity-70">
              {chosen.date} · departs {chosen.depart} · ~{chosen.durationHrs} h
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold tabular-nums">{inr(chosen.totalPrice)}</p>
            <span className={`badge badge-sm ${chosen.safetyScore >= SAFE_THRESHOLD ? "badge-success" : "badge-error"}`}>Safety {chosen.safetyScore}</span>
          </div>
        </div>
        <p className="text-xs opacity-70">{chosen.safetyNotes.join(" · ")}</p>
        {options.length > 1 && (
          <>
            <button className="btn btn-xs btn-ghost self-start" onClick={() => setOpen(!open)}>
              {open ? "Hide options" : `Compare ${options.length} options`}
            </button>
            {open && (
              <ul className="space-y-1">
                {options.map((o) => (
                  <li key={o.id}>
                    <button
                      className={`w-full text-left p-2 rounded-lg border text-sm flex justify-between gap-2 ${o.id === chosen.id ? "border-primary bg-primary/5" : "border-base-300 hover:bg-base-200"}`}
                      onClick={() => onPick(o)}
                    >
                      <span>
                        {MODE_ICON[o.mode]} {o.operator} · {o.travelClass} · {o.durationHrs} h
                        {o.safetyScore < SAFE_THRESHOLD && <span className="text-error"> · below safety bar</span>}
                      </span>
                      <span className="tabular-nums shrink-0">{inr(o.totalPrice)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
