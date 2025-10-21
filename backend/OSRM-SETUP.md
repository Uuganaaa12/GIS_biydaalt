# 1. osrm-data хавтас үүсгэх
mkdir -p /Users/uugnaa/Downloads/2025-3A/GIS/biydaalt/backend/osrm-data

# 2. Файлыг хуулах
cp ~/Downloads/mongolia-latest.osm.pbf /Users/uugnaa/Downloads/2025-3A/GIS/biydaalt/backend/osrm-data/

# 3. Дараах 3 боловсруулалтын алхмуудыг ажиллуулна:

cd /Users/uugnaa/Downloads/2025-3A/GIS/biydaalt/backend

# Алхам 1: Extract (5-10 минут)
docker run --rm -v "${PWD}/osrm-data:/data" \
  ghcr.io/project-osrm/osrm-backend:latest \
  osrm-extract -p /opt/car.lua /data/mongolia.osm.pbf

# Алхам 2: Partition (2-5 минут)
docker run --rm -v "${PWD}/osrm-data:/data" \
  ghcr.io/project-osrm/osrm-backend:latest \
  osrm-partition /data/mongolia.osrm

# Алхам 3: Customize (1-2 минут)
docker run --rm -v "${PWD}/osrm-data:/data" \
  ghcr.io/project-osrm/osrm-backend:latest \
  osrm-customize /data/mongolia.osrm

# 4. OSRM контейнерийг асаах
docker compose up -d osrm

# 5. Тест хийх
curl "http://localhost:5001/route/v1/car/106.9176,47.9205;106.8953,47.9211?overview=full"