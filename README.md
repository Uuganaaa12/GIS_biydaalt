# 🗺️ Улаанбаатар хотын жуулчны газрын зураг систем

Docker дээр ажиллуулах ба Backend нь Flask + PostGIS, Frontend нь Leaflet.js ашиглан газрын зураг дүрсэлдэг.

---

## 🚀 Ажиллуулах заавар

### Local хөгжүүлэлт (Docker)

1. **Clone хийх:**

```bash
git clone https://github.com/Uuganaaa12/GIS_biydaalt.git
cd GIS_biydaalt
```

2. **Backend эхлүүлэх:**

```bash
cd backend
docker-compose up --build
```

3. **Frontend эхлүүлэх:**

```bash
cd ../frontend
docker-compose up --build
```

4. **Хандах:**

- Frontend: http://localhost:8080
- Backend: http://localhost:5001
- pgAdmin: http://localhost:5050 (admin@example.com / admin)

### Production (Cloud Database)

**Алхам 1: Cloud Database үүсгэх**

**Supabase ашиглах (Санал болгох):**

1. https://supabase.com руу орж бүртгүүлэх
2. "New Project" үүсгэх
3. SQL Editor дээр PostGIS өргөтгөл нээх:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

4. Connection string авах (Settings → Database)

**Алхам 2: Backend тохируулах**

1. `.env` файл үүсгэх:

```bash
cd backend
cp .env.example .env
```

2. `.env` файлд бичих:

```env
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres
ADMIN_SECRET=your_secret_password
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

3. Database үүсгэх:

```bash
# Local Docker-ээс production database рүү импорт
docker exec -i postgis psql -U postgres -d ubmap < backup.sql
# эсвэл
psql "postgresql://..." < backup.sql
```

**Алхам 3: Deploy хийх**

**Railway.app ашиглах:**

1. https://railway.app руу орж GitHub холбох
2. "New Project" → "Deploy from GitHub repo"
3. Environment Variables нэмэх (.env дотрох утгууд)
4. Автоматаар deploy хийгдэнэ

**Render.com ашиглах:**

1. https://render.com руу орж бүртгүүлэх
2. "New Web Service" → GitHub repo холбох
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `gunicorn app.main:app`
5. Environment Variables нэмэх

---

## 📊 Database бүтэц

### places хүснэгт

```sql
CREATE TABLE places (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    place_type VARCHAR(50),
    description TEXT,
    image_url TEXT,
    geom GEOMETRY(Point, 4326)
);
```

### Backup/Restore

**Backup үүсгэх:**

```bash
docker exec postgis pg_dump -U postgres -d ubmap > backup.sql
git add backup.sql
git commit -m "Update database backup"
git push
```

**Restore хийх:**

```bash
docker exec -i postgis psql -U postgres -d ubmap < backup.sql
```

---

- **HTML, CSS, JavaScript**
- **Leaflet.js** – газрын зураг дүрслэх
- **Nginx** – статик вэб сервер
- **Fetch API** – backend REST API-тай холбогдох

### Backend

- **Python + Flask** – RESTful API
- **SQLAlchemy + GeoAlchemy2** – өгөгдлийн холбоос
- **PostgreSQL + PostGIS** – гео өгөгдөл хадгалах
- **Flask-CORS** – CORS холболт

### Орчин

- **Docker & Docker Compose** – орчны тусгаарлал
- **OSM / GeoJSON** – газрын мэдээлэл

---

## Төслийн бүтэц

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

## Үндсэн боломжууд

- **Газрын зураг** – Улаанбаатар хотын зураг дээр үзэх газар, буудал, ресторан харуулах
- **Хайлт ба ангилал** – Газрын төрлөөр шүүх (жишээ нь: "photo spot", "restaurant")
- **Замчлал** – Хоёр цэгийн хооронд маршрутын тооцоо
- **PostGIS** – Гео өгөгдлийг SQL түвшинд боловсруулалт хийх

---

docker compose -f /Users/uugnaa/Downloads/2025-3A/GIS/biydaalt/backend/docker-compose.yml up -d pgadmin

NAMES PORTS
pgadmin 0.0.0.0:5050->5050/tcp, [::]:5050->5050/tcp
backend 0.0.0.0:5001->5001/tcp, [::]:5001->5001/tcp
osrm  
postgis 0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp
tourist_frontend 0.0.0.0:8080->80/tcp, [::]:8080->80/tcp

frontend: localhost:8080 password: admin
backend: localhost:5001  
pgadmin: localhost:5050 email: admin@example.com password: admin
database: port: 5432 password: postgres

Хэрэв та volume доторх real өгөгдлийг дамжуулахыг хүсвэл:

docker exec -t postgis pg_dump -U postgres ubmap > backup.sql

→ дараа нь backup.sql файлаа GitHub-д commit хийнэ.
Шинэ орчинд ажиллуулахдаа:

docker exec -i postgis psql -U postgres -d ubmap < backup.sql
