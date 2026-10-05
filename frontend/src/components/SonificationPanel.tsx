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
import {
  DrumMachine,
  ElectricPiano,
  Soundfont,
  type Smplr,
} from "smplr";

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

type SoundInstrument = "keyboard" | "piano" | "flute" | "guitar" | "drums";

const SOUND_INSTRUMENTS: { value: SoundInstrument; label: string }[] = [
  { value: "keyboard", label: "Wurlitzer Keyboard" },
  { value: "piano", label: "Acoustic Piano" },
  { value: "flute", label: "Flute" },
  { value: "guitar", label: "Nylon Guitar" },
  { value: "drums", label: "TR-808 Drums" },
];

const MASTER_VOLUME = 0.8;

const PENTATONIC_MIDI = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81];
const MELODY_PATTERNS = [
  [0, 2, 4, 2, 1, 2, 4, 0],
  [0, 1, 3, 2, 4, 3, 1, 0],
  [0, 2, 1, 3, 4, 2, 3, 0],
  [0, 3, 4, 1, 2, 4, 3, 0],
];
const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

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

function getDirectionPan(direction: string): number {
  switch (direction.toLowerCase()) {
    case "inbound": return -0.75;
    case "outbound": return 0.75;
    default: return 0;
  }
}

function midiNoteName(note: number): string {
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
}

function getNoteFromTrafficPitch(pitchHz: number, scaleOffset: number): number {
  const midiPitch = 69 + 12 * Math.log2(clamp(pitchHz, 220, 880) / 440);
  const rootIndex = PENTATONIC_MIDI.reduce(
    (best, note, index) => Math.abs(note - midiPitch) < Math.abs(PENTATONIC_MIDI[best] - midiPitch) ? index : best,
    0,
  );
  const phraseIndex = rootIndex + scaleOffset;
  return PENTATONIC_MIDI[phraseIndex % PENTATONIC_MIDI.length]
    + 12 * Math.floor(phraseIndex / PENTATONIC_MIDI.length);
}

