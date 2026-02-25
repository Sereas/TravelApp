"""Infrastructure endpoints: health, probes, etc. No auth."""

from fastapi import APIRouter

router = APIRouter(tags=["infra"], include_in_schema=False)


@router.get("/health")
async def health() -> dict[str, str]:
    """Lightweight health endpoint for k8s/load balancer probes."""
    return {"status": "ok"}
