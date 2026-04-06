# CryoMedics - Smart Cold Storage System

> Sistem monitoring smart cold storage untuk penyimpanan obat & vaksin medis berbasis **gRPC** dengan **Node.js**

## Deskripsi

CryoMedics adalah sistem monitoring kulkas medis yang menggunakan arsitektur gRPC untuk komunikasi real-time antara sensor, server, dan dashboard. Setiap kulkas dilengkapi sensor yang mengirim data suhu secara terus-menerus menggunakan **client-side streaming**. Selain itu, sistem telah dilengkapi dengan TUI (Text-based User Interface) interaktif untuk mempermudah monitoring log server dan manajemen client operator.

## Arsitektur

```text
┌──────────────────┐     Client-side Streaming       ┌──────────────────────┐
│   Sensor Client  ├─────────────────────────────────┤                      │
│  (Fridge Sensor) │     TelemetryReading (stream)   │                      │
└──────────────────┘                                 │                      │
                                                     │   gRPC Server        │
┌──────────────────┐     Unary RPCs                  │                      │
│  Admin Client    ├─────────────────────────────────┤   ├─ StorageService  │
│  (Laptop)        │     Register/Remove/Report      │   ├─ MonitoringServic│
└──────────────────┘                                 │   ├─ AlertService    │
                                                     │   └─ ReportService   │
┌──────────────────┐     Server-side Streaming       │                      │
│  Dashboard       ├─────────────────────────────────┤                      │
│  (Tablet)        │     WatchAlerts (stream)        │                      │
└──────────────────┘                                 └──────────────────────┘
```

## Struktur Folder

```text
cold_storage_project_backup/
├── proto/
│   └── medicold.proto              # Kontrak API gRPC
├── server/
│   ├── server.js                   # Entry point server (TUI Dashboard)
│   ├── state/
│   │   ├── db.js                   # Koneksi PostgreSQL
│   │   └── dbStore.js              # State management & queries
│   ├── logic/
│   │   └── *Logic.js               # Business logic masing-masing service
│   └── services/
│       └── *Service.js             # Handler gRPC API
├── client/
│   ├── user_client.js              # Interaktif TUI Admin
│   ├── dashboard_client.js         # Real-time View TUI Monitor
│   └── sensor_client.js            # Simulasi stream suhu kulkas
└── package.json
```

## API Services
Sistem dipecah ke dalam empat peradilan layanan utama:

1. **StorageService**: Mendaftarkan batch vaksin baru, memeriksa sisa stok kulkas, dan menghapus batch.
2. **MonitoringService**: Menangkap aliran suhu beruntun dari sensor dan menampilkan riwayat metrik kulkas.
3. **AlertService**: Memicu peringatan jika batas wajar suhu dilewati, serta mengirim notifikasi siaran (broadcasting) ke seluruh operator lewat *Server-side Streaming*.
4. **ReportService**: Layanan eksekutif untuk mencetak ikhtisar harian status operasional dan mengekspor data ke dalam file CSV.

## Panduan Menjalankan

### 1. Install Dependencies
Sistem menggunakan package manager `yarn`. Jalankan perintah berikut:
```bash
yarn install
```

### 2. Jalankan Database (PostgreSQL via Docker)
Karena sistem kini memakai PostgreSQL untuk penyimpanan permanen, jalankan `docker-compose` untuk mengangkat kontainer database.
```bash
docker compose up -d
```
*(Catatan: Konfigurasi port mapping default Docker diset ke `5433` lokal agar tidak konflik dengan server PostgreSQL bawaan OS).*

### 3. Eksekusi Server
Server akan otomatis melakukan inisiasi database, menjalankan migrasi skema tabel, dan mengaktifkan TUI Server Dashboard.
```bash
yarn run server
```

### 4. Eksekusi Client (Gunakan Terminal Terpisah)

**Menjalankan Sensor (Simulasi Kulkas):**
Mensimulasikan sensor yang mengirimkan suhu tidak wajar secara real-time.
```bash
yarn run client:sensor
```

**Menjalankan Admin Panel (User_1):**
Membuka antarmuka TUI interaktif (`user_client.js`) untuk fungsi manajemen inventaris, penyelesaian alert, dan pelaporan harian.
```bash
yarn run client:user1
```

**Menjalankan Admin Panel (User_2):**
Membuka terminal client kedua untuk melihat pergerakan resolusi alert secara bersamaan (multi-operator broadcasting).
```bash
yarn run client:user2
```

## Deteksi Anomali & Resolusi

Sistem secara otomatis mendeteksi anomali berikut:
- **TEMP_OUT_OF_RANGE**: Suhu lingkungan cold storage tidak sesuai dengan batas suhu vaksin bawaan (*Warning* atau *Critical*).
- **HUMIDITY_HIGH**: Kelembaban melewati ambang batas > 80%.

Jika seorang operator mengoreksi/me-*resolve* salah satu sirine ini, status penanganan dan nama yang bersangkutan akan teregistrasi di database dan otomatis ter-*broadcast* ke layar client operator lainnya secara live tanpa perlu me-refresh.

## Teknologi Utama

Sistem ini mengimplementasikan teknologi dan stack modern:
- **Node.js** - Runtime environment utama
- **gRPC (@grpc/grpc-js)** - Arsitektur komunikasi bi-directional cepat
- **Protocol Buffers (@grpc/proto-loader)** - Standarisasi serialisasi data biner
- **PostgreSQL (pg)** - Basis data relasional persisten
- **Docker Compose** - Kontainerisasi dependensi lokal
- **Blessed & Blessed-Contrib** - Rendering grafis Grid TUI di dalam terminal
- **UUID** - Manajemen identifikasi unik sesi operator