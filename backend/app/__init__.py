import os
import time
from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from .models import db

def create_app():
    app = Flask(__name__)
    CORS(app)

    database_url = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@db:5432/ubmap')
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)

    # Wait for DB to be ready (simple retry loop)
    with app.app_context():
        attempts = 0
        while True:
            try:
                db.session.execute(db.text("SELECT 1"))
                break
            except Exception:
                attempts += 1
                if attempts > 20:
                    raise
                time.sleep(1)

        db.create_all()

        # Ensure new columns exist on existing DBs (simple, idempotent)
        try:
            db.session.execute(db.text("ALTER TABLE places ADD COLUMN IF NOT EXISTS image_url TEXT"))
            db.session.commit()
        except Exception:
            db.session.rollback()

    from .routes import main_bp
    app.register_blueprint(main_bp)

    return app
