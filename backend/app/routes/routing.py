import json
import math
import os
from flask import Blueprint, jsonify, request
from sqlalchemy import func
from shapely.geometry import LineString, Point, mapping
from geoalchemy2.shape import from_shape, to_shape
import requests

from ..models import db, Place


routing_bp = Blueprint("routing", __name__)


def haversine(lon1, lat1, lon2, lat2):
    # returns meters
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dl / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def _osrm_base_for_profile(profile: str) -> str:
    """Return the base URL (host:port) of the OSRM instance for a given profile."""
    p = (profile or "car").lower()
    if p == "foot":
        return "http://osrm_foot:5003"
    return "http://osrm:5002"


def _osrm_route(profile: str, slon: float, slat: float, elon: float, elat: float):
    """Helper to call OSRM and return (geometry, distance_m, duration_s) or None on failure."""
    try:
        base = _osrm_base_for_profile(profile)
        url = f"{base}/route/v1/{profile}/{slon},{slat};{elon},{elat}?overview=full&geometries=geojson"
        r = requests.get(url, timeout=6)
        if r.status_code == 200:
            d = r.json()
            if d.get("code") == "Ok" and d.get("routes"):
                r0 = d["routes"][0]
                return r0["geometry"], r0["distance"], r0["duration"]
    except Exception:
        pass
    return None


@routing_bp.route("/route")
def simple_route():
    try:
        start = request.args.get("start")  # "lon,lat"
        end = request.args.get("end")
        mode = request.args.get("mode", "car")  # car, foot, bicycle, bus

        if not start or not end:
            return jsonify({"error": "start and end are required as 'lon,lat'"}), 400

        slon, slat = map(float, start.split(","))
        elon, elat = map(float, end.split(","))

        # Map 'bus' to 'car' since OSRM doesn't have a bus profile by default
        osrm_profile = "car" if mode == "bus" else (mode or "car")

        # Primary attempt with requested profile
        primary = _osrm_route(osrm_profile, slon, slat, elon, elat)
        if primary:
            geom, distance_m, duration_s = primary
            feature = {
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "distance_m": round(distance_m, 1),
                    "duration_s": round(duration_s, 1),
                    "mode": mode,
                },
            }
            return jsonify({"type": "FeatureCollection", "features": [feature]})

        # Graceful fallback: if walking profile is unavailable, try car routing instead
        if osrm_profile == "foot":
            alt = _osrm_route("car", slon, slat, elon, elat)
            if alt:
                geom, distance_m, duration_s = alt
                feature = {
                    "type": "Feature",
                    "geometry": geom,
                    "properties": {
                        "distance_m": round(distance_m, 1),
                        "duration_s": round(duration_s, 1),
                        "mode": "foot-fallback-car",
                        "note": "foot OSRM unavailable; used car routing as fallback",
                    },
                }
                return jsonify({"type": "FeatureCollection", "features": [feature]})

        # Fallback: straight line
        line = LineString([(slon, slat), (elon, elat)])
        distance_m = haversine(slon, slat, elon, elat)

        feature = {
            "type": "Feature",
            "geometry": mapping(line),
            "properties": {
                "distance_m": round(distance_m, 1),
                "mode": "straight-line",
            },
        }
        return jsonify({"type": "FeatureCollection", "features": [feature]})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# -----------------------------
