"use client";

import { useState } from "react";
import { scoreHotel, VERDICT_STYLE } from "@/lib/credibility";
import { inr } from "@/lib/geo";
import type { Hotel, HotelEvidence } from "@/lib/types";

export function CredibilityReportView({ evidence }: { evidence: HotelEvidence }) {
  const r = scoreHotel(evidence);
  return (
    <div className="space-y-3">
      {r.flags.length > 0 && (
        <ul className="space-y-1">
          {r.flags.map((f) => (
            <li key={f} className="text-sm text-error flex gap-2">
              <span>⚠</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        {r.factors.map((f) => (
          <div key={f.key}>
            <div className="flex justify-between text-xs">
              <span className="font-medium">{f.label}</span>
              <span className="tabular-nums">{Math.round(f.score)}/100</span>
            </div>
            <progress
              className={`progress w-full h-2 ${f.score >= 75 ? "progress-success" : f.score >= 50 ? "progress-warning" : "progress-error"}`}
              value={f.score}
              max={100}
            />
            <p className="text-xs opacity-70">{f.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScoreBadge({ evidence }: { evidence: HotelEvidence }) {
  const r = scoreHotel(evidence);
  const v = VERDICT_STYLE[r.verdict];
  return (
    <div className="flex items-center gap-2">
      <div
        className={`radial-progress text-sm font-bold ${r.score >= 75 ? "text-success" : r.score >= 55 ? "text-warning" : "text-error"}`}
        style={{ "--value": r.score, "--size": "3rem", "--thickness": "4px" } as React.CSSProperties}
        role="progressbar"
        aria-label={`Credibility ${r.score} out of 100`}
      >
        {r.score}
      </div>
      <div>
        <span className={`badge ${v.badge} badge-sm`}>{v.label}</span>
        <p className="text-xs opacity-70 mt-1">
          {r.weightedRating.toFixed(1)}★ · {r.totalReviews.toLocaleString("en-IN")} reviews
        </p>
      </div>
    </div>
  );
}

export default function CredibilityCard({
  hotel,
  selected,
  onSelect,
  nights,
  rooms,
}: {
  hotel: Hotel;
  selected?: boolean;
  onSelect?: () => void;
  nights?: number;
  rooms?: number;
}) {
  const [open, setOpen] = useState(false);
  const r = scoreHotel(hotel);
  const blocked = r.verdict === "avoid" || r.verdict === "insufficient";
  return (
    <div className={`card bg-base-100 border ${selected ? "border-primary border-2" : "border-base-300"}`}>
      <div className="card-body p-4 gap-2">
        <div className="flex justify-between gap-3 items-start">
          <div>
            <h3 className="font-semibold">
              {hotel.name} <span className="text-warning text-sm">{"★".repeat(hotel.stars)}</span>
            </h3>
            <p className="text-sm opacity-70">
              {inr(hotel.pricePerNight)}/night
              {nights && rooms ? ` · ${inr(hotel.pricePerNight * nights * rooms)} for ${nights}n × ${rooms} room${rooms > 1 ? "s" : ""}` : ""}
              {hotel.freeCancellation ? " · Free cancellation" : " · Non-refundable 1st night"}
            </p>
            <p className="text-xs opacity-60">{hotel.amenities.join(" · ")}</p>
          </div>
          <ScoreBadge evidence={hotel} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-xs btn-ghost" onClick={() => setOpen(!open)}>
            {open ? "Hide" : "Why this score?"}
          </button>
          {onSelect && !selected && (
            <button className="btn btn-xs btn-primary" disabled={blocked} onClick={onSelect}>
              {blocked ? "Blocked by credibility check" : "Choose this hotel"}
            </button>
          )}
          {selected && <span className="badge badge-primary badge-sm self-center">Booked in plan</span>}
        </div>
        {open && (
          <div className="pt-2 border-t border-base-300">
            <CredibilityReportView evidence={hotel} />
            <details className="mt-3">
              <summary className="text-xs cursor-pointer">Sample reviews ({hotel.reviews.length})</summary>
              <ul className="mt-2 space-y-1 max-h-48 overflow-auto">
                {hotel.reviews.slice(0, 12).map((rv, i) => (
                  <li key={i} className="text-xs">
                    <span className="text-warning">{"★".repeat(rv.rating)}</span> {rv.text}{" "}
                    <span className="opacity-60">
                      — {rv.source}, {rv.daysAgo}d ago{rv.verifiedStay ? " · verified stay" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
