"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import CredibilityCard, { CredibilityReportView, ScoreBadge } from "@/components/CredibilityCard";
import { DESTINATIONS } from "@/lib/data";
import type { HotelEvidence, RatingSource, Review } from "@/lib/types";

const blankSources: RatingSource[] = [
  { name: "Google", rating: 4.5, count: 300 },
  { name: "Booking.com", rating: 4.2, count: 120 },
];

/** Parses lines like "5 | Great stay, clean rooms | 30 | verified". */
function parseReviews(text: string): Review[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [rating, body = "", days = "60", verified = ""] = line.split("|").map((x) => x.trim());
      return {
        rating: Math.max(1, Math.min(5, Math.round(+rating || 3))),
        text: body,
        daysAgo: +days || 60,
        verifiedStay: /^(y|yes|verified|true)$/i.test(verified),
        source: "Pasted",
      };
    });
}

export default function VerifyPage() {
  const [destId, setDestId] = useState("all");
  const [sources, setSources] = useState<RatingSource[]>(blankSources);
  const [reviewsText, setReviewsText] = useState(
    "5 | Lovely stay, staff very helpful | 20 | verified\n4 | Good location but noisy at night | 45 | verified\n5 | Best hotel ever!!! | 3 |\n5 | Best hotel ever!!! | 4 |\n2 | Overcharged at checkout | 90 | verified",
  );
  const [license, setLicense] = useState(true);
  const [complaints, setComplaints] = useState(1);
  const [years, setYears] = useState(3);

  const evidence: HotelEvidence = {
    sources: sources.filter((s) => s.name && s.count > 0),
    reviews: parseReviews(reviewsText),
    licenseRegistered: license,
    complaints,
    yearsOperating: years,
  };

  const hotels = DESTINATIONS.filter((d) => destId === "all" || d.id === destId).flatMap((d) =>
    d.hotels.map((h) => ({ h, dest: d.name })),
  );

  return (
    <>
      <Navbar />
      <main className="pt-20 pb-12 px-4 max-w-6xl mx-auto space-y-8">
        <div className="mt-4">
          <h1 className="text-3xl font-bold">Verify a hotel</h1>
          <p className="opacity-70">
            A high rating isn&apos;t the same as a trustworthy one. We check whether the reviews themselves can be believed.
          </p>
        </div>

        <section className="card bg-base-100 border border-base-300">
          <div className="card-body gap-4">
            <h2 className="card-title">Check any hotel</h2>
            <p className="text-sm opacity-70">Enter what you can find on each booking site. Paste reviews one per line as <code>rating | text | days ago | verified</code>.</p>
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="space-y-2">
                  {sources.map((s, i) => (
                    <div key={i} className="flex gap-2">
                      <input className="input input-bordered input-sm flex-1" aria-label="Platform" value={s.name} onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      <input type="number" step={0.1} min={1} max={5} className="input input-bordered input-sm w-20" aria-label="Rating" value={s.rating} onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, rating: +e.target.value } : x)))} />
                      <input type="number" min={0} className="input input-bordered input-sm w-24" aria-label="Review count" value={s.count} onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, count: +e.target.value } : x)))} />
                      <button className="btn btn-ghost btn-sm" aria-label="Remove platform" onClick={() => setSources(sources.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  ))}
                  <button className="btn btn-xs btn-outline" onClick={() => setSources([...sources, { name: "TripAdvisor", rating: 4, count: 50 }])}>+ Add platform</button>
                </div>
                <textarea className="textarea textarea-bordered w-full h-36 text-sm font-mono" value={reviewsText} onChange={(e) => setReviewsText(e.target.value)} aria-label="Reviews" />
                <div className="grid grid-cols-3 gap-2">
                  <label className="label cursor-pointer gap-2 justify-start">
                    <input type="checkbox" className="checkbox checkbox-sm" checked={license} onChange={(e) => setLicense(e.target.checked)} />
                    <span className="text-sm">Tourism-registered</span>
                  </label>
                  <label className="form-control">
                    <span className="text-xs">Complaints on record</span>
                    <input type="number" min={0} className="input input-bordered input-sm" value={complaints} onChange={(e) => setComplaints(+e.target.value)} />
                  </label>
                  <label className="form-control">
                    <span className="text-xs">Years operating</span>
                    <input type="number" min={0} className="input input-bordered input-sm" value={years} onChange={(e) => setYears(+e.target.value)} />
                  </label>
                </div>
              </div>
              <div className="space-y-3">
                <ScoreBadge evidence={evidence} />
                <CredibilityReportView evidence={evidence} />
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">Hotels we cover</h2>
            <select className="select select-bordered select-sm" value={destId} onChange={(e) => setDestId(e.target.value)}>
              <option value="all">All destinations</option>
              {DESTINATIONS.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <p className="text-xs opacity-60">Sample hotels are fictional and their reviews are generated for demonstration.</p>
          <div className="grid md:grid-cols-2 gap-3">
            {hotels.map(({ h, dest }) => (
              <div key={h.id}>
                <p className="text-xs uppercase opacity-60 mb-1">{dest}</p>
                <CredibilityCard hotel={h} />
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
