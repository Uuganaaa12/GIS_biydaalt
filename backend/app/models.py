from flask_sqlalchemy import SQLAlchemy
from geoalchemy2 import Geometry

db = SQLAlchemy()

class Place(db.Model):
    __tablename__ = "places"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    place_type = db.Column(db.String(50))
    description = db.Column(db.Text, nullable=True)
    image_url = db.Column(db.Text, nullable=True)
    geom = db.Column(Geometry(geometry_type='POINT', srid=4326))
