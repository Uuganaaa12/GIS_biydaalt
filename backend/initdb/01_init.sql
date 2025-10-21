-- Enable PostGIS (should already be enabled in postgis image) and prepare schema
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create table if not exists (mirrors SQLAlchemy model)
CREATE TABLE IF NOT EXISTS places (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    place_type VARCHAR(50),
    description TEXT,
    geom geometry(POINT, 4326)
);

-- Spatial index for faster bbox queries
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_places_geom'
    ) THEN
        CREATE INDEX idx_places_geom ON places USING GIST (geom);
    END IF;
END $$;

-- Seed a few sample places in central Ulaanbaatar (approx coords, WGS84 lon/lat)
INSERT INTO places (name, place_type, description, geom) VALUES
('Sukhbaatar Square', 'photo_spot', 'Central square of Ulaanbaatar', ST_SetSRID(ST_MakePoint(106.9176, 47.9205), 4326)),
('Gandantegchinlen Monastery', 'photo_spot', 'Famous Buddhist monastery', ST_SetSRID(ST_MakePoint(106.8953, 47.9211), 4326)),
('State Department Store', 'shopping', 'Historic department store', ST_SetSRID(ST_MakePoint(106.9189, 47.9187), 4326)),
('The Blue Sky Hotel', 'hotel', 'Luxury hotel in city center', ST_SetSRID(ST_MakePoint(106.9283, 47.9189), 4326)),
('Modern Nomads', 'restaurant', 'Popular Mongolian cuisine restaurant', ST_SetSRID(ST_MakePoint(106.9198, 47.9155), 4326)),
ON CONFLICT DO NOTHING;
