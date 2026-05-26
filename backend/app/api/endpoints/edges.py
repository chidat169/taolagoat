from fastapi import APIRouter, HTTPException, status, Path, Body

from app.schemas.edge import EdgeFeatureCollection
from app.crud.edge import read_edges, read_edge, update_edge_active_status

router = APIRouter(prefix="/edges", tags=["edges"])

@router.get("/", response_model=EdgeFeatureCollection)
async def get_edges():
    return await read_edges()

@router.patch("/{id}")
async def set_edge_active_status(id: int = Path(ge=1), active: bool = Body()):
    edge = await read_edge(id)
    if not edge:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Edge not found")
    if edge.properties.active == active:
        return {"message": "No change nedded", "active": active}
    await update_edge_active_status(id, active)
    return {"message": "Active status updated", "active": active}