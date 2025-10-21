from flask import Blueprint, jsonify, request
from .models import db, Place
from sqlalchemy import func
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import shape, mapping, LineString
import math
import requests
import json

main_bp = Blueprint("main", __name__)

@main_bp.route("/")
def home():
    return jsonify({"message": "UB Tourism Backend is running!"})

@main_bp.route("/api/health")
def health():
    try:
        db.session.execute(db.text("SELECT 1"))
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"status": "error", "detail": str(e)}), 500

@main_bp.route("/import_geojson", methods=["POST"])
def import_geojson():
    data = request.get_json()
    features = data.get("features", [])

    for f in features:
        geom = from_shape(shape(f["geometry"]), srid=4326)
        place = Place(
            name=f["properties"].get("name"),
            place_type=f["properties"].get("type"),
            description=f["properties"].get("description"),
            geom=geom
        )
        db.session.add(place)
    db.session.commit()

    return jsonify({"status": "success", "count": len(features)})


@main_bp.route("/places")
def get_places():
    # Optional filters: type and bbox (minx,miny,maxx,maxy in lon,lat)
    place_type = request.args.get("type")
    bbox_param = request.args.get("bbox")

    # Return from DB
    q = Place.query
    if place_type:
        q = q.filter(Place.place_type == place_type)
    if bbox_param:
        try:
            minx, miny, maxx, maxy = map(float, bbox_param.split(","))
            envelope = func.ST_MakeEnvelope(minx, miny, maxx, maxy, 4326)
            q = q.filter(func.ST_Intersects(Place.geom, envelope))
        except Exception:
            pass

    places = q.all()
    features = []
    for p in places:
        geom = to_shape(p.geom)
        features.append({
            "type": "Feature",
            "geometry": mapping(geom),
            "properties": {
                "id": p.id,
                "name": p.name,
                "type": p.place_type,
                "description": p.description,
            }
        })
    return jsonify({"type": "FeatureCollection", "features": features})

@main_bp.route("/categories")
def categories():
    rows = db.session.query(Place.place_type).distinct().all()
    cats = [r[0] for r in rows if r[0] is not None]
    return jsonify(sorted(cats))

# Removed explicit bus_stop endpoint; routing no longer depends on bus stop inputs

def haversine(lon1, lat1, lon2, lat2):
    # returns meters
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dl/2)**2
    c = 2*math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R*c

@main_bp.route("/route")
def simple_route():
    try:
        start = request.args.get("start")  # "lon,lat"
        end = request.args.get("end")
        mode = request.args.get("mode", "car")  # car, foot, bicycle, bus
        
        if not start or not end:
            return jsonify({"error": "start and end are required as 'lon,lat'"}), 400

        slon, slat = map(float, start.split(","))
        elon, elat = map(float, end.split(","))

        # Try OSRM first
        # OSRM doesn't have a 'bus' profile by default; map it to 'car'
        osrm_profile = "car" if mode == "bus" else mode
        osrm_url = f"http://osrm:5002/route/v1/{osrm_profile}/{slon},{slat};{elon},{elat}?overview=full&geometries=geojson"
        try:
            resp = requests.get(osrm_url, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("code") == "Ok" and data.get("routes"):
                    route = data["routes"][0]
                    geom = route["geometry"]
                    distance_m = route["distance"]
                    duration_s = route["duration"]
                    
                    feature = {
                        "type": "Feature",
                        "geometry": geom,
                        "properties": {
                            "distance_m": round(distance_m, 1),
                            "duration_s": round(duration_s, 1),
                            "mode": mode
                        }
                    }
                    return jsonify({"type": "FeatureCollection", "features": [feature]})
        except Exception:
            pass  # fallback to straight line
        
        # Fallback: straight line
        line = LineString([(slon, slat), (elon, elat)])
        distance_m = haversine(slon, slat, elon, elat)

        feature = {
            "type": "Feature",
            "geometry": mapping(line),
            "properties": {
                "distance_m": round(distance_m, 1),
                "mode": "straight-line"
            }
        }
        return jsonify({"type": "FeatureCollection", "features": [feature]})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


def _osrm_route(profile: str, slon: float, slat: float, elon: float, elat: float):
    """Helper to call OSRM and return (geometry, distance_m, duration_s) or None on failure."""
    try:
        url = f"http://osrm:5002/route/v1/{profile}/{slon},{slat};{elon},{elat}?overview=full&geometries=geojson"
        r = requests.get(url, timeout=6)
        if r.status_code == 200:
            d = r.json()
            if d.get("code") == "Ok" and d.get("routes"):
                r0 = d["routes"][0]
                return r0["geometry"], r0["distance"], r0["duration"]
    except Exception:
        pass
    return None


@main_bp.route("/route_bus")
def route_bus():
    """
    Public-transport-like routing approximation using nearest bus stops in DB (places.place_type = 'bus_stop').
    Steps:
      - Walk from start to nearest bus stop
      - "Bus" from that stop to nearest stop to destination (using car OSRM as proxy)
      - Walk from stop to destination
    Returns GeoJSON FeatureCollection with up to 3 features and a summary of chosen stops.
    """
    try:
        start = request.args.get("start")  # "lon,lat"
        end = request.args.get("end")
        if not start or not end:
            return jsonify({"error": "start and end are required as 'lon,lat'"}), 400

        slon, slat = map(float, start.split(","))
        elon, elat = map(float, end.split(","))

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
            # No bus stops available; fall back to foot + car proxy in one shot
            res = _osrm_route("car", slon, slat, elon, elat)
            if res:
                geom, dist_m, dur_s = res
                return jsonify({
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
                })
            # final fallback straight-line
            line = LineString([(slon, slat), (elon, elat)])
            feature = {
                "type": "Feature",
                "geometry": mapping(line),
                "properties": {"mode": "straight-line"},
            }
            return jsonify({"type": "FeatureCollection", "features": [feature], "summary": {"bus_stops": []}})

        # Extract stop coords
        s_stop_geom = to_shape(start_stop.geom)
        e_stop_geom = to_shape(end_stop.geom)
        sst_lon, sst_lat = s_stop_geom.x, s_stop_geom.y
        est_lon, est_lat = e_stop_geom.x, e_stop_geom.y

        features = []
        summary = {
            "start_stop": {"id": start_stop.id, "name": start_stop.name},
            "end_stop": {"id": end_stop.id, "name": end_stop.name},
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
            # fallback straight line
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

        # Find bus stops along the bus leg (approximate: within 60m of route, ordered)
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
            rows = db.session.execute(sql, {"g": geojson_str, "tol": 60}).fetchall()
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