from fastapi import APIRouter, Path, Body, HTTPException, status
from app.crud.line import read_line, update_line_active_status
from app.schemas.edge import EdgeFeatureCollection

router = APIRouter(prefix="/lines", tags=["lines"])

@router.get("/{id}", response_model=EdgeFeatureCollection)
async def get_line(id: str = Path(min_length=1, max_length=4)):
    line = await read_line(id)
    if not line:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Line not found")
    return line

@router.patch("/{id}")
async def set_line_active_status(id: str = Path(min_length=1, max_length=4), active: bool = Body()):
    line = await read_line(id)
    if not line:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Line not found")
    await update_line_active_status(id, active)
    return {"message": "Active status updated"}