# Overpass (OSM) bus stop import
# -----------------------------
OVERPASS_ENDPOINTS = [
    os.getenv("OVERPASS_URL"),
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
OVERPASS_ENDPOINTS = [e for e in OVERPASS_ENDPOINTS if e]


def _overpass_fetch_bus_stops(bbox: str | None = None, timeout: int = 25):
    """Fetch bus stop nodes from Overpass within bbox."""
    if not bbox:
        # south,west,north,east
        bbox = "47.84,106.76,47.99,107.20"

    q = f"""
    [out:json][timeout:{timeout}];
    (
      node["highway"="bus_stop"]({bbox});
      node["public_transport"="platform"]({bbox});
      node["public_transport"="stop_position"]({bbox});
      way["public_transport"="platform"]({bbox});
    );
    out body center;
    """
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            r = requests.post(endpoint, data={"data": q}, timeout=timeout + 5)
            if r.status_code >= 400:
                r = requests.get(endpoint, params={"data": q}, timeout=timeout + 5)
            r.raise_for_status()
            data = r.json()
            elements = data.get("elements", [])
            out = []
            for el in elements:
                t = el.get("type")
                tags = el.get("tags", {})
                name = tags.get("name") or tags.get("ref") or "Bus Stop"
                if t == "node":
                    lon = el.get("lon")
                    lat = el.get("lat")
                else:
                    c = el.get("center") or {}
                    lon = c.get("lon")
                    lat = c.get("lat")
                if lon is None or lat is None:
                    continue
                out.append({"name": name, "lon": float(lon), "lat": float(lat)})
            if out:
                return out
        except Exception:
            continue
    return []


def _insert_bus_stops_dedup(stops: list[dict], max_distance_m: float = 20.0) -> tuple[int, int]:
    """Insert bus stops with simple de-duplication by proximity+name."""
    ins, skip = 0, 0
    for st in stops:
        name = st.get("name") or "Bus Stop"
        lon = st.get("lon")
        lat = st.get("lat")
        if lon is None or lat is None:
            skip += 1
            continue

        point = func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326)
        cand = (
            db.session.query(Place)
            .filter(Place.place_type == "bus_stop")
            .order_by(func.ST_DistanceSphere(Place.geom, point))
            .first()
        )
        if cand is not None:
            try:
                dist = db.session.execute(
                    db.text("SELECT ST_DistanceSphere(:a, :b)"),
                    {"a": point, "b": cand.geom},
                ).scalar()
            except Exception:
                dist = None
            same_name = (cand.name or "").strip().lower() == name.strip().lower()
            if dist is not None and dist <= max_distance_m and same_name:
                skip += 1
                continue

        pt = Point(lon, lat)
        geom = from_shape(pt, srid=4326)
        db.session.add(Place(name=name, place_type="bus_stop", description=None, geom=geom))
        ins += 1

    if ins:
        db.session.commit()
    return ins, skip


