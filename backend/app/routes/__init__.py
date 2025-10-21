from .core import core_bp
from .places import places_bp
from .admin import admin_bp
from .routing import routing_bp


def register_blueprints(app):
    """Register all blueprints without changing existing URL paths."""
    app.register_blueprint(core_bp)
    app.register_blueprint(places_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(routing_bp)
