from pydantic import BaseModel

class Geometry(BaseModel):
    coordinates: list[float]
    type: str = "Point"

class Child(BaseModel):
    id: int
    line: str
    coordinates: list[float]

class Properties(BaseModel):
    id: int
    name: str
    active: bool
    child: list[Child]

class NodeFeature(BaseModel):
    type: str = "Feature"
    geometry: Geometry
    properties: Properties

class NodeFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: list[NodeFeature]