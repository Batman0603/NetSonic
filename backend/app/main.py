import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.devices import router as devices_router
from app.api.discovery import router as discovery_router
from app.api.health import router as health_router
from app.api.interfaces import router as interfaces_router
from app.api.traffic import router as traffic_router
from app.api.topology import router as topology_router
from app.api.sonification import router as sonification_router
from app.api.telemetry import router as telemetry_router

from app.core.logging_config import configure_logging
from app.db.session import Base, engine
from app.discovery.interfaces import list_ipv4_interfaces
from app.traffic.service import traffic_monitor
from app.telemetry.service import record_telemetry
from app.models.telemetry import Alert, DeviceTrafficSample, TelemetrySample  # noqa: F401

# Ensure SQLAlchemy registers the Device model before creating tables.
from app.models.device import Device  # noqa: F401


# Configure application logging.
configure_logging()
logger = logging.getLogger(__name__)


# Frontend development URLs.
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


def get_default_interface() -> str | None:
    """
    Find the first active non-loopback IPv4 network interface.
    """
    interfaces = list_ipv4_interfaces()

    for interface in interfaces:
        if interface.is_up and interface.ipv4_address:
            return interface.name

    return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application startup and shutdown lifecycle.

    Startup:
    - Creates database tables.
    - Detects an active IPv4 interface.
    - Automatically starts traffic monitoring.

    Shutdown:
    - Stops traffic monitoring cleanly.
    """
    # ---------------------------------------------------------
    # Startup
    # ---------------------------------------------------------

    Base.metadata.create_all(bind=engine)

    async def persist_telemetry() -> None:
        while True:
            try:
                await asyncio.to_thread(record_telemetry)
            except Exception:
                logger.exception("Unable to persist a telemetry sample.")
            await asyncio.sleep(15)

    telemetry_task = asyncio.create_task(persist_telemetry())

    try:
        default_interface = get_default_interface()

        if default_interface:
            traffic_monitor.start(default_interface)

            print(
                f"NetSonic traffic monitoring started "
                f"on interface '{default_interface}'."
            )
        else:
            print(
                "NetSonic started, but no active IPv4 "
                "network interface was found."
            )

    except Exception as exc:
        print(
            f"Unable to automatically start traffic monitoring: {exc}"
        )

    yield

    # ---------------------------------------------------------
    # Shutdown
    # ---------------------------------------------------------

    try:
        traffic_monitor.stop()
        print("NetSonic traffic monitoring stopped.")
    except Exception as exc:
        print(
            f"Unable to stop traffic monitoring cleanly: {exc}"
        )
    telemetry_task.cancel()
    try:
        await telemetry_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="NetSonic API",
    description=(
        "Local network discovery, device inventory, "
        "and network monitoring API."
    ),
    version="0.2.0",
    lifespan=lifespan,
)


# Configure CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------------------------------------------------
# Register API routers
# -------------------------------------------------------------

app.include_router(
    health_router,
    prefix="/api",
    tags=["Health"],
)

app.include_router(
    interfaces_router,
    prefix="/api",
    tags=["Network Interfaces"],
)

app.include_router(
    discovery_router,
    prefix="/api",
    tags=["Network Discovery"],
)

app.include_router(
    devices_router,
    prefix="/api",
    tags=["Devices"],
)

app.include_router(
    topology_router,
    prefix="/api",
    tags=["Topology"],
)

app.include_router(
    traffic_router,
    prefix="/api",
)

app.include_router(
    sonification_router,
    prefix="/api",
)

app.include_router(telemetry_router, prefix="/api")


@app.get("/", tags=["Root"])
def root():
    """
    Root endpoint providing basic API information.
    """
    return {
        "name": "NetSonic API",
        "version": "0.2.0",
        "status": "running",
        "docs": "/docs",
    }
