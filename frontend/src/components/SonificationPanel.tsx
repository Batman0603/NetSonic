import { useCallback, useEffect, useRef, useState } from "react";

import {
  createSonificationWebSocket,
  startSonification,
  stopSonification,
  type SonificationParameters,
  type SonificationStatus,
  type SonificationUpdate,
} from "../services/sonification";

import { NetworkSpectrum } from "./NetworkSpectrum";

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

const MASTER_VOLUME = 1.35;

const MUSICAL_SCALE = [
  220.0,
  246.94,
  261.63,
  293.66,
  329.63,
  369.99,
  392.0,
  440.0,
  493.88,
  523.25,
  587.33,
  659.25,
  739.99,
  783.99,
  880.0,
];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}

function getMusicalFrequency(
  pitchHz: number,
  intensity: number,
): number {
  const safePitch = clamp(pitchHz, 220, 880);

  const nearest = MUSICAL_SCALE.reduce((previous, current) => {
    return Math.abs(current - safePitch) <
      Math.abs(previous - safePitch)
      ? current
      : previous;
  });

  const octaveBoost =
    intensity > 0.75 ? 2 :
    intensity > 0.45 ? 1 :
    1;

  return nearest * octaveBoost;
}

function getWaveform(
  parameters: SonificationParameters,
): OscillatorType {
  if (parameters.protocol === "UDP") {
    return "triangle";
  }

  if (parameters.protocol === "ICMP") {
    return "square";
  }

  if (parameters.protocol === "TCP") {
    return "sine";
  }

  return "sawtooth";
}

function getDirectionPan(direction: string): number {
  const normalized = direction.toLowerCase();

  if (normalized === "inbound") {
    return -0.75;
  }

  if (normalized === "outbound") {
    return 0.75;
  }

  if (normalized === "local") {
    return 0;
  }

  return 0;
}

function createVoice(
  context: AudioContext,
  destination: AudioNode,
): AudioVoice {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const panner = context.createStereoPanner();
  const filter = context.createBiquadFilter();

  filter.type = "lowpass";
  filter.frequency.value = 3200;
  filter.Q.value = 0.8;

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(panner);
  panner.connect(destination);

  gain.gain.value = 0;

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

  const now = context.currentTime;

  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setTargetAtTime(0, now, 0.08);

  window.setTimeout(() => {
    try {
      voice.oscillator.stop();
    } catch {
      // Oscillator may already be stopped.
    }
  }, 500);
}

