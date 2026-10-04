import {
  useEffect,
  useRef,
} from "react";

import "./AudioVisualizer.css";

import type {
  VisualizerStyle,
  VisualizerTheme,
} from "./VisualizerControls";

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  style: VisualizerStyle;
  theme: VisualizerTheme;
  active: boolean;
}

interface ThemeColors {
  primary: string;
  secondary: string;
  tertiary: string;
  grid: string;
  background: string;
  text: string;
}

const THEME_COLORS: Record<
  VisualizerTheme,
  ThemeColors
> = {
  cyan: {
    primary: "#00e5ff",
    secondary: "#00b8d4",
    tertiary: "#64f4ff",
    grid: "rgba(0, 229, 255, 0.14)",
    background: "#050b0f",
    text: "#8defff",
  },

  neon: {
    primary: "#ff2da1",
    secondary: "#8a4dff",
    tertiary: "#00e5ff",
    grid: "rgba(255, 255, 255, 0.10)",
    background: "#08070d",
    text: "#f4d9ff",
  },

  purple: {
    primary: "#b45cff",
    secondary: "#7040ff",
    tertiary: "#e1b8ff",
    grid: "rgba(180, 92, 255, 0.14)",
    background: "#09060f",
    text: "#e6cfff",
  },

  green: {
    primary: "#38e89a",
    secondary: "#13b879",
    tertiary: "#9affd0",
    grid: "rgba(56, 232, 154, 0.14)",
    background: "#050d0a",
    text: "#b5ffdc",
  },

  amber: {
    primary: "#ffb02e",
    secondary: "#ff7b00",
    tertiary: "#ffe0a1",
    grid: "rgba(255, 176, 46, 0.14)",
    background: "#0d0904",
    text: "#ffe5b5",
  },

  mono: {
    primary: "#e4edf2",
    secondary: "#a8b6bf",
    tertiary: "#ffffff",
    grid: "rgba(255, 255, 255, 0.12)",
    background: "#080b0d",
    text: "#d5dfe4",
  },
};

