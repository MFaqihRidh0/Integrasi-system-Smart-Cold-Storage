/**
 * ============================================================
 *  🌡️ CryoMedics - Sensor Client (Fridge Sensor Simulator)
 * ============================================================
 *  Simulasi sensor di kulkas medis yang mengirim data suhu
 *  secara terus-menerus menggunakan CLIENT-SIDE STREAMING.
 *
 *  Fitur:
 *  - Stream data suhu, kelembaban, tekanan ke server
 *  - Simulasi fluktuasi suhu realistis
 *  - Simulasi anomali (suhu di luar range)
 *  - Menerima summary dari server setelah streaming selesai
 * ============================================================
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// ===================== LOAD PROTO =====================

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'medicold.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: Number,
    enums: Number,
    defaults: true,
    oneofs: true
});

const medicoldProto = grpc.loadPackageDefinition(packageDefinition).medicold;

// ===================== CLIENT SETUP =====================

const SERVER_ADDRESS = 'localhost:50051';
const monitoringClient = new medicoldProto.MonitoringService(
    SERVER_ADDRESS,
    grpc.credentials.createInsecure()
);

// ===================== SENSOR CONFIGURATION =====================

const SENSOR_CONFIG = {
    storage_id: 'FRIDGE-001',
    sensor_id: 'SENSOR-TH-001',
    base_temperature: -20.0,       // Suhu dasar kulkas (-20°C untuk FRIDGE-001)
    base_humidity: 45.0,           // Kelembaban dasar
    base_pressure: 1013.25,        // Tekanan atmosfer standar (hPa)
    interval_ms: 3000,             // Interval pengiriman (3 detik)
    total_readings: 15,            // Total data yang dikirim per sesi
    anomaly_probability: 0.15      // 15% kemungkinan anomali
};

// ===================== HELPER FUNCTIONS =====================

/**
 * Simulasi pembacaan sensor dengan fluktuasi realistis
 */
function generateReading(config, readingIndex) {
    let temperature = config.base_temperature;
    let humidity = config.base_humidity;
    let pressure = config.base_pressure;

    // Fluktuasi normal (±0.5°C)
    temperature += (Math.random() - 0.5) * 1.0;
    humidity += (Math.random() - 0.5) * 3.0;
    pressure += (Math.random() - 0.5) * 2.0;

    // Simulasi anomali pada reading ke-10 dan ke-12
    if (readingIndex === 10 || readingIndex === 12) {
        // Anomali suhu naik drastis (simulasi pintu terbuka)
        temperature += 15 + Math.random() * 10; // Suhu naik 15-25°C
        humidity += 20; // Kelembaban juga naik
        console.log(`   ⚠️  ANOMALY INJECTED at reading #${readingIndex + 1}!`);
    }

    return {
        storage_id: config.storage_id,
        temperature: Math.round(temperature * 100) / 100,
        humidity: Math.round(humidity * 100) / 100,
        pressure: Math.round(pressure * 100) / 100,
        timestamp: Date.now(),
        sensor_id: config.sensor_id
    };
}

// ===================== MAIN: CLIENT-SIDE STREAMING =====================

function startSensorStreaming() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║   🌡️  CryoMedics - Sensor Client                        ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║   📡 Connecting to: ${SERVER_ADDRESS}                     ║`);
    console.log(`║   🧊 Storage: ${SENSOR_CONFIG.storage_id}                          ║`);
    console.log(`║   🔧 Sensor: ${SENSOR_CONFIG.sensor_id}                        ║`);
    console.log(`║   ⏱️  Interval: ${SENSOR_CONFIG.interval_ms}ms                              ║`);
    console.log(`║   📦 Total readings: ${SENSOR_CONFIG.total_readings}                            ║`);
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');

    // Membuat client-side stream
    const stream = monitoringClient.StreamTelemetry((error, summary) => {
        if (error) {
            console.error('\n❌ StreamTelemetry error:', error.message);
            return;
        }

        // Server mengirim summary setelah stream selesai
        console.log('\n');
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║   📊 TELEMETRY SUMMARY (from Server)                    ║');
        console.log('╠══════════════════════════════════════════════════════════╣');
        console.log(`║   Storage ID       : ${summary.storage_id}`);
        console.log(`║   Total Packets    : ${summary.total_packets_received}`);
        console.log(`║   Avg Temperature  : ${summary.avg_temperature}°C`);
        console.log(`║   Min Temperature  : ${summary.min_temperature}°C`);
        console.log(`║   Max Temperature  : ${summary.max_temperature}°C`);
        console.log(`║   Avg Humidity     : ${summary.avg_humidity}%`);
        console.log(`║   Anomaly Count    : ${summary.anomaly_count}`);
        console.log(`║   Critical Alert   : ${summary.has_critical_alert ? '🚨 YES' : '✅ NO'}`);
        console.log(`║   Session Start    : ${summary.session_start}`);
        console.log(`║   Session End      : ${summary.session_end}`);
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log('');

        // Tutup koneksi
        process.exit(0);
    });

    // Kirim data sensor secara berkala
    let readingCount = 0;

    console.log(`🚀 Starting telemetry stream for '${SENSOR_CONFIG.storage_id}'...\n`);

    const sendInterval = setInterval(() => {
        if (readingCount >= SENSOR_CONFIG.total_readings) {
            clearInterval(sendInterval);

            console.log(`\n📤 All ${SENSOR_CONFIG.total_readings} readings sent. Closing stream...`);

            // Tutup stream (trigger server untuk mengirim summary)
            stream.end();
            return;
        }

        const reading = generateReading(SENSOR_CONFIG, readingCount);

        // Kirim ke server via stream
        stream.write(reading);

        const statusIcon = reading.temperature > SENSOR_CONFIG.base_temperature + 5 ? '🔴' :
                          reading.temperature > SENSOR_CONFIG.base_temperature + 2 ? '🟡' : '🟢';

        console.log(`   ${statusIcon} [${readingCount + 1}/${SENSOR_CONFIG.total_readings}] Temp: ${reading.temperature}°C | Humidity: ${reading.humidity}% | Pressure: ${reading.pressure} hPa`);

        readingCount++;
    }, SENSOR_CONFIG.interval_ms);
}

// ===================== RUN =====================

startSensorStreaming();
