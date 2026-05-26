from fastapi import APIRouter, HTTPException, status, Path, Body

from app.schemas.node import NodeFeatureCollection, NodeFeature
from app.crud.node import read_nodes, read_node, update_node_active_status

router = APIRouter(prefix="/nodes", tags=["nodes"])

@router.get("/", response_model=NodeFeatureCollection)
async def get_nodes():
    return await read_nodes()

@router.patch("/{id}")
async def set_node_active_status(id: int = Path(ge=1), active: bool = Body()):
    node = await read_node(id=id)
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")
    if node.properties.active == active:
        return {"message": "No change nedded", "active": active}
    await update_node_active_status(id, active)
    return {"message": "Active status updated", "active": active}