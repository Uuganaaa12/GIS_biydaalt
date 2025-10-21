import os
from flask import Blueprint, jsonify, request


admin_bp = Blueprint("admin", __name__)


@admin_bp.route("/admin_check", methods=["POST"])  # simple header-based secret check
def admin_check():
    secret = request.headers.get("X-Admin-Secret")
    expected = os.getenv("ADMIN_SECRET")
    if expected and secret == expected:
        return jsonify({"ok": True})
    return jsonify({"ok": False}), 401
