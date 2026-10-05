# NetSonic

### See your local network. Hear its rhythm.

NetSonic is a local network observability dashboard. It discovers devices on an authorized subnet, visualizes traffic and topology, and maps live network activity to selectable musical instruments.

> **At a glance** · FastAPI backend · React + TypeScript frontend · Live traffic · Network discovery · Audio sonification

---

## Get it running

NetSonic runs as two local processes: the API and the Vite development server. Open two terminals from the project folder.

### 1. Start the backend

Python 3.11 or newer is recommended.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The API is available at **http://127.0.0.1:8000** and its interactive documentation at **http://127.0.0.1:8000/docs**.

On Windows PowerShell, activate the environment with:

```powershell
.\.venv\Scripts\Activate.ps1
```

### 2. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The dashboard includes network discovery, traffic monitoring, topology, and the “Hear the network” sonification controls.

### Optional checks

```bash
# Frontend production build
cd frontend
npm run build

# Frontend lint
npm run lint

# Backend tests
cd ../backend
source .venv/bin/activate
python -m pytest -v
```

## Project map

```text
NetSonic/
├── backend/
│   ├── app/
│   │   ├── api/             # HTTP and WebSocket route handlers
│   │   ├── core/            # Settings, logging, shared exceptions
│   │   ├── db/              # Database setup and session management
│   │   ├── discovery/       # Local subnet scanning
│   │   ├── models/          # Database models
│   │   ├── schemas/         # API request and response models
│   │   ├── sonification/   # Audio event/configuration service
│   │   ├── topology/        # Network relationship data
│   │   ├── traffic/         # Packet capture and traffic aggregation
│   │   └── main.py          # FastAPI application and lifecycle
│   ├── tests/               # Backend test suite
│   ├── .env.example         # Backend configuration template
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── public/              # Static files and audio/sample credits
│   ├── src/
│   │   ├── assets/          # Frontend assets
│   │   ├── components/      # Dashboard, charts, topology, audio UI
│   │   ├── pages/           # Dashboard and Learn pages
│   │   ├── services/        # API and WebSocket clients
│   │   └── App.tsx          # Frontend route definitions
│   ├── .env.example         # Frontend configuration template
│   └── package.json         # Scripts and JavaScript dependencies
└── docs/                    # Project documentation and design notes
```

## What the app does

- **Discover:** scan an IPv4 subnet associated with a selected local interface and view discovered devices.
- **Monitor:** inspect traffic rates, packet counts, protocols, directions, and top peers.
- **Explore topology:** view inferred relationships among the local device, gateway, and discovered devices.
- **Sonify:** listen to network activity using selectable instrument sounds, with traffic activity driving the musical output. Audio starts only after you press **Start Audio** in the browser.
- **Learn:** visit `/learn` for the in-app guide.

The dashboard shows a first-run quick-start card with links to each stage. In the sonification controls, **Preview sample** plays a short instrument phrase for sound checking only; it is separate from live network sonification. The **LIVE TRAFFIC → SOUND** panel shows packet rate, mapped tempo, the last note, playback state, and sample velocity. To check the live mapping, start audio and generate a few pings to your gateway from another terminal, then stop and confirm playback goes silent when traffic falls to zero.

## Configuration

Copy the templates before changing local settings:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

The backend template covers the app name/version, environment, log level, SQLite database URL, and allowed CORS origins. The frontend template provides `VITE_API_BASE_URL`, whose default is `http://127.0.0.1:8000`. The current local frontend expects the API at that address.

The backend creates its SQLite database automatically when it starts. With the commands above, its file is created in `backend/`.

## API overview

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Check API health |
| `GET /api/interfaces` | List local network interfaces |
| `POST /api/discovery/scan` | Discover devices on an authorized subnet |
| `GET /api/devices` | List known devices |
| `GET /api/topology` | Get network topology data |
| `POST /api/traffic/start` · `POST /api/traffic/stop` | Control traffic monitoring |
| `GET /api/traffic/status` · `GET /api/traffic/snapshot` | Read monitoring state and traffic summary |
| `POST /api/sonification/start` · `POST /api/sonification/stop` | Control sonification service |
| `GET /api/sonification/config` · `PUT /api/sonification/config` | Read or update sonification settings |
| `WS /api/sonification/stream` | Receive live sonification updates |

For request and response details, use the interactive [API docs](http://127.0.0.1:8000/docs) while the backend is running.

## How the audio follows traffic

NetSonic uses sampled instrument sounds as the timbre for individual notes; it does not play one continuous sample recording. While fresh captured traffic is present, the browser triggers instrument notes in short phrases. Packet rate controls tempo, the backend's traffic pitch parameter selects notes within a pentatonic scale, traffic intensity controls note velocity, and inbound/outbound direction controls stereo position. Phrase patterns shift at phrase boundaries using traffic-rate, intensity, and direction bands, keeping the notes musical while making sustained traffic changes audible. The drums option uses a fixed kick, snare, and hi-hat pattern, with tempo and velocity responding to traffic. Playback becomes silent when the measured packet rate is zero or capture updates stop arriving. A steady traffic pattern can still sound repetitive.

Use **Preview sample** to audition the selected instrument independently of traffic. Use **LIVE TRAFFIC → SOUND** to verify live playback: it shows the measured packet rate, mapped tempo, latest note, note velocity, and whether capture updates have gone stale.

## Automated checks

GitHub Actions runs the backend test suite and the frontend lint/build checks on pushes and pull requests. Run those same commands locally with the optional checks above before opening a change.

## Permissions, privacy, and audio

- **Packet capture permissions:** live capture uses Scapy and may need raw-packet capture privileges on your operating system. If the API starts but traffic remains empty, check the permissions granted to the backend process and confirm the selected interface is active.
- **Authorized networks only:** scan only networks you own or have explicit permission to assess. The discovery service limits the scan size; broad subnets are rejected.
- **Payload privacy:** packet payloads are not stored. NetSonic uses packet metadata to calculate traffic summaries.
- **Audio samples:** instrument samples may load on first use and require network access. Browser audio also requires a user action, so press **Start Audio** before expecting sound.

## Common fixes

| Symptom | Check |
| --- | --- |
| Dashboard cannot reach the API | Confirm Uvicorn is running on `127.0.0.1:8000`; check `frontend/.env` if you changed the API address. |
| No interface appears or capture is empty | Confirm the machine has an active IPv4 interface and that the backend has packet-capture permission. |
| Discovery rejects a subnet | Choose a subnet that belongs to the selected interface and is within the supported scan-size limit. |
| Instrument is silent on first selection | Keep the page online while samples load, then start audio with the dashboard control. Check browser tab/system volume. |
| Port is already in use | Stop the existing process or choose another port, then update the frontend API URL if the backend port changes. |

## Built with

**Backend:** Python · FastAPI · Scapy · SQLAlchemy · SQLite  
**Frontend:** React · TypeScript · Vite · Recharts · Cytoscape

---

<p align="center"><strong>NetSonic</strong> · A clearer picture of the traffic around you.</p>
