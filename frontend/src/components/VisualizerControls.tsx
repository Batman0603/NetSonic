import "./VisualizerControls.css";

export type VisualizerStyle =
  | "spectrum"
  | "waveform"
  | "frequency"
  | "oscilloscope"
  | "filled"
  | "combined";

export type VisualizerTheme =
  | "cyan"
  | "neon"
  | "purple"
  | "green"
  | "amber"
  | "mono";

interface VisualizerControlsProps {
  style: VisualizerStyle;
  theme: VisualizerTheme;
  onStyleChange: (style: VisualizerStyle) => void;
  onThemeChange: (theme: VisualizerTheme) => void;
}

interface VisualizerOption {
  id: VisualizerStyle;
  title: string;
  description: string;
}

interface ThemeOption {
  id: VisualizerTheme;
  title: string;
  colorClass: string;
}

const VISUALIZER_OPTIONS: VisualizerOption[] = [
  {
    id: "spectrum",
    title: "Spectrum Bars",
    description: "Frequency activity as bars",
  },
  {
    id: "waveform",
    title: "Waveform",
    description: "Live audio waveform",
  },
  {
    id: "frequency",
    title: "Frequency",
    description: "Frequency distribution",
  },
  {
    id: "oscilloscope",
    title: "Oscilloscope",
    description: "Scientific signal view",
  },
  {
    id: "filled",
    title: "Filled Waveform",
    description: "Music-style amplitude waveform",
  },
  {
    id: "combined",
    title: "Research Analyzer",
    description: "Waveform + spectrum + signal",
  },
];

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "cyan",
    title: "Cyan Analyzer",
    colorClass: "theme-cyan",
  },
  {
    id: "neon",
    title: "Neon Spectrum",
    colorClass: "theme-neon",
  },
  {
    id: "purple",
    title: "Purple",
    colorClass: "theme-purple",
  },
  {
    id: "green",
    title: "Green",
    colorClass: "theme-green",
  },
  {
    id: "amber",
    title: "Amber",
    colorClass: "theme-amber",
  },
  {
    id: "mono",
    title: "Monochrome",
    colorClass: "theme-mono",
  },
];

export function VisualizerControls({
  style,
  theme,
  onStyleChange,
  onThemeChange,
}: VisualizerControlsProps) {
  return (
    <section className="visualizer-controls">
      <div className="visualizer-controls-header">
        <div>
          <div className="visualizer-controls-title">
            VISUALIZATION
          </div>

          <div className="visualizer-controls-description">
            Choose how the network audio is displayed
          </div>
        </div>
      </div>

      <div className="visualizer-style-grid">
        {VISUALIZER_OPTIONS.map((option) => {
          const selected = style === option.id;

          return (
            <button
              key={option.id}
              type="button"
              className={`visualizer-style-option ${
                selected ? "selected" : ""
              }`}
              onClick={() => onStyleChange(option.id)}
              aria-pressed={selected}
            >
              <span className="visualizer-option-title">
                {option.title}
              </span>

              <span className="visualizer-option-description">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>

      <div className="visualizer-theme-section">
        <div className="visualizer-theme-heading">
          <div className="visualizer-controls-title">
            COLOR PROFILE
          </div>

          <div className="visualizer-controls-description">
            Select the visual appearance
          </div>
        </div>

        <div className="visualizer-theme-list">
          {THEME_OPTIONS.map((option) => {
            const selected = theme === option.id;

            return (
              <button
                key={option.id}
                type="button"
                className={`visualizer-theme-option ${
                  selected ? "selected" : ""
                }`}
                onClick={() => onThemeChange(option.id)}
                aria-pressed={selected}
              >
                <span
                  className={`visualizer-theme-swatch ${option.colorClass}`}
                />

                <span>{option.title}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
