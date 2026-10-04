import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createSonificationWebSocket,
  startSonification,
  stopSonification,
  type SonificationParameters,
  type SonificationStatus,
  type SonificationUpdate,
} from "../services/sonification";

import { AudioVisualizer } from "./AudioVisualizer";
import { NetworkSpectrum } from "./NetworkSpectrum";
import { VisualizerControls } from "./VisualizerControls";

import type {
  VisualizerStyle,
  VisualizerTheme,
} from "./VisualizerControls";

import "./SonificationPanel.css";

interface SonificationPanelProps {
  interfaceName: string;
}

interface AudioVoice {
  oscillator: OscillatorNode;
  gain: GainNode;
  panner: StereoPannerNode;
  filter: BiquadFilterNode;
}

const MASTER_VOLUME = 0.8;

const MUSICAL_SCALE = [
  220.0,
  261.63,
  293.66,
  329.63,
  392.0,
  440.0,
  523.25,
  587.33,
  659.25,
  783.99,
  880.0,
];

const MELODY_STEPS = [0, 2, 4, 3, 1, 2, 4, 2];
const MUSICAL_PULSE_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes.toFixed(0)} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

function getMusicalFrequency(
  pitchHz: number,
  intensity: number,
): number {
  const safePitch =
    clamp(
      pitchHz,
      220,
      880,
    );

  const nearest =
    MUSICAL_SCALE.reduce(
      (
        previous,
        current,
      ) => {
        return Math.abs(
          current -
            safePitch,
        ) <
          Math.abs(
            previous -
              safePitch,
          )
          ? current
          : previous;
      },
    );

  const octaveBoost =
    intensity > 0.75
      ? 2
      : intensity > 0.45
        ? 1
        : 1;

  return nearest *
    octaveBoost;
}

function getFifthFrequency(
  pitchHz: number,
  intensity: number,
): number {
  const root = getMusicalFrequency(pitchHz, intensity);
  const rootIndex = MUSICAL_SCALE.reduce(
    (nearestIndex, note, index) =>
      Math.abs(note - root) < Math.abs(MUSICAL_SCALE[nearestIndex] - root)
        ? index
        : nearestIndex,
    0,
  );
  const degree = rootIndex % 5;
  const octave = Math.floor(rootIndex / 5);
  const fifthDegree = degree + 3;
  const fifthNote = MUSICAL_SCALE[fifthDegree % 5];

  return fifthNote * 2 ** (octave + (fifthDegree >= 5 ? 1 : 0));
}

function getMusicalPulseRate(pulseRate: number): number {
  const normalized =
    (clamp(pulseRate, 0.5, 8) - 0.5) / 7.5;
  const target = 0.75 + normalized * 1.25;

  return MUSICAL_PULSE_RATES.reduce((nearest, rate) =>
    Math.abs(rate - target) < Math.abs(nearest - target)
      ? rate
      : nearest,
  );
}

function getWaveform(
  parameters: SonificationParameters,
): OscillatorType {
  if (
    parameters.protocol ===
    "UDP"
  ) {
    return "triangle";
  }

  if (
    parameters.protocol ===
    "ICMP"
  ) {
    return "triangle";
  }

  if (
    parameters.protocol ===
    "TCP"
  ) {
    return "sine";
  }

  return "sine";
}

function getDirectionPan(
  direction: string,
): number {
  const normalized =
    direction.toLowerCase();

  if (
    normalized ===
    "inbound"
  ) {
    return -0.75;
  }

  if (
    normalized ===
    "outbound"
  ) {
    return 0.75;
  }

  if (
    normalized ===
    "local"
  ) {
    return 0;
  }

  return 0;
}

function createVoice(
  context: AudioContext,
  destination: AudioNode,
): AudioVoice {
  const oscillator =
    context.createOscillator();

  const gain =
    context.createGain();

  const panner =
    context.createStereoPanner();

  const filter =
    context.createBiquadFilter();

  filter.type =
    "lowpass";

  filter.frequency.value =
    3200;

  filter.Q.value =
    0.8;

  oscillator.connect(
    filter,
  );

  filter.connect(
    gain,
  );

  gain.connect(
    panner,
  );

  panner.connect(
    destination,
  );

  gain.gain.value =
    0;

  oscillator.start();

  return {
    oscillator,
    gain,
    panner,
    filter,
  };
}

