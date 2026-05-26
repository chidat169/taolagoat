import heapq, math
from app.core.database import db
from app.schemas.path import Path

async def get_node_map() -> dict:
    node_map = {}
    valid_edge_filter = {
        "$or": [
            {"properties.line": "transfer"},
            {"properties.active": True}
        ]
    }

    starts = await db.edges.distinct("properties.start", valid_edge_filter)
    ends = await db.edges.distinct("properties.end", valid_edge_filter)
    connected_child_ids = set(starts + ends)

    cursor = db.nodes.find(
        {"properties.active": True},
        {
            "properties.child": 1,
            "_id": 0
        }
    )
    
    async for node in cursor:
        children = node["properties"]["child"]
        for child in children:
            child_id = child["id"]
            if child_id in connected_child_ids:
                coordinates = child["coordinates"]
                node_map[child_id] = (coordinates[0], coordinates[1])
    return node_map

async def get_graph(penalty: float, node_map: dict) -> dict:
    valid_child_ids = set(node_map.keys())
    graph = {}
    for child_id in valid_child_ids:
        graph[child_id] = []
    
    cursor_edges = db.edges.find(
        {},
        {
            "properties.id": 1,
            "properties.start": 1,
            "properties.end": 1,
            "properties.length": 1,
            "properties.line": 1,
            "properties.active": 1,
            "_id": 0
        }
    )

    async for edge in cursor_edges:
        properties = edge["properties"]
        start = properties["start"]
        end = properties["end"]
        edge_id = properties["id"]
        line = properties["line"]

        if (start in valid_child_ids) and (end in valid_child_ids):
            if (line != "transfer") and (properties["active"] == False):
                continue
            if line == "transfer":
                weight = penalty
            else:
                weight = properties["length"]
            graph[start].append((end, weight, edge_id, line))
            graph[end].append((start, weight, edge_id, line))
    return graph

async def get_nearest_node(longitude: float, latitude: float, node_map: dict) -> dict:
    valid_child_ids = list(node_map.keys())
    node = await db.nodes.find_one(
        {
            "properties.child.id": {"$in": valid_child_ids},
            "geometry": {
                "$nearSphere": {
                    "$geometry": {
                        "type": "Point",
                        "coordinates": [longitude, latitude]
                    }
                }
            }
        },
        {
            "geometry.coordinates": 1,
            "properties.child.id": 1,
            "_id": 0
        }
    )
    set_valid_child_ids = set(valid_child_ids)
    child = []
    for item in node["properties"]["child"]:
        child_id = item["id"]
        if child_id in set_valid_child_ids:
            child.append(child_id)

    return {
        "coordinates": node["geometry"]["coordinates"],
        "child": child
    }

def heuristic(start_id: int, target_lon: float, target_lat: float, node_map: dict) -> float:
    lon1, lat1 = node_map[start_id]
    phi1, phi2 = math.radians(lat1), math.radians(target_lat)
    dphi = phi2 - phi1
    dlambda = math.radians(target_lon - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * (math.sin(dlambda/2)**2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return 6371000 * c

async def a_star(start_lon: float, start_lat: float, end_lon: float, end_lat: float, node_map: dict, graph: dict) -> Path | None:
    start_data = await get_nearest_node(start_lon, start_lat, node_map)
    end_data = await get_nearest_node(end_lon, end_lat, node_map)

    start_children = start_data["child"]
    end_children = set(end_data["child"])
    
    target_lon, target_lat = end_data["coordinates"]

    fringe = []
    g_score = {}
    came_from = {}
    inf = math.inf

    for start_node in start_children:
        g_score[start_node] = 0
        came_from[start_node] = None
        h = heuristic(start_node, target_lon, target_lat, node_map)
        heapq.heappush(fringe, (h, 0, start_node))

    while fringe:
        _, current_g, current_node = heapq.heappop(fringe)

        if current_node in end_children:
            path = []
            segments = []
            total_length = 0
            total_transfer = 0
            
            curr = current_node
            while came_from[curr] is not None:
                path.append(curr)
                prev_node, weight, edge_id, line = came_from[curr]
                segments.append(edge_id)
                
                if line == "transfer":
                    total_transfer += 1
                else:
                    total_length += weight
                curr = prev_node
                
            path.append(curr)
            path.reverse()
            segments.reverse()
            return Path(path=path, segments=segments, length=total_length, transfer=total_transfer)

        if current_g > g_score.get(current_node, inf):
            continue

        for neighbor, weight, edge_id, line in graph[current_node]:
            tentative_g_score = current_g + weight
            if tentative_g_score < g_score.get(neighbor, inf):
                g_score[neighbor] = tentative_g_score
                f_score = tentative_g_score + heuristic(neighbor, target_lon, target_lat, node_map)
                came_from[neighbor] = (current_node, weight, edge_id, line)
                heapq.heappush(fringe, (f_score, tentative_g_score, neighbor))
    return None