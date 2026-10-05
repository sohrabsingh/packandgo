import type { HotelEvidence } from "./types";

export type Verdict = "trusted" | "caution" | "avoid" | "insufficient";

export interface CredibilityFactor {
  key: string;
  label: string;
  score: number; // 0-100
  weight: number;
  detail: string;
}

export interface CredibilityReport {
  score: number;
  verdict: Verdict;
  weightedRating: number;
  totalReviews: number;
  factors: CredibilityFactor[];
  flags: string[];
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

const SAFETY_WORDS = /unsafe|scam|bedbug|overcharg|broken|not honoured|theft|stolen|harass/i;

/**
 * Scores how far a hotel's online reputation can be trusted, not just how high it is.
 * A 4.9 built on a burst of unverified reviews scores lower than an honest 4.2.
 */
export function scoreHotel(h: HotelEvidence): CredibilityReport {
  const flags: string[] = [];
  const factors: CredibilityFactor[] = [];
  const totalReviews = h.sources.reduce((s, x) => s + x.count, 0);
  const weightedRating = totalReviews
    ? h.sources.reduce((s, x) => s + x.rating * x.count, 0) / totalReviews
    : 0;

  // 1. Cross-platform consistency
  const ratings = h.sources.map((s) => s.rating);
  const spread = ratings.length > 1 ? Math.max(...ratings) - Math.min(...ratings) : 0;
  factors.push({
    key: "consistency",
    label: "Cross-platform consistency",
    weight: 20,
    score: ratings.length > 1 ? clamp(100 - spread * 60) : 50,
    detail:
      ratings.length > 1
        ? `Ratings span ${spread.toFixed(1)} stars across ${ratings.length} platforms`
        : "Only one platform available to compare",
  });
  if (spread >= 0.8) {
    const hi = h.sources.reduce((m, s) => (s.rating > m.rating ? s : m));
    flags.push(
      `${hi.name} rating (${hi.rating}) is ${spread.toFixed(1)} stars above other platforms — likely inflated`,
    );
  }

  // 2. Volume
  factors.push({
    key: "volume",
    label: "Review volume",
    weight: 10,
    score: clamp((Math.log10(totalReviews + 1) / Math.log10(2000)) * 100),
    detail: `${totalReviews.toLocaleString("en-IN")} reviews across platforms`,
  });

  // 3. Verified stays
  const verifiedRatio = h.reviews.length
    ? h.reviews.filter((r) => r.verifiedStay).length / h.reviews.length
    : 0;
  factors.push({
    key: "verified",
    label: "Verified stays",
    weight: 15,
    score: clamp(verifiedRatio * 110),
    detail: `${Math.round(verifiedRatio * 100)}% of sampled reviews come from confirmed bookings`,
  });
  if (h.reviews.length && verifiedRatio < 0.4) flags.push("Most reviews are not from verified stays");

  // 4. Review-pattern authenticity: bursts of 5-star reviews and copy-paste text
  const fives = h.reviews.filter((r) => r.rating === 5).map((r) => r.daysAgo).sort((x, y) => x - y);
  let maxBurst = 0;
  for (let i = 0; i < fives.length; i++) {
    let j = i;
    while (j < fives.length && fives[j] - fives[i] <= 14) j++;
    maxBurst = Math.max(maxBurst, j - i);
  }
  const burstShare = h.reviews.length ? maxBurst / h.reviews.length : 0;
  const texts = h.reviews.map((r) => r.text.trim().toLowerCase());
  const dupShare = texts.length ? 1 - new Set(texts).size / texts.length : 0;
  const burstPenalty = maxBurst >= 4 && burstShare > 0.3 ? (burstShare - 0.3) * 200 : 0;
  const dupPenalty = dupShare > 0.35 ? (dupShare - 0.35) * 150 : 0;
  factors.push({
    key: "pattern",
    label: "Review authenticity",
    weight: 20,
    score: clamp(100 - burstPenalty - dupPenalty),
    detail: `${maxBurst} five-star reviews within 14 days · ${Math.round(dupShare * 100)}% repeated text`,
  });
  if (burstPenalty > 0) flags.push(`Burst of ${maxBurst} five-star reviews posted within two weeks`);
  if (dupPenalty > 0) flags.push("Many reviews reuse identical wording");

  // 5. Recent sentiment (last 6 months, verified reviews count double)
  const recent = h.reviews.filter((r) => r.daysAgo <= 180);
  let recentAvg = 0;
  if (recent.length) {
    const w = recent.reduce((s, r) => s + (r.verifiedStay ? 2 : 1), 0);
    recentAvg = recent.reduce((s, r) => s + r.rating * (r.verifiedStay ? 2 : 1), 0) / w;
  }
  factors.push({
    key: "recent",
    label: "Recent guest experience",
    weight: 15,
    score: recent.length ? clamp(((recentAvg - 1) / 4) * 100) : 50,
    detail: recent.length
      ? `${recentAvg.toFixed(1)}★ average from ${recent.length} reviews in the last 6 months`
      : "No reviews in the last 6 months",
  });
  if (!recent.length) flags.push("No recent reviews — current condition unknown");

  // 6. Complaints & safety mentions
  const safetyMentions = h.reviews.filter((r) => SAFETY_WORDS.test(r.text)).length;
  const complaintRate = totalReviews ? (h.complaints / totalReviews) * 1000 : h.complaints * 10;
  factors.push({
    key: "complaints",
    label: "Complaints & safety",
    weight: 10,
    score: clamp(100 - complaintRate * 3 - safetyMentions * 8),
    detail: `${h.complaints} formal complaints · ${safetyMentions} reviews mention safety or scams`,
  });
  if (safetyMentions >= 3) flags.push(`${safetyMentions} reviews mention safety issues, scams or overcharging`);

  // 7. Registration & tenure
  factors.push({
    key: "registration",
    label: "Registration & track record",
    weight: 10,
    score: clamp((h.licenseRegistered ? 70 : 0) + Math.min(30, h.yearsOperating * 4)),
    detail: `${h.licenseRegistered ? "Registered with tourism board" : "No tourism registration found"} · ${h.yearsOperating} yr operating`,
  });
  if (!h.licenseRegistered) flags.push("Not registered with the state tourism department");

  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const score = Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight);

  let verdict: Verdict;
  if (totalReviews < 40) {
    verdict = "insufficient";
    flags.unshift("Too few reviews to judge reliably — treat as unverified");
  } else if (score >= 75) verdict = "trusted";
  else if (score >= 55) verdict = "caution";
  else verdict = "avoid";

  return { score, verdict, weightedRating, totalReviews, factors, flags };
}

export const VERDICT_STYLE: Record<Verdict, { label: string; badge: string }> = {
  trusted: { label: "Trusted", badge: "badge-success" },
  caution: { label: "Use caution", badge: "badge-warning" },
  avoid: { label: "Avoid", badge: "badge-error" },
  insufficient: { label: "Not enough data", badge: "badge-ghost" },
};
