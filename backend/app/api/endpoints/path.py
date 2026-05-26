from fastapi import APIRouter, Query
from app.services.path import get_node_map, get_graph, a_star

router = APIRouter(prefix="/path", tags=["path"])

@router.get("/")
async def path_finding(
    lon1: float = Query(ge=-180, le=180),
    lat1: float = Query(ge=-90, le=90),
    lon2: float = Query(ge=-180, le=180),
    lat2: float = Query(ge=-90, le=90),
    penalty: int = Query(default=0, ge=0)
):
    node_map = await get_node_map()
    graph = await get_graph(penalty, node_map)   
    path = await a_star(lon1, lat1, lon2, lat2, node_map, graph)
    if path is None:
        return {"message": "Path not found"}
    return path

@router.get("/graph")
async def graph(penalty: int = Query(default=0, ge=0)):
    node_map = await get_node_map()
    return await get_graph(penalty, node_map)

@router.get("/nodemap")
async def node_map():
    return await get_node_map()