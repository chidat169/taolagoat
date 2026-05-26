from fastapi import APIRouter
from app.api.endpoints import nodes, edges, path, lines

api_router = APIRouter(prefix="/api")
api_router.include_router(nodes.router)
api_router.include_router(edges.router)
api_router.include_router(lines.router)
api_router.include_router(path.router)