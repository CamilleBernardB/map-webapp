import { useEffect, useRef } from "react";
import maplibregl, { Map, Marker } from "maplibre-gl";
import type { GeoFix, GeoStatus } from "../services/geolocation";
import { createSmoother } from "../services/smoothing";
import type { Landmark } from "../types/landmark";

const DEFAULT_CENTER: [number, number] = [-122.4194, 37.7749];
const CAMERA_DEBOUNCE_MS = 250;

type MapViewProps = {
  fix: GeoFix | null;
  follow: boolean;
  status: GeoStatus;
  debugMode: boolean;
  landmarks: Landmark[];
};

export default function MapView({
  fix,
  follow,
  status,
  debugMode,
  landmarks
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const landmarkMarkersRef = useRef<Marker[]>([]);
  const smootherRef = useRef(createSmoother());
  const followRef = useRef(follow);
  const statusRef = useRef(status);
  const animationRef = useRef<number | null>(null);
  const lastCameraUpdate = useRef(0);

  useEffect(() => {
    followRef.current = follow;
  }, [follow]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const tileUrl =
      import.meta.env.VITE_TILE_URL ??
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

    let map: Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: [tileUrl],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors"
            }
          },
          layers: [
            {
              id: "osm",
              type: "raster",
              source: "osm"
            }
          ]
        },
        center: DEFAULT_CENTER,
        zoom: 15,
        pitch: 0,
        bearing: 0
      });
    } catch (error) {
      console.error("MapLibre init failed", error);
      return;
    }

    const markerEl = document.createElement("div");
    markerEl.className = "map-marker";

    const marker = new maplibregl.Marker({ element: markerEl, anchor: "center" })
      .setLngLat(DEFAULT_CENTER)
      .addTo(map);

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      marker.remove();
      landmarkMarkersRef.current.forEach((landmarkMarker) => landmarkMarker.remove());
      landmarkMarkersRef.current = [];
      map.remove();
      markerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (fix) {
      smootherRef.current.setTarget(fix);
    }
  }, [fix]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    landmarkMarkersRef.current.forEach((marker) => marker.remove());
    landmarkMarkersRef.current = [];

    if (!debugMode) {
      return;
    }

    const markers = landmarks.map((landmark) => {
      const markerEl = document.createElement("div");
      markerEl.className = "landmark-marker";
      markerEl.title = landmark.name;
      return new maplibregl.Marker({ element: markerEl, anchor: "center" })
        .setLngLat([landmark.lng, landmark.lat])
        .addTo(map);
    });

    landmarkMarkersRef.current = markers;
  }, [debugMode, landmarks]);

  useEffect(() => {
    const tick = (now: number) => {
      const map = mapRef.current;
      const marker = markerRef.current;
      const position = smootherRef.current.update(now);

      if (map && marker && position) {
        marker.setLngLat([position.lng, position.lat]);

        if (followRef.current && statusRef.current === "watching") {
          // Rate-limit camera updates to avoid jitter while following.
          if (now - lastCameraUpdate.current > CAMERA_DEBOUNCE_MS) {
            map.easeTo({
              center: [position.lng, position.lat],
              duration: CAMERA_DEBOUNCE_MS,
              essential: true
            });
            lastCameraUpdate.current = now;
          }
        }
      }

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return <div ref={containerRef} className="map-container" />;
}
