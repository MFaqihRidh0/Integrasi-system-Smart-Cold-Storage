# 🏥 CryoMedics - Smart Cold Storage System

> Sistem monitoring smart cold storage untuk penyimpanan obat & vaksin medis berbasis **gRPC** dengan **Node.js**

## 📖 Deskripsi

CryoMedics adalah sistem monitoring kulkas medis yang menggunakan arsitektur gRPC untuk komunikasi real-time antara sensor, server, dan dashboard. Setiap kulkas dilengkapi sensor yang mengirim data suhu secara terus-menerus menggunakan **client-side streaming**.

## 🏗️ Arsitektur

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

## 📁 Struktur Folder

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

## 🔧 Services

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

## 🚀 Cara Menjalankan

### 1. Install Dependencies
```bash
cd cold_storage_project_backup
npm install
```

### 2. Jalankan Server
```bash
npm run server
# atau
node server/server.js
```

### 3. Jalankan Client

**Terminal 2 - Sensor Client (Simulasi sensor kulkas):**
```bash
npm run client:sensor
# atau
node client/sensor_client.js
```

**Terminal 3 - Admin Client (CLI interaktif):**
```bash
npm run client:admin
# atau
node client/admin_client.js
```

**Terminal 4 - Dashboard Client (Monitoring real-time):**
```bash
npm run client:dashboard
# atau
node client/dashboard_client.js
```

## 🧊 Default Storage Units

| Storage ID | Tipe | Suhu Awal | Kegunaan |
|-----------|------|-----------|----------|
| FRIDGE-001 | Freezer | -20°C | Penyimpanan vaksin standar |
| FRIDGE-002 | Refrigerator | 4°C | Penyimpanan obat umum |
| FRIDGE-003 | Ultra-cold | -70°C | Penyimpanan vaksin mRNA |

## 📡 Flow Client-side Streaming (Sensor → Server)

```
Sensor Client                          Server
    │                                    │
    ├── TelemetryReading #1 ──────────►  │ processTelemetryReading()
    ├── TelemetryReading #2 ──────────►  │ processTelemetryReading()
    ├── TelemetryReading #3 ──────────►  │ processTelemetryReading()
    │   ...                              │   (cek anomali setiap reading)
    ├── TelemetryReading #N ──────────►  │ processTelemetryReading()
    │                                    │
    ├── END STREAM ────────────────────► │
    │                                    │ createTelemetrySummary()
    │  ◄──────────────── TelemetrySummary │
    │                                    │
```

## 🛡️ Deteksi Anomali

Sistem secara otomatis mendeteksi anomali berikut:

- **TEMP_OUT_OF_RANGE**: Suhu di luar batas yang diizinkan batch
  - **WARNING**: Suhu melampaui batas batch
  - **CRITICAL**: Suhu melampaui batas +5°C dari threshold batch
- **HUMIDITY_HIGH**: Kelembaban > 80%
  - **WARNING**: Kelembaban 80-90%
  - **CRITICAL**: Kelembaban > 90%

## 📝 Teknologi

- **Node.js** - Runtime
- **gRPC** (@grpc/grpc-js) - Framework RPC
- **Protocol Buffers** (@grpc/proto-loader) - Serialisasi data
- **UUID** - Generate unique alert ID
