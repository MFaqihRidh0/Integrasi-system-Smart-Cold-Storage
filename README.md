# Snart Cold Storage — Project Brief & Implementation Guide

> **Versi dokumen:** 1.0 · 31 Maret 2026
> Sistem pemantauan cold storage medis berbasis **gRPC Node.js**

---

| Nama | NRP       |
|-------|-----------|
| Mochammad Atha Tajuddin  | 5027241093  |
| M.Faqih Ridho  | 5027241123  |
---



---

## Daftar Isi

1. [Ringkasan Proyek](#1-ringkasan-proyek)
2. [Arsitektur Sistem](#2-arsitektur-sistem)
3. [Struktur File Final](#3-struktur-file-final)
4. [Komponen & Jobdesk](#4-komponen--jobdesk)
5. [Implementasi Services](#5-implementasi-services)
   - 5.1 [InventoryService](#51-inventoryservice)
   - 5.2 [ThermalTelemetryService](#52-thermalthermaltelemetryservice)
   - 5.3 [AlertStatusService](#53-alertstatusservice)
6. [InMemory State Store](#6-inmemory-state-store)
7. [Tiga Jenis Client](#7-tiga-jenis-client)
8. [Error Handling & gRPC Status Codes](#8-error-handling--grpc-status-codes)
9. [Threshold Anomali](#9-threshold-anomali)
10. [Checklist Implementasi](#10-checklist-implementasi)

---

## 1. Ringkasan Proyek

Storage Cold menghubungkan **sensor kulkas medis** di lapangan dengan **server pusat rumah sakit** menggunakan protokol gRPC. Sistem memantau suhu, kelembaban, dan tekanan secara real-time, mendeteksi anomali otomatis, dan mendistribusikan alert ke petugas medis via dashboard tablet.

### Aktor dalam Sistem

| Aktor | Perangkat | Peran |
|---|---|---|
| **Admin Gudang** | Laptop | Mendaftarkan batch medis (vaksin, sampel, obat) ke fridge |
| **Sensor Fridge** | Raspberry Pi / MCU | Streaming data suhu, kelembaban, tekanan secara kontinu |
| **Petugas Medis** | Tablet | Memantau alert dan status seluruh kulkas secara real-time |

---

## 2. Arsitektur Sistem (Minus Plus)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          gRPC Server Layer (Core)                           │
│                                                                             │
│  ┌──────────────────────────┐    ┌───────────────────────────────────────┐ │
│  │   gRPC Service Interface │    │        Business Logic & State         │ │
│  │                          │    │                                       │ │
│  │  InventoryService        │───▶│  inventoryLogic ──┐                   │ │
│  │  (Unary RPC)             │    │                   │                   │ │
│  │                          │    │  telemetryLogic ──┼──▶ InMemoryStore │ │
│  │  ThermalTelemetryService │───▶│                   │   (FridgeID→Data) │ │
│  │  (Client-Side Streaming) │    │  alertLogic    ───┘        │         │ │
│  │                          │    │       │                    │         │ │
│  │  AlertStatusService      │───▶│       └──── Push Updates ◀─┘         │ │
│  │  (Unary + Server Stream) │    │                    │                  │ │
│  └──────────────────────────┘    └────────────────────┼──────────────────┘ │
└───────────────────────────────────────────────────────┼────────────────────┘
         ▲                  ▲                  ▲         │ Push
         │                  │                  │         ▼
  admin_client.js   sensor_client.js   dashboard_client.js
  (Admin Laptop)    (Sensor A,B,C)     (Tablet Petugas)
```

### Pola gRPC per Service

| Service | Metode | Pola gRPC | Arah Data |
|---|---|---|---|
| `InventoryService` | `RegisterStock` | Unary | Client → Server → Client |
| `InventoryService` | `GetInventory` | Unary | Client → Server → Client |
| `ThermalTelemetryService` | `StreamTelemetry` | **Client-Side Streaming** | Client stream → Server → 1 Response |
| `AlertStatusService` | `GetAlerts` | Unary | Client → Server → Client |
| `AlertStatusService` | `ResolveAlert` | Unary | Client → Server → Client |
| `AlertStatusService` | `WatchAlerts` | **Server-Side Streaming** | Client → Server stream → Client |

---

## 3. Struktur File (Minus plus)

```
Snart_Cold_Storage/
├── proto/
│   └── medicold.proto                  ← Kontrak API (semua services & messages)
│
├── server/
│   ├── server.js                       ← Entry point: inisialisasi & bind gRPC server
│   ├── state/
│   │   └── inMemoryStore.js            ← Pusat state (Map: FridgeID → Data)
│   ├── logic/
│   │   ├── inventoryLogic.js           ← Business logic pendaftaran batch
│   │   ├── telemetryLogic.js           ← Proses stream, hitung statistik
│   │   └── alertLogic.js              ← Deteksi anomali, queue, push watcher
│   └── services/
│       ├── inventoryService.js         ← gRPC handler InventoryService
│       ├── telemetryService.js         ← gRPC handler ThermalTelemetryService
│       └── alertService.js            ← gRPC handler AlertStatusService
│
├── client/
│   ├── admin_client.js                 ← Petugas gudang (RegisterStock)
│   ├── sensor_client.js               ← Sensor kulkas (Client-Side Streaming)
│   └── dashboard_client.js            ← Dashboard tablet (WatchAlerts)
│
├── package.json
├── README.md
└── IMPLEMENTATION_GUIDE.md             ← (file ini)
```

---

## 4. Komponen & Jobdesk

### Proto `medicold.proto`

- Mendefinisikan **semua message** yang dipertukarkan antar komponen
- Mendefinisikan **3 service** beserta seluruh RPC method-nya
- Seluruh komponen lain (server & client) load file ini via `@grpc/proto-loader`

### `state/inMemoryStore.js`

- Menyimpan **state global** seluruh fridge dalam satu Map terpusat
- Tidak ada database — semua ada di memori proses server
- Diakses oleh semua logic module (`inventoryLogic`, `telemetryLogic`, `alertLogic`)

### `logic/` (Business Logic)

- **Tidak boleh** mengandung kode gRPC sama sekali
- Hanya menerima plain object, menjalankan logika, mengembalikan plain object
- Mudah diuji secara unit tanpa perlu mock gRPC

### `services/` (gRPC Handlers)

- Jembatan antara dunia gRPC (`call`, `callback`) dengan business logic
- Tugas: validasi request → panggil logic → bungkus hasil jadi response gRPC
- Handle gRPC error code (`INVALID_ARGUMENT`, `NOT_FOUND`, `OUT_OF_RANGE`, dsb.)

### `client/` (Tiga Client)

- Masing-masing fokus pada satu peran (Admin / Sensor / Dashboard)
- Tidak saling bergantung satu sama lain
- Bisa dijalankan dari terminal berbeda secara bersamaan

---

## 5. Implementasi Services

---

### 5.1 `InventoryService`

**File:** `server/services/inventoryService.js`
**Logic:** `server/logic/inventoryLogic.js`

#### Fungsi

Memungkinkan admin gudang untuk mendaftarkan batch medis baru (vaksin, sampel darah, obat) ke dalam sistem dan mengaitkannya dengan fridge tertentu.

#### RPC: `RegisterStock` (Unary)

```
Admin Client ──── RegisterStock(StockBatch) ────▶ Server
                                                    │
                                              Validasi request
                                                    │
                                              Cek batch_id unik
                                                    │
                                              Simpan ke InMemoryStore
                                                    │
Admin Client ◀─── RegisterStockResponse ───────────┘
```

**Request (`StockBatch`):**

```js
{
  batch_id:     "BATCH-2025-001",        // ID unik dari admin
  fridge_id:    "FRIDGE-A",             // Fridge tujuan
  content_type: "VACCINE",              // Enum: VACCINE | BLOOD_SAMPLE | MEDICINE | OTHER
  quantity:     200,                    // Jumlah unit
  expiry_date:  "2026-12-31",          // String ISO date
  notes:        "Vaksin COVID-19 dosis booster"
}
```

**Response (`RegisterStockResponse`):**

```js
{ success: true, message: "Batch BATCH-2025-001 berhasil didaftarkan ke FRIDGE-A" }
// atau jika gagal:
{ success: false, message: "batch_id sudah terdaftar" }
// + gRPC status code: ALREADY_EXISTS
```

**Cara implementasi `inventoryLogic.js`:**

```js
// Pseudocode
function registerStock(batch) {
  if (!batch.batch_id || !batch.fridge_id)
    throw grpcError(INVALID_ARGUMENT, "batch_id dan fridge_id wajib diisi")
  
  if (store.batchExists(batch.batch_id))
    throw grpcError(ALREADY_EXISTS, "batch_id sudah terdaftar")

  store.addBatch(batch.fridge_id, batch)
  return { success: true, message: `Batch ${batch.batch_id} terdaftar` }
}
```

---

#### RPC: `GetInventory` (Unary)

**Request:**

```js
{ fridge_id: "FRIDGE-A" }   // kosong = ambil semua fridge
```

**Response (`InventoryRecord`):**

```js
{
  fridge_id: "FRIDGE-A",
  batches: [
    { batch_id: "BATCH-2025-001", content_type: "VACCINE", quantity: 200, ... },
    { batch_id: "BATCH-2025-002", content_type: "BLOOD_SAMPLE", quantity: 50, ... }
  ],
  last_updated: 1711850000000  // Unix ms
}
```

**Cara implementasi:**

- Ambil data dari `InMemoryStore` berdasarkan `fridge_id`
- Jika `fridge_id` kosong, kembalikan semua fridge
- Jika `fridge_id` tidak ditemukan, kembalikan gRPC `NOT_FOUND`

---

### 5.2 `ThermalTelemetryService`

**File:** `server/services/telemetryService.js`
**Logic:** `server/logic/telemetryLogic.js`

#### Fungsi

Menerima stream data sensor dari fridge secara kontinu. Setiap paket data diproses secara real-time untuk deteksi anomali. Setelah sesi selesai, server mengembalikan satu response berupa `TelemetrySummary`.

#### RPC: `StreamTelemetry` (Client-Side Streaming)

```
Sensor Client ──── TelemetryReading #1 ─────────────────▶ Server
                                                             │ inspectReading() → alert?
Sensor Client ──── TelemetryReading #2 ─────────────────▶ Server
                                                             │ inspectReading() → alert?
Sensor Client ──── TelemetryReading #3 ─────────────────▶ Server
                                                             │ inspectReading() → ANOMALI KRITIS
                                                             │ addAlert() ───▶ AlertQueue
              ⋮                                              ⋮
Sensor Client ──── [END STREAM] ─────────────────────────▶ Server
                                                             │ buildSummary()
Sensor Client ◀─── TelemetrySummary ─────────────────────── Server
```

**Request per paket (`TelemetryReading`):**

```js
{
  fridge_id:           "Fridge A",
  session_id:          "uuid-sesi",
  timestamp:           1711850123000,       // Unix ms
  temperature_celsius: 4.7,
  humidity_percent:    42.3,
  pressure_hpa:        1001.5,
  door_open:           false,
  power_stable:        true,
  location:            "Ruang Farmasi Lt. 2",
  medical_content:     "Vaksin"
}
```

**Response (`TelemetrySummary`):**

```js
{
  session_id:           "uuid-sesi",
  fridge_id:            "FRIDGE-A",
  total_readings:       60,
  avg_temperature:      5.1,
  min_temperature:      3.8,
  max_temperature:      9.4,              // ← sudah melewati threshold!
  avg_humidity:         43.0,
  anomaly_count:        3,
  critical_alert_count: 1,
  overall_status:       "STATUS_WARNING",
  summary_notes:        "Suhu sempat melonjak ke 9.4°C pada bacaan ke-47"
}
```

**Cara implementasi `telemetryService.js`:**

```js
// Pseudocode gRPC handler Client-Side Streaming
function StreamTelemetry(call, callback) {
  let stats = null

  call.on('data', (reading) => {
    // 1. Inisialisasi SessionStats pada data pertama
    if (!stats) stats = new SessionStats(reading)

    // 2. Akumulasi statistik
    stats.addReading(reading)

    // 3. Update InMemoryStore dengan data terbaru fridge ini
    store.updateTelemetry(reading.fridge_id, reading)

    // 4. Deteksi anomali → jika ada, masuk alert queue + push ke watcher
    alertLogic.detectAndDispatch(reading, stats)
  })

  call.on('error', (err) => {
    console.error('Stream error:', err.message)
  })

  call.on('end', () => {
    if (!stats) return callback(null, {})

    // 5. Bangun summary setelah stream selesai
    const summary = telemetryLogic.buildSummary(stats)
    callback(null, summary)
  })
}
```

**Cara implementasi `telemetryLogic.js`:**

```js
// Pseudocode logic
class SessionStats {
  constructor(firstReading) { /* init dari bacaan pertama */ }
  addReading(r) { /* update sum/min/max setiap sensor */ }
}

function buildSummary(stats) {
  return {
    overall_status: stats.criticalAlerts > 0 ? 'STATUS_CRITICAL'
                  : stats.anomalies > 0      ? 'STATUS_WARNING'
                  : 'STATUS_NORMAL',
    avg_temperature: stats.tempSum / stats.count,
    // ... dst
  }
}
```

**Kapan gRPC Error `OUT_OF_RANGE` dilempar?**

Bila nilai sensor benar-benar tidak masuk akal secara fisik (bukan sekadar melewati threshold medis), server menghentikan stream dengan error ini:

```js
// Contoh: suhu di bawah -50°C atau di atas 100°C mustahil untuk sensor kulkas
if (reading.temperature_celsius < -50 || reading.temperature_celsius > 100) {
  call.destroy(
    new grpc.StatusError(grpc.status.OUT_OF_RANGE,
      `Nilai suhu tidak valid: ${reading.temperature_celsius}°C`)
  )
  return
}
```

> **Perbedaan `OUT_OF_RANGE` vs Alert:**
> - Alert → nilai melewati batas medis (misal >8°C) tapi masih masuk akal secara fisik → stream **tetap berjalan**
> - `OUT_OF_RANGE` → nilai mustahil secara fisik → stream **dihentikan**

---

### 5.3 `AlertStatusService`

**File:** `server/services/alertService.js`
**Logic:** `server/logic/alertLogic.js`

#### Fungsi

Melayani kebutuhan dashboard petugas medis: query alert snapshot, resolve alert yang sudah ditangani, dan menerima push notifikasi alert secara real-time via server-side streaming.

---

#### RPC: `GetAlerts` (Unary)

**Request (`AlertQuery`):**

```js
{
  fridge_id:      "Fridge A",   // kosong = semua fridge
  unresolved_only: true,
  min_level:      "WARNING",    // INFO | WARNING | CRITICAL | EMERGENCY
  from_time:      0,            // Unix ms, 0 = tidak difilter
  to_time:        0
}
```

**Response (`AlertList`):**

```js
{
  alerts: [
    {
      alert_id:        "uuid",
      fridge_id:       "Fridge A",
      type:            "Alert_High_Temperature",
      level:           "CRITICAL",
      description:     "Suhu 9.4°C melewati batas 8°C",
      sensor_value:    9.4,
      threshold_value: 8.0,
      timestamp:       1711850145000,
      resolved:        false
    }
  ],
  total_count: 1,
  query_time:  "2026-03-31T07:30:00.000Z"
}
```

**Cara implementasi:**

```js
function GetAlerts(call, callback) {
  const filter = call.request
  const alerts = alertLogic.getAlerts(filter)
  callback(null, { alerts, total_count: alerts.length, query_time: new Date().toISOString() })
}
```

---

#### RPC: `ResolveAlert` (Unary)

**Request:**

```js
{ alert_id: "uuid", resolved_by: "Dr. Rina", notes: "Sudah diperbaiki" }
```

**Response:**

```js
{ success: true, message: "Alert uuid berhasil di-resolve oleh Dr. Rina" }
// atau: gRPC NOT_FOUND jika alert_id tidak ada
```

---

#### RPC: `WatchAlerts` (Server-Side Streaming) ⭐

Ini adalah RPC paling kompleks. Berbeda dengan `GetAlerts` yang snapshot, `WatchAlerts` membuka koneksi permanen dan server **mendorong** notifikasi setiap kali ada alert baru atau alert di-resolve.

```
Dashboard Client ──── WatchAlerts({ fridge_ids: ['A','B','C'] }) ──▶ Server
                                                                        │
                                                                  Register watcher
                                                                        │
Dashboard Client ◀─── AlertUpdate { type: "NEW_ALERT", alert: {...} } ─┤ (push saat Fridge A panas)
Dashboard Client ◀─── AlertUpdate { type: "NEW_ALERT", alert: {...} } ─┤ (push saat Fridge B mati listrik)
Dashboard Client ◀─── AlertUpdate { type: "RESOLVED",  alert: {...} } ─┤ (push saat alert ke-1 di-resolve)
         ⋮                                                              ⋮  (stream tetap terbuka)
Dashboard Client ── [Ctrl+C / disconnect] ─────────────────────────────▶ Remove watcher
```

**Message `AlertUpdate` (dikirim server secara push):**

```js
{
  event_type: "NEW_ALERT",   // NEW_ALERT | RESOLVED
  alert: { ...objek Alert lengkap... }
}
```

**Cara implementasi `alertService.js`:**

```js
// Pseudocode
function WatchAlerts(call) {
  const { fridge_ids, min_level } = call.request

  // Daftarkan stream ini sebagai watcher aktif
  alertLogic.registerWatcher(call, { fridge_ids, min_level })

  // Ketika client disconnect, hapus watcher agar tidak memory leak
  call.on('cancelled', () => alertLogic.removeWatcher(call))
  call.on('error',     () => alertLogic.removeWatcher(call))
}
```

**Cara implementasi `alertLogic.js` — bagian push:**

```js
// Pseudocode
const watchers = new Set()   // Set of active gRPC call objects

function registerWatcher(call, filter) {
  watchers.add({ call, filter })
}

function removeWatcher(call) {
  for (const w of watchers) if (w.call === call) watchers.delete(w)
}

function addAlert(alert) {
  alertQueue.push(alert)

  // Push ke semua watcher yang filter-nya cocok
  for (const { call, filter } of watchers) {
    if (matchesFilter(alert, filter)) {
      call.write({
        event_type: 'New_Alert',
        alert
      })
    }
  }
}

function resolveAlert(alertId) {
  const alert = alertQueue.find(a => a.alert_id === alertId)
  if (!alert) return false
  alert.resolved = true

  // Notifikasi watcher bahwa alert ini sudah resolved
  for (const { call, filter } of watchers) {
    if (matchesFilter(alert, filter)) {
      call.write({ event_type: 'Resolved', alert })
    }
  }
  return true
}
```

> **Mengapa `WatchAlerts` tidak punya `callback`?**
>
> Pada Server-Side Streaming di `@grpc/grpc-js`, handler hanya menerima `call` (tanpa `callback`).
> Server menulis response dengan `call.write(data)` dan menutup stream dengan `call.end()`.
> Selama stream terbuka, server bisa memanggil `call.write()` kapan saja.

---

## 6. InMemory State Store

**File:** `server/state/inMemoryStore.js`

Seluruh state sistem disimpan dalam satu struktur Map:

```
Map<fridgeId, FridgeState>

FridgeState = {
  fridgeId:          string,
  status:            FridgeStatus,        // NORMAL | WARNING | CRITICAL | OFFLINE
  latestTelemetry:   TelemetryReading,    // Bacaan sensor terakhir
  activeSessions:    Map<sessionId, SessionStats>,
  inventory:         StockBatch[],        // Daftar batch terdaftar
  lastUpdated:       number               // Unix ms
}
```

**API yang diekspos store:**

```js
store.getFridgeState(fridgeId)
store.getAllFridges()
store.updateTelemetry(fridgeId, reading)
store.updateStatus(fridgeId, status)
store.addBatch(fridgeId, batch)
store.getBatches(fridgeId)
store.batchExists(batchId)
```

---

## 7. Tiga Jenis Client

### `admin_client.js` — Petugas Gudang

```bash
# Daftarkan batch baru
node client/admin_client.js --action register \
  --fridge-id FRIDGE-A --batch-id BATCH-001 --content vaccine --qty 200

# Lihat inventaris fridge
node client/admin_client.js --action list --fridge-id FRIDGE-A
```

### `sensor_client.js` — Sensor Kulkas

```bash
# Skenario normal 60 detik
node client/sensor_client.js --fridge-id FRIDGE-A --scenario normal --readings 60

# Skenario suhu naik (akan trigger alert)
node client/sensor_client.js --fridge-id FRIDGE-B --scenario temp_rise --readings 30

# Skenario listrik padam
node client/sensor_client.js --fridge-id FRIDGE-C --scenario power_fail
```

**5 Skenario Simulasi:**

| Skenario | Kondisi yang Disimulasikan | Alert Diharapkan |
|---|---|---|
| `normal` | Semua dalam batas aman | Tidak ada |
| `temp_rise` | Suhu naik perlahan 4°C → 16°C | CRITICAL lalu EMERGENCY |
| `door_open` | Pintu terbuka 30-70% durasi | CRITICAL (door open >30s) |
| `power_fail` | Listrik padam 40-60% durasi | EMERGENCY |
| `chaos` | Random gabungan semua anomali | Campuran WARNING–EMERGENCY |

### `dashboard_client.js` — Petugas Medis (Tablet)

```bash
# Mode watch real-time (stream terbuka, push dari server)
node client/dashboard_client.js --watch --fridge-ids FRIDGE-A,FRIDGE-B,FRIDGE-C

# Lihat semua alert aktif
node client/dashboard_client.js --get-alerts --min-level WARNING

# Resolve alert
node client/dashboard_client.js --resolve <alert-uuid> --by "Dr. Rina"
```

---

## 8. Error Handling & gRPC Status Codes

| Kondisi | gRPC Status Code | Dilempar Oleh | Ditangkap Oleh |
|---|---|---|---|
| `batch_id` sudah ada | `ALREADY_EXISTS` | inventoryService | admin_client |
| `fridge_id` tidak ditemukan | `NOT_FOUND` | inventoryService / alertService | Semua client |
| `alert_id` tidak valid | `NOT_FOUND` | alertService | dashboard_client |
| Field wajib kosong | `INVALID_ARGUMENT` | Semua service | Semua client |
| Nilai sensor mustahil secara fisik | `OUT_OF_RANGE` | telemetryService | sensor_client |
| Server tidak aktif | `UNAVAILABLE` | gRPC runtime | Semua client |

**Cara tangkap error di client:**

```js
try {
  const response = await stub.RegisterStock(request)
} catch (err) {
  if (err.code === grpc.status.ALREADY_EXISTS) {
    console.error('Batch sudah terdaftar!')
  } else if (err.code === grpc.status.NOT_FOUND) {
    console.error('Fridge tidak ditemukan!')
  } else {
    console.error('Error tidak dikenal:', err.message)
  }
}
```

---

## 9. Threshold Anomali

Batas ini digunakan oleh `alertLogic.detectAndDispatch()` untuk menentukan alert apa yang dibuat:

| Sensor | Min Aman | Max Aman | Level jika Melewati |
|---|---|---|---|
| Suhu | 2°C | 8°C | CRITICAL; EMERGENCY jika >10°C atau <0°C |
| Kelembaban | 30% | 60% | WARNING |
| Tekanan | 980 hPa | 1020 hPa | WARNING |
| Pintu Terbuka | — | > 30 detik | CRITICAL |
| Daya Listrik | — | Tidak stabil | EMERGENCY |

---

## 10. Checklist Implementasi

### Proto (`proto/medicold.proto`)
- [ ] Tambahkan `InventoryService` (RegisterStock, GetInventory)
- [ ] Tambahkan `ThermalTelemetryService` (StreamTelemetry)
- [ ] Tambahkan `AlertStatusService` (GetAlerts, ResolveAlert, WatchAlerts)
- [ ] Message: `StockBatch`, `RegisterStockResponse`, `InventoryRecord`
- [ ] Message: `TelemetryReading`, `TelemetrySummary`
- [ ] Message: `Alert`, `AlertQuery`, `AlertList`, `WatchAlertsRequest`, `AlertUpdate`
- [ ] Enum: `ContentType`, `FridgeStatus`, `AlertType`, `AlertLevel`

### Server
- [ ] `state/inMemoryStore.js` — Map pusat + semua accessor
- [ ] `logic/inventoryLogic.js` — registerStock, getInventory
- [ ] `logic/telemetryLogic.js` — SessionStats, buildSummary
- [ ] `logic/alertLogic.js` — detectAndDispatch, addAlert, getAlerts, resolveAlert, registerWatcher, removeWatcher, push ke watcher
- [ ] `services/inventoryService.js` — handler RegisterStock + GetInventory
- [ ] `services/telemetryService.js` — handler StreamTelemetry + validasi OUT_OF_RANGE
- [ ] `services/alertService.js` — handler GetAlerts + ResolveAlert + WatchAlerts
- [ ] `server.js` — refactor jadi pure entry point, load semua services

### Client
- [ ] `admin_client.js` — RegisterStock + GetInventory + CLI
- [ ] `sensor_client.js` — StreamTelemetry + SensorSimulator 5 skenario + handle OUT_OF_RANGE
- [ ] `dashboard_client.js` — GetAlerts + ResolveAlert + WatchAlerts (Server-Side Stream)

---
## Resource Reference

- https://www.researchgate.net/publication/399896435_Challenges_and_Innovations_of_Vaccine_Cold_Chain_Distribution_in_Developing_Countries_A_Narrative_Review

- https://pmc.ncbi.nlm.nih.gov/articles/PMC8706030/

- https://www.pharmacytimes.com/view/cold-chain-failure-lessons-learned-from-2-cases