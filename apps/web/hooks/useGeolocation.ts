"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLng } from "@fantom/shared";
import { LOCATION } from "@fantom/shared";

export type GeoPermissionStatus = "idle" | "granted" | "denied" | "unavailable" | "error";

export type UseGeolocationOptions = {
  enabled: boolean;
  onLocationUpdate?: (payload: {
    position: LatLng;
    accuracyM: number;
    clientTimestamp: number;
  }) => void;
};

export type UseGeolocationResult = {
  status: GeoPermissionStatus;
  lastPosition: LatLng | null;
  accuracyM: number | null;
  errorMessage: string | null;
  requestLocationPermission: () => Promise<boolean>;
};

export function useGeolocation({
  enabled,
  onLocationUpdate,
}: UseGeolocationOptions): UseGeolocationResult {
  const [status, setStatus] = useState<GeoPermissionStatus>("idle");
  const [lastPosition, setLastPosition] = useState<LatLng | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const lastSentAtRef = useRef<number>(0);
  const onUpdateRef = useRef(onLocationUpdate);
  onUpdateRef.current = onLocationUpdate;

  const requestLocationPermission = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unavailable");
      setErrorMessage("Geolocation is not supported by this browser.");
      return false;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: LatLng = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          const acc = Math.max(0, pos.coords.accuracy);
          setStatus("granted");
          setLastPosition(coords);
          setAccuracyM(acc);
          setErrorMessage(null);
          resolve(true);
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setStatus("denied");
            setErrorMessage("Location permission denied. Please allow location access to play.");
          } else {
            setStatus("error");
            setErrorMessage(err.message || "Unable to acquire GPS fix.");
          }
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 2000 }
      );
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unavailable");
      setErrorMessage("Geolocation is not supported by this browser.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        const coords: LatLng = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        const acc = Math.max(0, pos.coords.accuracy);
        setStatus("granted");
        setLastPosition(coords);
        setAccuracyM(acc);
        setErrorMessage(null);

        // Throttle UPDATE_LOCATION to <= 2 Hz (LOCATION.minUpdateIntervalMs = 500ms)
        if (now - lastSentAtRef.current >= LOCATION.minUpdateIntervalMs) {
          lastSentAtRef.current = now;
          onUpdateRef.current?.({
            position: coords,
            accuracyM: acc,
            clientTimestamp: now,
          });
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus("denied");
          setErrorMessage("Location permission denied.");
        } else {
          setStatus("error");
          setErrorMessage(err.message || "GPS signal temporarily unavailable.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled]);

  return {
    status,
    lastPosition,
    accuracyM,
    errorMessage,
    requestLocationPermission,
  };
}
