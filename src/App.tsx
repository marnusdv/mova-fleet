// MOVA Fleet Manager Web Portal (Minimal Demo)
// Stack: React + TypeScript + Tailwind + maplibre-gl
// Notes:
// - All data is mocked. Replace fetch* functions with your real APIs when ready.
// - Map uses MapLibre public demo style; change MAP_STYLE_URL if needed.

import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MAP_STYLE_URL = "https://demotiles.maplibre.org/style.json";

// ---------- Types ----------
type Vehicle = {
  id: string;
  plate: string;
  driver: string;
  lat: number;
  lng: number;
  spendToday: number;
  spend7d: number;
  spend30d: number;
};

type Policy = {
  id: string;
  name: string;
  scope: "Fuel-Only" | "Fuel+Maintenance" | "Fuel+Tolls+Parking";
  dailyLimit: number;
  perTxnLimit: number;
  maxFillsPerDay: number;
  startHour: number;
  endHour: number;
  requiresMobileUnlock: boolean;
  geofenceCenter?: { lat: number; lng: number };
  geofenceRadiusKm?: number;
  mccAllow?: number[];
  mccBlock?: number[];
};

type ExceptionItem = {
  id: string;
  time: string;
  vehicleId: string;
  plate: string;
  driver: string;
  type: "Off-Route" | "Tank-Overfill" | "After-Hours" | "Card-Not-Present" | "Velocity" | "MCC-Blocked";
  amount: number;
  location: string;
  reason: string;
  status: "Open" | "Approved" | "Denied";
};

// ---------- Mock Data ----------
const mockVehicles: Vehicle[] = [
  { id: "V-101", plate: "NDL 123 GP", driver: "S. Dlamini", lat: -26.2041, lng: 28.0473, spendToday: 950,  spend7d: 5400, spend30d: 21000 },
  { id: "V-102", plate: "CPT 456 WC", driver: "A. Williams", lat: -33.9249, lng: 18.4241, spendToday: 1200, spend7d: 7200, spend30d: 28500 },
  { id: "V-103", plate: "DBN 789 KZN", driver: "K. Naidoo",  lat: -29.8587, lng: 31.0218, spendToday: 300,  spend7d: 4100, spend30d: 16000 },
  { id: "V-104", plate: "PLK 908 LP", driver: "T. Mokoena",  lat: -23.9045, lng: 29.4689, spendToday: 1800, spend7d: 9500, spend30d: 32000 },
];

const mockPolicies: Policy[] = [
  {
    id: "P-1", name: "Driver Fuel-Only", scope: "Fuel-Only",
    dailyLimit: 2500, perTxnLimit: 1500, maxFillsPerDay: 2,
    startHour: 6, endHour: 20, requiresMobileUnlock: true,
    geofenceCenter: { lat: -26.2041, lng: 28.0473 }, geofenceRadiusKm: 10,
    mccAllow: [5541, 5542],
  },
  {
    id: "P-2", name: "Maintenance & Fuel", scope: "Fuel+Maintenance",
    dailyLimit: 15000, perTxnLimit: 5000, maxFillsPerDay: 6,
    startHour: 5, endHour: 22, requiresMobileUnlock: false,
    mccAllow: [5541, 5542, 7538, 5013],
  },
];

const mockExceptions: ExceptionItem[] = [
  { id: "E-9001", time: new Date().toISOString(), vehicleId: "V-104", plate: "PLK 908 LP", driver: "T. Mokoena",
    type: "After-Hours", amount: 680, location: "N1 North, Polokwane",
    reason: "Swipe at 22:37 outside allowed 06:00–20:00 window", status: "Open" },
  { id: "E-9002", time: new Date(Date.now() - 3600_000).toISOString(), vehicleId: "V-103", plate: "DBN 789 KZN", driver: "K. Naidoo",
    type: "Off-Route", amount: 420, location: "Queensburgh, Durban",
    reason: "Vehicle 8km outside geofence at time of purchase", status: "Open" },
  { id: "E-9003", time: new Date(Date.now() - 7200_000).toISOString(), vehicleId: "V-101", plate: "NDL 123 GP", driver: "S. Dlamini",
    type: "MCC-Blocked", amount: 1200, location: "Braamfontein, JHB",
    reason: "Attempted purchase at blocked MCC 5812 (Restaurants)", status: "Open" },
];