export function AudioVisualizer({
  analyser,
  style,
  theme,
  active,
}: AudioVisualizerProps) {
  const canvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const animationRef =
    useRef<number | null>(null);

  const previousWidthRef =
    useRef<number>(0);

  const colors =
    THEME_COLORS[theme];

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context =
      canvas.getContext("2d");

    if (!context) {
      return;
    }

    const resizeCanvas = () => {
      const rect =
        canvas.getBoundingClientRect();

      const pixelRatio =
        window.devicePixelRatio || 1;

      const width =
        Math.max(1, rect.width);

      const height =
        Math.max(1, rect.height);

      canvas.width =
        Math.floor(width * pixelRatio);

      canvas.height =
        Math.floor(height * pixelRatio);

      context.setTransform(
        pixelRatio,
        0,
        0,
        pixelRatio,
        0,
        0,
      );

      previousWidthRef.current =
        width;
    };

    resizeCanvas();

    window.addEventListener(
      "resize",
      resizeCanvas,
    );

    const frequencyData =
      analyser
        ? new Uint8Array(
            analyser.frequencyBinCount,
          )
        : new Uint8Array(1024);

    const waveformData =
      analyser
        ? new Uint8Array(
            analyser.fftSize,
          )
        : new Uint8Array(2048);

    const drawGrid = (
      width: number,
      height: number,
      gridColor = colors.grid,
    ) => {
      context.strokeStyle =
        gridColor;

      context.lineWidth = 1;

      const horizontalLines = 8;
      const verticalLines = 16;

      for (
        let index = 0;
        index <= horizontalLines;
        index += 1
      ) {
        const y =
          (height /
            horizontalLines) *
          index;

        context.beginPath();

        context.moveTo(
          0,
          y,
        );

        context.lineTo(
          width,
          y,
        );

        context.stroke();
      }

      for (
        let index = 0;
        index <= verticalLines;
        index += 1
      ) {
        const x =
          (width /
            verticalLines) *
          index;

        context.beginPath();

        context.moveTo(
          x,
          0,
        );

        context.lineTo(
          x,
          height,
        );

        context.stroke();
      }
    };

    const drawIdle = (
      width: number,
      height: number,
    ) => {
      context.strokeStyle =
        colors.grid;

      context.lineWidth = 1;

      const center =
        height / 2;

      context.beginPath();

      context.moveTo(
        0,
        center,
      );

      context.lineTo(
        width,
        center,
      );

      context.stroke();

      context.fillStyle =
        colors.text;

      context.font =
        "10px monospace";

      context.textAlign =
        "center";

      context.fillText(
        "WAITING FOR AUDIO SIGNAL",
        width / 2,
        center - 12,
      );

      context.fillStyle =
        "rgba(255,255,255,0.35)";

      context.fillText(
        "Start network sonification to activate analyzer",
        width / 2,
        center + 10,
      );
    };

    const drawSpectrum = (
      width: number,
      height: number,
    ) => {
      if (!analyser) {
        drawIdle(
          width,
          height,
        );

        return;
      }

      analyser.getByteFrequencyData(
        frequencyData,
      );

      const barCount = 96;

      const usableBins =
        Math.min(
          frequencyData.length,
          512,
        );

      const barWidth =
        width / barCount;

      const gradient =
        context.createLinearGradient(
          0,
          height,
          0,
          0,
        );

      gradient.addColorStop(
        0,
        colors.secondary,
      );

      gradient.addColorStop(
        0.5,
        colors.primary,
      );

      gradient.addColorStop(
        1,
        colors.tertiary,
      );

      context.fillStyle =
        gradient;

      for (
        let index = 0;
        index < barCount;
        index += 1
      ) {
        const bin =
          Math.floor(
            (index /
              barCount) *
              usableBins,
          );

        const value =
          frequencyData[bin] /
          255;

        const barHeight =
          Math.max(
            2,
            value *
              height *
              0.92,
          );

        const x =
          index * barWidth;

        const y =
          height -
          barHeight;

        context.fillRect(
          x + 1,
          y,
          Math.max(
            2,
            barWidth - 3,
          ),
          barHeight,
        );
      }
    };

    const drawWaveform = (
      width: number,
      height: number,
    ) => {
      if (!analyser) {
        drawIdle(
          width,
          height,
        );

        return;
      }

      analyser.getByteTimeDomainData(
        waveformData,
      );

      const center =
        height / 2;

      context.beginPath();

      context.strokeStyle =
        colors.primary;

      context.lineWidth = 1.7;

      for (
        let index = 0;
        index < waveformData.length;
        index += 1
      ) {
        const x =
          (index /
            (waveformData.length - 1)) *
          width;

        const normalized =
          waveformData[index] /
            128 -
          1;

        const y =
          center +
          normalized *
            height *
            0.42;

        if (index === 0) {
          context.moveTo(
            x,
            y,
          );
        } else {
          context.lineTo(
            x,
            y,
          );
        }
      }

      context.stroke();

      context.strokeStyle =
        colors.secondary;

      context.globalAlpha = 0.35;

      context.beginPath();

      context.moveTo(
        0,
        center,
      );

      context.lineTo(
        width,
        center,
      );

      context.stroke();

      context.globalAlpha = 1;
    };

    const drawFrequency = (
      width: number,
      height: number,
    ) => {
      if (!analyser) {
        drawIdle(
          width,
          height,
        );

        return;
      }

      analyser.getByteFrequencyData(
        frequencyData,
      );

      const points = 160;

      context.beginPath();

      context.strokeStyle =
        colors.primary;

      context.lineWidth = 1.8;

      for (
        let index = 0;
        index < points;
        index += 1
      ) {
        const position =
          index /
          (points - 1);

        const bin =
          Math.floor(
            position *
              (frequencyData.length -
                1),
          );

        const value =
          frequencyData[bin] /
          255;

        const x =
          position * width;

        const y =
          height -
          value *
            height *
            0.9;

        if (index === 0) {
          context.moveTo(
            x,
            y,
          );
        } else {
          context.lineTo(
            x,
            y,
          );
        }
      }

      context.stroke();

      context.fillStyle =
        colors.text;

      context.font =
        "9px monospace";

      context.textAlign =
        "left";

      context.fillText(
        "20 Hz",
        8,
        height - 8,
      );

      context.textAlign =
        "center";

      context.fillText(
        "1 kHz",
        width * 0.42,
        height - 8,
      );

      context.textAlign =
        "right";

      context.fillText(
        "20 kHz",
        width - 8,
        height - 8,
      );
    };

    const drawOscilloscope = (
      width: number,
      height: number,
    ) => {
      if (!analyser) {
        drawIdle(
          width,
          height,
        );

        return;
      }

      analyser.getByteTimeDomainData(
        waveformData,
      );

      const center =
        height / 2;

      context.beginPath();

      context.strokeStyle =
        colors.primary;

      context.lineWidth = 1.3;

      for (
        let index = 0;
        index < waveformData.length;
        index += 1
      ) {
        const x =
          (index /
            (waveformData.length - 1)) *
          width;

        const value =
          waveformData[index] /
            128 -
          1;

        const y =
          center +
          value *
            height *
            0.44;

        if (index === 0) {
          context.moveTo(
            x,
            y,
          );
        } else {
          context.lineTo(
            x,
            y,
          );
        }
      }

      context.stroke();

      context.strokeStyle =
        colors.grid;

      context.beginPath();

      context.moveTo(
        0,
        center,
      );

      context.lineTo(
        width,
        center,
      );

      context.stroke();

      context.fillStyle =
        colors.text;

      context.font =
        "9px monospace";

      context.textAlign =
        "left";

      context.fillText(
        "OSCILLOSCOPE / TIME DOMAIN",
        8,
        14,
      );
    };

    /*
     * NEW:
     *
     * Music-style filled waveform.
     *
     * This is intentionally different from the normal
     * waveform. Instead of drawing only a thin line,
     * it creates a mirrored amplitude envelope and fills
     * the area between the upper and lower waveform.
     */
    const drawFilledWaveform = (
      width: number,
      height: number,
    ) => {
      if (!analyser) {
        drawIdle(width, height);
        return;
      }

      analyser.getByteTimeDomainData(waveformData);
      analyser.getByteFrequencyData(frequencyData);

      const center = height / 2;
      const pointCount = Math.max(
        500,
        Math.min(1100, Math.floor(width)),
      );
      const envelope = new Float32Array(pointCount);
      const time = performance.now() * 0.001;
      const usefulBins = Math.min(frequencyData.length, 256);

      for (let index = 0; index < pointCount; index += 1) {
        const sourceIndex = Math.floor(
          (index / (pointCount - 1)) * (waveformData.length - 1),
        );
        const sample = waveformData[sourceIndex] / 128 - 1;
        const frequencyIndex = Math.min(
          usefulBins - 1,
          Math.floor((index / pointCount) * usefulBins),
        );
        const spectralEnergy = frequencyData[frequencyIndex] / 255;
        const carrier =
          0.72 +
          Math.abs(Math.sin(index * 8.31 + time * 1.7)) * 0.28 +
          spectralEnergy * 0.16;
        const amplitude =
          Math.pow(Math.abs(sample), 0.62) * 1.6 +
          spectralEnergy * 0.12;

        envelope[index] = Math.min(
          0.96,
          Math.max(0.025, amplitude * carrier),
        );
      }

      const gradient = context.createLinearGradient(
        0,
        center - height * 0.46,
        0,
        center + height * 0.46,
      );
      gradient.addColorStop(0, '#e94d08');
      gradient.addColorStop(0.42, '#ff8a0a');
      gradient.addColorStop(0.5, '#ffc12b');
      gradient.addColorStop(0.58, '#ff8a0a');
      gradient.addColorStop(1, '#d93806');

      context.beginPath();
      for (let index = 0; index < pointCount; index += 1) {
        const x = (index / (pointCount - 1)) * width;
        const y = center - envelope[index] * height * 0.46;
        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
      for (let index = pointCount - 1; index >= 0; index -= 1) {
        const x = (index / (pointCount - 1)) * width;
        const y = center + envelope[index] * height * 0.46;
        context.lineTo(x, y);
      }
      context.closePath();

      context.save();
      context.fillStyle = gradient;
      context.globalAlpha = 0.94;
      context.shadowColor = 'rgba(255, 94, 15, 0.42)';
      context.shadowBlur = 12;
      context.fill();
      context.restore();

      context.beginPath();
      for (let index = 0; index < pointCount; index += 1) {
        const x = (index / (pointCount - 1)) * width;
        const y = center - envelope[index] * height * 0.46;
        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
      context.strokeStyle = 'rgba(255, 204, 105, 0.78)';
      context.lineWidth = 0.9;
      context.stroke();

      context.beginPath();
      context.moveTo(0, center);
      context.lineTo(width, center);
      context.strokeStyle = 'rgba(255, 133, 57, 0.32)';
      context.lineWidth = 1;
      context.stroke();

      const playheadX = Math.floor(width * 0.52);
      context.beginPath();
      context.moveTo(playheadX, 0);
      context.lineTo(playheadX, height);
      context.strokeStyle = '#ff3448';
      context.lineWidth = 1.25;
      context.shadowColor = 'rgba(255, 40, 65, 0.75)';
      context.shadowBlur = 8;
      context.stroke();
      context.shadowBlur = 0;
    };

    const drawCombined = (
      width: number,
      height: number,
    ) => {
      if (!analyser) {
        drawIdle(
          width,
          height,
        );

        return;
      }

      analyser.getByteFrequencyData(
        frequencyData,
      );

      analyser.getByteTimeDomainData(
        waveformData,
      );

      const upperHeight =
        height * 0.56;

      const lowerHeight =
        height * 0.44;

      const barCount = 72;

      const barWidth =
        width / barCount;

      /*
       * Frequency bars.
       */
      for (
        let index = 0;
        index < barCount;
        index += 1
      ) {
        const bin =
          Math.floor(
            (index /
              barCount) *
              Math.min(
                frequencyData.length,
                512,
              ),
          );

        const value =
          frequencyData[bin] /
          255;

        const barHeight =
          Math.max(
            1,
            value *
              upperHeight *
              0.85,
          );

        const x =
          index * barWidth;

        const y =
          upperHeight -
          barHeight;

        context.fillStyle =
          colors.primary;

        context.fillRect(
          x + 1,
          y,
          Math.max(
            2,
            barWidth - 2,
          ),
          barHeight,
        );
      }

      /*
       * Separator.
       */
      context.strokeStyle =
        colors.grid;

      context.beginPath();

      context.moveTo(
        0,
        upperHeight,
      );

      context.lineTo(
        width,
        upperHeight,
      );

      context.stroke();

      /*
       * Waveform.
       */
      context.beginPath();

      context.strokeStyle =
        colors.tertiary;

      context.lineWidth = 1.3;

      const waveformCenter =
        upperHeight +
        lowerHeight / 2;

      for (
        let index = 0;
        index < waveformData.length;
        index += 1
      ) {
        const x =
          (index /
            (waveformData.length - 1)) *
          width;

        const value =
          waveformData[index] /
            128 -
          1;

        const y =
          waveformCenter +
          value *
            lowerHeight *
            0.38;

        if (index === 0) {
          context.moveTo(
            x,
            y,
          );
        } else {
          context.lineTo(
            x,
            y,
          );
        }
      }

      context.stroke();

      /*
       * Labels.
       */
      context.fillStyle =
        colors.text;

      context.font =
        "9px monospace";

      context.textAlign =
        "left";

      context.fillText(
        "FREQUENCY",
        8,
        13,
      );

      context.fillText(
        "WAVEFORM",
        8,
        upperHeight + 13,
      );
    };

    const render = () => {
      const rect =
        canvas.getBoundingClientRect();

      const width =
        Math.max(
          1,
          rect.width,
        );

      const height =
        Math.max(
          1,
          rect.height,
        );

      /*
       * Keep canvas dimensions synchronized with
       * its actual CSS dimensions.
       */
      if (
        Math.abs(
          previousWidthRef.current -
            width,
        ) > 1
      ) {
        resizeCanvas();
      }

      context.clearRect(0, 0, width, height);
      context.fillStyle = style === "filled"
        ? "#100706"
        : colors.background;
      context.fillRect(0, 0, width, height);

      drawGrid(
        width,
        height,
        style === "filled"
          ? "rgba(255, 105, 45, 0.12)"
          : colors.grid,
      );

      if (!active) {
        drawIdle(
          width,
          height,
        );
      } else {
        switch (style) {
          case "spectrum":
            drawSpectrum(
              width,
              height,
            );
            break;

          case "waveform":
            drawWaveform(
              width,
              height,
            );
            break;

          case "frequency":
            drawFrequency(
              width,
              height,
            );
            break;

          case "oscilloscope":
            drawOscilloscope(
              width,
              height,
            );
            break;

          case "filled":
            drawFilledWaveform(
              width,
              height,
            );
            break;

          case "combined":
            drawCombined(
              width,
              height,
            );
            break;

          default:
            drawFilledWaveform(
              width,
              height,
            );
            break;
        }
      }

      animationRef.current =
        window.requestAnimationFrame(
          render,
        );
    };

    animationRef.current =
      window.requestAnimationFrame(
        render,
      );

    return () => {
      window.removeEventListener(
        "resize",
        resizeCanvas,
      );

      if (
        animationRef.current !==
        null
      ) {
        window.cancelAnimationFrame(
          animationRef.current,
        );

        animationRef.current =
          null;
      }
    };
  }, [
    analyser,
    active,
    style,
    colors,
  ]);

  return (
    <div
      className={`audio-visualizer audio-visualizer-${style}`}
      data-theme={theme}
    >
      <canvas
        ref={canvasRef}
        className="audio-visualizer-canvas"
      />
    </div>
  );
}
