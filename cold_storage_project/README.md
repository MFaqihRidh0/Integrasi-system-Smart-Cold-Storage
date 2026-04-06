# CryoMedics - Smart Cold Storage System

> Sistem monitoring smart cold storage untuk penyimpanan obat & vaksin medis berbasis **gRPC** dengan **Node.js**

## Deskripsi

CryoMedics adalah sistem monitoring kulkas medis yang menggunakan arsitektur gRPC untuk komunikasi real-time antara sensor, server, dan dashboard. Setiap kulkas dilengkapi sensor yang mengirim data suhu secara terus-menerus menggunakan **client-side streaming**.

## Arsitektur

```
┌──────────────────┐     Client-side Streaming      ┌──────────────────────┐
│  🌡️ Sensor Client ├─────────────────────────────────┤                      │
│  (Fridge Sensor)  │     TelemetryReading (stream)   │                      │
└──────────────────┘                                 │                      │
                                                     │   🏥 gRPC Server      │
┌──────────────────┐     Unary RPCs                  │                      │
│  💻 Admin Client  ├─────────────────────────────────┤   ├─ StorageService   │
│  (Laptop)         │     Register/Remove/Report      │   ├─ MonitoringService│
└──────────────────┘                                 │   ├─ AlertService     │
                                                     │   └─ ReportService    │
┌──────────────────┐     Server-side Streaming       │                      │
│  📱 Dashboard     ├─────────────────────────────────┤                      │
│  (Tablet)         │     WatchAlerts (stream)        │                      │
└──────────────────┘                                 └──────────────────────┘
```

## Struktur Folder

```
cold_storage_project_backup/
├── proto/
│   └── medicold.proto              # Kontrak API gRPC
├── server/
│   ├── server.js                   # Entry point server
│   ├── state/
│   │   └── inMemoryStore.js        # State management (in-memory)
│   ├── logic/
│   │   ├── storageLogic.js         # Business logic StorageService
│   │   ├── monitoringLogic.js      # Business logic MonitoringService
│   │   ├── alertLogic.js           # Business logic AlertService
│   │   └── reportLogic.js          # Business logic ReportService
│   └── services/
│       ├── storageService.js       # Handler gRPC StorageService
│       ├── monitoringService.js    # Handler gRPC MonitoringService
│       ├── alertService.js         # Handler gRPC AlertService
│       └── reportService.js        # Handler gRPC ReportService
├── client/
│   ├── admin_client.js             # Client Admin (Laptop) - CLI interaktif
│   ├── sensor_client.js            # Client Sensor (Fridge) - Streaming suhu
│   └── dashboard_client.js         # Client Dashboard (Tablet) - Real-time view
├── package.json
└── README.md
```

## Services

### 1. StorageService (Manajemen Inventaris)
| RPC | Tipe | Deskripsi |
|-----|------|-----------|
| `RegisterStock` | Unary | Mendaftarkan batch obat/vaksin baru |
| `GetInventory` | Unary | Mengambil daftar batch di kulkas tertentu |
| `RemoveBatch` | Unary | Menghapus batch dari kulkas |

### 2. MonitoringService (Monitoring Real-time)
| RPC | Tipe | Deskripsi |
|-----|------|-----------|
| `StreamTelemetry` | **Client-side Streaming** | Sensor mengirim data suhu secara kontinu |
| `GetAllStorageStatus` | Unary | Mengambil status semua kulkas |
| `GetStorageHistory` | Unary | Mengambil riwayat data telemetry |

### 3. AlertService (Alert & Notifikasi)
| RPC | Tipe | Deskripsi |
|-----|------|-----------|
| `GetAlerts` | Unary | Mengambil daftar alert berdasarkan filter |
| `ResolveAlert` | Unary | Menyelesaikan alert tertentu |
| `WatchAlerts` | **Server-side Streaming** | Menerima notifikasi alert secara real-time |

### 4. ReportService (Laporan & Compliance)
| RPC | Tipe | Deskripsi |
|-----|------|-----------|
| `GenerateDailyReport` | Unary | Generate laporan harian |
| `ExportCSV` | Unary | Export data ke CSV/JSON |
| `GetComplianceStatus` | Unary | Cek status kepatuhan suhu |

