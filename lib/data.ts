/**
 * Sample data for the MVP. Attractions are real places with approximate coordinates;
 * hotels and guides are FICTIONAL and their reviews are generated, so the credibility
 * engine has realistic patterns to work on. Replace with live sources via lib/providers.
 */
import { seededRandom } from "./geo";
import type {
  Attraction,
  Destination,
  Guide,
  Hotel,
  Interest,
  LatLng,
  Place,
  Review,
} from "./types";

const a = (
  id: string,
  name: string,
  lat: number,
  lng: number,
  tags: Interest[],
  entryFee: number,
  hours: number,
  description: string,
): Attraction => ({ id, name, coords: [lat, lng], tags, entryFee, hours, description });

// ---------- Hotel generation ----------

type Profile = "trusted" | "mixed" | "suspicious" | "new";

const POSITIVE = [
  "Spotless rooms and very helpful staff.",
  "Great location, walked to most sights.",
  "Breakfast was fresh and the hosts were warm.",
  "Felt safe as a solo traveller, staff checked in on us.",
  "Exactly as pictured. Would stay again.",
  "Quiet at night, comfortable beds.",
  "Check-in was quick and they stored our luggage.",
];
const MIXED = [
  "Decent stay but the bathroom needed cleaning.",
  "Good view, slow room service.",
  "Hot water only in the mornings.",
  "Okay for the price, wifi was patchy.",
  "Staff friendly but room smelled damp.",
];
const NEGATIVE = [
  "Overcharged at checkout for things we never used.",
  "Dirty sheets and found bedbugs.",
  "Room looked nothing like the photos. Felt like a scam.",
  "Door lock was broken, did not feel safe.",
  "Booking was not honoured, had to find another place at night.",
];
const SHILL = "Best hotel ever!!! Amazing amazing stay, 5 star must visit!!!";

const SOURCES = ["Google", "Booking.com", "TripAdvisor", "MakeMyTrip"];

