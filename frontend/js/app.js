const API = 'http://127.0.0.1:8000';
let map, nodesData = [], edgesData = [], stationMarkers = {}, edgeLayers = {}, pathLayer = null, startMarker = null, endMarker = null;
let selectedStart = null, selectedEnd = null, selectingPoint = null, allLineNames = new Set(), sidebarOpen = true;
let edgeStatusFilter = 'all', stationStatusFilter = 'all', edgeLineFilter = 'all';
let highlightedLine = null, highlightedEdge = null;
let flatEdgesCache = null, flatStationsCache = null;
const METRO = {
    '1': { color: '#FFCD00', name: 'Line 1' }, '2': { color: '#003CA6', name: 'Line 2' }, '3': { color: '#837902', name: 'Line 3' },
    '3bis': { color: '#6EC4E8', name: 'Line 3bis' }, '4': { color: '#CF009E', name: 'Line 4' }, '5': { color: '#FF7E2E', name: 'Line 5' },
    '6': { color: '#6ECA97', name: 'Line 6' }, '7': { color: '#FA9ABA', name: 'Line 7' }, '7bis': { color: '#6ECA97', name: 'Line 7bis' },
    '8': { color: '#E19BDF', name: 'Line 8' }, '9': { color: '#B6BD00', name: 'Line 9' }, '10': { color: '#C9910D', name: 'Line 10' },
    '11': { color: '#704B1C', name: 'Line 11' }, '12': { color: '#007852', name: 'Line 12' }, '13': { color: '#6EC4E8', name: 'Line 13' },
    '14': { color: '#62259D', name: 'Line 14' }
};
function initMap() {
    map = L.map('map', { center: [48.8566, 2.3522], zoom: 13, zoomControl: false, doubleClickZoom: false, preferCanvas: true });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attribution">CARTO</a>',
        subdomains: 'abcd', maxZoom: 19
    }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    map.on('click', onMapClick);
}
async function fetchNodes() { return (await (await fetch(`${API}/nodes/`)).json()).features || []; }
async function fetchEdges() { return (await (await fetch(`${API}/edges/`)).json()).features || []; }
async function fetchPath(a, b, c, d, p) { return await (await fetch(`${API}/path/?lon1=${a}&lat1=${b}&lon2=${c}&lat2=${d}&penalty=${p}`)).json(); }
async function toggleNodeActive(id, v) { await fetch(`${API}/nodes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) }); }
async function toggleEdgeActive(id, v) { await fetch(`${API}/edges/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) }); }
async function toggleLineActive(l, v) { await fetch(`${API}/lines/${l}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) }); }
function getNodeName(id) { const n = nodesData.find(n => n.properties.id === id); return n ? n.properties.name : `#${id}`; }
function renderEdges(edges) {
    if (Object.keys(edgeLayers).length > 0) {
        Object.values(edgeLayers).flat().forEach(e => { if (map.hasLayer(e.layer)) map.removeLayer(e.layer); });
    }
    edgeLayers = {};
    flatEdgesCache = null;
    L.geoJSON(edges, {
        style: (f) => ({
            color: f.properties.color || '#888',
            weight: f.properties.active ? 8 : 4,
            opacity: f.properties.active ? 0.85 : 0.25,
            lineJoin: 'round', lineCap: 'round'
        }),
        onEachFeature: (f, layer) => {
            const p = f.properties;
            allLineNames.add(p.line);
            layer.on('mouseover', function () { if (!pathLayer && !selectingPoint) this.setStyle({ weight: p.active ? 12 : 7 }); });
            layer.on('mouseout', function () { if (!pathLayer && !selectingPoint) this.setStyle({ weight: p.active ? 8 : 4 }); });
            layer.on('click', function (e) {
                L.DomEvent.stopPropagation(e);
                if (selectingPoint) {
                    selectAsCoordinate(selectingPoint, e.latlng.lng, e.latlng.lat);
                } else {
                    L.popup().setLatLng(e.latlng).setContent(createEdgePopup(p)).openOn(map);
                }
            });
            if (!edgeLayers[p.line]) edgeLayers[p.line] = [];
            edgeLayers[p.line].push({ layer, props: p });
        }
    });
    updateMapVisibility();
}
function renderNodes(nodes) {
    Object.values(stationMarkers).forEach(m => { if (map.hasLayer(m.marker)) map.removeLayer(m.marker); });
    stationMarkers = {};
    flatStationsCache = null;
    L.geoJSON(nodes, {
        pointToLayer: (f, latlng) => {
            const p = f.properties;
            return L.circleMarker(latlng, {
                radius: 6, fillColor: p.active ? '#ffffff' : '#94a3b8', color: p.active ? '#0d6efd' : '#cbd5e1',
                weight: 2.2, fillOpacity: 1, opacity: p.active ? 1 : 0.4
            });
        },
        onEachFeature: (f, layer) => {
            const p = f.properties;
            const c = f.geometry.coordinates;
            layer.on('mouseover', function () { 
                this.setRadius(9); 
                if (selectingPoint) this.openPopup();
            });
            layer.on('mouseout', function () { 
                this.setRadius(6); 
                if (selectingPoint) this.closePopup();
            });
            layer.bindPopup(createNodePopup(p));
            layer.on('click', e => { L.DomEvent.stopPropagation(e); onStationClick(p, c); });
            stationMarkers[p.id] = { marker: layer, props: p, coords: c };
        }
    });
    updateMapVisibility();
}
function createNodePopup(p) {
    return `<div class="p-3"><div class="font-semibold text-base mb-0.5">${p.name}</div><div class="text-sm text-slate-400 mb-2">${p.active ? '<span class="text-emerald-500">Active</span>' : '<span class="text-red-400">Inactive</span>'}</div></div>`;
}
function createEdgePopup(p) {
    const li = METRO[p.line] || { name: `Line ${p.line}` };
    return `<div class="p-3"><div class="flex items-center gap-2 mb-1"><span class="w-3 h-3 rounded-full inline-block" style="background:${p.color}"></span><span class="font-semibold text-base">${li.name}</span><span class="text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-md ml-auto">#${p.id}</span></div><div class="text-sm text-slate-400">${getNodeName(p.start)} ↔ ${getNodeName(p.end)}</div><div class="text-sm text-slate-400">Length: ${p.length.toFixed(0)}m • ${p.active ? '<span class="text-emerald-500">Active</span>' : '<span class="text-red-400">Inactive</span>'}</div></div>`;
}
function createPathEdgePopup(p, sId, eId) {
    const li = METRO[p.line] || { name: `Line ${p.line}` };
    const sid = sId || p.start, eid = eId || p.end;
    return `<div class="p-3"><div class="flex items-center gap-2 mb-1"><span class="w-3 h-3 rounded-full inline-block" style="background:${p.color}"></span><span class="font-semibold text-base">${li.name}</span><span class="text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-md ml-auto">#${p.id}</span></div><div class="text-sm text-slate-400">${getNodeName(sid)} → ${getNodeName(eid)}</div><div class="text-sm text-slate-400">Length: ${parseFloat(p.length).toFixed(0)}m</div></div>`;
}
function createPathNodePopup(p) {
    return `<div class="p-3"><div class="font-semibold text-base mb-0.5">${p.name}</div></div>`;
}
function onStationClick(p, c) { if (selectingPoint) selectAsPoint(selectingPoint, p.id); }
function selectAsPoint(type, id) {
    const s = stationMarkers[id]; if (!s) return;
    const { props: p, coords: c } = s;
    if (type === 'start') {
        selectedStart = { id: p.id, name: p.name, lon: c[0], lat: c[1] };
        document.getElementById('input-start').value = p.name;
        if (startMarker) map.removeLayer(startMarker);
        startMarker = L.marker([c[1], c[0]], { icon: makeIcon('emerald') }).addTo(map);
        startMarker.bindPopup(createPathNodePopup(p), { closeButton: false });
    } else {
        selectedEnd = { id: p.id, name: p.name, lon: c[0], lat: c[1] };
        document.getElementById('input-end').value = p.name;
        if (endMarker) map.removeLayer(endMarker);
        endMarker = L.marker([c[1], c[0]], { icon: makeIcon('rose') }).addTo(map);
        endMarker.bindPopup(createPathNodePopup(p), { closeButton: false });
    }
    map.closePopup(); updateBtn();
}
function makeIcon(color) {
    const bg = color === 'emerald' ? '#10b981' : '#f43f5e', sh = color === 'emerald' ? 'rgba(16,185,129,0.4)' : 'rgba(244,63,94,0.4)';
    return L.divIcon({ className: '', html: `<div style="width:22px;height:22px;border-radius:50%;background:${bg};border:3px solid white;box-shadow:0 2px 10px ${sh};transform:translate(-50%,-50%)"></div>`, iconSize: [0, 0] });
}
function onMapClick(e) {
    if (selectingPoint) selectAsCoordinate(selectingPoint, e.latlng.lng, e.latlng.lat);
}
function selectAsCoordinate(type, lon, lat) {
    const name = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    const popupHtml = `<div class="p-3"><div class="font-semibold text-base mb-0.5">${name}</div></div>`;
    if (type === 'start') {
        selectedStart = { id: null, name: name, lon: lon, lat: lat };
        document.getElementById('input-start').value = name;
        if (startMarker) map.removeLayer(startMarker);
        startMarker = L.marker([lat, lon], { icon: makeIcon('emerald') }).addTo(map);
        startMarker.bindPopup(popupHtml);
    } else {
        selectedEnd = { id: null, name: name, lon: lon, lat: lat };
        document.getElementById('input-end').value = name;
        if (endMarker) map.removeLayer(endMarker);
        endMarker = L.marker([lat, lon], { icon: makeIcon('rose') }).addTo(map);
        endMarker.bindPopup(popupHtml);
    }
    map.closePopup(); updateBtn();
}
function setSelectingPoint(type) {
    selectingPoint = type;
    document.getElementById('btn-cancel-select').classList.remove('hidden');
    showToast(type);
}
function cancelSelection() {
    selectingPoint = null;
    document.getElementById('btn-cancel-select').classList.add('hidden');
    document.activeElement?.blur();
    const t = document.getElementById('map-click-toast');
    t.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
    t.classList.remove('opacity-100', 'translate-y-0');
    if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
    if (endMarker) { map.removeLayer(endMarker); endMarker = null; }
    selectedStart = null; selectedEnd = null;
    document.getElementById('input-start').value = '';
    document.getElementById('input-end').value = '';
    updateBtn();
}
async function findPath() {
    if (!selectedStart || !selectedEnd) return;
    document.getElementById('btn-cancel-select').classList.add('hidden');
    selectingPoint = null;
    const btn = document.getElementById('btn-find-path');
    btn.disabled = true; btn.innerHTML = '<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Searching...';
    try {
        const data = await fetchPath(selectedStart.lon, selectedStart.lat, selectedEnd.lon, selectedEnd.lat, parseInt(document.getElementById('penalty-slider').value));
        if (data.message === "Path not found") {
            alert('Path not found!');
            document.getElementById('btn-cancel-select').classList.remove('hidden');
            return;
        }
        displayPath(data);
    } catch (e) {
        console.error(e);
        alert('Error finding path.');
        document.getElementById('btn-cancel-select').classList.remove('hidden');
    }
    finally { btn.disabled = false; btn.innerHTML = '<i data-lucide="search" class="w-4 h-4"></i>Find'; lucide.createIcons(); updateBtn(); }
}
function displayPath(data) {
    if (pathLayer) map.removeLayer(pathLayer);
    pathLayer = L.layerGroup().addTo(map);
    const geoLayer = L.geoJSON(data, {
        style: (f) => {
            if (f.geometry.type === 'LineString') {
                return { color: f.properties.color, weight: 10, opacity: 1, lineCap: 'round', lineJoin: 'round' };
            }
        },
        pointToLayer: (f, latlng) => {
            if (f.geometry.type === 'Point') {
                return L.circleMarker(latlng, { radius: 7, fillColor: '#fff', color: '#3b82f6', weight: 3, fillOpacity: 1 });
            }
        },
        onEachFeature: (f, layer) => {
            if (f.geometry.type === 'LineString') {
                const glow = L.polyline(layer.getLatLngs(), { color: f.properties.color, weight: 16, opacity: 0.2 }).addTo(pathLayer);
                let sId = f.properties.start, eId = f.properties.end;
                const pathSteps = data.properties.path;
                for (let i = 1; i < pathSteps.length; i++) {
                    const u = pathSteps[i - 1][0], v = pathSteps[i][0];
                    if ((f.properties.start === u && f.properties.end === v) || (f.properties.start === v && f.properties.end === u)) {
                        sId = u; eId = v; break;
                    }
                }
                layer.bindPopup(createPathEdgePopup(f.properties, sId, eId));
                layer.on('mouseover', function () { this.setStyle({ weight: 14 }); });
                layer.on('mouseout', function () { this.setStyle({ weight: 10 }); });
                layer.addTo(pathLayer);
            } else if (f.geometry.type === 'Point') {
                layer.on('mouseover', function () { this.setRadius(10); });
                layer.on('mouseout', function () { this.setRadius(7); });
                layer.bindPopup(createPathNodePopup(f.properties));
                layer.addTo(pathLayer);
            }
        }
    });
    const edges = data.features.filter(f => f.geometry.type === 'LineString');
    const nodes = data.features.filter(f => f.geometry.type === 'Point');
    const { total_transfers, length: len } = data.properties;
    if (edges.length) {
        const ac = edges.flatMap(e => e.geometry.coordinates.map(c => [c[1], c[0]]));
        map.fitBounds(L.latLngBounds(ac).pad(0.1), { animate: true, duration: 0.25 });
    }
    document.getElementById('path-length').textContent = len >= 1000 ? `${(len / 1000).toFixed(2)} km` : `${len.toFixed(0)} m`;
    document.getElementById('path-transfers').textContent = total_transfers;
    document.getElementById('transfer-label').textContent = total_transfers === 1 ? 'Transfer' : 'Transfers';
    buildSteps(data.properties.path, nodes, edges);
    document.getElementById('path-inputs-area').classList.add('hidden');
    document.getElementById('path-results').classList.remove('hidden');
    document.getElementById('btn-clear-path').classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.id !== 'tab-pathfinding') {
            btn.classList.add('opacity-40', 'cursor-not-allowed');
            btn.style.pointerEvents = 'none';
        }
    });
    updateMapVisibility();
}
function zoomToPath() {
    if (!pathLayer) return;
    const layers = pathLayer.getLayers();
    if (layers.length === 0) return;
    const bounds = L.latLngBounds([]);
    layers.forEach(layer => {
        if (layer.getBounds) bounds.extend(layer.getBounds());
        else if (layer.getLatLng) bounds.extend(layer.getLatLng());
    });
    if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.1), { animate: true, duration: 0.5 });
    }
}
function buildSteps(path, nodes, edges) {
    const box = document.getElementById('path-steps'); box.innerHTML = '';
    const nm = {}; nodes.forEach(n => { nm[n.properties.id] = n; });
    const lineColors = {}; edges.forEach(e => { lineColors[e.properties.line] = e.properties.color; });
    if (!path || path.length < 2) return;
    const startNode = nm[path[0][0]];
    const startLine = path[1][1];
    const startColor = lineColors[startLine] || (METRO[startLine]?.color || '#888');
    if (startNode) box.innerHTML += stepHTML(startNode.properties.id, startNode.properties.name, startLine, startColor, 'start');
    let currentLine = startLine;
    for (let i = 1; i < path.length; i++) {
        const nodeId = path[i][0];
        const lineId = path[i][1];
        const color = lineColors[lineId] || (METRO[lineId]?.color || '#888');
        if (lineId !== currentLine && lineId !== "") {
            const transferNodeId = path[i - 1][0];
            const transferNode = nm[transferNodeId];
            if (transferNode) box.innerHTML += stepHTML(transferNode.properties.id, transferNode.properties.name, lineId, color, 'transfer');
            currentLine = lineId;
        }
        if (i === path.length - 1) {
            const endNode = nm[nodeId];
            if (endNode) {
                const finalColor = lineColors[currentLine] || (METRO[currentLine]?.color || '#888');
                box.innerHTML += stepHTML(endNode.properties.id, endNode.properties.name, currentLine, finalColor, 'end');
            }
        }
    }
    lucide.createIcons();
}
function stepHTML(id, name, line, color, type) {
    const li = METRO[line] || { name: `Line ${line}` };
    const ic = { start: 'circle-dot', transfer: 'arrow-left-right', end: 'map-pin' };
    const lb = { start: 'Start', transfer: 'Transfer', end: 'End' };
    const bg = { start: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100', transfer: 'bg-amber-50 border-amber-200 hover:bg-amber-100', end: 'bg-rose-50 border-rose-200 hover:bg-rose-100' };
    return `<div onclick="viewStation(${id}, 0.25)" class="flex items-start gap-3 p-3 rounded-lg border ${bg[type]} mb-2 cursor-pointer transition-all active:scale-[0.98] group">
        <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style="background:${color}20;border:1px solid ${color}50">
            <i data-lucide="${ic[type]}" class="w-3.5 h-3.5" style="color:${color}"></i>
        </div>
        <div class="flex-1 min-w-0">
            <div class="text-xs text-slate-400 font-medium">${lb[type]}</div>
            <div class="font-semibold text-base text-slate-800 truncate group-hover:text-blue-700">${name}</div>
            <div class="flex items-center gap-1 mt-0.5">
                <span class="w-2 h-2 rounded-full" style="background:${color}"></span>
                <span class="text-xs text-slate-400">${li.name}</span>
            </div>
        </div>
    </div>`;
}
function clearPath() {
    if (pathLayer) { map.removeLayer(pathLayer); pathLayer = null; }
    if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
    if (endMarker) { map.removeLayer(endMarker); endMarker = null; }
    selectedStart = null; selectedEnd = null;
    cancelSelection();
    document.getElementById('input-start').value = ''; document.getElementById('input-end').value = '';
    document.getElementById('path-inputs-area').classList.remove('hidden');
    document.getElementById('path-results').classList.add('hidden'); document.getElementById('btn-clear-path').classList.add('hidden');
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('opacity-40', 'cursor-not-allowed');
        btn.style.pointerEvents = 'auto';
    });
    updateBtn();
    updateMapVisibility();
}
function handleStationSearch(input, type) {
    const q = input.value.toLowerCase().trim(), dd = document.getElementById(`suggestions-${type}`);
    if (q.length === 0) {
        if (type === 'start') { selectedStart = null; if (startMarker) { map.removeLayer(startMarker); startMarker = null; } }
        else { selectedEnd = null; if (endMarker) { map.removeLayer(endMarker); endMarker = null; } }
        updateBtn();
    }
    if (q.length < 1) { dd.classList.add('hidden'); return; }
    const m = nodesData.filter(n => n.properties.active && n.properties.name.toLowerCase().includes(q)).slice(0, 8);
    if (!m.length) { dd.classList.add('hidden'); return; }
    dd.innerHTML = m.map(n => `<div class="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm text-slate-600 hover:text-blue-700 border-b border-slate-100 last:border-0" onclick="selectSuggestion('${type}',${n.properties.id})">${hlMatch(n.properties.name, q)}</div>`).join('');
    dd.classList.remove('hidden');
}
function hlMatch(n, q) { const i = n.toLowerCase().indexOf(q); return i < 0 ? n : n.substring(0, i) + '<span class="text-blue-600 font-semibold">' + n.substring(i, i + q.length) + '</span>' + n.substring(i + q.length); }
function selectSuggestion(t, id) { selectAsPoint(t, id); document.getElementById(`suggestions-${t}`).classList.add('hidden'); }
function showSuggestions(t) { const i = document.getElementById(`input-${t}`); if (i.value.length > 0) handleStationSearch(i, t); }
function swapStations() {
    [selectedStart, selectedEnd] = [selectedEnd, selectedStart];
    document.getElementById('input-start').value = selectedStart ? selectedStart.name : '';
    document.getElementById('input-end').value = selectedEnd ? selectedEnd.name : '';
    if (startMarker) map.removeLayer(startMarker); if (endMarker) map.removeLayer(endMarker);
    if (selectedStart) {
        startMarker = L.marker([selectedStart.lat, selectedStart.lon], { icon: makeIcon('emerald') }).addTo(map);
        if (selectedStart.id) {
            const p = stationMarkers[selectedStart.id]?.props;
            if (p) startMarker.bindPopup(createPathNodePopup(p), { closeButton: false });
        } else {
            startMarker.bindPopup(`<div class="p-3"><div class="font-semibold text-base mb-0.5">${selectedStart.name}</div></div>`);
        }
    } else { startMarker = null; }
    if (selectedEnd) {
        endMarker = L.marker([selectedEnd.lat, selectedEnd.lon], { icon: makeIcon('rose') }).addTo(map);
        if (selectedEnd.id) {
            const p = stationMarkers[selectedEnd.id]?.props;
            if (p) endMarker.bindPopup(createPathNodePopup(p), { closeButton: false });
        } else {
            endMarker.bindPopup(`<div class="p-3"><div class="font-semibold text-base mb-0.5">${selectedEnd.name}</div></div>`);
        }
    } else { endMarker = null; }
    updateBtn();
}
function renderLinesList() {
    const c = document.getElementById('lines-list');
    const sorted = Array.from(allLineNames).sort((a, b) => (parseFloat(a) || 999) - (parseFloat(b) || 999) || a.localeCompare(b));
    c.innerHTML = sorted.map(l => {
        const info = METRO[l] || { color: '#888', name: `Line ${l}` };
        const le = edgeLayers[l] || [];
        const active = le.length > 0 && le[0].props.active;
        return `<div class="flex items-center gap-3 p-3 bg-slate-50 hover:bg-blue-50 rounded-xl border border-slate-200 transition-all cursor-pointer" onclick="viewLine('${l}')">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0" style="background:${info.color};color:${contrastColor(info.color)}">${l}</div>
            <div class="flex-1 min-w-0"><div class="font-medium text-base text-slate-700">${info.name}</div><div class="text-xs text-slate-400">${le.length} segments</div></div>
            <div class="toggle-switch ${active ? 'active' : 'inactive'}" onclick="event.stopPropagation(); handleToggleLine('${l}',this)"></div>
        </div>`;
    }).join('');
}
async function handleToggleLine(l, el) {
    el.classList.toggle('active'); el.classList.toggle('inactive');
    const isActive = el.classList.contains('active');
    try {
        await toggleLineActive(l, isActive);
        edgesData = await fetchEdges();
        renderEdges(edgesData);
        renderLinesList();
        renderEdgesList();
        viewLine(l, 0.25);
    }
    catch (e) { el.classList.toggle('active'); el.classList.toggle('inactive'); }
}
function populateLineFilter() {
    const sel = document.getElementById('edge-line-filter');
    const sorted = Array.from(allLineNames).sort((a, b) => (parseFloat(a) || 999) - (parseFloat(b) || 999) || a.localeCompare(b));
    sel.innerHTML = '<option value="all">All lines</option>' + sorted.map(l => {
        const info = METRO[l] || { name: `Line ${l}` };
        return `<option value="${l}">${info.name}</option>`;
    }).join('');
}
function renderEdgesList() {
    const c = document.getElementById('edges-list');
    const lineF = document.getElementById('edge-line-filter').value;
    const idQ = (document.getElementById('edge-search-id')?.value || '').trim();
    let filtered = [...edgesData];
    if (lineF !== 'all') filtered = filtered.filter(e => e.properties.line === lineF);
    if (idQ) filtered = filtered.filter(e => e.properties.id.toString() === idQ);
    if (edgeStatusFilter === 'active') filtered = filtered.filter(e => e.properties.active);
    else if (edgeStatusFilter === 'inactive') filtered = filtered.filter(e => !e.properties.active);
    filtered.sort((a, b) => a.properties.id - b.properties.id);
    document.getElementById('edge-count').textContent = `${filtered.length} / ${edgesData.length} segments`;
    if (!filtered.length) { c.innerHTML = '<div class="text-center text-sm text-slate-400 py-8">No segments found</div>'; return; }
    c.innerHTML = filtered.map(e => {
        const p = e.properties;
        const info = METRO[p.line] || { color: '#888', name: `L${p.line}` };
        return `<div class="flex items-center gap-2.5 p-2.5 bg-slate-50 hover:bg-blue-50 rounded-lg border border-slate-200 transition-all group cursor-pointer" onclick="viewEdge(${p.id}, 0.25)">
            <div class="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0" style="background:${info.color};color:${contrastColor(info.color)}">${p.line}</div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                    <div class="text-sm font-medium text-slate-700 truncate">${getNodeName(p.start)} ↔ ${getNodeName(p.end)}</div>
                    <span class="text-xs font-bold font-mono bg-slate-200 text-slate-600 px-2 py-1 rounded-md ml-auto flex-shrink-0 border border-slate-300">#${p.id}</span>
                </div>
                <div class="text-xs text-slate-400">${p.length.toFixed(0)}m • ${p.active ? '<span class="text-emerald-500">Active</span>' : '<span class="text-rose-400">Inactive</span>'}</div>
            </div>
            <div class="toggle-switch ${p.active ? 'active' : 'inactive'}" style="transform:scale(0.8)" onclick="event.stopPropagation(); handleToggleEdge(${p.id},this)"></div>
        </div>`;
    }).join('');
}
function filterEdgeList() { renderEdgesList(); }
function setEdgeStatusFilter(v) {
    edgeStatusFilter = v;
    document.querySelectorAll('.edge-status-btn').forEach(b => {
        if (b.dataset.filter === v) { b.classList.add('bg-white', 'text-slate-900', 'shadow-sm'); b.classList.remove('text-slate-500'); }
        else { b.classList.remove('bg-white', 'text-slate-900', 'shadow-sm'); b.classList.add('text-slate-500'); }
    });
    renderEdgesList();
}
async function handleToggleEdge(id, el) {
    el.classList.toggle('active'); el.classList.toggle('inactive');
    const isActive = el.classList.contains('active');
    try {
        await toggleEdgeActive(id, isActive);
        edgesData = await fetchEdges();
        renderEdges(edgesData);
        renderEdgesList();
        viewEdge(id, 0);
    } catch (e) { el.classList.toggle('active'); el.classList.toggle('inactive'); }
}
function renderStationsList() {
    const c = document.getElementById('stations-list');
    const q = (document.getElementById('station-search')?.value || '').toLowerCase().trim();
    let sorted = [...nodesData].sort((a, b) => a.properties.name.localeCompare(b.properties.name));
    if (q) sorted = sorted.filter(n => n.properties.name.toLowerCase().includes(q));
    if (stationStatusFilter === 'active') sorted = sorted.filter(n => n.properties.active);
    else if (stationStatusFilter === 'inactive') sorted = sorted.filter(n => !n.properties.active);
    document.getElementById('station-count').textContent = `${sorted.length} / ${nodesData.length} stations`;
    if (!sorted.length) { c.innerHTML = '<div class="text-center text-sm text-slate-400 py-8">No stations found</div>'; return; }
    c.innerHTML = sorted.map(n => {
        const p = n.properties;
        return `<div class="station-item flex items-center gap-2.5 p-2 hover:bg-blue-50 rounded-lg transition-all cursor-pointer group" data-name="${p.name.toLowerCase()}" data-active="${p.active}" onclick="viewStation(${p.id}, 0.25)">
            <div class="w-2.5 h-2.5 rounded-full flex-shrink-0 ${p.active ? 'bg-emerald-500' : 'bg-slate-300'}"></div>
            <span class="text-base text-slate-600 group-hover:text-slate-800 flex-1 truncate">${p.name}</span>
            <div class="toggle-switch ${p.active ? 'active' : 'inactive'}" style="transform:scale(0.75)" onclick="event.stopPropagation();handleToggleStation(${p.id},this)"></div>
        </div>`;
    }).join('');
}
function filterStations() { renderStationsList(); }
function setStationStatusFilter(v) {
    stationStatusFilter = v;
    document.querySelectorAll('.station-status-btn').forEach(b => {
        if (b.dataset.filter === v) { b.classList.add('bg-white', 'text-slate-900', 'shadow-sm'); b.classList.remove('text-slate-500'); }
        else { b.classList.remove('bg-white', 'text-slate-900', 'shadow-sm'); b.classList.add('text-slate-500'); }
    });
    renderStationsList();
}
function viewStation(id, duration = 0.25) {
    const s = stationMarkers[id];
    if (s) {
        if (duration === 0) {
            map.setView([s.coords[1], s.coords[0]], 15, { animate: false });
        } else {
            map.setView([s.coords[1], s.coords[0]], 15, { animate: true, duration: duration });
        }
        highlightedLine = null;
        highlightedEdge = null;
        updateMapVisibility();
    }
}
function updateMapVisibility() {
    const isPathMode = pathLayer !== null;
    if (!flatEdgesCache) flatEdgesCache = Object.values(edgeLayers).flat();
    if (!flatStationsCache) flatStationsCache = Object.values(stationMarkers);
    flatEdgesCache.forEach(({ layer, props: p }) => {
        if (isPathMode) {
            if (map.hasLayer(layer)) map.removeLayer(layer);
        } else {
            let showEdge = true;
            if (highlightedLine !== null && p.line !== highlightedLine) showEdge = false;
            if (showEdge) {
                if (!map.hasLayer(layer)) layer.addTo(map);
                const opacity = p.active ? 0.85 : 0.25;
                const weight = p.active ? 8 : 4;
                if (layer.options.opacity !== opacity || layer.options.weight !== weight) {
                    layer.setStyle({ opacity, weight });
                }
            } else {
                if (map.hasLayer(layer)) map.removeLayer(layer);
            }
        }
    });
    const highlightedLineNodes = highlightedLine !== null ?
        new Set(edgesData.filter(e => e.properties.line === highlightedLine).flatMap(e => [e.properties.start, e.properties.end])) :
        null;
    flatStationsCache.forEach(s => {
        let showNode = !isPathMode;
        if (highlightedLine !== null) {
            showNode = highlightedLineNodes.has(s.props.id);
        }
        if (showNode) {
            if (!map.hasLayer(s.marker)) s.marker.addTo(map);
            s.marker.bringToFront();
        } else {
            if (map.hasLayer(s.marker)) map.removeLayer(s.marker);
        }
    });
}
function viewLine(l, duration = 0.25) {
    const le = edgeLayers[l];
    if (!le || !le.length) return;
    const bounds = L.latLngBounds(le.flatMap(e => e.layer.getLatLngs()));
    map.fitBounds(bounds, { animate: true, duration: duration, padding: [20, 20] });
    highlightedLine = l; updateMapVisibility();
}
function viewEdge(id, duration = 0.25) {
    const edge = edgesData.find(e => e.properties.id === id);
    if (!edge) return;
    const coords = edge.geometry.coordinates.map(c => [c[1], c[0]]);
    if (duration === 0) {
        map.fitBounds(L.latLngBounds(coords), { animate: false, maxZoom: 16, padding: [20, 20] });
    } else {
        map.fitBounds(L.latLngBounds(coords), { animate: true, duration: duration, maxZoom: 16, padding: [20, 20] });
    }
    highlightedLine = null; updateMapVisibility();
}
async function handleToggleStation(id, el) {
    el.classList.toggle('active'); el.classList.toggle('inactive');
    const isActive = el.classList.contains('active');
    try {
        await toggleNodeActive(id, isActive);
        nodesData = await fetchNodes();
        renderNodes(nodesData);
        renderStationsList();
        viewStation(id, 0);
    }
    catch (e) { el.classList.toggle('active'); el.classList.toggle('inactive'); }
}
function switchTab(t) {
    if (pathLayer !== null && t !== 'pathfinding') return;
    if (selectingPoint && t !== 'pathfinding') cancelSelection();
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('bg-white', 'text-blue-600', 'shadow-sm'); b.classList.add('text-slate-500'); });
    document.getElementById(`panel-${t}`).classList.remove('hidden');
    const btn = document.getElementById(`tab-${t}`); btn.classList.add('bg-white', 'text-blue-600', 'shadow-sm'); btn.classList.remove('text-slate-500');
    if (t === 'pathfinding' || t === 'edges' || t === 'stations') {
        highlightedLine = null;
        updateMapVisibility();
    }
    const esi = document.getElementById('edge-search-id'); if (esi) esi.value = '';
    const elf = document.getElementById('edge-line-filter'); if (elf) elf.value = 'all';
    const ssi = document.getElementById('station-search'); if (ssi) ssi.value = '';
    setEdgeStatusFilter('all');
    setStationStatusFilter('all');
}
function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    document.getElementById('sidebar').classList.toggle('collapsed');
    document.getElementById('sidebar-toggle').style.left = sidebarOpen ? '432px' : '12px';
    setTimeout(() => map.invalidateSize(), 350);
}
function updatePenaltyValue(v) { document.getElementById('penalty-value').textContent = `${v}m`; }
function updateBtn() { document.getElementById('btn-find-path').disabled = !(selectedStart && selectedEnd); }
function showToast(pt) {
    const t = document.getElementById('map-click-toast');
    document.getElementById('toast-point-type').textContent = pt === 'start' ? 'start' : 'end';
    t.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none'); t.classList.add('opacity-100', 'translate-y-0');
    setTimeout(() => { t.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none'); t.classList.remove('opacity-100', 'translate-y-0'); }, 2500);
}
function contrastColor(hex) { hex = hex.replace('#', ''); const r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16); return (r * 0.299 + g * 0.587 + b * 0.114) > 150 ? '#1e293b' : '#fff'; }
document.addEventListener('click', e => {
    if (!e.target.closest('#input-start') && !e.target.closest('#suggestions-start')) document.getElementById('suggestions-start')?.classList.add('hidden');
    if (!e.target.closest('#input-end') && !e.target.closest('#suggestions-end')) document.getElementById('suggestions-end')?.classList.add('hidden');
});
async function initApp() {
    initMap();
    try {
        [nodesData, edgesData] = await Promise.all([fetchNodes(), fetchEdges()]);
        renderEdges(edgesData); renderNodes(nodesData);
        renderLinesList(); populateLineFilter(); renderEdgesList(); renderStationsList();
    } catch (e) { console.error(e); alert('Could not connect to server: ' + API); }
    const ov = document.getElementById('loading-overlay'); ov.style.opacity = '0'; setTimeout(() => ov.remove(), 300);
    lucide.createIcons();
}
document.addEventListener('DOMContentLoaded', initApp);