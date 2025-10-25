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

-- Create place_images table for gallery support
CREATE TABLE IF NOT EXISTS place_images (
    id SERIAL PRIMARY KEY,
    place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster queries by place_id
CREATE INDEX IF NOT EXISTS idx_place_images_place_id ON place_images(place_id);

-- Index for ordering
CREATE INDEX IF NOT EXISTS idx_place_images_order ON place_images(place_id, display_order);

-- Add social media columns to places table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='places' AND column_name='facebook_url'
    ) THEN
        ALTER TABLE places ADD COLUMN facebook_url TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='places' AND column_name='instagram_url'
    ) THEN
        ALTER TABLE places ADD COLUMN instagram_url TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='places' AND column_name='website_url'
    ) THEN
        ALTER TABLE places ADD COLUMN website_url TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='places' AND column_name='phone'
    ) THEN
        ALTER TABLE places ADD COLUMN phone VARCHAR(20);
    END IF;
END $$;
