import heapq, math
from app.core.database import db
from app.schemas.path import Path

async def get_node_map() -> dict:
    node_map = {}
    starts = await db.edges.distinct("properties.start")
    ends = await db.edges.distinct("properties.end")
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

async def get_graph(penalty: float) -> dict:
    graph = {}
    active_child_ids = set(await db.nodes.distinct("properties.child.id", {"properties.active": True}))
    
    cursor_edges = db.edges.find(
        {},
        {
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
        line = properties["line"]

        if (start in active_child_ids) and (end in active_child_ids):
            if (line != "transfer") and (properties["active"] == False):
                continue

            if line == "transfer":
                weight = penalty
            else:
                weight = properties["length"]

            if start not in graph:
                graph[start] = []
            graph[start].append((end, weight))

            if end not in graph:
                graph[end] = []
            graph[end].append((start, weight))
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

async def a_star(start_lon: float, start_lat: float, end_lon: float, end_lat: float, node_map: dict, graph: dict) -> list[int] | None:
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
            while current_node is not None:
                path.append(current_node)
                current_node = came_from[current_node]
            path.reverse()
            return path

        if current_g > g_score.get(current_node, inf):
            continue

        for neighbor, weight in graph[current_node]:
            tentative_g_score = current_g + weight
            if tentative_g_score < g_score.get(neighbor, inf):
                g_score[neighbor] = tentative_g_score
                f_score = tentative_g_score + heuristic(neighbor, target_lon, target_lat, node_map)
                came_from[neighbor] = current_node
                heapq.heappush(fringe, (f_score, tentative_g_score, neighbor))
    return None

async def path_output(path: list[int]) -> Path:
    if len(path) == 1:
        return Path(path=path, segments=[], length=0, transfer=0)

    conditions = []
    for i in range(len(path) - 1):
        u = path[i]
        v = path[i + 1]
        conditions.append({"properties.start": u, "properties.end": v})
        conditions.append({"properties.start": v, "properties.end": u})

    edges = await db.edges.find(
        {"$or": conditions},
        {"properties": 1, "_id": 0}
    ).to_list()

    lookup = {}
    for edge in edges:
        properties = edge["properties"]
        lookup[(properties["start"], properties["end"])] = properties
        lookup[(properties["end"], properties["start"])] = properties

    edge_ids = []
    total_length = 0
    total_transfer = 0

    for i in range(len(path) - 1):
        u = path[i]
        v = path[i + 1]
        
        edge_info = lookup[(u,v)]
    
        edge_ids.append(edge_info.get("id"))
        if edge_info["line"] == "transfer":
            total_transfer += 1
        else:
            total_length += edge_info["length"]

    return Path(
        path=path,
        segments=edge_ids,
        length=total_length,
        transfer=total_transfer
    )
