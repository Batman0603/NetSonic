from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.telemetry import Alert
from app.telemetry.service import _as_utc, get_history, health_monitor
from app.traffic.service import traffic_monitor

router = APIRouter(tags=["Telemetry"])


@router.get("/history/traffic")
def traffic_history(
    window: Literal["5m", "1h", "24h", "7d"] = "1h",
    interface_name: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """Return stored aggregate trends for one of the supported time ranges."""
    return get_history(db, window, interface_name)


@router.get("/health/network")
def network_health() -> dict:
    """Report the score and component metrics from recent gateway probes."""
    status = traffic_monitor.status()
    traffic = None
    if status["running"] and status["interface_name"]:
        try:
            traffic = traffic_monitor.snapshot(status["interface_name"], 60)
        except Exception:
            traffic = None
    result = health_monitor.metrics(traffic)
    result["status"] = ("collecting" if not result["probe_count"] else
                        "healthy" if result["score"] >= 80 else "degraded" if result["score"] >= 50 else "poor")
    result["monitoring"] = status["running"]
    result["interface_name"] = status["interface_name"]
    return result


@router.get("/alerts")
def list_alerts(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> dict:
    """List recent stored alert events, newest first."""
    alerts = list(db.scalars(select(Alert).order_by(Alert.created_at.desc()).limit(limit)).all())
    return {"alerts": [{"id": alert.id, "created_at": _as_utc(alert.created_at), "type": alert.type,
                        "severity": alert.severity, "title": alert.title,
                        "message": alert.message, "active": alert.active} for alert in alerts],
            "total": len(alerts)}


@router.get("/health/network/history")
def network_health_history(
    window: Literal["5m", "1h", "24h", "7d"] = "1h",
    db: Session = Depends(get_db),
) -> dict:
    """Expose historical score inputs for network health trend charts."""
    history = get_history(db, window)
    return {"window": history["window"], "samples": [
        {key: point.get(key) for key in ("timestamp", "health_score", "latency_ms", "packet_loss_percent", "jitter_ms")}
        for point in history["samples"]]}
