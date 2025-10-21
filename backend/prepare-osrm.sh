#!/bin/bash
# OSRM өгөгдөл бэлтгэх скрипт
# Жишээ: Монголын OSM өгөгдлийг ашиглах

set -e

REGION="mongolia-latest"
DATA_DIR="./osrm-data"

mkdir -p $DATA_DIR

echo "1. OSM өгөгдлийг татаж байна..."
if [ ! -f "$DATA_DIR/${REGION}.osm.pbf" ]; then
  wget -O "$DATA_DIR/${REGION}.osm.pbf" \
    "https://download.geofabrik.de/asia/mongolia-latest.osm.pbf"
else
  echo "   Өгөгдөл аль хэдийн татагдсан байна."
fi

echo "2. OSRM өгөгдөл боловсруулж байна (энэ нь хэдэн минут үргэлжилнэ)..."
docker run --rm -t -v "${PWD}/${DATA_DIR}:/data" \
  ghcr.io/project-osrm/osrm-backend:latest \
  osrm-extract -p /opt/car.lua /data/${REGION}.osm.pbf

echo "3. OSRM өгөгдөл партицчилж байна..."
docker run --rm -t -v "${PWD}/${DATA_DIR}:/data" \
  ghcr.io/project-osrm/osrm-backend:latest \
  osrm-partition /data/${REGION}.osrm

echo "4. OSRM индекс бүтээж байна..."
docker run --rm -t -v "${PWD}/${DATA_DIR}:/data" \
  ghcr.io/project-osrm/osrm-backend:latest \
  osrm-customize /data/${REGION}.osrm

echo "✅ OSRM өгөгдөл бэлэн боллоо! Одоо backend/docker-compose.yml-ийг ашиглан осруулна уу."
