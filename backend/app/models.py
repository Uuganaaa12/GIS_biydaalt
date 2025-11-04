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
    facebook_url = db.Column(db.Text, nullable=True)
    instagram_url = db.Column(db.Text, nullable=True)
    website_url = db.Column(db.Text, nullable=True)
    phone = db.Column(db.String(20), nullable=True)
    geom = db.Column(Geometry(geometry_type='POINT', srid=4326))
    
    images = db.relationship('PlaceImage', backref='place', lazy=True, cascade='all, delete-orphan', order_by='PlaceImage.display_order')

class PlaceImage(db.Model):
    __tablename__ = "place_images"
    id = db.Column(db.Integer, primary_key=True)
    place_id = db.Column(db.Integer, db.ForeignKey('places.id', ondelete='CASCADE'), nullable=False)
    image_url = db.Column(db.Text, nullable=False)
    display_order = db.Column(db.Integer, default=0)
    uploaded_at = db.Column(db.DateTime, server_default=db.func.current_timestamp())