// Pretend APIs (swap these with real fetch calls later)
const fetchVehicles = async () => mockVehicles;
const fetchPolicies = async () => mockPolicies;
const fetchExceptions = async () => mockExceptions;

// ---------- Helpers ----------
function vehiclesToGeoJSON(
  vehicles: Vehicle[],
  spendKey: keyof Pick<Vehicle, "spendToday" | "spend7d" | "spend30d">
) {
  return {
    type: "FeatureCollection",
    features: vehicles.map((v) => ({
      type: "Feature",
      properties: { id: v.id, plate: v.plate, driver: v.driver, spend: v[spendKey] },
      geometry: { type: "Point", coordinates: [v.lng, v.lat] },
    })),
  } as GeoJSON.FeatureCollection;
}

// ---------- Map Panel ----------
function MapPanel({
  vehicles,
  spendWindow,
}: {
  vehicles: Vehicle[];
  spendWindow: "today" | "7d" | "30d";
}) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(true);

  const geojson = useMemo(() => {
    const key = spendWindow === "today" ? "spendToday" : spendWindow === "7d" ? "spend7d" : "spend30d";
    return vehiclesToGeoJSON(vehicles, key as any);
  }, [vehicles, spendWindow]);

  useEffect(() => {
    if (containerRef.current && !mapRef.current) {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLE_URL,
        center: [28.0473, -26.2041], // Johannesburg
        zoom: 5,
      });
      map.addControl(new maplibregl.NavigationControl(), "top-right");

      map.on("load", () => {
        map.addSource("vehicles", { type: "geojson", data: geojson });

        // Heatmap layer
        map.addLayer({
          id: "vehicle-heat",
          type: "heatmap",
          source: "vehicles",
          maxzoom: 12,
          paint: {
            "heatmap-weight": ["interpolate", ["linear"], ["get", "spend"], 0, 0, 10000, 1],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 12, 2],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 2, 12, 30],
            "heatmap-opacity": 0.6,
          },
        });

        // Circles layer (when heatmap is off)
        map.addLayer({
          id: "vehicle-circles",
          type: "circle",
          source: "vehicles",
          paint: {
            "circle-radius": [
              "interpolate", ["linear"], ["get", "spend"],
              0, 4, 500, 6, 2000, 10, 10000, 18
            ],
            "circle-color": "#1f2937",
            "circle-opacity": 0.9,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-opacity": 0.8,
          },
        });

        // Labels
        map.addLayer({
          id: "vehicle-labels",
          type: "symbol",
          source: "vehicles",
          layout: {
            "text-field": ["concat", ["get", "plate"], "\nR ", ["get", "spend"]],
            "text-size": 12,
            "text-offset": [0, 1.2],
            "text-anchor": "top",
          },
          paint: {
            "text-halo-width": 1,
            "text-halo-color": "#ffffff",
          },
        });
      });

      mapRef.current = map;
    }
  }, []);

  // Update data + toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("vehicles") as GeoJSONSource | undefined;
    if (src) src.setData(geojson as any);

    const heatId = "vehicle-heat";
    const circId = "vehicle-circles";
    if (map.getLayer(heatId) && map.getLayer(circId)) {
      map.setLayoutProperty(heatId, "visibility", showHeatmap ? "visible" : "none");
      map.setLayoutProperty(circId, "visibility", showHeatmap ? "none" : "visible");
    }
  }, [geojson, showHeatmap]);

  return (
    <div className="border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className="font-semibold">Live Vehicles & Spend Overlay</div>
        <label className="inline-flex items-center gap-2 text-sm">
          <span>Heatmap</span>
          <input
            type="checkbox"
            checked={showHeatmap}
            onChange={(e) => setShowHeatmap(e.target.checked)}
          />
        </label>
      </div>
      <div ref={containerRef} className="h-[520px] w-full" />
    </div>
  );
}

