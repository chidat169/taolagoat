from pydantic import BaseModel

class Path(BaseModel):
    path: list[int]
    segments: list[int]
    length: float
    transfer: int