export function SonificationPanel({
  interfaceName,
}: SonificationPanelProps) {
  const [status, setStatus] =
    useState<SonificationStatus | null>(null);

  const [latestUpdate, setLatestUpdate] =
    useState<SonificationUpdate | null>(null);

  const [audioEnabled, setAudioEnabled] = useState(false);
  const [connectionState, setConnectionState] =
    useState<"disconnected" | "connecting" | "connected">(
      "disconnected",
    );

  const [error, setError] = useState<string | null>(null);

  const audioContextRef =
    useRef<AudioContext | null>(null);

  const masterGainRef =
    useRef<GainNode | null>(null);

  const compressorRef =
    useRef<DynamicsCompressorNode | null>(null);

  const uploadVoiceRef =
    useRef<AudioVoice | null>(null);

  const downloadVoiceRef =
    useRef<AudioVoice | null>(null);

  const ambientVoiceRef =
    useRef<AudioVoice | null>(null);

  const websocketRef =
    useRef<WebSocket | null>(null);

  const pulseTimerRef =
    useRef<number | null>(null);

  const latestParametersRef =
    useRef<SonificationParameters | null>(null);

  const audioEnabledRef =
    useRef(false);

  const updateStatus = useCallback(async () => {
    try {
      const response = await fetch(
        "http://127.0.0.1:8000/api/sonification/status",
      );

      if (!response.ok) {
        throw new Error("Unable to retrieve sonification status.");
      }

      const data =
        (await response.json()) as SonificationStatus;

      setStatus(data);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void updateStatus();

    const interval = window.setInterval(() => {
      void updateStatus();
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [updateStatus]);

  const disconnectWebSocket = useCallback(() => {
    const websocket = websocketRef.current;

    if (!websocket) {
      return;
    }

    websocket.onopen = null;
    websocket.onmessage = null;
    websocket.onerror = null;
    websocket.onclose = null;

    if (
      websocket.readyState === WebSocket.OPEN ||
      websocket.readyState === WebSocket.CONNECTING
    ) {
      websocket.close();
    }

    websocketRef.current = null;

    setConnectionState("disconnected");
  }, []);

  const stopPulseTimer = useCallback(() => {
    if (pulseTimerRef.current !== null) {
      window.clearInterval(pulseTimerRef.current);
      pulseTimerRef.current = null;
    }
  }, []);

  const stopAudio = useCallback(async () => {
    audioEnabledRef.current = false;
    setAudioEnabled(false);

    stopPulseTimer();
    disconnectWebSocket();

    const context = audioContextRef.current;

    if (context) {
      stopVoice(context, uploadVoiceRef.current);
      stopVoice(context, downloadVoiceRef.current);
      stopVoice(context, ambientVoiceRef.current);

      uploadVoiceRef.current = null;
      downloadVoiceRef.current = null;
      ambientVoiceRef.current = null;

      try {
        await context.close();
      } catch {
        // Context may already be closed.
      }
    }

    audioContextRef.current = null;
    masterGainRef.current = null;
    compressorRef.current = null;

    try {
      await stopSonification();
    } catch {
      // Backend may already be stopped.
    }

    await updateStatus();
  }, [
    disconnectWebSocket,
    stopPulseTimer,
    updateStatus,
  ]);

  const createAudioEngine = useCallback(async () => {
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

    const context = new AudioContextClass();

    const compressor =
      context.createDynamicsCompressor();

    compressor.threshold.value = -24;
    compressor.knee.value = 18;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;

    const masterGain =
      context.createGain();

    masterGain.gain.value = MASTER_VOLUME;

    compressor.connect(masterGain);
    masterGain.connect(context.destination);

    await context.resume();

    const uploadVoice =
      createVoice(context, compressor);

    const downloadVoice =
      createVoice(context, compressor);

    const ambientVoice =
      createVoice(context, compressor);

    uploadVoiceRef.current = uploadVoice;
    downloadVoiceRef.current = downloadVoice;
    ambientVoiceRef.current = ambientVoice;

    audioContextRef.current = context;
    compressorRef.current = compressor;
    masterGainRef.current = masterGain;
  }, []);

  const updateContinuousVoices = useCallback(
    (parameters: SonificationParameters) => {
      const context = audioContextRef.current;

      if (!context) {
        return;
      }

      const now = context.currentTime;

      const intensity =
        clamp(parameters.intensity, 0, 1);

      const musicalFrequency =
        getMusicalFrequency(
          parameters.pitch_hz,
          intensity,
        );

      const waveform =
        getWaveform(parameters);

      const baseVolume =
        clamp(parameters.volume, 0.04, 0.9);

      const upload =
        uploadVoiceRef.current;

      const download =
        downloadVoiceRef.current;

      const ambient =
        ambientVoiceRef.current;

      /*
       * Upload voice
       */
      if (upload) {
        upload.oscillator.type = waveform;

        upload.oscillator.frequency.cancelScheduledValues(now);

        upload.oscillator.frequency.setTargetAtTime(
          musicalFrequency * 1.25,
          now,
          0.08,
        );

        upload.panner.pan.setTargetAtTime(
          0.78,
          now,
          0.08,
        );

        upload.filter.frequency.setTargetAtTime(
          1800 + intensity * 4500,
          now,
          0.08,
        );

        upload.gain.gain.setTargetAtTime(
          baseVolume * 0.85,
          now,
          0.08,
        );
      }

      /*
       * Download voice
       */
      if (download) {
        download.oscillator.type = waveform;

        download.oscillator.frequency.cancelScheduledValues(now);

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
          1400 + intensity * 5200,
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
       *
       * This is deliberately quiet. It prevents very small
       * amounts of traffic from disappearing completely.
       */
      if (ambient) {
        ambient.oscillator.type = "sine";

        ambient.oscillator.frequency.setTargetAtTime(
          musicalFrequency / 2,
          now,
          0.12,
        );

        ambient.panner.pan.setTargetAtTime(
          0,
          now,
          0.12,
        );

        ambient.filter.frequency.setTargetAtTime(
          900 + intensity * 1800,
          now,
          0.12,
        );

        ambient.gain.gain.setTargetAtTime(
          Math.max(0.012, intensity * 0.055),
          now,
          0.12,
        );
      }
    },
    [],
  );

  const triggerPulse = useCallback(() => {
    const context = audioContextRef.current;

    if (!context || !audioEnabledRef.current) {
      return;
    }

    const parameters =
      latestParametersRef.current;

    if (!parameters) {
      return;
    }

    const now = context.currentTime;

    const intensity =
      clamp(parameters.intensity, 0, 1);

    const frequency =
      getMusicalFrequency(
        parameters.pitch_hz,
        intensity,
      );

    const waveform =
      getWaveform(parameters);

    const volume =
      clamp(parameters.volume, 0.04, 0.9);

    const direction =
      parameters.direction.toLowerCase();

    const pan =
      getDirectionPan(direction);

    /*
     * Short musical pulse oscillator.
     *
     * Each network update creates a short note-like event.
     */
    const oscillator =
      context.createOscillator();

    const gain =
      context.createGain();

    const panner =
      context.createStereoPanner();

    const filter =
      context.createBiquadFilter();

    oscillator.type = waveform;

    oscillator.frequency.value =
      frequency;

    panner.pan.value =
      pan;

    filter.type = "lowpass";

    filter.frequency.value =
      1600 + intensity * 5200;

    filter.Q.value = 1.2;

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(
      compressorRef.current ?? context.destination,
    );

    const peak =
      Math.max(
        0.045,
        Math.min(
          0.38,
          volume * (0.28 + intensity * 0.55),
        ),
      );

    const attack = 0.012;
    const decay = 0.12 + (1 - intensity) * 0.16;

    gain.gain.setValueAtTime(
      0,
      now,
    );

    gain.gain.linearRampToValueAtTime(
      peak,
      now + attack,
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      now + attack + decay,
    );

    oscillator.start(now);

    oscillator.stop(
      now + attack + decay + 0.03,
    );
  }, []);

  const startPulseTimer = useCallback(() => {
    stopPulseTimer();

    const schedule = () => {
      const parameters =
        latestParametersRef.current;

      if (!parameters || !audioEnabledRef.current) {
        return;
      }

      const pulseRate =
        clamp(
          parameters.pulse_rate_hz,
          0.5,
          8,
        );

      const interval =
        1000 / pulseRate;

      triggerPulse();

      pulseTimerRef.current =
        window.setTimeout(
          schedule,
          interval,
        );
    };

    schedule();
  }, [
    stopPulseTimer,
    triggerPulse,
  ]);

  const handleUpdate = useCallback(
    (update: SonificationUpdate) => {
      setLatestUpdate(update);

      latestParametersRef.current =
        update.parameters;

      updateContinuousVoices(
        update.parameters,
      );

      /*
       * Restart the pulse timing whenever the network
       * reports a new pulse rate.
       */
      startPulseTimer();
    },
    [
      startPulseTimer,
      updateContinuousVoices,
    ],
  );

  const connectWebSocket = useCallback(() => {
    disconnectWebSocket();

    setConnectionState("connecting");

    const websocket =
      createSonificationWebSocket();

    websocketRef.current =
      websocket;

    websocket.onopen = () => {
      setConnectionState("connected");
    };

    websocket.onmessage = (event) => {
      try {
        const update =
          JSON.parse(
            event.data,
          ) as SonificationUpdate;

        if (
          update.type ===
          "sonification_update"
        ) {
          handleUpdate(update);
        }
      } catch {
        setError(
          "Received invalid sonification data.",
        );
      }
    };

    websocket.onerror = () => {
      setError(
        "Unable to connect to the sonification stream.",
      );
    };

    websocket.onclose = () => {
      setConnectionState("disconnected");
    };
  }, [
    disconnectWebSocket,
    handleUpdate,
  ]);

  const startAudio = useCallback(async () => {
    try {
      setError(null);

      if (!interfaceName) {
        throw new Error(
          "Select a network interface first.",
        );
      }

      /*
       * Create the browser audio engine first because browsers
       * require an explicit user interaction before audio plays.
       */
      await createAudioEngine();

      /*
       * Tell the backend to begin the sonification stream.
       *
       * Traffic monitoring itself is already running automatically
       * from backend startup.
       */
      await startSonification(
        interfaceName,
      );

      audioEnabledRef.current = true;
      setAudioEnabled(true);

      connectWebSocket();

      await updateStatus();
    } catch (audioError) {
      audioEnabledRef.current = false;
      setAudioEnabled(false);

      setError(
        audioError instanceof Error
          ? audioError.message
          : "Unable to start audio.",
      );

      await stopAudio();
    }
  }, [
    connectWebSocket,
    createAudioEngine,
    interfaceName,
    stopAudio,
    updateStatus,
  ]);

  useEffect(() => {
    return () => {
      void stopAudio();
    };
  }, [stopAudio]);

  const parameters =
    latestUpdate?.parameters;

  const traffic =
    latestUpdate?.traffic;

  const protocols =
    latestUpdate?.protocols ?? [];

  const peers =
    latestUpdate?.peers ?? [];

  const formatMbps = (value: number) => {
    if (value < 0.001) {
      return `${(value * 1000).toFixed(2)} Kbps`;
    }

    return `${value.toFixed(3)} Mbps`;
  };

  const formatBytes = (value: number) => {
    if (value < 1024) {
      return `${value} B`;
    }

    if (value < 1024 * 1024) {
      return `${(value / 1024).toFixed(1)} KB`;
    }

    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <section className="sonification-panel">
      <div className="sonification-header">
        <div>
          <p className="eyebrow">
            PHASE 4 · ADAPTIVE AUDIO
          </p>

          <h2>
            Network Sonification
          </h2>

          <p className="sonification-description">
            Transform live network activity into
            adaptive musical patterns using pitch,
            rhythm, timbre, loudness and stereo
            positioning.
          </p>
        </div>

        <div
          className={`audio-status ${
            audioEnabled
              ? "audio-status-active"
              : ""
          }`}
        >
          <span className="audio-status-dot" />

          <div>
            <strong>
              {audioEnabled
                ? "AUDIO ACTIVE"
                : "AUDIO READY"}
            </strong>

            <span>
              {connectionState ===
              "connected"
                ? "Live network stream"
                : "Waiting for audio"}
            </span>
          </div>
        </div>
      </div>

      <div className="sonification-controls">
        <div className="control-interface">
          <span>
            Interface
          </span>

          <strong>
            {interfaceName || "None selected"}
          </strong>
        </div>

        {!audioEnabled ? (
          <button
            type="button"
            className="audio-button audio-button-start"
            onClick={() => {
              void startAudio();
            }}
            disabled={!interfaceName}
          >
            <span className="button-icon">
              ▶
            </span>

            Start Network Music
          </button>
        ) : (
          <button
            type="button"
            className="audio-button audio-button-stop"
            onClick={() => {
              void stopAudio();
            }}
          >
            <span className="button-icon">
              ■
            </span>

            Stop Audio
          </button>
        )}
      </div>

      {error && (
        <div
          className="sonification-error"
          role="alert"
        >
          <strong>
            Audio error:
          </strong>

          <span>
            {error}
          </span>
        </div>
      )}

      <NetworkSpectrum
        intensity={parameters?.intensity ?? 0}
        uploadMbps={traffic?.upload_mbps ?? 0}
        downloadMbps={traffic?.download_mbps ?? 0}
        packetsPerSecond={
          traffic?.packets_per_second ?? 0
        }
        pulseRate={
          parameters?.pulse_rate_hz ?? 0.5
        }
        protocol={
          parameters?.protocol ?? "NETWORK"
        }
        active={audioEnabled}
      />

      <div className="sonification-grid">
        <article className="audio-card">
          <span className="card-label">
            PITCH
          </span>

          <strong className="metric-large">
            {parameters
              ? `${Math.round(
                  parameters.pitch_hz,
                )} Hz`
              : "—"}
          </strong>

          <span className="metric-detail">
            Musical note mapping
          </span>
        </article>

        <article className="audio-card">
          <span className="card-label">
            RHYTHM
          </span>

          <strong className="metric-large">
            {parameters
              ? `${parameters.pulse_rate_hz.toFixed(
                  1,
                )} Hz`
              : "—"}
          </strong>

          <span className="metric-detail">
            Packet pulse rate
          </span>
        </article>

        <article className="audio-card">
          <span className="card-label">
            LOUDNESS
          </span>

          <strong className="metric-large">
            {parameters
              ? `${(
                  parameters.volume *
                  100
                ).toFixed(0)}%`
              : "—"}
          </strong>

          <span className="metric-detail">
            Adaptive volume
          </span>
        </article>

        <article className="audio-card">
          <span className="card-label">
            UPLOAD
          </span>

          <strong className="metric-large">
            {traffic
              ? formatMbps(
                  traffic.upload_mbps,
                )
              : "—"}
          </strong>

          <span className="metric-detail">
            Stereo right
          </span>
        </article>

        <article className="audio-card">
          <span className="card-label">
            DOWNLOAD
          </span>

          <strong className="metric-large">
            {traffic
              ? formatMbps(
                  traffic.download_mbps,
                )
              : "—"}
          </strong>

          <span className="metric-detail">
            Stereo left
          </span>
        </article>

        <article className="audio-card">
          <span className="card-label">
            PACKETS
          </span>

          <strong className="metric-large">
            {traffic
              ? traffic.packets_per_second.toFixed(
                  1,
                )
              : "—"}
          </strong>

          <span className="metric-detail">
            packets / second
          </span>
        </article>

        <article className="audio-card">
          <span className="card-label">
            TOTAL DATA
          </span>

          <strong className="metric-large">
            {traffic
              ? formatBytes(traffic.total_bytes)
              : "—"}
          </strong>

          <span className="metric-detail">
            Captured in current window
          </span>
        </article>

        <article className="audio-card">
          <span className="card-label">
            PROTOCOL
          </span>

          <strong className="metric-large">
            {parameters?.protocol ??
              "—"}
          </strong>

          <span className="metric-detail">
            {parameters?.waveform ??
              "Waiting"}
          </span>
        </article>
      </div>

      <div className="sonification-details">
        <article className="detail-card">
          <div className="detail-heading">
            <div>
              <span className="card-label">
                AUDIO ENGINE
              </span>

              <h3>
                Musical Mapping
              </h3>
            </div>

            <span className="live-badge">
              {audioEnabled
                ? "LIVE"
                : "READY"}
            </span>
          </div>

          <div className="mapping-list">
            <div className="mapping-row">
              <span>
                Traffic intensity
              </span>

              <strong>
                Pitch + loudness
              </strong>
            </div>

            <div className="mapping-row">
              <span>
                Packet rate
              </span>

              <strong>
                Rhythm / pulse
              </strong>
            </div>

            <div className="mapping-row">
              <span>
                TCP
              </span>

              <strong>
                Sine
              </strong>
            </div>

            <div className="mapping-row">
              <span>
                UDP
              </span>

              <strong>
                Triangle
              </strong>
            </div>

            <div className="mapping-row">
              <span>
                ICMP
              </span>

              <strong>
                Square
              </strong>
            </div>

            <div className="mapping-row">
              <span>
                Upload / Download
              </span>

              <strong>
                Right / Left
              </strong>
            </div>
          </div>
        </article>

        <article className="detail-card">
          <div className="detail-heading">
            <div>
              <span className="card-label">
                TRAFFIC SOURCES
              </span>

              <h3>
                Active Protocols
              </h3>
            </div>
          </div>

          {protocols.length === 0 ? (
            <div className="empty-detail">
              Waiting for traffic...
            </div>
          ) : (
            <div className="protocol-list">
              {protocols
                .slice(0, 6)
                .map((protocol) => (
                  <div
                    className="protocol-row"
                    key={protocol.protocol}
                  >
                    <span>
                      {protocol.protocol}
                    </span>

                    <div className="protocol-bar">
                      <div
                        style={{
                          width: `${clamp(
                            (protocol.bytes /
                              Math.max(
                                1,
                                traffic?.total_bytes ??
                                  1,
                              )) *
                              100,
                            3,
                            100,
                          )}%`,
                        }}
                      />
                    </div>

                    <strong>
                      {formatBytes(
                        protocol.bytes,
                      )}
                    </strong>
                  </div>
                ))}
            </div>
          )}
        </article>

        <article className="detail-card">
          <div className="detail-heading">
            <div>
              <span className="card-label">
                NETWORK PEERS
              </span>

              <h3>
                Active Endpoints
              </h3>
            </div>

            <span className="peer-count">
              {peers.length}
            </span>
          </div>

          {peers.length === 0 ? (
            <div className="empty-detail">
              Waiting for network activity...
            </div>
          ) : (
            <div className="peer-list">
              {peers
                .slice(0, 6)
                .map((peer) => (
                  <div
                    className="peer-row"
                    key={`${peer.ip_address}-${peer.direction}`}
                  >
                    <div>
                      <strong>
                        {peer.ip_address}
                      </strong>

                      <span>
                        {peer.direction}
                      </span>
                    </div>

                    <strong>
                      {formatBytes(
                        peer.bytes,
                      )}
                    </strong>
                  </div>
                ))}
            </div>
          )}
        </article>
      </div>

      <div className="sonification-footer">
        <span>
          Backend:{" "}
          {status?.enabled
            ? "Sonification stream active"
            : "Ready"}
        </span>

        <span>
          WebSocket:{" "}
          {connectionState}
        </span>

        <span>
          {traffic
            ? `${traffic.total_packets} packets`
            : "No traffic sample"}
        </span>
      </div>
    </section>
  );
}