// ---------- Policy Editor ----------
function PolicyEditor({
  policies,
  onSave,
}: {
  policies: Policy[];
  onSave: (p: Policy) => void;
}) {
  const [draft, setDraft] = useState<Policy>({
    id: "new",
    name: "New Policy",
    scope: "Fuel-Only",
    dailyLimit: 2500,
    perTxnLimit: 1500,
    maxFillsPerDay: 2,
    startHour: 6,
    endHour: 20,
    requiresMobileUnlock: true,
    geofenceCenter: { lat: -26.2041, lng: 28.0473 },
    geofenceRadiusKm: 10,
    mccAllow: [5541, 5542],
  });

  const update = <K extends keyof Policy>(key: K, value: Policy[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = () => {
    onSave({ ...draft, id: draft.id === "new" ? `P-${Date.now()}` : draft.id });
  };

  return (
    <div className="border rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Rule / Policy Editor</div>
        <button
          onClick={save}
          className="px-3 py-1.5 rounded-md bg-black text-white text-sm"
        >
          Save Policy
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm">Name</label>
          <input className="w-full border rounded-md px-2 py-1.5"
            value={draft.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm">Scope</label>
          <select
            className="w-full border rounded-md px-2 py-1.5"
            value={draft.scope}
            onChange={(e) => update("scope", e.target.value as Policy["scope"])}
          >
            <option value="Fuel-Only">Fuel-Only</option>
            <option value="Fuel+Maintenance">Fuel + Maintenance</option>
            <option value="Fuel+Tolls+Parking">Fuel + Tolls + Parking</option>
          </select>
        </div>
        <div>
          <label className="text-sm">Daily Limit (R)</label>
          <input type="number" className="w-full border rounded-md px-2 py-1.5"
            value={draft.dailyLimit}
            onChange={(e) => update("dailyLimit", Number(e.target.value))}
          />
        </div>
        <div>
          <label className="text-sm">Per-Txn Limit (R)</label>
          <input type="number" className="w-full border rounded-md px-2 py-1.5"
            value={draft.perTxnLimit}
            onChange={(e) => update("perTxnLimit", Number(e.target.value))}
          />
        </div>
        <div>
          <label className="text-sm">Max Fills / Day</label>
          <input type="number" className="w-full border rounded-md px-2 py-1.5"
            value={draft.maxFillsPerDay}
            onChange={(e) => update("maxFillsPerDay", Number(e.target.value))}
          />
        </div>
        <div>
          <label className="text-sm">Start Hour</label>
          <input type="number" min={0} max={23} className="w-full border rounded-md px-2 py-1.5"
            value={draft.startHour}
            onChange={(e) => update("startHour", Number(e.target.value))}
          />
        </div>
        <div>
          <label className="text-sm">End Hour</label>
          <input type="number" min={0} max={23} className="w-full border rounded-md px-2 py-1.5"
            value={draft.endHour}
            onChange={(e) => update("endHour", Number(e.target.value))}
          />
        </div>
        <div className="col-span-1 md:col-span-2 flex items-center gap-2">
          <input
            id="mobileUnlock"
            type="checkbox"
            checked={draft.requiresMobileUnlock}
            onChange={(e) => update("requiresMobileUnlock", e.target.checked)}
          />
          <label htmlFor="mobileUnlock" className="text-sm">Requires Mobile Unlock</label>
        </div>
        <div>
          <label className="text-sm">Geofence Center (lat,lng)</label>
          <div className="flex gap-2">
            <input type="number" className="w-full border rounded-md px-2 py-1.5"
              value={draft.geofenceCenter?.lat ?? 0}
              onChange={(e) =>
                update("geofenceCenter", { lat: Number(e.target.value), lng: draft.geofenceCenter?.lng ?? 0 })
              }
            />
            <input type="number" className="w-full border rounded-md px-2 py-1.5"
              value={draft.geofenceCenter?.lng ?? 0}
              onChange={(e) =>
                update("geofenceCenter", { lat: draft.geofenceCenter?.lat ?? 0, lng: Number(e.target.value) })
              }
            />
          </div>
        </div>
        <div>
          <label className="text-sm">Geofence Radius (km)</label>
          <input type="number" className="w-full border rounded-md px-2 py-1.5"
            value={draft.geofenceRadiusKm ?? 0}
            onChange={(e) => update("geofenceRadiusKm", Number(e.target.value))}
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm">MCC Allowlist (comma separated)</label>
          <input className="w-full border rounded-md px-2 py-1.5"
            value={(draft.mccAllow ?? []).join(",")}
            onChange={(e) =>
              update(
                "mccAllow",
                e.target.value
                  .split(",")
                  .map((n) => Number(n.trim()))
                  .filter((n) => !Number.isNaN(n))
              )
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="font-semibold">Existing Policies</div>
        <div className="space-y-2">
          {policies.map((p) => (
            <div key={p.id} className="border rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{p.name} <span className="ml-2 text-xs border rounded px-1 py-0.5">{p.scope}</span></div>
                <div className="text-xs text-gray-500">
                  Daily: R{p.dailyLimit} • Per-Txn: R{p.perTxnLimit} • Fills/Day: {p.maxFillsPerDay} • Hours: {p.startHour}:00–{p.endHour}:00
                </div>
                {p.geofenceCenter && (
                  <div className="text-xs text-gray-500">
                    Geofence: {p.geofenceCenter.lat.toFixed(4)}, {p.geofenceCenter.lng.toFixed(4)} • Radius {p.geofenceRadiusKm ?? 0} km
                  </div>
                )}
              </div>
              <button
                className="text-sm px-3 py-1.5 rounded-md border"
                onClick={() => setDraft(p)}
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Exceptions ----------
function ExceptionsTable({
  exceptions,
  onAction,
  onRefresh,
}: {
  exceptions: ExceptionItem[];
  onAction: (id: string, action: "Approved" | "Denied") => void;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<"All" | "Open" | "Approved" | "Denied">("Open");

  const filtered = useMemo(
    () => exceptions.filter((e) => (filter === "All" ? true : e.status === filter)),
    [exceptions, filter]
  );

  return (
    <div className="border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold">Exceptions Queue</div>
        <div className="flex items-center gap-2">
          <select
            className="border rounded-md px-2 py-1.5 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
          >
            <option>All</option>
            <option>Open</option>
            <option>Approved</option>
            <option>Denied</option>
          </select>
          <button className="px-3 py-1.5 rounded-md border text-sm" onClick={onRefresh}>
            Refresh
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left border-b">
            <tr>
              <th className="py-2 pr-4">Time</th>
              <th className="py-2 pr-4">Vehicle</th>
              <th className="py-2 pr-4">Driver</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Amount</th>
              <th className="py-2 pr-4">Location</th>
              <th className="py-2 pr-4">Reason</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-0 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-b">
                <td className="py-2 pr-4 whitespace-nowrap">{new Date(e.time).toLocaleString()}</td>
                <td className="py-2 pr-4 whitespace-nowrap">{e.plate}</td>
                <td className="py-2 pr-4 whitespace-nowrap">{e.driver}</td>
                <td className="py-2 pr-4 whitespace-nowrap">
                  <span className="text-xs border rounded px-1 py-0.5">{e.type}</span>
                </td>
                <td className="py-2 pr-4">R{e.amount.toFixed(2)}</td>
                <td className="py-2 pr-4 max-w-[220px] truncate" title={e.location}>{e.location}</td>
                <td className="py-2 pr-4 max-w-[320px] truncate" title={e.reason}>{e.reason}</td>
                <td className="py-2 pr-4">
                  {e.status === "Open" && <span className="text-xs bg-gray-900 text-white px-2 py-0.5 rounded">Open</span>}
                  {e.status === "Approved" && <span className="text-xs bg-gray-200 px-2 py-0.5 rounded">Approved</span>}
                  {e.status === "Denied" && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Denied</span>}
                </td>
                <td className="py-2 pr-0">
                  <div className="flex justify-end gap-2">
                    <button className="px-3 py-1.5 rounded-md border text-sm" onClick={() => onAction(e.id, "Approved")}>Approve</button>
                    <button className="px-3 py-1.5 rounded-md border text-sm bg-red-50" onClick={() => onAction(e.id, "Denied")}>Deny</button>
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-gray-500">No items</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Toolbar ----------
function Toolbar({
  spendWindow,
  setSpendWindow,
}: {
  spendWindow: "today" | "7d" | "30d";
  setSpendWindow: (v: "today" | "7d" | "30d") => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-xs border rounded px-2 py-1 bg-gray-50">Spend Window</span>
      <select
        className="border rounded-md px-2 py-1.5"
        value={spendWindow}
        onChange={(e) => setSpendWindow(e.target.value as any)}
      >
        <option value="today">Today</option>
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
      </select>
      <span className="ml-2 text-xs text-gray-500">Tip: use filters in each panel</span>
    </div>
  );
}

// ---------- Root App ----------
export default function App() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [spendWindow, setSpendWindow] = useState<"today" | "7d" | "30d">("today");
  const [tab, setTab] = useState<"map" | "policies" | "exceptions">("map");

  useEffect(() => {
    fetchVehicles().then(setVehicles);
    fetchPolicies().then(setPolicies);
    fetchExceptions().then(setExceptions);
  }, []);

  const handleSavePolicy = (p: Policy) => {
    setPolicies((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = p;
        return copy;
      }
      return [p, ...prev];
    });
  };

  const handleExceptionAction = (id: string, action: "Approved" | "Denied") => {
    setExceptions((prev) => prev.map((e) => (e.id === id ? { ...e, status: action } : e)));
  };

  const handleRefreshExceptions = () => {
    fetchExceptions().then(setExceptions);
  };

  const topSpendPlate =
    vehicles.length ? [...vehicles].sort((a, b) => b.spendToday - a.spendToday)[0].plate : "—";
  const topSpendValue =
    vehicles.length ? [...vehicles].sort((a, b) => b.spendToday - a.spendToday)[0].spendToday.toFixed(0) : "";

  return (
    <div className="min-h-full p-6 space-y-4 bg-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">MOVA Fleet Manager Portal</h1>
          <p className="text-sm text-gray-500">
            Live map, policy control, and real-time exceptions — demo with mocked data.
          </p>
        </div>
        <Toolbar spendWindow={spendWindow} setSpendWindow={setSpendWindow} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          className={`px-3 py-1.5 rounded-md border text-sm ${tab === "map" ? "bg-black text-white" : ""}`}
          onClick={() => setTab("map")}
        >
          Map
        </button>
        <button
          className={`px-3 py-1.5 rounded-md border text-sm ${tab === "policies" ? "bg-black text-white" : ""}`}
          onClick={() => setTab("policies")}
        >
          Policies
        </button>
        <button
          className={`px-3 py-1.5 rounded-md border text-sm ${tab === "exceptions" ? "bg-black text-white" : ""}`}
          onClick={() => setTab("exceptions")}
        >
          Exceptions
        </button>
      </div>

      {/* Content */}
      {tab === "map" && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            <MapPanel vehicles={vehicles} spendWindow={spendWindow} />
          </div>

          <div className="xl:col-span-1 space-y-4">
            <div className="border rounded-2xl">
              <div className="px-4 py-3 border-b bg-gray-50 font-semibold">Fleet Snapshot</div>
              <div className="p-4 grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl border">
                  <div className="text-xs text-gray-500">Vehicles</div>
                  <div className="text-2xl font-semibold">{vehicles.length}</div>
                </div>
                <div className="p-4 rounded-2xl border">
                  <div className="text-xs text-gray-500">Open Exceptions</div>
                  <div className="text-2xl font-semibold">{exceptions.filter(e => e.status === "Open").length}</div>
                </div>
                <div className="p-4 rounded-2xl border col-span-2">
                  <div className="text-xs text-gray-500 mb-1">Top Spend (vehicle today)</div>
                  <div className="text-sm">
                    {topSpendPlate} {topSpendValue && <span className="ml-2 font-medium">R{topSpendValue}</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "policies" && <PolicyEditor policies={policies} onSave={handleSavePolicy} />}

      {tab === "exceptions" && (
        <ExceptionsTable
          exceptions={exceptions}
          onAction={handleExceptionAction}
          onRefresh={handleRefreshExceptions}
        />
      )}
    </div>
  );
}
