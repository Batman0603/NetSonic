import { useMemo, useState } from "react";

import "./LearnPage.css";
import { ThemeToggle } from "../components/ThemeToggle";

interface LearnSection {
  id: string;
  title: string;
  shortTitle: string;
}

const sections: LearnSection[] = [
  {
    id: "introduction",
    title: "What is NetSonic?",
    shortTitle: "Introduction",
  },
  {
    id: "architecture",
    title: "How NetSonic Works",
    shortTitle: "Architecture",
  },
  {
    id: "interfaces",
    title: "Network Interfaces",
    shortTitle: "Interfaces",
  },
  {
    id: "discovery",
    title: "Device Discovery",
    shortTitle: "Discovery",
  },
  {
    id: "topology",
    title: "Network Topology",
    shortTitle: "Topology",
  },
  {
    id: "traffic",
    title: "Traffic Monitoring",
    shortTitle: "Traffic",
  },
  {
    id: "protocols",
    title: "Network Protocols",
    shortTitle: "Protocols",
  },
  {
    id: "sonification",
    title: "Network Sonification",
    shortTitle: "Sonification",
  },
  {
    id: "visualizers",
    title: "Audio Visualizations",
    shortTitle: "Visualizers",
  },
  {
    id: "dashboard",
    title: "Understanding the Dashboard",
    shortTitle: "Dashboard",
  },
  {
    id: "workflow",
    title: "How to Use NetSonic",
    shortTitle: "Getting Started",
  },
  {
    id: "research",
    title: "Research & Technical Concepts",
    shortTitle: "Research",
  },
  {
    id: "limitations",
    title: "Limitations",
    shortTitle: "Limitations",
  },
  {
    id: "faq",
    title: "Frequently Asked Questions",
    shortTitle: "FAQ",
  },
];

function SectionTitle({
  number,
  title,
}: {
  number: string;
  title: string;
}) {
  return (
    <div className="learn-section-heading">
      <span>{number}</span>
      <h2>{title}</h2>
    </div>
  );
}