function stopVoice(
  context: AudioContext,
  voice: AudioVoice | null,
): void {
  if (!voice) {
    return;
  }

  const now =
    context.currentTime;

  voice.gain.gain.cancelScheduledValues(
    now,
  );

  voice.gain.gain.setTargetAtTime(
    0,
    now,
    0.08,
  );

  window.setTimeout(
    () => {
      try {
        voice.oscillator.stop();
      } catch {
        // Oscillator may already be stopped.
      }
    },
    500,
  );
}

export function SonificationPanel({
  interfaceName,
}: SonificationPanelProps) {
  const [
    status,
    setStatus,
  ] =
    useState<SonificationStatus | null>(
      null,
    );

  const [
    latestUpdate,
    setLatestUpdate,
  ] =
    useState<SonificationUpdate | null>(
      null,
    );

  const [
    audioEnabled,
    setAudioEnabled,
  ] =
    useState(false);

  const [
    analyser,
    setAnalyser,
  ] =
    useState<AnalyserNode | null>(
      null,
    );

  const [
    visualizerStyle,
    setVisualizerStyle,
  ] =
    useState<VisualizerStyle>(
      () => {
        const saved =
          localStorage.getItem(
            "netsonic.visualizer.style",
          );

        const validStyles: VisualizerStyle[] =
          [
            "spectrum",
            "waveform",
            "frequency",
            "oscilloscope",
            "filled",
            "combined",
          ];

        return saved &&
          validStyles.includes(
            saved as VisualizerStyle,
          )
          ? (saved as VisualizerStyle)
          : "combined";
      },
    );

  const [
    visualizerTheme,
    setVisualizerTheme,
  ] =
    useState<VisualizerTheme>(
      () => {
        const saved =
          localStorage.getItem(
            "netsonic.visualizer.theme",
          );

        const validThemes: VisualizerTheme[] =
          [
            "cyan",
            "neon",
            "purple",
            "green",
            "amber",
            "mono",
          ];

        return saved &&
          validThemes.includes(
            saved as VisualizerTheme,
          )
          ? (saved as VisualizerTheme)
          : "cyan";
      },
    );

  const [
    connectionState,
    setConnectionState,
  ] =
    useState<
      | "disconnected"
      | "connecting"
      | "connected"
    >("disconnected");

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const audioContextRef =
    useRef<AudioContext | null>(
      null,
    );

  const masterGainRef =
    useRef<GainNode | null>(
      null,
    );

  const compressorRef =
    useRef<DynamicsCompressorNode | null>(
      null,
    );

  const uploadVoiceRef =
    useRef<AudioVoice | null>(
      null,
    );

  const downloadVoiceRef =
    useRef<AudioVoice | null>(
      null,
    );

  const ambientVoiceRef =
    useRef<AudioVoice | null>(
      null,
    );

  const websocketRef =
    useRef<WebSocket | null>(
      null,
    );

  const pulseTimerRef =
    useRef<number | null>(
      null,
    );

  const latestParametersRef =
    useRef<SonificationParameters | null>(
      null,
    );

  const audioEnabledRef =
    useRef(false);

  const melodyStepRef =
    useRef(0);

  const handleVisualizerStyleChange =
    useCallback(
      (
        style: VisualizerStyle,
      ): void => {
        setVisualizerStyle(
          style,
        );

        localStorage.setItem(
          "netsonic.visualizer.style",
          style,
        );
      },
      [],
    );

  const handleVisualizerThemeChange =
    useCallback(
      (
        theme: VisualizerTheme,
      ): void => {
        setVisualizerTheme(
          theme,
        );

        localStorage.setItem(
          "netsonic.visualizer.theme",
          theme,
        );
      },
      [],
    );

  const updateStatus =
    useCallback(
      async () => {
        try {
          const response =
            await fetch(
              "http://127.0.0.1:8000/api/sonification/status",
            );

          if (!response.ok) {
            throw new Error(
              "Unable to retrieve sonification status.",
            );
          }

          const data =
            (await response.json()) as SonificationStatus;

          setStatus(
            data,
          );
        } catch {
          setStatus(
            null,
          );
        }
      },
      [],
    );

  useEffect(
    () => {
      void updateStatus();

      const interval =
        window.setInterval(
          () => {
            void updateStatus();
          },
          3000,
        );

      return () => {
        window.clearInterval(
          interval,
        );
      };
    },
    [updateStatus],
  );

  const disconnectWebSocket =
    useCallback(
      () => {
        const websocket =
          websocketRef.current;

        if (!websocket) {
          return;
        }

        websocket.onopen =
          null;

        websocket.onmessage =
          null;

        websocket.onerror =
          null;

        websocket.onclose =
          null;

        if (
          websocket.readyState ===
            WebSocket.OPEN ||
          websocket.readyState ===
            WebSocket.CONNECTING
        ) {
          websocket.close();
        }

        websocketRef.current =
          null;

        setConnectionState(
          "disconnected",
        );
      },
      [],
    );

  const stopPulseTimer =
    useCallback(
      () => {
        if (
          pulseTimerRef.current !==
          null
        ) {
          window.clearTimeout(
            pulseTimerRef.current,
          );

          pulseTimerRef.current =
            null;
        }
      },
      [],
    );

  const stopAudio =
    useCallback(
      async () => {
        audioEnabledRef.current =
          false;

        setAudioEnabled(
          false,
        );

        stopPulseTimer();

        disconnectWebSocket();

        const context =
          audioContextRef.current;

        if (context) {
          stopVoice(
            context,
            uploadVoiceRef.current,
          );

          stopVoice(
            context,
            downloadVoiceRef.current,
          );

          stopVoice(
            context,
            ambientVoiceRef.current,
          );

          uploadVoiceRef.current =
            null;

          downloadVoiceRef.current =
            null;

          ambientVoiceRef.current =
            null;

          try {
            await context.close();
          } catch {
            // Context may already be closed.
          }
        }

        audioContextRef.current =
          null;

        masterGainRef.current =
          null;

        compressorRef.current =
          null;

        setAnalyser(
          null,
        );

        try {
          await stopSonification();
        } catch {
          // Backend may already be stopped.
        }

        await updateStatus();
      },
      [
        disconnectWebSocket,
        stopPulseTimer,
        updateStatus,
      ],
    );

  const createAudioEngine =
    useCallback(
      async () => {
        const AudioContextClass =
          window.AudioContext ||
          (
            window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;

        if (!AudioContextClass) {
          throw new Error(
            "Web Audio API is not supported by this browser.",
          );
        }

        const context =
          new AudioContextClass();

        const compressor =
          context.createDynamicsCompressor();

        compressor.threshold.value =
          -24;

        compressor.knee.value =
          18;

        compressor.ratio.value =
          8;

        compressor.attack.value =
          0.003;

        compressor.release.value =
          0.15;

        const masterGain =
          context.createGain();

        const analyserNode =
          context.createAnalyser();

        /*
         * Larger FFT gives the visualizers enough
         * resolution for detailed spectrum rendering.
         */
        analyserNode.fftSize =
          2048;

        analyserNode.smoothingTimeConstant =
          0.72;

        /*
         * Make the visualizer respond strongly
         * while keeping the actual audio controlled
         * by the compressor.
         */
        analyserNode.minDecibels =
          -90;

        analyserNode.maxDecibels =
          -5;

        masterGain.gain.value =
          MASTER_VOLUME;

        compressor.connect(
          masterGain,
        );

        masterGain.connect(
          analyserNode,
        );

        analyserNode.connect(
          context.destination,
        );

        await context.resume();

        const uploadVoice =
          createVoice(
            context,
            compressor,
          );

        const downloadVoice =
          createVoice(
            context,
            compressor,
          );

        const ambientVoice =
          createVoice(
            context,
            compressor,
          );

        uploadVoiceRef.current =
          uploadVoice;

        downloadVoiceRef.current =
          downloadVoice;

        ambientVoiceRef.current =
          ambientVoice;

        audioContextRef.current =
          context;

        compressorRef.current =
          compressor;

        masterGainRef.current =
          masterGain;

        setAnalyser(
          analyserNode,
        );
      },
      [],
    );

  const updateContinuousVoices =
    useCallback(
      (
        parameters: SonificationParameters,
      ) => {
        const context =
          audioContextRef.current;

        if (!context) {
          return;
        }

        const now =
          context.currentTime;

        const intensity =
          clamp(
            parameters.intensity,
            0,
            1,
          );

        const musicalFrequency =
          getMusicalFrequency(
            parameters.pitch_hz,
            intensity,
          );

        const baseVolume = clamp(
          parameters.volume * intensity * 0.11,
          0,
          0.16,
        );

        const upload =
          uploadVoiceRef.current;

        const download =
          downloadVoiceRef.current;

        const ambient =
          ambientVoiceRef.current;

        /*
         * Upload voice.
         */
        if (upload) {
          upload.oscillator.type =
            "sine";

          upload.oscillator.frequency.cancelScheduledValues(
            now,
          );

          upload.oscillator.frequency.setTargetAtTime(
            getFifthFrequency(parameters.pitch_hz, intensity),
            now,
            0.08,
          );

          upload.panner.pan.setTargetAtTime(
            0.78,
            now,
            0.08,
          );

          upload.filter.frequency.setTargetAtTime(
            900 + intensity * 1600,
            now,
            0.08,
          );

          upload.gain.gain.setTargetAtTime(
            baseVolume *
              0.55,
            now,
            0.08,
          );
        }

        /*
         * Download voice.
         */
        if (download) {
          download.oscillator.type =
            "sine";

          download.oscillator.frequency.cancelScheduledValues(
            now,
          );

          download.oscillator.frequency.setTargetAtTime(
            musicalFrequency,
            now,
            0.08,
          );

          download.panner.pan.setTargetAtTime(
            -0.78,
            now,
            0.08,
          );

          download.filter.frequency.setTargetAtTime(
            800 + intensity * 1800,
            now,
            0.08,
          );

          download.gain.gain.setTargetAtTime(
            baseVolume,
            now,
            0.08,
          );
        }

        /*
         * Ambient network bed.
         */
        if (ambient) {
          ambient.oscillator.type =
            "sine";

          ambient.oscillator.frequency.setTargetAtTime(
            musicalFrequency /
              2,
            now,
            0.12,
          );

          ambient.panner.pan.setTargetAtTime(
            0,
            now,
            0.12,
          );

          ambient.filter.frequency.setTargetAtTime(
            650 + intensity * 850,
            now,
            0.12,
          );

          ambient.gain.gain.setTargetAtTime(
            intensity * 0.018,
            now,
            0.12,
          );
        }
      },
      [],
    );

  const triggerPulse =
    useCallback(
      () => {
        const context =
          audioContextRef.current;

        if (
          !context ||
          !audioEnabledRef.current
        ) {
          return;
        }

        const parameters =
          latestParametersRef.current;

        if (!parameters) {
          return;
        }

        const now =
          context.currentTime;

        const intensity =
          clamp(
            parameters.intensity,
            0,
            1,
          );

        if (intensity < 0.015) {
          return;
        }

        const melodyOffset =
          MELODY_STEPS[
            melodyStepRef.current % MELODY_STEPS.length
          ];
        const melodyPosition = melodyOffset;
        const frequency = Math.min(
          1320,
          MUSICAL_SCALE[melodyPosition % MUSICAL_SCALE.length] *
            (intensity > 0.72 ? 2 : 1),
        );
        melodyStepRef.current += 1;

        const waveform =
          getWaveform(
            parameters,
          );

        const volume = clamp(
          parameters.volume *
            intensity * 0.1,
          0,
          0.16,
        );

        const direction =
          parameters.direction.toLowerCase();

        const pan =
          getDirectionPan(
            direction,
          );

        const oscillator =
          context.createOscillator();

        const gain =
          context.createGain();

        const panner =
          context.createStereoPanner();

        const filter =
          context.createBiquadFilter();

        oscillator.type =
          waveform;

        oscillator.frequency.value =
          frequency;

        panner.pan.value =
          pan;

        filter.type =
          "lowpass";

        filter.frequency.value =
          1600 +
          intensity *
            5200;

        filter.Q.value =
          1.2;

        oscillator.connect(
          filter,
        );

        filter.connect(
          gain,
        );

        gain.connect(
          panner,
        );

        panner.connect(
          compressorRef.current ??
            context.destination,
        );

        const peak = clamp(
          volume * 0.65,
          0.003,
          0.1,
        );

        const attack =
          0.012;

        const decay =
          0.26 + (1 - intensity) * 0.12;

        gain.gain.setValueAtTime(
          0,
          now,
        );

        gain.gain.linearRampToValueAtTime(
          peak,
          now +
            attack,
        );

        gain.gain.exponentialRampToValueAtTime(
          0.001,
          now +
            attack +
            decay,
        );

        oscillator.start(
          now,
        );

        oscillator.stop(
          now +
            attack +
            decay +
            0.03,
        );
      },
      [],
    );

  const startPulseTimer =
    useCallback(
      () => {
        if (pulseTimerRef.current !== null) {
          return;
        }

        const schedule =
          () => {
            const parameters =
              latestParametersRef.current;

            if (
              !parameters ||
              !audioEnabledRef.current
            ) {
              return;
            }

            const pulseRate = getMusicalPulseRate(
              parameters.pulse_rate_hz,
            );

            const interval =
              1000 /
              pulseRate;

            triggerPulse();

            pulseTimerRef.current =
              window.setTimeout(
                schedule,
                interval,
              );
          };

        schedule();
      },
      [
        triggerPulse,
      ],
    );

  const handleUpdate =
    useCallback(
      (
        update: SonificationUpdate,
      ) => {
        setLatestUpdate(
          update,
        );

        latestParametersRef.current =
          update.parameters;

        updateContinuousVoices(
          update.parameters,
        );

        startPulseTimer();
      },
      [
        startPulseTimer,
        updateContinuousVoices,
      ],
    );

  const connectWebSocket =
    useCallback(
      () => {
        disconnectWebSocket();

        setConnectionState(
          "connecting",
        );

        const websocket =
          createSonificationWebSocket();

        websocketRef.current =
          websocket;

        websocket.onopen =
          () => {
            setConnectionState(
              "connected",
            );
          };

        websocket.onmessage =
          (event) => {
            try {
              const update =
                JSON.parse(
                  event.data,
                ) as SonificationUpdate;

              if (
                update.type ===
                "sonification_update"
              ) {
                handleUpdate(
                  update,
                );
              }
            } catch {
              setError(
                "Received invalid sonification data.",
              );
            }
          };

        websocket.onerror =
          () => {
            setError(
              "Unable to connect to the sonification stream.",
            );
          };

        websocket.onclose =
          () => {
            setConnectionState(
              "disconnected",
            );
          };
      },
      [
        disconnectWebSocket,
        handleUpdate,
      ],
    );

  const startAudio =
    useCallback(
      async () => {
        try {
          setError(
            null,
          );

          if (!interfaceName) {
            throw new Error(
              "Select a network interface first.",
            );
          }

          /*
           * Browser audio requires an explicit
           * user interaction.
           */
          await createAudioEngine();

          /*
           * Traffic monitoring is already started
           * automatically by the backend.
           *
           * This only enables the sonification stream.
           */
          await startSonification(
            interfaceName,
          );

          audioEnabledRef.current =
            true;

          setAudioEnabled(
            true,
          );

          connectWebSocket();

          await updateStatus();
        } catch (
          audioError
        ) {
          audioEnabledRef.current =
            false;

          setAudioEnabled(
            false,
          );

          setError(
            audioError instanceof
              Error
              ? audioError.message
              : "Unable to start audio.",
          );

          const context =
            audioContextRef.current;

          if (context) {
            try {
              await context.close();
            } catch {
              // Ignore cleanup failure.
            }
          }

          audioContextRef.current =
            null;

          masterGainRef.current =
            null;

          compressorRef.current =
            null;

          setAnalyser(
            null,
          );
        }
      },
      [
        connectWebSocket,
        createAudioEngine,
        interfaceName,
        updateStatus,
      ],
    );

  useEffect(
    () => {
      return () => {
        audioEnabledRef.current =
          false;

        stopPulseTimer();

        disconnectWebSocket();

        const context =
          audioContextRef.current;

        if (context) {
          try {
            void context.close();
          } catch {
            // Ignore cleanup failure.
          }
        }

        void stopSonification();
      };
    },
    [
      disconnectWebSocket,
      stopPulseTimer,
    ],
  );

  const intensity =
    latestUpdate?.parameters
      .intensity ?? 0;
  const protocols =
    latestUpdate?.protocols ?? [];

  const protocolPacketCount = (
    names: string[],
  ) => protocols
    .filter((item) => names.includes(item.protocol.toUpperCase()))
    .reduce((total, item) => total + item.packets, 0);

  const tcpPackets = protocolPacketCount(["TCP"]);
  const udpPackets = protocolPacketCount(["UDP"]);
  const icmpPackets = protocolPacketCount(["ICMP"]);
  const otherPackets = protocols
    .filter((item) => !["TCP", "UDP", "ICMP"].includes(item.protocol.toUpperCase()))
    .reduce((total, item) => total + item.packets, 0);
  const totalProtocolPackets =
    tcpPackets + udpPackets + icmpPackets + otherPackets;

  const percentage = (packets: number) =>
    totalProtocolPackets > 0
      ? `${Math.round((packets / totalProtocolPackets) * 100)}%`
      : "0%";

  const peers = latestUpdate?.peers ?? [];
  const busiestPeer = peers.reduce<SonificationUpdate["peers"][number] | null>(
    (busiest, peer) => !busiest || peer.bytes > busiest.bytes ? peer : busiest,
    null,
  );

  const connectionLabel =
    connectionState ===
    "connected"
      ? "STREAM CONNECTED"
      : connectionState ===
          "connecting"
        ? "CONNECTING"
        : "STREAM OFFLINE";

  return (
    <section className="sonification-panel">
      <div className="sonification-header">
        <div>
          <p className="eyebrow">
            NETWORK SONIFICATION
          </p>

          <h2>
            Hear the network
          </h2>

          <p className="sonification-description">
            Convert live network activity into
            adaptive musical signals.
          </p>
        </div>

        <div className="sonification-status">
          <span
            className={`status-indicator ${
              audioEnabled
                ? "status-online-indicator"
                : ""
            }`}
          />

          <span>
            {audioEnabled
              ? "AUDIO ACTIVE"
              : "AUDIO READY"}
          </span>
          <span className="sonification-client-count">
            {status?.connected_clients ?? 0} CLIENTS
          </span>
        </div>
      </div>

      <div className="sonification-controls">
        <div>
          <span className="sonification-interface-label">
            INTERFACE
          </span>

          <strong>
            {interfaceName || "No interface selected"}
          </strong>
        </div>

        <div className="sonification-actions">
          {!audioEnabled ? (
            <button
              type="button"
              className="sonification-button sonification-button-primary"
              onClick={() => {
                void startAudio();
              }}
              disabled={!interfaceName}
            >
              Start Audio
            </button>
          ) : (
            <button
              type="button"
              className="sonification-button sonification-button-danger"
              onClick={() => {
                void stopAudio();
              }}
            >
              Stop Audio
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          className="sonification-error"
          role="alert"
        >
          {error}
        </div>
      )}

      <VisualizerControls
        style={visualizerStyle}
        theme={visualizerTheme}
        onStyleChange={
          handleVisualizerStyleChange
        }
        onThemeChange={
          handleVisualizerThemeChange
        }
      />

      <div className="sonification-visualizer-card">
        <div className="sonification-visualizer-header">
          <div>
            <span>
              NETWORK AUDIO ANALYZER
            </span>

            <strong>
              {visualizerStyle ===
              "filled"
                ? "FILLED WAVEFORM"
                : visualizerStyle.toUpperCase()}
            </strong>
          </div>

          <div className="sonification-live-indicator">
            <span
              className={
                audioEnabled
                  ? "live-dot"
                  : "live-dot inactive"
              }
            />

            <span>
              {connectionLabel}
            </span>
          </div>
        </div>

        <AudioVisualizer
          analyser={analyser}
          style={visualizerStyle}
          theme={visualizerTheme}
          active={
            audioEnabled &&
            analyser !== null
          }
        />
      </div>

      {latestUpdate && (
        <NetworkSpectrum
          intensity={
            latestUpdate.parameters.intensity
          }
          uploadMbps={
            latestUpdate.traffic.upload_mbps
          }
          downloadMbps={
            latestUpdate.traffic.download_mbps
          }
          packetsPerSecond={
            latestUpdate.traffic.packets_per_second
          }
          pulseRate={
            latestUpdate.parameters.pulse_rate_hz
          }
          protocol={
            latestUpdate.parameters.protocol
          }
          active={audioEnabled}
        />
      )}

      <div className="sonification-sound-guide" aria-label="Audio sound guide">
        <div className="sonification-sound-guide-heading">
          <span>WHAT YOU’RE HEARING</span>
          <small>Network events are mapped to a soft A-minor pentatonic soundscape.</small>
        </div>
        <div className="sonification-sound-guide-items">
          <div className="sonification-sound-guide-item">
            <strong>DOWNLOAD · LEFT</strong>
            <span>A low, smooth note follows incoming traffic.</span>
          </div>
          <div className="sonification-sound-guide-item">
            <strong>UPLOAD · RIGHT</strong>
            <span>A higher note forms a consonant fifth with download.</span>
          </div>
          <div className="sonification-sound-guide-item">
            <strong>PACKETS · MELODY</strong>
            <span>Soft plucked notes play in a repeating musical phrase; busier traffic speeds it up.</span>
          </div>
          <div className="sonification-sound-guide-item">
            <strong>PROTOCOL · TONE</strong>
            <span>TCP uses a smooth sine tone; UDP and ICMP use a gentle triangle tone.</span>
          </div>
          <div className="sonification-sound-guide-item">
            <strong>ACTIVITY · VOLUME</strong>
            <span>More activity raises the sound level. Inbound notes pan left, outbound right, and local traffic stays centered.</span>
          </div>
        </div>
      </div>

      <div className="sonification-summary-grid">
        <div className="sonification-summary-card">
          <span>DOWNLOAD</span>
          <strong>{(latestUpdate?.traffic.download_mbps ?? 0).toFixed(2)} Mbps</strong>
        </div>
        <div className="sonification-summary-card">
          <span>UPLOAD</span>
          <strong>{(latestUpdate?.traffic.upload_mbps ?? 0).toFixed(2)} Mbps</strong>
        </div>
        <div className="sonification-summary-card">
          <span>PACKETS</span>
          <strong>{Math.round(latestUpdate?.traffic.packets_per_second ?? 0)} p/s</strong>
        </div>
        <div className="sonification-summary-card">
          <span>INTENSITY</span>
          <strong>{(intensity * 100).toFixed(0)}%</strong>
        </div>
        <div className="sonification-summary-card">
          <span>TCP</span>
          <strong>{percentage(tcpPackets)}</strong>
        </div>
        <div className="sonification-summary-card">
          <span>UDP</span>
          <strong>{percentage(udpPackets)}</strong>
        </div>
        <div className="sonification-summary-card">
          <span>ICMP</span>
          <strong>{percentage(icmpPackets)}</strong>
        </div>
        <div className="sonification-summary-card">
          <span>OTHER</span>
          <strong>{percentage(otherPackets)}</strong>
        </div>
        <div className="sonification-summary-card">
          <span>TOTAL PACKETS</span>
          <strong>{(latestUpdate?.traffic.total_packets ?? 0).toLocaleString()}</strong>
        </div>
        <div className="sonification-summary-card">
          <span>TOTAL DATA</span>
          <strong>{formatBytes(latestUpdate?.traffic.total_bytes ?? 0)}</strong>
        </div>
        <div className="sonification-summary-card">
          <span>ACTIVE PEERS</span>
          <strong>{peers.length.toLocaleString()}</strong>
        </div>
        <div className="sonification-summary-card">
          <span>TOP PEER</span>
          <strong title={busiestPeer?.ip_address ?? "No peer data"}>
            {busiestPeer?.ip_address ?? "—"}
          </strong>
        </div>
      </div>
    </section>
  );
}
