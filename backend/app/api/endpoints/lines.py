from fastapi import APIRouter, Path, Body, HTTPException, status
from app.crud.line import read_line, update_line_active_status

router = APIRouter(prefix="/lines", tags=["lines"])

@router.patch("/{line}")
async def set_line_active_status(line: str = Path(min_length=1, max_length=4), active: bool = Body()):
    edges = await read_line(line=line)
    if not edges:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Line not found")
    await update_line_active_status(line=line, active=active)
    return {"message": "Active status updated"}