function makeHotel(
  destinationId: string,
  idx: number,
  name: string,
  coords: LatLng,
  pricePerNight: number,
  stars: number,
  profile: Profile,
  freeCancellation: boolean,
  amenities: string[],
): Hotel {
  const id = `${destinationId}-h${idx}`;
  const r = seededRandom(id);
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  const reviews: Review[] = [];
  let sources: { name: string; rating: number; count: number }[] = [];
  let complaints = 0;
  let licenseRegistered = true;
  let yearsOperating = 1;

  if (profile === "trusted") {
    sources = SOURCES.map((s) => ({
      name: s,
      rating: +(4.3 + r() * 0.35).toFixed(1),
      count: Math.round(600 + r() * 2400),
    }));
    for (let i = 0; i < 24; i++) {
      const good = r() < 0.85;
      reviews.push({
        rating: good ? (r() < 0.6 ? 5 : 4) : 3,
        text: good ? pick(POSITIVE) : pick(MIXED),
        daysAgo: Math.round(r() * 700),
        verifiedStay: r() < 0.85,
        source: pick(SOURCES),
      });
    }
    complaints = Math.round(r() * 3);
    yearsOperating = 8 + Math.round(r() * 15);
  } else if (profile === "mixed") {
    sources = SOURCES.map((s) => ({
      name: s,
      rating: +(3.4 + r() * 0.7).toFixed(1),
      count: Math.round(150 + r() * 450),
    }));
    for (let i = 0; i < 20; i++) {
      const roll = r();
      reviews.push({
        rating: roll < 0.45 ? 4 : roll < 0.8 ? 3 : 2,
        text: roll < 0.45 ? pick(POSITIVE) : roll < 0.85 ? pick(MIXED) : pick(NEGATIVE),
        daysAgo: Math.round(r() * 500),
        verifiedStay: r() < 0.6,
        source: pick(SOURCES),
      });
    }
    complaints = 4 + Math.round(r() * 5);
    yearsOperating = 3 + Math.round(r() * 5);
  } else if (profile === "suspicious") {
    // One platform is inflated with a burst of short, repeated 5-star reviews.
    sources = [
      { name: "Google", rating: 4.9, count: 140 + Math.round(r() * 60) },
      { name: "Booking.com", rating: +(3.0 + r() * 0.4).toFixed(1), count: 90 },
      { name: "TripAdvisor", rating: +(2.8 + r() * 0.5).toFixed(1), count: 60 },
    ];
    const burstStart = 20 + Math.round(r() * 30);
    for (let i = 0; i < 14; i++) {
      reviews.push({
        rating: 5,
        text: r() < 0.7 ? SHILL : "Superb!! Best hotel best staff 5 star",
        daysAgo: burstStart + Math.round(r() * 8),
        verifiedStay: r() < 0.1,
        source: "Google",
      });
    }
    for (let i = 0; i < 8; i++) {
      reviews.push({
        rating: r() < 0.6 ? 1 : 2,
        text: pick(NEGATIVE),
        daysAgo: Math.round(r() * 300),
        verifiedStay: r() < 0.7,
        source: pick(["Booking.com", "TripAdvisor"]),
      });
    }
    complaints = 12 + Math.round(r() * 10);
    licenseRegistered = false;
    yearsOperating = 1 + Math.round(r() * 2);
  } else {
    sources = [
      { name: "Google", rating: 4.6, count: 18 + Math.round(r() * 10) },
      { name: "Booking.com", rating: 4.5, count: 9 },
    ];
    for (let i = 0; i < 8; i++) {
      reviews.push({
        rating: r() < 0.7 ? 5 : 4,
        text: pick(POSITIVE),
        daysAgo: Math.round(r() * 120),
        verifiedStay: r() < 0.8,
        source: pick(["Google", "Booking.com"]),
      });
    }
    complaints = 0;
    yearsOperating = 1;
  }

  return {
    id,
    destinationId,
    name,
    coords,
    pricePerNight,
    stars,
    freeCancellation,
    amenities,
    sources,
    reviews: reviews.sort((x, y) => x.daysAgo - y.daysAgo),
    complaints,
    licenseRegistered,
    yearsOperating,
  };
}

function guides(destId: string, list: [string, string[], number, number, boolean][]): Guide[] {
  return list.map(([name, languages, perDay, rating, licensed], i) => ({
    id: `${destId}-g${i}`,
    name,
    languages,
    perDay,
    rating,
    licensed,
  }));
}

// ---------- Origins ----------

export const ORIGINS: (Place & { id: string })[] = [
  { id: "delhi", name: "New Delhi", coords: [28.6139, 77.209] },
  { id: "mumbai", name: "Mumbai", coords: [19.076, 72.8777] },
  { id: "bengaluru", name: "Bengaluru", coords: [12.9716, 77.5946] },
  { id: "kolkata", name: "Kolkata", coords: [22.5726, 88.3639] },
  { id: "chennai", name: "Chennai", coords: [13.0827, 80.2707] },
  { id: "hyderabad", name: "Hyderabad", coords: [17.385, 78.4867] },
  { id: "chandigarh", name: "Chandigarh", coords: [30.7333, 76.7794] },
  { id: "amritsar", name: "Amritsar", coords: [31.634, 74.8723] },
];

// ---------- Destinations ----------