function LearnPage() {
  const [search, setSearch] = useState("");

  const filteredSections = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return sections;
    }

    return sections.filter(
      (section) =>
        section.title.toLowerCase().includes(query) ||
        section.shortTitle.toLowerCase().includes(query),
    );
  }, [search]);

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <div className="learn-page">
      <header className="learn-header">
        <div className="learn-header-inner">
          <div>
            <p className="learn-eyebrow">
              NETSONIC DOCUMENTATION
            </p>

            <h1>Learn NetSonic</h1>

            <p className="learn-header-description">
              Understand how NetSonic discovers your network,
              monitors traffic, and converts network activity
              into adaptive audio.
            </p>
          </div>

          <div className="learn-header-actions">
            <ThemeToggle />
            <a href="/" className="learn-dashboard-link">
              ← Dashboard
            </a>
          </div>
        </div>
      </header>

      <div className="learn-layout">
        <aside className="learn-sidebar">
          <div className="learn-sidebar-title">
            ON THIS PAGE
          </div>

          <input
            className="learn-search"
            type="search"
            placeholder="Search topics..."
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />

          <nav>
            {filteredSections.map(
              (section, index) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() =>
                    scrollToSection(section.id)
                  }
                >
                  <span>
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  {section.shortTitle}
                </button>
              ),
            )}
          </nav>
        </aside>

        <main className="learn-content">
          <section
            id="introduction"
            className="learn-section learn-hero"
          >
            <p className="learn-label">
              01 / INTRODUCTION
            </p>

            <h2>What is NetSonic?</h2>

            <p className="lead">
              NetSonic is a network intelligence and
              sonification framework that allows users
              to observe local network activity visually
              and experience it audibly.
            </p>

            <div className="definition-card">
              <strong>
                "See the network. Hear the network."
              </strong>

              <p>
                NetSonic combines network discovery,
                topology visualization, traffic
                monitoring, and adaptive sonification
                into a single interface.
              </p>
            </div>

            <p>
              Instead of requiring users to continuously
              inspect packet counters and graphs, NetSonic
              translates changes in network activity into
              meaningful audio characteristics.
            </p>
          </section>

          <section
            id="architecture"
            className="learn-section"
          >
            <SectionTitle
              number="02"
              title="How NetSonic Works"
            />

            <p>
              NetSonic processes network information through
              several stages. Each stage has a specific
              responsibility.
            </p>

            <div className="architecture-flow">
              {[
                "Network Interface",
                "Device Discovery",
                "Topology",
                "Traffic Monitoring",
                "Traffic Aggregation",
                "Sonification",
                "Web Audio",
                "User",
              ].map((item, index) => (
                <div
                  className="architecture-step"
                  key={item}
                >
                  <strong>{item}</strong>

                  {index < 7 && (
                    <span>↓</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section
            id="interfaces"
            className="learn-section"
          >
            <SectionTitle
              number="03"
              title="Network Interfaces"
            />

            <p>
              A network interface is the communication
              endpoint through which your computer connects
              to a network.
            </p>

            <div className="info-grid">
              <InfoCard
                title="Interface"
                description="The system network device used for communication, such as Wi-Fi or Ethernet."
              />

              <InfoCard
                title="IP Address"
                description="The IPv4 address assigned to the selected network interface."
              />

              <InfoCard
                title="Subnet"
                description="The local IPv4 network range that NetSonic is allowed to inspect."
              />

              <InfoCard
                title="Active Interface"
                description="An interface that is currently available for network communication."
              />
            </div>

            <div className="warning-card">
              <strong>Why select an interface?</strong>

              <p>
                NetSonic needs to know which network interface
                should be used for discovery and traffic
                monitoring.
              </p>
            </div>
          </section>

          <section
            id="discovery"
            className="learn-section"
          >
            <SectionTitle
              number="04"
              title="Device Discovery"
            />

            <p>
              Device discovery identifies devices that
              respond on the authorized local network.
            </p>

            <h3>ARP Discovery</h3>

            <p>
              NetSonic uses Address Resolution Protocol
              (ARP) requests to identify IPv4 hosts on the
              selected local subnet.
            </p>

            <div className="info-grid">
              <InfoCard
                title="IP Address"
                description="Identifies the device at the IPv4 network layer."
              />

              <InfoCard
                title="MAC Address"
                description="Identifies the network interface at the local-link layer."
              />

              <InfoCard
                title="Hostname"
                description="The available human-readable name associated with a device."
              />

              <InfoCard
                title="Last Seen"
                description="The latest time NetSonic observed the device."
              />
            </div>

            <div className="warning-card">
              <strong>Important</strong>

              <p>
                A device not responding to ARP may not appear
                in discovery. Therefore, the discovered device
                list should not be interpreted as a guaranteed
                list of every physical device on the network.
              </p>
            </div>
          </section>

          <section
            id="topology"
            className="learn-section"
          >
            <SectionTitle
              number="05"
              title="Network Topology"
            />

            <p>
              The topology view presents a logical
              representation of the discovered network.
            </p>

            <div className="topology-example">
              <div>YOUR DEVICE</div>
              <span>↓</span>
              <div>DEFAULT GATEWAY</div>
              <span>↓</span>
              <div>DISCOVERED DEVICES</div>
            </div>

            <div className="warning-card">
              <strong>
                Logical topology ≠ physical topology
              </strong>

              <p>
                NetSonic infers logical relationships from
                available network information. It does not
                claim that the displayed edges represent
                physical cable or wireless paths.
              </p>
            </div>
          </section>

          <section
            id="traffic"
            className="learn-section"
          >
            <SectionTitle
              number="06"
              title="Traffic Monitoring"
            />

            <p>
              Traffic monitoring observes network packets
              and aggregates them into useful measurements.
            </p>

            <div className="metric-table">
              <MetricRow
                name="Packets"
                meaning="Number of observed network packets."
              />

              <MetricRow
                name="Bytes"
                meaning="Amount of network data represented by the observed packets."
              />

              <MetricRow
                name="Upload"
                meaning="Traffic transmitted from the local device."
              />

              <MetricRow
                name="Download"
                meaning="Traffic received by the local device."
              />

              <MetricRow
                name="Mbps"
                meaning="Network data rate measured in megabits per second."
              />

              <MetricRow
                name="Packets/sec"
                meaning="Average packet rate during the measurement window."
              />

              <MetricRow
                name="Peer"
                meaning="Remote IP address associated with observed traffic."
              />
            </div>
          </section>

          <section
            id="protocols"
            className="learn-section"
          >
            <SectionTitle
              number="07"
              title="Network Protocols"
            />

            <div className="info-grid">
              <InfoCard
                title="TCP"
                description="Connection-oriented transport protocol commonly used by web applications and many network services."
              />

              <InfoCard
                title="UDP"
                description="Connectionless transport protocol commonly used where low latency is important."
              />

              <InfoCard
                title="ICMP"
                description="Network-layer protocol used for control and diagnostic messages."
              />

              <InfoCard
                title="IGMP"
                description="Protocol used for IPv4 multicast group management."
              />
            </div>

            <p className="small-note">
              NetSonic may display a protocol as OTHER when
              traffic does not match one of the explicitly
              classified protocol categories.
            </p>
          </section>

          <section
            id="sonification"
            className="learn-section"
          >
            <SectionTitle
              number="08"
              title="Network Sonification"
            />

            <p>
              Sonification is the process of representing
              information using sound.
            </p>

            <p>
              NetSonic maps network characteristics to
              different audio parameters so that changes
              in network activity can be perceived without
              constantly looking at the dashboard.
            </p>

            <div className="mapping-table">
              <MappingRow
                network="Packet rate"
                audio="Tempo (76–165 BPM)"
              />

              <MappingRow
                network="Backend traffic pitch"
                audio="Next note, quantized to a pentatonic scale"
              />

              <MappingRow
                network="Traffic intensity"
                audio="Sample velocity (loudness)"
              />

              <MappingRow
                network="Traffic direction"
                audio="Stereo position (inbound left, outbound right)"
              />

              <MappingRow
                network="Instrument choice"
                audio="Sampled piano, keyboard, flute, guitar, or drum timbre"
              />
            </div>

            <p>
              Instrument samples provide the sound of each note; they are not
              played as one continuous recording. The browser retriggers
              individual sampled notes while fresh packet activity is present.
              A short repeating melodic phrase keeps the notes musical, so a
              steady stream of traffic can sound repetitive. The drum option
              uses a fixed kick, snare, and hi-hat pattern whose tempo and
              velocity follow traffic. When packet activity reaches zero or
              traffic updates become stale, note playback stops.
            </p>

            <div className="definition-card">
              <strong>Adaptive normalization</strong>

              <p>
                Network traffic can vary greatly in scale.
                NetSonic therefore normalizes recent traffic
                values so that both small and large changes
                can remain perceptually useful.
              </p>
            </div>
          </section>

          <section
            id="visualizers"
            className="learn-section"
          >
            <SectionTitle
              number="09"
              title="Audio Visualizations"
            />

            <p>
              The visualizer provides a visual representation
              of the audio generated by the sonification engine.
              Users can choose the representation that best
              suits their purpose.
            </p>

            <div className="info-grid">
              <InfoCard
                title="Spectrum Bars"
                description="Displays frequency activity as vertical bars."
              />

              <InfoCard
                title="Waveform"
                description="Displays the live audio signal in the time domain."
              />

              <InfoCard
                title="Frequency"
                description="Shows the distribution of energy across frequencies."
              />

              <InfoCard
                title="Oscilloscope"
                description="Scientific-style time-domain representation of the audio signal."
              />

              <InfoCard
                title="Spectrogram"
                description="Shows how frequency content changes over time."
              />

              <InfoCard
                title="Filled Waveform"
                description="Displays the amplitude envelope as a filled audio waveform."
              />

              <InfoCard
                title="Research Analyzer"
                description="Combines multiple signal representations for analysis."
              />
            </div>
          </section>

          <section
            id="dashboard"
            className="learn-section"
          >
            <SectionTitle
              number="10"
              title="Understanding the Dashboard"
            />

            <div className="info-grid">
              <InfoCard
                title="Discovery"
                description="Used to find and inspect devices on the selected local network."
              />

              <InfoCard
                title="Topology"
                description="Provides a logical visualization of the local network."
              />

              <InfoCard
                title="Traffic"
                description="Displays current network traffic measurements."
              />

              <InfoCard
                title="Sonification"
                description="Converts traffic information into adaptive audio."
              />

              <InfoCard
                title="Visualizer"
                description="Provides graphical representations of the generated audio signal."
              />

              <InfoCard
                title="Protocol / Peer Data"
                description="Shows which protocols and remote peers contribute to observed traffic."
              />
            </div>
          </section>

          <section
            id="workflow"
            className="learn-section"
          >
            <SectionTitle
              number="11"
              title="How to Use NetSonic"
            />

            <div className="workflow">
              <WorkflowStep
                number="01"
                title="Select an interface"
                description="Choose the active network interface you want NetSonic to monitor."
              />

              <WorkflowStep
                number="02"
                title="Discover devices"
                description="Run discovery on the authorized local subnet."
              />

              <WorkflowStep
                number="03"
                title="Inspect topology"
                description="Use the topology view to understand the logical network relationships."
              />

              <WorkflowStep
                number="04"
                title="Start traffic monitoring"
                description="Observe packets, bytes, traffic rates, protocols, directions and peers."
              />

              <WorkflowStep
                number="05"
                title="Start audio"
                description="Enable browser audio and start the network sonification engine."
              />

              <WorkflowStep
                number="06"
                title="Choose a visualizer"
                description="Select the visual representation that best matches your use case."
              />

              <WorkflowStep
                number="07"
                title="Listen and observe"
                description="Compare what you hear with the traffic measurements and visualizations."
              />
            </div>
          </section>

          <section
            id="research"
            className="learn-section"
          >
            <SectionTitle
              number="12"
              title="Research & Technical Concepts"
            />

            <div className="info-grid">
              <InfoCard
                title="Adaptive Mapping"
                description="Audio parameters change according to current network activity."
              />

              <InfoCard
                title="Rolling History"
                description="Recent traffic measurements provide the reference used for normalization."
              />

              <InfoCard
                title="Real-Time Processing"
                description="Network measurements are continuously transformed into audio parameters."
              />

              <InfoCard
                title="Web Audio"
                description="The browser generates and renders the sonification audio."
              />
            </div>

            <div className="definition-card">
              <strong>Privacy-oriented design</strong>

              <p>
                NetSonic focuses on network metadata and
                aggregated traffic measurements. It does not
                require storing application payload contents
                for the sonification workflow.
              </p>
            </div>
          </section>

          <section
            id="limitations"
            className="learn-section"
          >
            <SectionTitle
              number="13"
              title="Limitations"
            />

            <ul className="learn-list">
              <li>
                Devices that do not respond to discovery
                requests may not appear.
              </li>

              <li>
                MAC addresses are meaningful primarily on
                the local network segment.
              </li>

              <li>
                The topology visualization represents
                logical relationships rather than guaranteed
                physical connections.
              </li>

              <li>
                Network sonification represents observed
                traffic; it does not automatically determine
                whether traffic is malicious.
              </li>

              <li>
                Results depend on the selected network
                interface and the traffic visible through it.
              </li>

              <li>
                Network conditions can change rapidly, so
                measurements represent a particular observation
                window.
              </li>
            </ul>
          </section>

          <section
            id="faq"
            className="learn-section learn-faq"
          >
            <SectionTitle
              number="14"
              title="Frequently Asked Questions"
            />

            <Faq
              question="Why are no devices appearing?"
              answer="Make sure the correct active network interface is selected and that the system has the required packet-capture privileges. Devices that do not respond to ARP may also remain undiscovered."
            />

            <Faq
              question="Why is traffic showing zero?"
              answer="The selected interface may currently have very little traffic, or traffic monitoring may not be running. Generate some normal network activity and check the traffic window again."
            />

            <Faq
              question="Why can't I hear audio?"
              answer="Browsers require audio playback to be initiated by a user interaction. Click Start Audio and make sure your system output device is working."
            />

            <Faq
              question="Is NetSonic just replaying an instrument sample?"
              answer="Instrument samples supply the timbre, but NetSonic triggers separate notes from them using live traffic measurements. Packet rate controls tempo, the traffic pitch parameter selects notes in a repeating pentatonic phrase, intensity controls note velocity, and direction controls stereo position. The drum option follows a fixed kick/snare/hi-hat pattern. The sound stops when packet activity is zero or capture updates are stale."
            />

            <Faq
              question="What does OTHER-2 mean?"
              answer="It indicates IP protocol number 2, which corresponds to IGMP. NetSonic can display protocol numbers that are not represented by its main TCP, UDP and ICMP categories."
            />

            <Faq
              question="Why does upload sound different from download?"
              answer="NetSonic uses stereo direction mapping. Outbound and inbound traffic are represented at different stereo positions so that the listener can distinguish traffic direction."
            />

            <Faq
              question="Can NetSonic detect attacks?"
              answer="The sonification system is designed to represent network activity. It should not be interpreted as an intrusion-detection or attack-classification system unless a separate detection mechanism is added."
            />
          </section>
        </main>
      </div>
    </div>
  );
}

function InfoCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <article className="learn-info-card">
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}

function MetricRow({
  name,
  meaning,
}: {
  name: string;
  meaning: string;
}) {
  return (
    <div className="learn-table-row">
      <strong>{name}</strong>
      <span>{meaning}</span>
    </div>
  );
}

function MappingRow({
  network,
  audio,
}: {
  network: string;
  audio: string;
}) {
  return (
    <div className="learn-table-row">
      <strong>{network}</strong>
      <span>→ {audio}</span>
    </div>
  );
}

function WorkflowStep({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="workflow-step">
      <div className="workflow-number">
        {number}
      </div>

      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

function Faq({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  return (
    
    <details className="learn-faq-item">
      <summary>{question}</summary>
      <p>{answer}</p>
    </details>
  );
}

export default LearnPage;
