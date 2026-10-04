from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.devices import router as devices_router
from app.api.discovery import router as discovery_router
from app.api.health import router as health_router
from app.api.interfaces import router as interfaces_router

from app.core.logging_config import configure_logging
from app.db.session import Base, engine
from app.api.topology import router as topology_router

# Ensure SQLAlchemy registers the Device model before creating tables.
from app.models.device import Device  # noqa: F401


# Configure application logging.
configure_logging()


# Frontend development URLs.
# Add your frontend's URL here if Vite uses a different port.
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application startup and shutdown lifecycle.

    Creates database tables if they do not already exist.
    """
    Base.metadata.create_all(bind=engine)

    yield


app = FastAPI(
    title="NetSonic API",
    description=(
        "Local network discovery, device inventory, "
        "and network monitoring API."
    ),
    version="0.2.0",
    lifespan=lifespan,
)


# Configure CORS so the React/Vite frontend can communicate
# with the FastAPI backend during local development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Register API routers.
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