export const DESTINATIONS: Destination[] = [
  {
    id: "manali",
    name: "Manali",
    region: "Himachal Pradesh",
    coords: [32.2432, 77.1892],
    terrain: "hills",
    localTransportPerDay: 2500,
    airport: { name: "Bhuntar (Kullu) Airport", transferCost: 1800, transferHrs: 1.5 },
    attractions: [
      a("hadimba", "Hadimba Devi Temple", 32.2479, 77.1806, ["culture", "spiritual"], 0, 1.5, "Cedar-forest temple from 1553."),
      a("oldmanali", "Old Manali", 32.2559, 77.1806, ["food", "culture", "nightlife"], 0, 2.5, "Cafés, river views, old village lanes."),
      a("solang", "Solang Valley", 32.3166, 77.157, ["adventure", "nature"], 600, 4, "Paragliding, ropeway, snow in winter."),
      a("sissu", "Sissu via Atal Tunnel", 32.4826, 77.1253, ["nature", "adventure"], 0, 5, "Lahaul valley through the world's longest highway tunnel above 10,000 ft."),
      a("vashisht", "Vashisht Hot Springs", 32.2675, 77.1885, ["spiritual", "nature"], 0, 1.5, "Natural sulphur springs and temple."),
      a("jogini", "Jogini Waterfall Trek", 32.274, 77.191, ["nature", "adventure"], 0, 3, "Easy trek to a 150 ft waterfall."),
      a("mallroad", "Mall Road Manali", 32.2396, 77.1887, ["food", "nightlife"], 0, 2, "Shopping and street food."),
      a("naggar", "Naggar Castle", 32.1155, 77.1662, ["culture"], 50, 2, "500-year-old stone-and-wood castle."),
      a("manu", "Manu Temple", 32.256, 77.1775, ["spiritual", "culture"], 0, 1, "Temple to the sage Manu above Old Manali."),
    ],
    enRoute: [
      a("sukhna", "Sukhna Lake, Chandigarh", 30.7421, 76.8188, ["nature"], 0, 1, "Lakeside promenade."),
      a("gobindsagar", "Gobind Sagar Lake, Bilaspur", 31.4126, 76.65, ["nature"], 0, 0.5, "Reservoir viewpoint on NH-205."),
      a("rewalsar", "Rewalsar Lake", 31.6339, 76.8333, ["spiritual", "nature"], 0, 1, "Sacred lake for Hindus, Sikhs and Buddhists."),
      a("pandoh", "Pandoh Dam", 31.669, 77.064, ["nature"], 0, 0.5, "Beas river gorge viewpoint."),
      a("kullu", "Raghunath Temple, Kullu", 31.9578, 77.1095, ["culture", "spiritual"], 0, 1, "Heart of Kullu Dussehra."),
    ],
    hotels: [
      makeHotel("manali", 1, "Cedar Crest Lodge", [32.2505, 77.1832], 4200, 4, "trusted", true, ["Heating", "Breakfast", "24h desk"]),
      makeHotel("manali", 2, "Riverside Homestay", [32.2589, 77.1845], 2100, 3, "mixed", true, ["Breakfast", "River view"]),
      makeHotel("manali", 3, "Snow Palace Grand", [32.2415, 77.1901], 2600, 4, "suspicious", false, ["Pool", "Spa"]),
      makeHotel("manali", 4, "Apple Orchard Cottages", [32.2662, 77.1871], 3100, 3, "new", true, ["Kitchen", "Garden"]),
    ],
    guides: guides("manali", [
      ["Tenzin Negi", ["Hindi", "English"], 2000, 4.8, true],
      ["Ravi Thakur", ["Hindi", "Punjabi"], 1500, 4.4, true],
    ]),
  },
  {
    id: "rishikesh",
    name: "Rishikesh",
    region: "Uttarakhand",
    coords: [30.1158, 78.315],
    terrain: "hills",
    localTransportPerDay: 1500,
    railhead: { name: "Yog Nagari Rishikesh", transferCost: 300, transferHrs: 0.5 },
    airport: { name: "Dehradun Jolly Grant", transferCost: 900, transferHrs: 1 },
    attractions: [
      a("laxman", "Laxman Jhula", 30.126, 78.3299, ["culture", "spiritual"], 0, 1, "Iconic suspension bridge over the Ganga."),
      a("ramjhula", "Ram Jhula & cafés", 30.1236, 78.3159, ["food", "culture"], 0, 2, "Bridge, ashrams and riverside cafés."),
      a("triveni", "Triveni Ghat Aarti", 30.1027, 78.2967, ["spiritual", "culture"], 0, 1.5, "Evening Ganga aarti."),
      a("beatles", "Beatles Ashram", 30.1186, 78.3171, ["culture"], 150, 1.5, "Graffiti-covered ashram where the Beatles stayed."),
      a("neelkanth", "Neelkanth Mahadev Temple", 30.0801, 78.3434, ["spiritual", "nature"], 0, 3, "Forest temple drive."),
      a("shivpuri", "River Rafting, Shivpuri", 30.1406, 78.3888, ["adventure", "nature"], 1200, 4, "16 km grade III rapids."),
      a("kunjapuri", "Kunjapuri Sunrise", 30.1919, 78.2955, ["nature", "spiritual"], 0, 2.5, "Sunrise over the Himalaya."),
      a("rajaji", "Rajaji National Park (Chilla)", 29.98, 78.22, ["nature", "adventure"], 1500, 4, "Elephant and tiger reserve safari."),
    ],
    enRoute: [
      a("harkipauri", "Har Ki Pauri, Haridwar", 29.9568, 78.171, ["spiritual", "culture"], 0, 1.5, "Haridwar's most sacred ghat."),
      a("chandidevi", "Chandi Devi Ropeway", 29.9338, 78.1797, ["spiritual"], 300, 1, "Hilltop temple by cable car."),
    ],
    hotels: [
      makeHotel("rishikesh", 1, "Ganga View Retreat", [30.1243, 78.3221], 3600, 4, "trusted", true, ["Yoga deck", "Breakfast"]),
      makeHotel("rishikesh", 2, "Tapovan Backpackers", [30.1304, 78.3282], 1200, 2, "mixed", true, ["Dorms", "Café"]),
      makeHotel("rishikesh", 3, "Divine Luxury Resort", [30.111, 78.3051], 2900, 4, "suspicious", false, ["Pool"]),
      makeHotel("rishikesh", 4, "Himalayan Stillness Ashram Stay", [30.1201, 78.3178], 1800, 3, "trusted", true, ["Meditation", "Satvik meals"]),
    ],
    guides: guides("rishikesh", [
      ["Anil Bhatt", ["Hindi", "English", "French"], 1800, 4.7, true],
      ["Deepa Rawat", ["Hindi", "English"], 1600, 4.9, true],
    ]),
  },
  {
    id: "jaipur",
    name: "Jaipur",
    region: "Rajasthan",
    coords: [26.9124, 75.7873],
    terrain: "plains",
    localTransportPerDay: 1800,
    railhead: { name: "Jaipur Junction", transferCost: 250, transferHrs: 0.4 },
    airport: { name: "Jaipur International", transferCost: 500, transferHrs: 0.5 },
    attractions: [
      a("amber", "Amber Fort", 26.9855, 75.8513, ["culture"], 200, 3, "Hilltop Rajput fort-palace."),
      a("hawamahal", "Hawa Mahal", 26.9239, 75.8267, ["culture"], 50, 1, "Palace of Winds with 953 windows."),
      a("citypalace", "City Palace", 26.9258, 75.8237, ["culture"], 300, 2, "Royal residence and museum."),
      a("jantar", "Jantar Mantar", 26.9248, 75.8246, ["culture"], 50, 1, "UNESCO astronomical instruments."),
      a("nahargarh", "Nahargarh Fort Sunset", 26.9373, 75.8155, ["culture", "nature"], 200, 2, "City views at sunset."),
      a("jalmahal", "Jal Mahal", 26.9535, 75.8462, ["culture", "nature"], 0, 0.5, "Palace in the middle of Man Sagar lake."),
      a("johari", "Johari Bazaar food walk", 26.9196, 75.8266, ["food"], 0, 2, "Pyaaz kachori, lassi, jewellery stalls."),
      a("chokhidhani", "Chokhi Dhani", 26.7672, 75.835, ["food", "culture", "nightlife"], 900, 3, "Rajasthani village dinner and folk shows."),
      a("albert", "Albert Hall Museum", 26.9116, 75.8195, ["culture"], 40, 1.5, "Indo-Saracenic museum, lit up at night."),
    ],
    enRoute: [
      a("neemrana", "Neemrana Fort", 27.9886, 76.3858, ["culture"], 0, 1, "15th-century fort on NH-48."),
      a("bhangarh", "Bhangarh Fort", 27.096, 76.29, ["culture", "adventure"], 50, 1.5, "India's most famous 'haunted' ruins."),
      a("pushkar", "Pushkar Lake", 26.4897, 74.5511, ["spiritual", "culture"], 0, 2, "Holy lake and Brahma temple."),
    ],
    hotels: [
      makeHotel("jaipur", 1, "Haveli Sunrise Heritage", [26.9213, 75.8205], 3800, 4, "trusted", true, ["Courtyard", "Rooftop dining"]),
      makeHotel("jaipur", 2, "Pink City Inn", [26.9178, 75.8102], 1600, 3, "mixed", true, ["Wifi", "Breakfast"]),
      makeHotel("jaipur", 3, "Royal Maharaja Palace Hotel", [26.9015, 75.8001], 2400, 5, "suspicious", false, ["Pool", "Spa"]),
      makeHotel("jaipur", 4, "Bagh Garden Residency", [26.8932, 75.8073], 2700, 3, "trusted", true, ["Garden", "Airport shuttle"]),
    ],
    guides: guides("jaipur", [
      ["Mahesh Sharma", ["Hindi", "English", "German"], 1800, 4.8, true],
      ["Kavita Rathore", ["Hindi", "English"], 1500, 4.6, true],
      ["Street guide (unlicensed)", ["Hindi"], 700, 3.6, false],
    ]),
  },
  {
    id: "goa",
    name: "Goa",
    region: "Goa",
    coords: [15.4909, 73.8278],
    terrain: "coast",
    localTransportPerDay: 2200,
    railhead: { name: "Madgaon Junction", transferCost: 1100, transferHrs: 1 },
    airport: { name: "Goa (Dabolim / Mopa)", transferCost: 1200, transferHrs: 1 },
    attractions: [
      a("baga", "Baga Beach", 15.5553, 73.7517, ["beach", "nightlife"], 0, 3, "Water sports by day, clubs by night."),
      a("calangute", "Calangute Beach", 15.5439, 73.7553, ["beach"], 0, 2, "Goa's longest beach stretch."),
      a("aguada", "Fort Aguada", 15.492, 73.7737, ["culture"], 0, 1.5, "17th-century Portuguese fort and lighthouse."),
      a("bomjesus", "Basilica of Bom Jesus", 15.5009, 73.9116, ["culture", "spiritual"], 0, 1.5, "UNESCO baroque church, Old Goa."),
      a("dudhsagar", "Dudhsagar Falls", 15.3144, 74.3143, ["nature", "adventure"], 600, 5, "Four-tiered waterfall, jeep safari."),
      a("anjuna", "Anjuna Flea Market", 15.5733, 73.7407, ["food", "nightlife"], 0, 2, "Wednesday market and sunset shacks."),
      a("palolem", "Palolem Beach", 15.01, 74.0232, ["beach", "nature"], 0, 4, "Calm crescent beach in South Goa."),
      a("fontainhas", "Fontainhas Latin Quarter", 15.497, 73.831, ["culture", "food"], 0, 2, "Colourful Portuguese-era lanes."),
      a("chapora", "Chapora Fort", 15.606, 73.7364, ["culture", "nature"], 0, 1, "Sunset views over Vagator."),
    ],
    enRoute: [
      a("ganpatipule", "Ganpatipule Beach", 17.144, 73.264, ["beach", "spiritual"], 0, 1.5, "Beach temple on the Konkan coast."),
      a("tarkarli", "Tarkarli Beach", 16.03, 73.48, ["beach", "adventure"], 0, 2, "Clear water and snorkelling."),
      a("gokarna", "Om Beach, Gokarna", 14.5479, 74.3188, ["beach", "spiritual"], 0, 2, "Om-shaped beach and temple town."),
      a("dandeli", "Dandeli Forest", 15.25, 74.62, ["nature", "adventure"], 300, 2, "Kali river and hornbill forest."),
    ],
    hotels: [
      makeHotel("goa", 1, "Casa Azul Beach Villa", [15.5502, 73.7614], 5200, 4, "trusted", true, ["Pool", "Beach access"]),
      makeHotel("goa", 2, "Shack & Stay Baga", [15.5561, 73.7549], 1900, 2, "mixed", false, ["Beachfront"]),
      makeHotel("goa", 3, "Paradise Grand Resort & Casino", [15.5333, 73.7655], 3300, 5, "suspicious", false, ["Casino", "Pool"]),
      makeHotel("goa", 4, "Fontainhas Heritage Rooms", [15.4975, 73.8305], 2900, 3, "trusted", true, ["Heritage", "Breakfast"]),
    ],
    guides: guides("goa", [
      ["Joaquim Fernandes", ["English", "Konkani", "Hindi", "Portuguese"], 2200, 4.8, true],
      ["Priya Naik", ["English", "Hindi", "Marathi"], 1800, 4.7, true],
    ]),
  },
  {
    id: "munnar",
    name: "Munnar",
    region: "Kerala",
    coords: [10.0889, 77.0595],
    terrain: "hills",
    localTransportPerDay: 2600,
    railhead: { name: "Aluva", transferCost: 2800, transferHrs: 3.5 },
    airport: { name: "Kochi International", transferCost: 3200, transferHrs: 4 },
    attractions: [
      a("eravikulam", "Eravikulam National Park", 10.196, 77.061, ["nature"], 200, 3, "Nilgiri tahr and rolling grasslands."),
      a("mattupetty", "Mattupetty Dam & Lake", 10.106, 77.124, ["nature"], 0, 1.5, "Boating among tea hills."),
      a("teamuseum", "Tata Tea Museum", 10.096, 77.064, ["culture", "food"], 125, 1.5, "History of Munnar tea with tasting."),
      a("topstation", "Top Station", 10.124, 77.244, ["nature"], 0, 2.5, "Views over the Western Ghats into Tamil Nadu."),
      a("echopoint", "Echo Point", 10.123, 77.145, ["nature"], 20, 1, "Lakeside echo spot."),
      a("attukal", "Attukal Waterfalls", 10.081, 77.031, ["nature", "adventure"], 0, 2, "Trek to monsoon-fed falls."),
      a("kolukkumalai", "Kolukkumalai Sunrise Jeep", 10.07, 77.23, ["adventure", "nature"], 2000, 4, "World's highest organic tea estate."),
      a("spice", "Spice Plantation Walk", 10.042, 77.08, ["food", "nature"], 300, 1.5, "Cardamom, pepper, vanilla farms."),
    ],
    enRoute: [
      a("fortkochi", "Fort Kochi", 9.9658, 76.2421, ["culture", "food"], 0, 2, "Chinese fishing nets and colonial streets."),
      a("cheeyappara", "Cheeyappara Waterfalls", 10.05, 76.84, ["nature"], 0, 0.5, "Seven-step falls on the Kochi–Munnar road."),
      a("madurai", "Meenakshi Temple, Madurai", 9.9195, 78.1193, ["spiritual", "culture"], 0, 2, "Towering gopurams of Madurai."),
    ],
    hotels: [
      makeHotel("munnar", 1, "Tea Valley Resort", [10.0912, 77.0628], 4600, 4, "trusted", true, ["Valley view", "Restaurant"]),
      makeHotel("munnar", 2, "Misty Hills Homestay", [10.0801, 77.0555], 2000, 3, "trusted", true, ["Home-cooked meals"]),
      makeHotel("munnar", 3, "Cloud Nine Luxury Villas", [10.0998, 77.0711], 2500, 5, "suspicious", false, ["Jacuzzi"]),
      makeHotel("munnar", 4, "Cardamom County Inn", [10.0703, 77.0472], 2300, 3, "mixed", true, ["Parking"]),
    ],
    guides: guides("munnar", [
      ["Thomas Varghese", ["Malayalam", "English", "Tamil"], 1800, 4.8, true],
      ["Lakshmi Menon", ["Malayalam", "English", "Hindi"], 1700, 4.6, true],
    ]),
  },
  {
    id: "darjeeling",
    name: "Darjeeling",
    region: "West Bengal",
    coords: [27.041, 88.2663],
    terrain: "hills",
    localTransportPerDay: 2400,
    railhead: { name: "New Jalpaiguri (NJP)", transferCost: 2800, transferHrs: 3 },
    airport: { name: "Bagdogra", transferCost: 2800, transferHrs: 3 },
    attractions: [
      a("tigerhill", "Tiger Hill Sunrise", 26.996, 88.29, ["nature"], 50, 2.5, "Sunrise over Kangchenjunga."),
      a("batasia", "Batasia Loop", 27.014, 88.247, ["culture", "nature"], 50, 1, "Toy-train spiral and war memorial."),
      a("toytrain", "Darjeeling Himalayan Railway Joyride", 27.044, 88.266, ["culture", "adventure"], 1600, 2, "UNESCO heritage steam toy train."),
      a("peacepagoda", "Japanese Peace Pagoda", 27.033, 88.255, ["spiritual", "culture"], 0, 1, "Hilltop pagoda with panoramic views."),
      a("hmi", "Himalayan Mountaineering Institute & Zoo", 27.058, 88.255, ["culture", "nature"], 100, 2.5, "Everest museum and red pandas."),
      a("happyvalley", "Happy Valley Tea Estate", 27.057, 88.259, ["food", "nature"], 100, 1.5, "Tea factory tour and tasting."),
      a("ghoom", "Ghoom Monastery", 27.007, 88.249, ["spiritual", "culture"], 0, 1, "Yiga Choeling monastery, 1850."),
      a("glenarys", "Glenary's & Chowrasta", 27.0425, 88.264, ["food", "nightlife"], 0, 1.5, "Bakery and the Mall promenade."),
    ],
    enRoute: [
      a("kurseong", "Kurseong", 26.8806, 88.2775, ["nature", "culture"], 0, 1, "Land of white orchids."),
      a("mirik", "Mirik Lake", 26.887, 88.186, ["nature"], 0, 1.5, "Pine-ringed lake with boating."),
    ],
    hotels: [
      makeHotel("darjeeling", 1, "Kanchen View Heritage", [27.0435, 88.2644], 4400, 4, "trusted", true, ["Mountain view", "Fireplace"]),
      makeHotel("darjeeling", 2, "Mall Road Guesthouse", [27.0418, 88.2671], 1700, 2, "mixed", true, ["Central"]),
      makeHotel("darjeeling", 3, "Everest Grand Palace", [27.0389, 88.2622], 2600, 5, "suspicious", false, ["Spa"]),
      makeHotel("darjeeling", 4, "Orchid Hill Cottage", [27.0501, 88.2601], 2500, 3, "new", true, ["Garden", "Breakfast"]),
    ],
    guides: guides("darjeeling", [
      ["Pemba Sherpa", ["Nepali", "English", "Hindi", "Bengali"], 1900, 4.9, true],
      ["Anjali Pradhan", ["Nepali", "English", "Hindi"], 1600, 4.6, true],
    ]),
  },
];

export const destinationById = (id: string) => DESTINATIONS.find((d) => d.id === id)!;
export const originById = (id: string) => ORIGINS.find((o) => o.id === id)!;
export const allHotels = () => DESTINATIONS.flatMap((d) => d.hotels);
