import { useState } from "react";

const HIDE_KEY = "netsonic.onboarding.dismissed";

export function OnboardingGuide({
  hasInterface,
}: {
  hasInterface: boolean;
}) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === "true";
    } catch {
      return false;
    }
  });

  if (hidden) return null;

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(HIDE_KEY, "true");
    } catch {
      // Dismiss for this session if storage is unavailable.
    }
  }

  return (
    <section className="onboarding-guide" aria-labelledby="onboarding-title">
      <div className="onboarding-guide-heading">
        <div>
          <p className="eyebrow">QUICK START</p>
          <h2 id="onboarding-title">Your first network check</h2>
          <p>Follow the live readings from interface selection to sound.</p>
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss quick start">
          Dismiss
        </button>
      </div>

      <ol className="onboarding-steps">
        <li className={hasInterface ? "is-ready" : ""}>
          <span>01</span>
          <div><strong>Choose an interface</strong><a href="#network-source">Review network source</a></div>
        </li>
        <li>
          <span>02</span>
          <div><strong>Check local devices</strong><a href="#discovery">Open discovery</a></div>
        </li>
        <li>
          <span>03</span>
          <div><strong>Confirm traffic is live</strong><a href="#traffic">Review packet rate</a></div>
        </li>
        <li>
          <span>04</span>
          <div><strong>Compare traffic and sound</strong><a href="#sonification">Open live sound mapping</a></div>
        </li>
      </ol>

      <p className="onboarding-tip">
        For a quick check, start audio and generate a few pings to your gateway from another terminal. Watch packet rate, tempo, and last note change; stop the pings and playback should become silent when traffic falls to zero.
      </p>
    </section>
  );
}
