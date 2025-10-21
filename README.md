# 🗺️ Улаанбаатар хотын жуулчны газрын зураг систем

 Docker дээр ажиллуулах ба Backend нь Flask + PostGIS, Frontend нь Leaflet.js ашиглан газрын зураг дүрсэлдэг.


Энэ нь PostGIS (PostgreSQL + PostGIS) ба Flask backend-ийг асаана. `backend/initdb/01_init.sql` файл автоматаар ачаалж, жишээ цэгүүдийг суулгаж өгнө.

- Backend URL: http://localhost:5001
  - Ажиллаж байгаа эсэх: GET `/api/health`
  - Цэгүүд: GET `/places?type=<category>&bbox=minx,miny,maxx,maxy`
  - Ангиллууд: GET `/categories`
  - Замчлал (шугам): GET `/route?start=lon,lat&end=lon,lat`

- Frontend URL: http://localhost:8080

## API тайлбар

- GET `/api/health` — DB холболт OK эсэх
- POST `/import_geojson` — GeoJSON FeatureCollection-аас `places` рүү импорт хийдэг. properties: name, type, description
- GET `/places` — GeoJSON FeatureCollection буцаана. Параметрүүд:
  - `type` (заавал биш) — ангилал шүүх
  - `bbox=minx,miny,maxx,maxy` (заавал биш) — харагдаж буй extent доторх цэгүүд
- GET `/categories` — Давтагдашгүй ангиллуудын жагсаалт
- GET `/route?start=lon,lat&end=lon,lat` — Хоёр цэгийн хооронд шулуун шугамын маршрут (OSRM холболтгүй үед түр арга). `distance_m` метрт буцаана.

## Хөгжүүлэлтийн тэмдэглэл

- Мэдээллийн сангийн холбоосыг `DATABASE_URL` орчноос уншдаг. Docker Compose нь `postgresql://postgres:postgres@db:5432/ubmap` утгыг өгдөг.
- `geoalchemy2` болон `shapely` ашиглаж GeoJSON хувиргалт хийсэн.
- Илүү нарийн routing хэрэгтэй бол OSRM эсвэл Valhalla контейнер нэмэх боломжтой.

## Түгээмэл асуудал

- M1/M2 Mac дээр PostGIS image `platform: linux/amd64` заасан — шаардлагатай бол устгаж ARM-д тааруулж болно.
- Хэрэв DB эхлэхгүй бол `pgdata` volume-ийг цэвэрлэж дахин асаана.



#  Улаанбаатар хотын жуулчны газрын зураг систем

**Төслийн зорилго:**  
Жуулчдад зориулсан Улаанбаатар хотын газрын зурагт суурилсан вэб систем бүтээх.  
Хэрэглэгчдэд зураг авах тохиромжтой газар, томоохон ресторан, буудлуудыг харуулж, эдгээр рүү очих **замчлал (routing)** болон **байршлын мэдээлэл** үзүүлнэ.

---

##  Ашигласан технологиуд

###  Frontend

- **HTML, CSS, JavaScript**
- **Leaflet.js** – газрын зураг дүрслэх
- **Nginx** – статик вэб сервер
- **Fetch API** – backend REST API-тай холбогдох

###  Backend

- **Python + Flask** – RESTful API
- **SQLAlchemy + GeoAlchemy2** – өгөгдлийн холбоос
- **PostgreSQL + PostGIS** – гео өгөгдөл хадгалах
- **Flask-CORS** – CORS холболт

###  Орчин

- **Docker & Docker Compose** – орчны тусгаарлал
- **OSM / GeoJSON** – газрын мэдээлэл

---

##  Төслийн бүтэц

tourist-map-ub/
│
├── frontend/ # Вэб интерфейс
│ ├── index.html
│ ├── script.js
│ ├── style.css
│ ├── Dockerfile
│ └── docker-compose.yml
│
├── backend/ # Flask API ба өгөгдлийн сан
│ ├── app/
│ │ ├── init.py
│ │ ├── routes.py
│ │ ├── models.py
│ │ └── database.py
│ ├── Dockerfile
│ ├── docker-compose.yml
│ └── requirements.txt
│
└── data/ # OSM / GeoJSON өгөгдөл
├── ulaanbaatar.osm
└── places.geojson

##  Үндсэн боломжууд

- **Газрын зураг** – Улаанбаатар хотын зураг дээр үзэх газар, буудал, ресторан харуулах
- **Хайлт ба ангилал** – Газрын төрлөөр шүүх (жишээ нь: "photo spot", "restaurant")
- **Замчлал** – Хоёр цэгийн хооронд маршрутын тооцоо
- **PostGIS** – Гео өгөгдлийг SQL түвшинд боловсруулалт хийх

---



docker compose -f /Users/uugnaa/Downloads/2025-3A/GIS/biydaalt/backend/docker-compose.yml up -d pgadmin




NAMES              PORTS
pgadmin            0.0.0.0:5050->5050/tcp, [::]:5050->5050/tcp
backend            0.0.0.0:5001->5001/tcp, [::]:5001->5001/tcp
osrm               
postgis            0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp
tourist_frontend   0.0.0.0:8080->80/tcp, [::]:8080->80/tcp


frontend: localhost:8080    password: admin
backend: localhost:5001     
pgadmin: localhost:5050         email: admin@example.com       password: admin
database: port: 5432      password: postgres