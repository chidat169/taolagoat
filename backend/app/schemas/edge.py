from pydantic import BaseModel

class Geometry(BaseModel):
    coordinates: list[list[float]]
    type: str = "LineString"

class Properties(BaseModel):
    id: int
    start: int
    end: int
    line: str
    length: float
    active: bool

class TransferProperties(BaseModel):
    id: int
    start: int
    end: int
    line: str = "transfer"

class EdgeFeature(BaseModel):
    type: str = "Feature"
    geometry: Geometry
    properties: Properties | TransferProperties

class EdgeFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: list[EdgeFeature]