function getTempoFromPacketRate(packetsPerSecond: number): number {
  return Math.round(clamp(76 + Math.log2(1 + Math.max(0, packetsPerSecond)) * 17, 76, 165));
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

  const instrumentPlayersRef = useRef(new Map<SoundInstrument, Smplr>());
  const instrumentLoadsRef = useRef(new Map<SoundInstrument, Promise<Smplr>>());
  const [readyInstruments, setReadyInstruments] = useState<SoundInstrument[]>([]);
  const drumMachineRef = useRef<ReturnType<typeof DrumMachine> | null>(null);
  const drumMappingErrorRef = useRef(false);
  const [instrumentLoading, setInstrumentLoading] = useState(false);
  const [sampleLoadProgress, setSampleLoadProgress] = useState({ loaded: 0, total: 0 });
  const loadingInstrumentRef = useRef<SoundInstrument | null>(null);

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

  const latestPacketRateRef = useRef(0);
  const lastTrafficUpdateAtRef = useRef(0);
  const [trafficUpdateStale, setTrafficUpdateStale] = useState(false);
  const [playedNote, setPlayedNote] = useState<{ note: string; velocity: number; bpm: number } | null>(null);
  const [instrumentPreviewing, setInstrumentPreviewing] = useState(false);
  const previewTimeoutRef = useRef<number | null>(null);

  const audioEnabledRef =
    useRef(false);

  const melodyStepRef =
    useRef(0);

  const melodyPatternRef = useRef(0);

  const [instrument, setInstrument] = useState<SoundInstrument>(() => {
    const saved = localStorage.getItem("netsonic.sound.instrument");
    return SOUND_INSTRUMENTS.some((item) => item.value === saved)
      ? (saved as SoundInstrument)
      : "piano";
  });

  const instrumentRef = useRef<SoundInstrument>(instrument);

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
      const initialStatusTimeout = window.setTimeout(() => void updateStatus(), 0);

      const interval =
        window.setInterval(
          () => {
            void updateStatus();
          },
          3000,
        );

      return () => {
        window.clearTimeout(initialStatusTimeout);
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

        const context = audioContextRef.current;
        for (const player of instrumentPlayersRef.current.values()) {
          player.dispose();
        }
        drumMachineRef.current = null;
        instrumentPlayersRef.current.clear();
        instrumentLoadsRef.current.clear();
        setReadyInstruments([]);

        if (context) {
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
        const existingContext = audioContextRef.current;
        if (existingContext && existingContext.state !== "closed") {
          await existingContext.resume();
          return;
        }

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
          0.52;

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

  const loadInstrument = useCallback((selected: SoundInstrument): Promise<Smplr> => {
    const existing = instrumentPlayersRef.current.get(selected);
    if (existing) return Promise.resolve(existing);

    const inProgress = instrumentLoadsRef.current.get(selected);
    if (inProgress) return inProgress;

    const context = audioContextRef.current;
    const destination = compressorRef.current;
    if (!context || !destination) {
      return Promise.reject(new Error("Audio engine is not ready."));
    }

    const notesToLoad = {
      notes: [60, 62, 64, 67, 69, 72, 74, 76, 79],
      fallback: "nearest" as const,
    };
    loadingInstrumentRef.current = selected;
    setSampleLoadProgress({ loaded: 0, total: 0 });
    const onLoadProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      if (loadingInstrumentRef.current === selected) {
        setSampleLoadProgress({ loaded, total });
      }
    };

    const player: Smplr = selected === "drums"
      ? DrumMachine(context, {
          instrument: "TR-808",
          destination,
          volume: 108,
          onLoadProgress,
        })
      : selected === "keyboard"
        ? ElectricPiano(context, {
            instrument: "WurlitzerEP200",
            destination,
            volume: 108,
            notesToLoad,
            onLoadProgress,
          })
        : Soundfont(context, {
            instrument: selected === "flute"
              ? "flute"
              : selected === "guitar"
                ? "acoustic_guitar_nylon"
                : "acoustic_grand_piano",
            kit: "FluidR3_GM",
            destination,
            volume: 108,
            notesToLoad,
            onLoadProgress,
          });

    if (selected === "drums") {
      drumMachineRef.current = player as ReturnType<typeof DrumMachine>;
    }

    const loading = player.ready.then(() => {
      instrumentPlayersRef.current.set(selected, player);
      setReadyInstruments((current) =>
        current.includes(selected) ? current : [...current, selected],
      );
      if (loadingInstrumentRef.current === selected) {
        setSampleLoadProgress({ loaded: 1, total: 1 });
      }
      return player;
    }).catch((loadError: unknown) => {
      player.dispose();
      const message = loadError instanceof Error
        ? loadError.message
        : "Unable to load the selected instrument samples.";
      throw new Error(`Could not load ${selected} samples: ${message}`);
    }).finally(() => {
      instrumentLoadsRef.current.delete(selected);
      if (loadingInstrumentRef.current === selected) {
        loadingInstrumentRef.current = null;
      }
    });

    instrumentLoadsRef.current.set(selected, loading);
    return loading;
  }, []);

  const previewInstrument = useCallback(async () => {
    if (instrumentPreviewing || instrumentLoading) return;

    setError(null);
    setInstrumentLoading(true);

    try {
      await createAudioEngine();
      const player = await loadInstrument(instrument);
      const context = audioContextRef.current;
      if (!context) throw new Error("Audio engine is not ready.");

      const startsAt = context.currentTime + 0.08;
      if (instrument === "drums") {
        const drumPlayer = drumMachineRef.current;
        if (!drumPlayer) throw new Error("Drum samples are not ready.");
        const groups = drumPlayer.getGroupNames();
        const findGroup = (parts: string[]) => groups.find((name) => {
          const normalized = name.toLowerCase().replace(/[^a-z]/g, "");
          return parts.some((part) => normalized.includes(part));
        });
        const kick = findGroup(["kick", "bass"]) ?? groups[0];
        const snare = findGroup(["snare", "clap"]);
        const hat = findGroup(["closedhihat", "closedhat", "hat", "cymbal"]);
        [kick, hat, snare, hat].forEach((group, index) => {
          if (group) {
            drumPlayer.start({
              note: group,
              time: startsAt + index * 0.24,
              velocity: 96,
            });
          }
        });
      } else {
        const previewNotes = [60, 64, 67, 72, 67, 64];
        previewNotes.forEach((note, index) => {
          player.start({
            note,
            time: startsAt + index * 0.24,
            velocity: 96,
            duration: 0.21,
          });
        });
      }

      setInstrumentPreviewing(true);
      if (previewTimeoutRef.current !== null) {
        window.clearTimeout(previewTimeoutRef.current);
      }
      previewTimeoutRef.current = window.setTimeout(() => {
        setInstrumentPreviewing(false);
        previewTimeoutRef.current = null;
      }, 1800);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Unable to preview this instrument.");
    } finally {
      setInstrumentLoading(false);
    }
  }, [createAudioEngine, instrument, instrumentLoading, instrumentPreviewing, loadInstrument]);

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

        const packetsPerSecond = latestPacketRateRef.current;
        const updateIsFresh = Date.now() - lastTrafficUpdateAtRef.current < 3000;
        if (packetsPerSecond <= 0 || !updateIsFresh) {
          setTrafficUpdateStale(!updateIsFresh && lastTrafficUpdateAtRef.current > 0);
          setPlayedNote(null);
          return;
        }
        setTrafficUpdateStale(false);

        const intensity =
          clamp(
            parameters.intensity,
            0,
            1,
          );

        const selectedInstrument = instrumentRef.current;
        const player = instrumentPlayersRef.current.get(selectedInstrument);
        if (!player) return;

        player.output.pan = getDirectionPan(parameters.direction);

        const velocity = Math.round(clamp(82 + Math.sqrt(intensity) * 40, 82, 120));
        const bpm = getTempoFromPacketRate(packetsPerSecond);
        const phrasePosition = melodyStepRef.current % 8;
        if (phrasePosition === 0) {
          const rateBand = Math.floor(Math.log2(1 + packetsPerSecond));
          const directionBand = parameters.direction === "inbound"
            ? 1
            : parameters.direction === "outbound"
              ? 2
              : 0;
          const loadBand = Math.floor(intensity * 4);
          melodyPatternRef.current =
            (rateBand + directionBand + loadBand) % MELODY_PATTERNS.length;
        }

        if (selectedInstrument === "drums") {
          const drumPlayer = drumMachineRef.current;
          if (!drumPlayer) return;

          const groups = drumPlayer.getGroupNames();
          const desired = phrasePosition % 4 === 0
            ? ["kick", "bass"]
            : phrasePosition % 4 === 2
              ? ["snare", "clap"]
              : ["closedhihat", "closedhat", "hat", "cymbal"];
          const group = groups.find((name) => {
            const normalized = name.toLowerCase().replace(/[^a-z]/g, "");
            return desired.some((part) => normalized.includes(part));
          });
          if (!group) {
            if (!drumMappingErrorRef.current) {
              setError(`Drum kit is missing a ${desired[0]} sample. Available groups: ${groups.join(", ") || "none"}.`);
              drumMappingErrorRef.current = true;
            }
            return;
          }
          drumMappingErrorRef.current = false;
          try {
            drumPlayer.start({ note: group, time: context.currentTime, velocity });
          } catch (audioError) {
            setError(audioError instanceof Error ? audioError.message : "Unable to play the selected drum sample.");
            return;
          }
          melodyStepRef.current += 1;
          setPlayedNote({ note: group, velocity, bpm });
          return;
        }

        const melodyPattern = MELODY_PATTERNS[melodyPatternRef.current];
        const midiNote = getNoteFromTrafficPitch(
          parameters.pitch_hz,
          melodyPattern[phrasePosition],
        );
        try {
          player.start({
            note: midiNote,
            time: context.currentTime,
            velocity,
            duration: 30 / bpm * 0.9,
          });
        } catch (audioError) {
          setError(audioError instanceof Error ? audioError.message : `Unable to play the selected ${selectedInstrument} sample.`);
          return;
        }
        melodyStepRef.current += 1;
        setPlayedNote({ note: midiNoteName(midiNote), velocity, bpm });
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

            const packetRate = latestPacketRateRef.current;
            const freshTraffic = Date.now() - lastTrafficUpdateAtRef.current < 3000;
            setTrafficUpdateStale(
              lastTrafficUpdateAtRef.current > 0 && !freshTraffic,
            );
            const beatsPerMinute = freshTraffic ? getTempoFromPacketRate(packetRate) : 76;
            const interval = 60_000 / beatsPerMinute / 2;

            if (packetRate > 0 && freshTraffic) {
              triggerPulse();
            } else {
              setPlayedNote(null);
            }

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
        setTrafficUpdateStale(false);

        latestParametersRef.current =
          update.parameters;

        latestPacketRateRef.current = update.traffic.packets_per_second;
        lastTrafficUpdateAtRef.current = Date.now();

        startPulseTimer();
      },
      [
        startPulseTimer,
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
          setInstrumentLoading(true);
          loadingInstrumentRef.current = instrumentRef.current;
          await loadInstrument(instrumentRef.current);
          setInstrumentLoading(false);

          /*
           * Traffic monitoring is already started
           * automatically by the backend.
           *
           * This only enables the sonification stream.
           */
          await startSonification(
            interfaceName,
          );

          melodyStepRef.current = 0;
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
          setInstrumentLoading(false);
          loadingInstrumentRef.current = null;
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

          for (const player of instrumentPlayersRef.current.values()) {
            player.dispose();
          }
          instrumentPlayersRef.current.clear();
          instrumentLoadsRef.current.clear();
          setReadyInstruments([]);
          drumMachineRef.current = null;

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
        loadInstrument,
        updateStatus,
      ],
    );

  useEffect(
    () => {
      const instrumentPlayers = instrumentPlayersRef.current;
      const instrumentLoads = instrumentLoadsRef.current;
      return () => {
        if (previewTimeoutRef.current !== null) {
          window.clearTimeout(previewTimeoutRef.current);
          previewTimeoutRef.current = null;
        }
        audioEnabledRef.current =
          false;

        stopPulseTimer();

        disconnectWebSocket();

        const context =
          audioContextRef.current;

        for (const player of instrumentPlayers.values()) {
          player.dispose();
        }
        instrumentPlayers.clear();
        instrumentLoads.clear();
        drumMachineRef.current = null;

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
  const packetsPerSecond = latestUpdate?.traffic.packets_per_second ?? 0;
  const mappedTempo = getTempoFromPacketRate(packetsPerSecond);
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
        <div className="sonification-interface-control">
          <span className="sonification-interface-label">
            INTERFACE
          </span>

          <strong>
            {interfaceName || "No interface selected"}
          </strong>
        </div>

        <label className="sonification-instrument-control">
          <span>INSTRUMENT</span>
          <select
            value={instrument}
            onChange={(event) => {
              const nextInstrument = event.target.value as SoundInstrument;
              instrumentRef.current = nextInstrument;
              setInstrument(nextInstrument);
              localStorage.setItem("netsonic.sound.instrument", nextInstrument);
              setError(null);
              setPlayedNote(null);
              drumMappingErrorRef.current = false;
              if (audioEnabledRef.current) {
                setInstrumentLoading(true);
                loadingInstrumentRef.current = nextInstrument;
                void loadInstrument(nextInstrument)
                  .catch((loadError: unknown) => {
                    setError(loadError instanceof Error ? loadError.message : "Unable to load instrument samples.");
                  })
                  .finally(() => setInstrumentLoading(false));
              }
            }}
            aria-label="Choose sonification instrument"
          >
            {SOUND_INSTRUMENTS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <div className="instrument-load-status" aria-live="polite">
            <small>
              {instrumentLoading
                ? `Loading ${SOUND_INSTRUMENTS.find((item) => item.value === instrument)?.label} samples${sampleLoadProgress.total > 0 ? ` · ${sampleLoadProgress.loaded}/${sampleLoadProgress.total}` : "…"}`
                : readyInstruments.includes(instrument)
                  ? "Instrument samples ready"
                  : "Samples load when audio starts"}
            </small>
            {instrumentLoading && (
              <progress
                className="instrument-load-progress"
                max={sampleLoadProgress.total || 1}
                value={sampleLoadProgress.total ? sampleLoadProgress.loaded : undefined}
                aria-label="Instrument sample loading progress"
              />
            )}
            <a href="/audio-credits.html" target="_blank" rel="noreferrer">Sample credits</a>
          </div>
        </label>

        <div className="sonification-actions">
          <button
            type="button"
            className="sonification-button sonification-button-preview"
            onClick={() => void previewInstrument()}
            disabled={instrumentLoading || instrumentPreviewing || audioEnabled}
            title="Plays a fixed instrument phrase without using network traffic; available while live audio is stopped"
          >
            {instrumentLoading
              ? "Loading sample…"
              : instrumentPreviewing
                ? "Preview playing…"
                : "Preview sample"}
          </button>
          {!audioEnabled ? (
            <button
              type="button"
              className="sonification-button sonification-button-primary"
              onClick={() => {
                void startAudio();
              }}
              disabled={!interfaceName || instrumentLoading || instrumentPreviewing}
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

      <div className="sonification-traffic-link" aria-live="polite">
        <div className="sonification-traffic-link-heading">
          <div>
            <strong>LIVE TRAFFIC → SOUND</strong>
            <span>Playback is driven by the latest packet capture, not a free-running melody.</span>
          </div>
          <span className={`traffic-playback-state ${playedNote ? "is-playing" : ""}`}>
            {trafficUpdateStale
              ? "CAPTURE STALE"
              : playedNote
                ? "PLAYING"
                : packetsPerSecond > 0
                  ? "WAITING FOR NOTE"
                  : "NO PACKETS · SILENT"}
          </span>
        </div>
        <div className="sonification-traffic-link-grid">
          <div>
            <span>PACKET RATE → TEMPO</span>
            <strong>{packetsPerSecond.toFixed(1)} p/s · {mappedTempo} BPM</strong>
          </div>
          <div>
            <span>TRAFFIC LOAD → PITCH</span>
            <strong>{latestUpdate ? `${latestUpdate.parameters.pitch_hz.toFixed(0)} Hz → ${playedNote?.note ?? "next note"}` : "Waiting for traffic data"}</strong>
          </div>
          <div>
            <span>INTENSITY → NOTE VELOCITY</span>
            <strong>{playedNote ? `${Math.round(intensity * 100)}% · ${playedNote.velocity}/127` : `${Math.round(intensity * 100)}% · waiting`}</strong>
          </div>
          <div>
            <span>LAST SOUND</span>
            <strong>{playedNote?.note ?? "—"}</strong>
          </div>
        </div>
        <small>
          To verify the live mapping, start audio and ping your gateway from another terminal: packet rate, tempo, and last note should respond. Stop the pings and playback should fall silent when traffic reaches zero. “Preview sample” plays a separate fixed phrase for instrument checking only.
        </small>
      </div>

      <div className="sonification-sound-guide" aria-label="Audio sound guide">
        <div className="sonification-sound-guide-heading">
          <span>WHAT YOU’RE HEARING</span>
          <small>{instrument === "drums" ? "A sampled TR-808 kit marks traffic with a steady kick, snare, and hi-hat pattern." : `Sampled ${SOUND_INSTRUMENTS.find((item) => item.value === instrument)?.label} follows a repeating C-major pentatonic melody.`}</small>
        </div>
        <div className="sonification-sound-guide-items">
          <div className="sonification-sound-guide-item">
            <strong>INBOUND · LEFT</strong>
            <span>Incoming traffic notes are placed to the left.</span>
          </div>
          <div className="sonification-sound-guide-item">
            <strong>OUTBOUND · RIGHT</strong>
            <span>Outgoing traffic notes are placed to the right.</span>
          </div>
          <div className="sonification-sound-guide-item">
            <strong>PACKETS · MELODY</strong>
            <span>Measured packets per second set the tempo from 76 to 165 BPM.</span>
          </div>
          <div className="sonification-sound-guide-item">
            <strong>PROTOCOL · ACTIVITY</strong>
            <span>TCP, UDP, and ICMP protocol counts are shown in the live metrics.</span>
          </div>
          <div className="sonification-sound-guide-item">
            <strong>ACTIVITY · VOLUME</strong>
            <span>Traffic intensity raises sampled note velocity. Local traffic stays centered.</span>
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
