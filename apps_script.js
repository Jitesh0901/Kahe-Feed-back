// ═══════════════════════════════════════════════════════
//  KAHE — Gen AI Feedback System  |  Code.gs
//
//  MULTI-USER SAFE: Uses LockService to queue concurrent
//  submissions so no data is ever lost or overwritten.
//
//  SETUP (one-time):
//  1. Google Sheet → Extensions → Apps Script
//  2. Paste this entire file into Code.gs
//  3. Deploy → New Deployment → Web App
//       Execute as : Me
//       Who has access : Anyone
//  4. Copy the /exec URL → paste into script.js as GOOGLE_SCRIPT_URL
// ═══════════════════════════════════════════════════════

const SHEET_NAME = "FeedbackData";

const HEADERS = [
    "Timestamp",
    "Student Name",
    "Roll Number",
    "Mobile Number",
    "College / Institution",
    "Q1 – Overall Quality",
    "Q2 – Course Content",
    "Q3 – Teaching Style",
    "Q4 – Practical Sessions",
    "Q5 – Industry Relevance",
    "Q6 – Study Materials",
    "Q7 – Pace & Duration",
    "Q8 – GenAI Understanding",
    "Q9 – Support & Mentoring",
    "Q10 – Recommendation",
    "Comments"
];

/* ─── Auto-create + style headers (runs once) ─── */
function ensureHeaders(sheet) {
    if (sheet.getLastRow() === 0) {
        sheet.appendRow(HEADERS);

        const range = sheet.getRange(1, 1, 1, HEADERS.length);
        range.setFontWeight("bold")
            .setBackground("#1a1a2e")
            .setFontColor("#ffffff")
            .setHorizontalAlignment("center")
            .setWrap(true);

        sheet.setFrozenRows(1);
        sheet.setRowHeight(1, 40);

        // Column widths
        sheet.setColumnWidth(1, 180);  // Timestamp
        sheet.setColumnWidth(2, 180);  // Student Name
        sheet.setColumnWidth(3, 130);  // Roll Number
        sheet.setColumnWidth(4, 140);  // Mobile
        sheet.setColumnWidth(5, 220);  // College
        for (let c = 6; c <= 15; c++) sheet.setColumnWidth(c, 90);   // Q1–Q10
        sheet.setColumnWidth(16, 320); // Comments
    }
}

/* ─── Zebra-stripe a newly added data row ─── */
function stripeRow(sheet) {
    const row = sheet.getLastRow();
    if (row > 1 && row % 2 === 0) {
        sheet.getRange(row, 1, 1, HEADERS.length)
            .setBackground("#f0f4ff");
    }
}

/* ═══════════════════════════════════════════
   doPost  —  called on every form submission
   THREAD-SAFE via LockService
═══════════════════════════════════════════ */
function doPost(e) {

    // ── Acquire a script-level lock (waits up to 10 s) ──
    // This guarantees that if 100 students submit at once,
    // each write is queued and completes without collisions.
    const lock = LockService.getScriptLock();

    try {
        lock.waitLock(10000); // wait up to 10 seconds to acquire lock
    } catch (lockErr) {
        // Could not acquire lock — server is under heavy load
        return ContentService
            .createTextOutput(JSON.stringify({
                status: "error",
                message: "Server busy. Please try again in a moment."
            }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    try {
        // ── Open / create sheet ──
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        let sheet = ss.getSheetByName(SHEET_NAME);
        if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

        ensureHeaders(sheet);

        // ── Parse JSON payload ──
        let data = {};
        if (e && e.postData && e.postData.type === "application/json") {
            data = JSON.parse(e.postData.contents);
        } else if (e && e.parameter) {
            data = e.parameter;
        }

        // ── Build row (order = HEADERS) ──
        const rowData = [
            new Date(),                  // Timestamp — server-side (tamper-proof)
            data.studentName || "",
            data.rollNumber || "",
            data.mobileNumber || "",
            data.college || "",
            Number(data.q1) || "",
            Number(data.q2) || "",
            Number(data.q3) || "",
            Number(data.q4) || "",
            Number(data.q5) || "",
            Number(data.q6) || "",
            Number(data.q7) || "",
            Number(data.q8) || "",
            Number(data.q9) || "",
            Number(data.q10) || "",
            data.comments || ""
        ];

        // ── Append row (atomic inside the lock) ──
        sheet.appendRow(rowData);
        stripeRow(sheet);

        // Flush all pending Spreadsheet changes before releasing lock
        SpreadsheetApp.flush();

        return ContentService
            .createTextOutput(JSON.stringify({
                status: "success",
                message: "Feedback saved successfully."
            }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
        Logger.log("doPost error: " + err.toString());
        return ContentService
            .createTextOutput(JSON.stringify({
                status: "error",
                message: err.toString()
            }))
            .setMimeType(ContentService.MimeType.JSON);

    } finally {
        // ── ALWAYS release the lock so the next request can proceed ──
        lock.releaseLock();
    }
}

/* ─── GET: quick health-check in browser ─── */
function doGet(e) {
    return ContentService
        .createTextOutput(JSON.stringify({
            status: "ok",
            message: "KAHE Feedback endpoint is live.",
            sheet: SHEET_NAME,
            columns: HEADERS.length
        }))
        .setMimeType(ContentService.MimeType.JSON);
}
