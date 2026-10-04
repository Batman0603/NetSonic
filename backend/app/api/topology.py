import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.topology import TopologyResponse
from app.topology.service import (
    GatewayDetectionError,
    InterfaceNotFoundError,
    InterfaceUnavailableError,
    TopologyError,
    TopologyService,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/topology",
    tags=["Topology"],
)


@router.get(
    "",
    response_model=TopologyResponse,
    summary="Build local logical network topology",
)
def get_topology(
    interface_name: str = Query(
        ...,
        min_length=1,
        max_length=64,
        description="Network interface to use for topology generation.",
    ),
    db: Session = Depends(get_db),
) -> TopologyResponse:
    try:
        service = TopologyService(db)

        return service.build_topology(interface_name)

    except InterfaceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    except InterfaceUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    except GatewayDetectionError as exc:
        logger.warning("Gateway detection failed: %s", exc)

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    except TopologyError as exc:
        logger.warning("Topology generation failed: %s", exc)

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception("Unexpected topology error.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while building the topology.",
        ) from exc