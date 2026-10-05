"use client";

import "leaflet/dist/leaflet.css";
import { Fragment, useEffect } from "react";
import L from "leaflet";
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { DESTINATIONS, destinationById } from "@/lib/data";
import { findHotel } from "@/lib/planner";
import { HAZARDS } from "@/lib/safety";
import type { LatLng, SafetyAlert, Trip } from "@/lib/types";
import { DAY_COLORS } from "./dayColors";


const numberIcon = (n: number | string, color: string, faded = false) =>
  L.divIcon({
    className: "",
    html: `<div style="background:${faded ? "#9ca3af" : color};color:#fff;width:24px;height:24px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font:600 12px system-ui;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);${faded ? "text-decoration:line-through;" : ""}">${n}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

const emojiIcon = (e: string) =>
  L.divIcon({ className: "", html: `<div style="font-size:22px;line-height:22px">${e}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] });

function FitTo({ points }: { points: LatLng[] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 11);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

function ClickPicker({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick([e.latlng.lat, e.latlng.lng]) });
  return null;
}

/** Map for picking a destination (no trip yet). */
export function PickerMap({
  selectedId,
  onPick,
}: {
  selectedId: string;
  onPick: (p: LatLng) => void;
}) {
  return (
    <MapContainer center={[22.5, 79]} zoom={4} className="h-full w-full rounded-xl" scrollWheelZoom>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ClickPicker onPick={onPick} />
      {DESTINATIONS.map((d) => (
        <CircleMarker
          key={d.id}
          center={d.coords}
          radius={d.id === selectedId ? 11 : 7}
          pathOptions={{ color: d.id === selectedId ? "#db2777" : "#4b5563", fillOpacity: 0.8 }}
          eventHandlers={{ click: () => onPick(d.coords) }}
        >
          <Tooltip permanent={d.id === selectedId} direction="top">
            {d.name}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

/** Map of a planned trip: daily routes, hotel, journey and live hazard zones. */
export default function TripMap({ trip, alerts, focusDay }: { trip: Trip; alerts: SafetyAlert[]; focusDay?: number }) {
  const hotel = findHotel(trip.hotelId);
  const dest = destinationById(trip.destinationId);
  const days = trip.days.filter((d) => focusDay === undefined || d.day === focusDay);
  const points: LatLng[] = [hotel.coords, ...days.flatMap((d) => d.stops.map((s) => s.attraction.coords))];
  const journey: LatLng[] =
    trip.outbound.mode === "cab"
      ? [trip.origin.coords, ...trip.enRoute.map((a) => a.coords), dest.coords]
      : [trip.origin.coords, dest.coords];

  return (
    <MapContainer center={dest.coords} zoom={11} className="h-full w-full rounded-xl" scrollWheelZoom>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitTo points={points} />

      <Polyline positions={journey} pathOptions={{ color: "#6b7280", dashArray: "6 8", weight: 2 }} />
      <CircleMarker center={trip.origin.coords} radius={6} pathOptions={{ color: "#111827" }}>
        <Tooltip>Home: {trip.origin.name}</Tooltip>
      </CircleMarker>
      {trip.outbound.mode === "cab" &&
        trip.enRoute.map((a) => (
          <CircleMarker key={a.id} center={a.coords} radius={5} pathOptions={{ color: "#6b7280", fillOpacity: 0.7 }}>
            <Tooltip>On the way: {a.name}</Tooltip>
          </CircleMarker>
        ))}

      {alerts.map((al) => (
        <Circle
          key={al.id}
          center={al.coords}
          radius={al.radiusKm * 1000}
          pathOptions={{
            color: al.severity === "severe" ? "#dc2626" : al.severity === "warning" ? "#f59e0b" : "#3b82f6",
            fillOpacity: 0.18,
          }}
        >
          <Tooltip>
            {HAZARDS[al.type].icon} {al.title} ({al.severity})
          </Tooltip>
        </Circle>
      ))}
      {alerts.map((al) => (
        <Marker key={al.id + "i"} position={al.coords} icon={emojiIcon(HAZARDS[al.type].icon)} />
      ))}

      {days.map((d) => {
        const color = DAY_COLORS[(d.day - 1) % DAY_COLORS.length];
        const live = d.stops.filter((s) => !s.cancelled);
        return (
          <Fragment key={d.day}>
            {d.destinationId === trip.destinationId && live.length > 0 && (
              <Polyline positions={[hotel.coords, ...live.map((s) => s.attraction.coords)]} pathOptions={{ color, weight: 3 }} />
            )}
            {d.stops.map((s, i) => (
              <Marker key={s.attraction.id + i} position={s.attraction.coords} icon={numberIcon(d.day, color, s.cancelled)}>
                <Tooltip>
                  Day {d.day}: {s.attraction.name}
                  {s.cancelled ? ` — cancelled (${s.reason})` : s.replacement ? " — safe replacement" : ""}
                </Tooltip>
              </Marker>
            ))}
          </Fragment>
        );
      })}

      <Marker position={hotel.coords} icon={emojiIcon("🏨")}>
        <Tooltip>{hotel.name}</Tooltip>
      </Marker>
    </MapContainer>
  );
}
