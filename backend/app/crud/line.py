from app.core.database import db
from app.schemas.edge import EdgeFeatureCollection

async def read_line(line: str) -> EdgeFeatureCollection:
    edges = await db.edges.find({"properties.line": line}, {"_id": 0}).to_list()
    if not edges:
        return None
    return EdgeFeatureCollection(features=edges)

async def update_line_active_status(line: str, active: bool):
    await db.edges.update_many({"properties.line": line}, {"$set": {"properties.active": active}})