## Cara Menjalankan

### 1. Install Dependencies
Sistem kita sekarang menggunakan `yarn`. Jalankan perintah berikut:
```bash
yarn install
```

### 2. Jalankan Database (PostgreSQL via Docker)
Karena sistem kini memakai PostgreSQL, pastikan Anda menjalankan Docker Compose untuk mengangkat service database:
```bash
docker compose up -d
```
*(Catatan: Konfigurasi default mapping port dari container Docker diset ke `5433` lokal agar tidak konflik dengan server lokal).*

### 3. Jalankan Server
Server akan otomatis terhubung dengan database dan menjalankan migrasi schema awal (tabel `storages`, `batches`, `alerts`, `telemetry`).
```bash
yarn run server
```

### 4. Buka Client Baru untuk Simulasi (Buka Beberapa Terminal)

**Terminal 2 - Sensor Client (Simulasi sensor kulkas):**
```bash
yarn run client:sensor
```
*(Memulai client-side streaming pengiriman data suhu)*

**Terminal 3 - Admin Client (Manajemen Inventaris & Laporan):**
```bash
yarn run client:admin
```
*(Mendaftarkan vaksin, membaca inventaris, membuat laporan harian)*

**Terminal 4 - Multi-Client Operator (User 1 - Resolusi False Positive):**
```bash
yarn run client:user1
```
*(Login sebagai Operator User_1 yang memantau notifikasi suhu real-time lewat Server-side streaming)*

**Terminal 5 - Multi-Client Operator (User 2):**
```bash
yarn run client:user2
```
*(Coba Override/Resolve sebuah alert dari Terminal 4, notifikasinya akan otomatis dikirim (broadcasting) ke Terminal 5 !)*

## Default Storage Units

| Storage ID | Tipe | Suhu Awal | Kegunaan |
|-----------|------|-----------|----------|
| FRIDGE-001 | Freezer | -20°C | Penyimpanan vaksin standar |
| FRIDGE-002 | Refrigerator | 4°C | Penyimpanan obat umum |
| FRIDGE-003 | Ultra-cold | -70°C | Penyimpanan vaksin mRNA |

## Flow Client-side Streaming (Sensor → Server)

```
Sensor Client                          Server
    │                                    │
    ├── TelemetryReading #1 ──────────►  │ processTelemetryReading() (async Db)
    ├── TelemetryReading #2 ──────────►  │ processTelemetryReading() (async Db)
    ├── TelemetryReading #3 ──────────►  │ processTelemetryReading() (async Db)
    │   ...                              │   (cek anomali setiap reading)
    ├── TelemetryReading #N ──────────►  │ processTelemetryReading() (async Db)
    │                                    │
    ├── END STREAM ────────────────────► │
    │                                    │ createTelemetrySummary()
    │  ◄──────────────── TelemetrySummary │
    │                                    │
```

## Deteksi Anomali & Resolusi

Sistem secara otomatis mendeteksi anomali berikut:

- **TEMP_OUT_OF_RANGE**: Suhu di luar batas yang diizinkan batch
  - **WARNING**: Suhu melampaui batas batch
  - **CRITICAL**: Suhu melampaui batas +5°C dari threshold batch
- **HUMIDITY_HIGH**: Kelembaban > 80%

Ketika alert muncul dan dianggap sebagai false-positive (misal kesalahan baca sensor), operator (User1/User2) dapat me-Resolve Alert beserta catatannya, dan perubahan status tersebut secara **Real-time broadcast** ke operator lainnya lewat gRPC Server Streaming.

## Teknologi

- **Node.js** - Runtime Backend
- **PostgreSQL & DB Store** - Persistent Storage Database
- **Docker Compose** - Database Containerization 
- **gRPC** (@grpc/grpc-js) - Framework RPC
- **Protocol Buffers** (@grpc/proto-loader) - Serialisasi data
---

## How to Run ?

Pre-requisites:
1. Docker
2. Node.js
3. Yarn

Run this command first:

yarn install

Then run this command:

1. docker compose up -d
2. yarn run server
3. yarn run client:user1
4. yarn run client:user2
5. yarn run client:sensor