from app.core.database import db
from app.schemas.edge import EdgeFeatureCollection

async def read_line(id: str) -> EdgeFeatureCollection:
    line = await db.edges.find({"properties.line": id}, {"_id": 0}).to_list()
    if not line:
        return None
    return EdgeFeatureCollection(features=line)

async def update_line_active_status(id: str, active: bool):
    await db.edges.update_many({"properties.line": id}, {"$set": {"properties.active": active}})