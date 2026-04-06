/**
 * ============================================================
 *  CryoMedics - ReportService Handler (gRPC)
 * ============================================================
 *  Handler gRPC untuk ReportService:
 *  - GenerateDailyReport (Unary)
 *  - ExportCSV (Unary)
 *  - GetComplianceStatus (Unary)
 * ============================================================
 */

const reportLogic = require('../logic/reportLogic');

const reportServiceHandlers = {

    /**
     * GenerateDailyReport - Generate laporan harian
     * RPC Type: Unary
     */
    GenerateDailyReport(call, callback) {
        const { date, storage_id } = call.request;

        console.log(`\n[ReportService] 📊 GenerateDailyReport request → date: '${date}' | storage: '${storage_id || 'ALL'}'`);

        try {
            const result = reportLogic.generateDailyReport(date, storage_id);
            console.log(`[ReportService] → Report generated: ${result.storage_summaries.length} summaries | ${result.total_alerts} alerts`);
            callback(null, result);
        } catch (error) {
            console.error('[ReportService] ❌ GenerateDailyReport error:', error.message);
            callback({
                code: 13,
                message: error.message
            });
        }
    },

    /**
     * ExportCSV - Export data ke CSV/JSON
     * RPC Type: Unary
     */
    ExportCSV(call, callback) {
        const { storage_id, start_time, end_time, format } = call.request;

        console.log(`\n[ReportService] 📁 ExportCSV request → storage: '${storage_id}' | format: '${format}'`);

        try {
            const result = reportLogic.exportCSV(storage_id, start_time, end_time, format);
            callback(null, result);
        } catch (error) {
            console.error('[ReportService] ❌ ExportCSV error:', error.message);
            callback({
                code: 13,
                message: error.message
            });
        }
    },

    /**
     * GetComplianceStatus - Cek compliance status
     * RPC Type: Unary
     */
    GetComplianceStatus(call, callback) {
        const { period_start, period_end } = call.request;

        console.log(`\n[ReportService] 📋 GetComplianceStatus request → period: '${period_start}' to '${period_end}'`);

        try {
            const result = reportLogic.getComplianceStatus(period_start, period_end);
            console.log(`[ReportService] → Compliance: ${result.overall_compliant ? 'COMPLIANT ✅' : 'NON-COMPLIANT ⚠️'} | Avg: ${result.average_compliance_rate}%`);
            callback(null, result);
        } catch (error) {
            console.error('[ReportService] ❌ GetComplianceStatus error:', error.message);
            callback({
                code: 13,
                message: error.message
            });
        }
    }
};

module.exports = reportServiceHandlers;
