import { useEffect, useMemo, useRef } from "react";

import "./NetworkSpectrum.css";

interface SpectrumProps {
  intensity: number;
  uploadMbps: number;
  downloadMbps: number;
  packetsPerSecond: number;
  pulseRate: number;
  protocol: string;
  active: boolean;
}

const BAR_COUNT = 64;

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.max(
    minimum,
    Math.min(value, maximum),
  );
}

export function NetworkSpectrum({
  intensity,
  uploadMbps,
  downloadMbps,
  packetsPerSecond,
  pulseRate,
  protocol,
  active,
}: SpectrumProps) {
  const phaseRef = useRef(0);
  const animationRef = useRef<number | null>(null);

  const barsRef = useRef<(HTMLDivElement | null)[]>(
    [],
  );

  const seed = useMemo(
    () =>
      Array.from(
        { length: BAR_COUNT },
        (_, index) => {
          const waveA =
            Math.sin(index * 0.47) * 0.5 + 0.5;

          const waveB =
            Math.sin(index * 0.17 + 1.7) * 0.5 + 0.5;

          return 0.18 + waveA * 0.35 + waveB * 0.25;
        },
      ),
    [],
  );

  useEffect(() => {
    if (!active) {
      if (animationRef.current !== null) {
        cancelAnimationFrame(
          animationRef.current,
        );

        animationRef.current = null;
      }

      return;
    }

    const animate = () => {
      phaseRef.current +=
        0.018 +
        clamp(pulseRate, 0.5, 8) *
          0.002;

      const trafficEnergy = clamp(
        intensity * 1.4 +
          uploadMbps * 0.15 +
          downloadMbps * 0.15 +
          packetsPerSecond * 0.002,
        0.05,
        1,
      );

      for (
        let index = 0;
        index < BAR_COUNT;
        index += 1
      ) {
        const element =
          barsRef.current[index];

        if (!element) {
          continue;
        }

        const wave1 =
          Math.sin(
            index * 0.42 +
              phaseRef.current * 2.1,
          );

        const wave2 =
          Math.sin(
            index * 0.13 -
              phaseRef.current * 1.4,
          );

        const wave3 =
          Math.sin(
            index * 0.71 +
              phaseRef.current * 0.8,
          );

        const center =
          1 -
          Math.abs(
            index -
              BAR_COUNT / 2,
          ) /
            (BAR_COUNT / 2);

        const shape =
          0.22 +
          Math.max(0, wave1) * 0.22 +
          Math.max(0, wave2) * 0.18 +
          Math.max(0, wave3) * 0.12 +
          center * 0.12;

        const value =
          clamp(
            seed[index] * 0.25 +
              shape * trafficEnergy,
            0.04,
            1,
          );

        element.style.height =
          `${value * 100}%`;

        element.style.opacity =
          `${0.45 + value * 0.55}`;
      }

      animationRef.current =
        requestAnimationFrame(animate);
    };

    animationRef.current =
      requestAnimationFrame(animate);

    return () => {
      if (
        animationRef.current !== null
      ) {
        cancelAnimationFrame(
          animationRef.current,
        );
      }
    };
  }, [
    active,
    intensity,
    uploadMbps,
    downloadMbps,
    packetsPerSecond,
    pulseRate,
    seed,
  ]);

  return (
    <div className="network-spectrum">
      <div className="spectrum-topline">
        <div>
          <span>
            LIVE NETWORK SPECTRUM
          </span>

          <strong>
            {protocol || "NETWORK"}
          </strong>
        </div>

        <div className="spectrum-status">
          <span
            className={
              active
                ? "spectrum-live-dot"
                : "spectrum-idle-dot"
            }
          />

          {active
            ? "LIVE"
            : "WAITING"}
        </div>
      </div>

      <div className="spectrum-display">
        <div className="spectrum-bars">
          {Array.from(
            { length: BAR_COUNT },
            (_, index) => (
              <div
                key={index}
                className={`spectrum-bar spectrum-bar-${index % 8}`}
                ref={(element) => {
                  barsRef.current[index] =
                    element;
                }}
              />
            ),
          )}
        </div>

        <div className="spectrum-baseline" />
      </div>

      <div className="spectrum-labels">
        <span>LOW</span>
        <span>
          PACKETS / TRAFFIC
        </span>
        <span>HIGH</span>
      </div>
    </div>
  );
}