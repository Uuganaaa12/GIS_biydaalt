-- Enable PostGIS (should already be enabled in postgis image) and prepare schema
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create table if not exists (mirrors SQLAlchemy model)
CREATE TABLE IF NOT EXISTS places (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    place_type VARCHAR(50),
    description TEXT,
    image_url TEXT,
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



-- Make sure image_url exists for existing databases
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='places' AND column_name='image_url'
    ) THEN
        ALTER TABLE places ADD COLUMN IF NOT EXISTS image_url TEXT;
    END IF;
END $$;
