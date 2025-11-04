import os
from flask import Blueprint, jsonify, request
from sqlalchemy import func
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import shape, mapping
from werkzeug.utils import secure_filename
from ..models import db, Place, PlaceImage
import cloudinary
import cloudinary.uploader



places_bp = Blueprint("places", __name__)


@places_bp.route("/import_geojson", methods=["POST"])
def import_geojson():
    data = request.get_json()
    features = data.get("features", [])

    for f in features:
        geom = from_shape(shape(f["geometry"]), srid=4326)
        place = Place(
            name=f["properties"].get("name"),
            place_type=f["properties"].get("type"),
            description=f["properties"].get("description"),
            geom=geom,
        )
        db.session.add(place)
    db.session.commit()

    return jsonify({"status": "success", "count": len(features)})


@places_bp.route("/places", methods=["POST"])  
def create_place():
    try:
        secret = request.headers.get("X-Admin-Secret")
        expected = os.getenv("ADMIN_SECRET")
        if not expected or secret != expected:
            return jsonify({"error": "unauthorized"}), 401

        # Accept both JSON and multipart/form-data
        name = None
        place_type = None
        description = None
        lon = None
        lat = None
        image_url = None
        facebook_url = None
        instagram_url = None
        website_url = None
        phone = None

        if request.content_type and request.content_type.startswith("application/json"):
            data = request.get_json() or {}
            name = data.get("name")
            place_type = data.get("place_type") or data.get("type")
            description = data.get("description")
            lon = data.get("lon")
            lat = data.get("lat")
            image_url = data.get("image_url")
            facebook_url = data.get("facebook_url")
            instagram_url = data.get("instagram_url")
            website_url = data.get("website_url")
            phone = data.get("phone")
        else:
            form = request.form
            name = form.get("name")
            place_type = form.get("place_type") or form.get("type")
            description = form.get("description")
            lon = form.get("lon")
            lat = form.get("lat")
            facebook_url = form.get("facebook_url")
            instagram_url = form.get("instagram_url")
            website_url = form.get("website_url")
            phone = form.get("phone")
            file = request.files.get("image")
            # Upload image to Cloudinary if present
            if file and file.filename:
                filename = secure_filename(file.filename)
                # Configure cloudinary
                cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME")
                api_key = os.getenv("CLOUDINARY_API_KEY")
                api_secret = os.getenv("CLOUDINARY_API_SECRET")
                folder = os.getenv("CLOUDINARY_FOLDER", "ubmap")
                if cloud_name and api_key and api_secret:
                    cloudinary.config(cloud_name=cloud_name, api_key=api_key, api_secret=api_secret)
                    try:
                        upload_res = cloudinary.uploader.upload(file, folder=folder, resource_type="image")
                        image_url = upload_res.get("secure_url") or upload_res.get("url")
                    except Exception as e:
                        return jsonify({"error": f"image upload failed: {e}"}), 400

        # Validate
        if not name or not place_type or lon is None or lat is None:
            return jsonify({"error": "name, place_type, lon, lat are required"}), 400
        try:
            lon = float(lon)
            lat = float(lat)
        except Exception:
            return jsonify({"error": "invalid lon/lat"}), 400

        geom = from_shape(shape({"type": "Point", "coordinates": [lon, lat]}), srid=4326)
        place = Place(
            name=name,
            place_type=place_type,
            description=description,
            image_url=image_url,
            facebook_url=facebook_url,
            instagram_url=instagram_url,
            website_url=website_url,
            phone=phone,
            geom=geom
        )
        db.session.add(place)
        db.session.commit()

        # Return created feature
        return jsonify({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "id": place.id,
                "name": place.name,
                "type": place.place_type,
                "description": place.description,
                "image_url": place.image_url,
                "facebook_url": place.facebook_url,
                "instagram_url": place.instagram_url,
                "website_url": place.website_url,
                "phone": place.phone,
            },
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 400


@places_bp.route("/places")
def get_places():
    # Optional filters: type or types (CSV), bbox (minx,miny,maxx,maxy in lon,lat), and q (search by name/description)
    place_type = request.args.get("type")
    types_csv = request.args.get("types")
    bbox_param = request.args.get("bbox")
    q_text = request.args.get("q")

    # Return from DB
    q = Place.query
    if types_csv:
        try:
            types_list = [t.strip() for t in types_csv.split(",") if t.strip()]
            if types_list:
                q = q.filter(Place.place_type.in_(types_list))
        except Exception:
            pass
    elif place_type:
        q = q.filter(Place.place_type == place_type)
    if bbox_param:
        try:
            minx, miny, maxx, maxy = map(float, bbox_param.split(","))
            envelope = func.ST_MakeEnvelope(minx, miny, maxx, maxy, 4326)
            q = q.filter(func.ST_Intersects(Place.geom, envelope))
        except Exception:
            pass
    if q_text:
        try:
            like = f"%{q_text.strip()}%"
            # ILIKE for case-insensitive match (works on PostgreSQL)
            q = q.filter(
                (Place.name.ilike(like)) | (Place.description.ilike(like))
            )
        except Exception:
            pass

    places = q.all()
    features = []
    for p in places:
        geom = to_shape(p.geom)
        # Get gallery images
        gallery_images = [{"id": img.id, "url": img.image_url, "order": img.display_order} 
                         for img in p.images] if hasattr(p, 'images') else []
        
        features.append({
            "type": "Feature",
            "geometry": mapping(geom),
            "properties": {
                "id": p.id,
                "name": p.name,
                "type": p.place_type,
                "description": p.description,
                "image_url": getattr(p, 'image_url', None),
                "gallery": gallery_images,  # Gallery images array
                "facebook_url": getattr(p, 'facebook_url', None),
                "instagram_url": getattr(p, 'instagram_url', None),
                "website_url": getattr(p, 'website_url', None),
                "phone": getattr(p, 'phone', None),
            },
        })
    return jsonify({"type": "FeatureCollection", "features": features})


@places_bp.route("/categories")
def categories():
    rows = db.session.query(Place.place_type).distinct().all()
    cats = [r[0] for r in rows if r[0] is not None]
    return jsonify(sorted(cats))


@places_bp.route("/places/<int:place_id>", methods=["GET"])
def get_place(place_id: int):
    p = Place.query.get(place_id)
    if not p:
        return jsonify({"error": "not found"}), 404
    geom = to_shape(p.geom)
    
    # Get gallery images
    gallery_images = [{"id": img.id, "url": img.image_url, "order": img.display_order} 
                     for img in p.images] if hasattr(p, 'images') else []
    
    return jsonify({
        "type": "Feature",
        "geometry": mapping(geom),
        "properties": {
            "id": p.id,
            "name": p.name,
            "type": p.place_type,
            "description": p.description,
            "image_url": getattr(p, 'image_url', None),
            "gallery": gallery_images,  # Gallery images array
            "facebook_url": getattr(p, 'facebook_url', None),
            "instagram_url": getattr(p, 'instagram_url', None),
            "website_url": getattr(p, 'website_url', None),
            "phone": getattr(p, 'phone', None),
        },
    })


@places_bp.route("/places/<int:place_id>", methods=["PUT", "PATCH"])
def update_place(place_id: int):
    try:
        secret = request.headers.get("X-Admin-Secret")
        expected = os.getenv("ADMIN_SECRET")
        if not expected or secret != expected:
            return jsonify({"error": "unauthorized"}), 401

        place = Place.query.get(place_id)
        if not place:
            return jsonify({"error": "not found"}), 404

        name = None
        place_type = None
        description = None
        lon = None
        lat = None
        image_url = None
        facebook_url = None
        instagram_url = None
        website_url = None
        phone = None
        replace_image = False

        if request.content_type and request.content_type.startswith("application/json"):
            data = request.get_json() or {}
            name = data.get("name")
            place_type = data.get("place_type") or data.get("type")
            description = data.get("description")
            lon = data.get("lon")
            lat = data.get("lat")
            image_url = data.get("image_url")
            facebook_url = data.get("facebook_url")
            instagram_url = data.get("instagram_url")
            website_url = data.get("website_url")
            phone = data.get("phone")
            replace_image = image_url is not None
        else:
            form = request.form
            name = form.get("name")
            place_type = form.get("place_type") or form.get("type")
            description = form.get("description")
            lon = form.get("lon")
            lat = form.get("lat")
            facebook_url = form.get("facebook_url")
            instagram_url = form.get("instagram_url")
            website_url = form.get("website_url")
            phone = form.get("phone")
            file = request.files.get("image")
            if file and file.filename:
                # Configure cloudinary
                cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME")
                api_key = os.getenv("CLOUDINARY_API_KEY")
                api_secret = os.getenv("CLOUDINARY_API_SECRET")
                folder = os.getenv("CLOUDINARY_FOLDER", "ubmap")
                if cloud_name and api_key and api_secret:
                    cloudinary.config(cloud_name=cloud_name, api_key=api_key, api_secret=api_secret)
                    try:
                        upload_res = cloudinary.uploader.upload(file, folder=folder, resource_type="image")
                        image_url = upload_res.get("secure_url") or upload_res.get("url")
                        replace_image = True
                    except Exception as e:
                        return jsonify({"error": f"image upload failed: {e}"}), 400

        if name is not None:
            place.name = name
        if place_type is not None:
            place.place_type = place_type
        if description is not None:
            place.description = description
        if replace_image:
            place.image_url = image_url
        if facebook_url is not None:
            place.facebook_url = facebook_url
        if instagram_url is not None:
            place.instagram_url = instagram_url
        if website_url is not None:
            place.website_url = website_url
        if phone is not None:
            place.phone = phone
        if lon is not None and lat is not None:
            try:
                flon = float(lon)
                flat = float(lat)
            except Exception:
                return jsonify({"error": "invalid lon/lat"}), 400
            geom = from_shape(shape({"type": "Point", "coordinates": [flon, flat]}), srid=4326)
            place.geom = geom

        db.session.commit()

        # Return updated feature
        geom_shp = to_shape(place.geom)
        return jsonify({
            "type": "Feature",
            "geometry": mapping(geom_shp),
            "properties": {
                "id": place.id,
                "name": place.name,
                "type": place.place_type,
                "description": place.description,
                "image_url": getattr(place, 'image_url', None),
            },
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 400


@places_bp.route("/places/<int:place_id>/images", methods=["POST"])
def upload_place_images(place_id: int):
    """Upload multiple images to a place's gallery"""
    try:
        secret = request.headers.get("X-Admin-Secret")
        expected = os.getenv("ADMIN_SECRET")
        if not expected or secret != expected:
            return jsonify({"error": "unauthorized"}), 401

        place = Place.query.get(place_id)
        if not place:
            return jsonify({"error": "place not found"}), 404

        # Get all uploaded files
        files = request.files.getlist("images")
        if not files:
            return jsonify({"error": "no images provided"}), 400

        # Configure cloudinary
        cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME")
        api_key = os.getenv("CLOUDINARY_API_KEY")
        api_secret = os.getenv("CLOUDINARY_API_SECRET")
        folder = os.getenv("CLOUDINARY_FOLDER", "ubmap")
        
        if not (cloud_name and api_key and api_secret):
            return jsonify({"error": "cloudinary not configured"}), 500
        
        cloudinary.config(cloud_name=cloud_name, api_key=api_key, api_secret=api_secret)

        uploaded_images = []
        # Get current max display_order
        max_order = db.session.query(func.max(PlaceImage.display_order)).filter_by(place_id=place_id).scalar() or 0

        for idx, file in enumerate(files):
            if file and file.filename:
                try:
                    filename = secure_filename(file.filename)
                    upload_res = cloudinary.uploader.upload(file, folder=folder, resource_type="image")
                    image_url = upload_res.get("secure_url") or upload_res.get("url")
                    
                    # Create PlaceImage record
                    place_image = PlaceImage(
                        place_id=place_id,
                        image_url=image_url,
                        display_order=max_order + idx + 1
                    )
                    db.session.add(place_image)
                    uploaded_images.append({
                        "image_url": image_url,
                        "display_order": max_order + idx + 1
                    })
                except Exception as e:
                    print(f"Failed to upload {filename}: {e}")
                    continue

        db.session.commit()
        return jsonify({
            "status": "success",
            "place_id": place_id,
            "uploaded_count": len(uploaded_images),
            "images": uploaded_images
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 400


@places_bp.route("/places/<int:place_id>/images/<int:image_id>", methods=["DELETE"])
def delete_place_image(place_id: int, image_id: int):
    """Delete a specific image from place's gallery"""
    try:
        secret = request.headers.get("X-Admin-Secret")
        expected = os.getenv("ADMIN_SECRET")
        if not expected or secret != expected:
            return jsonify({"error": "unauthorized"}), 401

        image = PlaceImage.query.filter_by(id=image_id, place_id=place_id).first()
        if not image:
            return jsonify({"error": "image not found"}), 404

        db.session.delete(image)
        db.session.commit()
        return jsonify({"status": "deleted", "image_id": image_id})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 400


@places_bp.route("/places/<int:place_id>", methods=["DELETE"])
def delete_place(place_id: int):
    try:
        secret = request.headers.get("X-Admin-Secret")
        expected = os.getenv("ADMIN_SECRET")
        if not expected or secret != expected:
            return jsonify({"error": "unauthorized"}), 401

        place = Place.query.get(place_id)
        if not place:
            return jsonify({"error": "not found"}), 404

        db.session.delete(place)
        db.session.commit()
        return jsonify({"status": "deleted", "id": place_id})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 400
