from flask import Blueprint, jsonify
from ..models import db


core_bp = Blueprint("core", __name__)


@core_bp.route("/")
def home():
    return jsonify({"message": "UB Tourism Backend is running!"})


@core_bp.route("/api/health")
def health():
    try:
        db.session.execute(db.text("SELECT 1"))
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"status": "error", "detail": str(e)}), 500