@routing_bp.route("/import_bus_stops_overpass", methods=["POST", "GET"])  # optional bbox query param
def import_bus_stops_overpass():
    try:
        payload = {}
        try:
            payload = request.get_json(silent=True) or {}
        except Exception:
            payload = {}
        bbox = request.args.get("bbox") or payload.get("bbox")
        stops = _overpass_fetch_bus_stops(bbox=bbox)
        inserted, skipped = _insert_bus_stops_dedup(stops)
        return jsonify(
            {
                "status": "ok",
                "source": "overpass",
                "bbox": bbox,
                "inserted": inserted,
                "skipped": skipped,
                "total_fetched": len(stops),
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@routing_bp.route("/bus_stop_count")
def bus_stop_count():
    try:
        c = (
            db.session.query(func.count())
            .select_from(Place)
            .filter(Place.place_type == "bus_stop")
            .scalar()
        )
        return jsonify({"count": int(c)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@routing_bp.route("/route_bus")
def route_bus():
    try:
        start = request.args.get("start")  # "lon,lat"
        end = request.args.get("end")
        if not start or not end:
            return jsonify({"error": "start and end are required as 'lon,lat'"}), 400

        slon, slat = map(float, start.split(","))
        elon, elat = map(float, end.split(","))

        # Ensure we have bus stops; if none in DB, try to import automatically
        try:
            count = (
                db.session.query(func.count())
                .select_from(Place)
                .filter(Place.place_type == "bus_stop")
                .scalar()
            )
        except Exception:
            count = 0
        if not count or count == 0:
            fetched = _overpass_fetch_bus_stops()
            if fetched:
                _insert_bus_stops_dedup(fetched)

        # Find nearest bus stops
        point_start = func.ST_SetSRID(func.ST_MakePoint(slon, slat), 4326)
        point_end = func.ST_SetSRID(func.ST_MakePoint(elon, elat), 4326)

        start_stop = (
            db.session.query(Place)
            .filter(Place.place_type == "bus_stop")
            .order_by(func.ST_DistanceSphere(Place.geom, point_start))
            .first()
        )
        end_stop = (
            db.session.query(Place)
            .filter(Place.place_type == "bus_stop")
            .order_by(func.ST_DistanceSphere(Place.geom, point_end))
            .first()
        )

        if not start_stop or not end_stop:
            res = _osrm_route("car", slon, slat, elon, elat)
            if res:
                geom, dist_m, dur_s = res
                return jsonify(
                    {
                        "type": "FeatureCollection",
                        "features": [
                            {
                                "type": "Feature",
                                "geometry": geom,
                                "properties": {
                                    "mode": "bus-proxy",
                                    "distance_m": round(dist_m, 1),
                                    "duration_s": round(dur_s, 1),
                                },
                            }
                        ],
                        "summary": {
                            "message": "Bus stops not available in DB; showing approximated route",
                            "bus_stops": [],
                        },
                    }
                )
            line = LineString([(slon, slat), (elon, elat)])
            feature = {
                "type": "Feature",
                "geometry": mapping(line),
                "properties": {"mode": "straight-line"},
            }
            return jsonify({"type": "FeatureCollection", "features": [feature], "summary": {"bus_stops": []}})

        s_stop_geom = to_shape(start_stop.geom)
        e_stop_geom = to_shape(end_stop.geom)
        sst_lon, sst_lat = s_stop_geom.x, s_stop_geom.y
        est_lon, est_lat = e_stop_geom.x, e_stop_geom.y

        features = []
        summary = {
            "start_stop": {"id": start_stop.id, "name": start_stop.name, "coords": [sst_lon, sst_lat]},
            "end_stop": {"id": end_stop.id, "name": end_stop.name, "coords": [est_lon, est_lat]},
            "bus_stops": [
                {"id": start_stop.id, "name": start_stop.name},
                {"id": end_stop.id, "name": end_stop.name},
            ],
            "note": "Intermediate stops require route line data; currently showing nearest boarding and alighting stops only.",
        }

        # 1) Walk to start stop
        walk1 = _osrm_route("foot", slon, slat, sst_lon, sst_lat)
        if walk1:
            geom, dist_m, dur_s = walk1
        else:
            car_alt = _osrm_route("car", slon, slat, sst_lon, sst_lat)
            if car_alt:
                geom, dist_m, dur_s = car_alt
            else:
                line = LineString([(slon, slat), (sst_lon, sst_lat)])
                geom = mapping(line)
                dist_m = haversine(slon, slat, sst_lon, sst_lat)
                dur_s = None
        features.append(
            {
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "segment": "walk-to-stop",
                    "mode": "foot",
                    "distance_m": round(dist_m, 1) if dist_m is not None else None,
                    "duration_s": round(dur_s, 1) if isinstance(dur_s, (int, float)) else None,
                    "to_stop": start_stop.name,
                },
            }
        )

        # 2) Bus between stops (use car profile as proxy)
        bus_leg = _osrm_route("car", sst_lon, sst_lat, est_lon, est_lat)
        if bus_leg:
            geom, dist_m, dur_s = bus_leg
        else:
            line = LineString([(sst_lon, sst_lat), (est_lon, est_lat)])
            geom = mapping(line)
            dist_m = haversine(sst_lon, sst_lat, est_lon, est_lat)
            dur_s = None
        features.append(
            {
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "segment": "bus",
                    "mode": "bus",
                    "distance_m": round(dist_m, 1) if dist_m is not None else None,
                    "duration_s": round(dur_s, 1) if isinstance(dur_s, (int, float)) else None,
                    "from_stop": start_stop.name,
                    "to_stop": end_stop.name,
                },
            }
        )

        # Find bus stops along the bus leg (approximate: within 100m of route, ordered)
        try:
            geojson_str = json.dumps(geom)
            sql = db.text(
                """
                WITH route AS (
                    SELECT ST_SetSRID(ST_GeomFromGeoJSON(:g), 4326) AS g
                )
                SELECT p.id, p.name,
                       ST_X(ST_Transform(p.geom, 4326)) AS lon,
                       ST_Y(ST_Transform(p.geom, 4326)) AS lat,
                       ST_LineLocatePoint(r.g, p.geom) AS loc
                FROM places p, route r
                WHERE p.place_type = 'bus_stop'
                      AND ST_DWithin(p.geom::geography, r.g::geography, :tol)
                ORDER BY loc
                """
            )
            rows = db.session.execute(sql, {"g": geojson_str, "tol": 100}).fetchall()
            intermediate = [
                {"id": r[0], "name": r[1], "coords": [float(r[2]), float(r[3])]}
                for r in rows
            ]
            summary["intermediate_stops"] = intermediate
        except Exception:
            summary["intermediate_stops"] = []

        # 3) Walk from end stop to destination
        walk2 = _osrm_route("foot", est_lon, est_lat, elon, elat)
        if walk2:
            geom, dist_m, dur_s = walk2
        else:
            car_alt2 = _osrm_route("car", est_lon, est_lat, elon, elat)
            if car_alt2:
                geom, dist_m, dur_s = car_alt2
            else:
                line = LineString([(est_lon, est_lat), (elon, elat)])
                geom = mapping(line)
                dist_m = haversine(est_lon, est_lat, elon, elat)
                dur_s = None
        features.append(
            {
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "segment": "walk-from-stop",
                    "mode": "foot",
                    "distance_m": round(dist_m, 1) if dist_m is not None else None,
                    "duration_s": round(dur_s, 1) if isinstance(dur_s, (int, float)) else None,
                    "from_stop": end_stop.name,
                },
            }
        )

        return jsonify({"type": "FeatureCollection", "features": features, "summary": summary})
    except Exception as e:
        return jsonify({"error": str(e)}), 400
