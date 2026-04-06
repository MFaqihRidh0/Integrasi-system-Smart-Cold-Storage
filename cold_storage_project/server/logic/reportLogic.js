/**
 * ============================================================
 *  CryoMedics - Report Logic (Business Logic)
 * ============================================================
 *  Menangani logika bisnis untuk reporting & compliance:
 *  - generateDailyReport: laporan harian per storage
 *  - exportCSV: export data ke format CSV
 *  - getComplianceStatus: cek kepatuhan suhu
 * ============================================================
 */

const store = require('../state/dbStore');

const reportLogic = {

    /**
     * Generate laporan harian untuk storage tertentu atau semua storage
     */
    async generateDailyReport(date, storageId) {
        const reportDate = date || new Date().toISOString().split('T')[0];
        const dayStart = new Date(reportDate).getTime();
        const dayEnd = dayStart + 24 * 60 * 60 * 1000;

        let storages = [];
        if (storageId && storageId !== '') {
            const s = await store.getStorage(storageId);
            if (s) storages.push(s);
        } else {
            storages = await store.getAllStorages();
        }

        const storageSummaries = [];
        for (const s of storages) {
            const readings = await store.getTelemetryHistory(s.storage_id, dayStart, dayEnd, 0);
            const alertsAll = await store.getAlerts(s.storage_id);
            const alerts = alertsAll.filter(a =>
                a.triggered_at >= dayStart && a.triggered_at <= dayEnd
            );

            // Hitung statistik suhu
            let avgTemp = 0, minTemp = 0, maxTemp = 0;
            if (readings.length > 0) {
                const temps = readings.map(r => r.temperature);
                avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
                minTemp = Math.min(...temps);
                maxTemp = Math.max(...temps);
            }

            // Cek compliance: apakah rata-rata suhu dalam range yang diizinkan batch
            const batches = await store.getBatchesByStorage(s.storage_id);
            let withinCompliance = true;
            if (batches.length > 0 && readings.length > 0) {
                for (const batch of batches) {
                    if (avgTemp < batch.min_temp || avgTemp > batch.max_temp) {
                        withinCompliance = false;
                        break;
                    }
                }
            }

            // Hitung uptime (persentase waktu dalam status NORMAL)
            const normalReadings = readings.filter(r => {
                if (batches.length === 0) return true;
                return batches.every(b => r.temperature >= b.min_temp && r.temperature <= b.max_temp);
            });
            const uptimePerc = readings.length > 0 
                ? (normalReadings.length / readings.length) * 100 
                : 100;

            storageSummaries.push({
                storage_id: s.storage_id,
                avg_temp: Math.round(avgTemp * 100) / 100,
                min_temp: Math.round(minTemp * 100) / 100,
                max_temp: Math.round(maxTemp * 100) / 100,
                total_readings: readings.length,
                alert_count: alerts.length,
                uptime_percentage: Math.round(uptimePerc * 100) / 100,
                within_compliance: withinCompliance
            });
        }

        // Hitung total alert
        const allAlertsRaw = await store.getAlerts('', null, false);
        const allAlerts = allAlertsRaw.filter(a =>
            a.triggered_at >= dayStart && a.triggered_at <= dayEnd
        );
        const criticalAlerts = allAlerts.filter(a => a.severity === 2);

        // System uptime
        const avgUptime = storageSummaries.length > 0
            ? storageSummaries.reduce((sum, s) => sum + s.uptime_percentage, 0) / storageSummaries.length
            : 100;

        const report = {
            report_date: reportDate,
            generated_at: new Date().toISOString(),
            storage_summaries: storageSummaries,
            total_alerts: allAlerts.length,
            critical_alerts: criticalAlerts.length,
            system_uptime_percentage: Math.round(avgUptime * 100) / 100
        };

        console.log(`[ReportLogic] 📊 Daily report generated for '${reportDate}' | ${storageSummaries.length} storages | ${allAlerts.length} alerts`);

        return report;
    },

    /**
     * Export data telemetry ke format CSV/JSON
     */
    async exportCSV(storageId, startTime, endTime, format) {
        const readings = await store.getTelemetryHistory(
            storageId, 
            startTime || 0, 
            endTime || Date.now(), 
            0
        );

        if (readings.length === 0) {
            return {
                success: false,
                download_url: '',
                file_size_bytes: 0,
                record_count: 0
            };
        }

        const fs = require('fs');
        const path = require('path');
        const exportsDir = path.join(__dirname, '..', '..', 'exports');

        if (!fs.existsSync(exportsDir)) {
            fs.mkdirSync(exportsDir, { recursive: true });
        }

        const exportId = `export_${storageId}_${Date.now()}`;
        const fileName = `${exportId}.${(format || 'csv').toLowerCase()}`;
        const filePath = path.join(exportsDir, fileName);

        let fileContent = '';
        if (format === 'CSV') {
            // Header + data rows
            const header = 'timestamp,temperature,humidity,pressure,sensor_id\n';
            const rows = readings.map(r => `${r.timestamp},${r.temperature},${r.humidity},${r.pressure || 0},${r.sensor_id || ''}`).join('\n');
            fileContent = header + rows;
        } else {
            fileContent = JSON.stringify(readings, null, 2);
        }

        fs.writeFileSync(filePath, fileContent);
        const estimatedSize = fileContent.length;

        console.log(`[ReportLogic] 📁 Export ${format} → Storage '${storageId}' | ${readings.length} records | ~${estimatedSize} bytes`);
        console.log(`[ReportLogic] 📁 File saved successfully at ${filePath}`);

        return {
            success: true,
            download_url: filePath,
            file_size_bytes: estimatedSize,
            record_count: readings.length
        };
    },

    /**
     * Mengecek status kepatuhan (compliance) suhu seluruh sistem
     */
    async getComplianceStatus(periodStart, periodEnd) {
        const startTime = periodStart ? new Date(periodStart).getTime() : Date.now() - (7 * 24 * 60 * 60 * 1000);
        const endTime = periodEnd ? new Date(periodEnd).getTime() : Date.now();

        const allStorages = await store.getAllStorages();
        const storageCompliance = [];
        const recommendations = [];

        for (const storage of allStorages) {
            const readings = await store.getTelemetryHistory(storage.storage_id, startTime, endTime, 0);
            const batches = await store.getBatchesByStorage(storage.storage_id);
            const alertsAll = await store.getAlerts(storage.storage_id);
            const alerts = alertsAll.filter(a =>
                a.triggered_at >= startTime && a.triggered_at <= endTime
            );

            // Hitung violations
            const violations = [];
            let compliantReadings = 0;

            for (const reading of readings) {
                let isCompliant = true;
                for (const batch of batches) {
                    if (reading.temperature < batch.min_temp || reading.temperature > batch.max_temp) {
                        isCompliant = false;
                        violations.push({
                            timestamp: reading.timestamp,
                            type: 'TEMPERATURE_VIOLATION',
                            duration_minutes: 0.5, // Setiap reading ~30 detik
                            deviation_value: reading.temperature > batch.max_temp
                                ? reading.temperature - batch.max_temp
                                : batch.min_temp - reading.temperature
                        });
                        break;
                    }
                }
                if (isCompliant) compliantReadings++;
            }

            const compliancePercentage = readings.length > 0
                ? (compliantReadings / readings.length) * 100
                : 100;

            const isCompliant = compliancePercentage >= 95; // Standar: 95% compliance

            storageCompliance.push({
                storage_id: storage.storage_id,
                compliant: isCompliant,
                compliance_percentage: Math.round(compliancePercentage * 100) / 100,
                violations_count: violations.length,
                violations: violations.slice(0, 50) // Limit 50 violations untuk response
            });

            // Generate recommendations
            if (!isCompliant) {
                recommendations.push(
                    `Storage '${storage.storage_id}': Compliance ${compliancePercentage.toFixed(1)}% - perlu pengecekan sistem pendingin`
                );
            }
            if (alerts.filter(a => a.severity === 2).length > 3) {
                recommendations.push(
                    `Storage '${storage.storage_id}': ${alerts.filter(a => a.severity === 2).length} critical alerts - pertimbangkan maintenance segera`
                );
            }
        }

        const avgCompliance = storageCompliance.length > 0
            ? storageCompliance.reduce((sum, s) => sum + s.compliance_percentage, 0) / storageCompliance.length
            : 100;

        const overallCompliant = storageCompliance.every(s => s.compliant);

        if (recommendations.length === 0) {
            recommendations.push('Semua storage dalam kondisi compliant. Tidak ada tindakan yang diperlukan.');
        }

        console.log(`[ReportLogic] 📋 Compliance report generated | Overall: ${overallCompliant ? 'COMPLIANT' : 'NON-COMPLIANT'} | Avg: ${avgCompliance.toFixed(1)}%`);

        return {
            overall_compliant: overallCompliant,
            storage_compliance: storageCompliance,
            average_compliance_rate: Math.round(avgCompliance * 100) / 100,
            recommendations: recommendations
        };
    }
};

module.exports = reportLogic;
