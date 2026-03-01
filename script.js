/* ═══════════════════════════════════════════════════════
   J-Impact — Gen AI Feedback Form  |  script.js
   ✅ Stores data in Google Sheets via Apps Script
   ✅ Offline-first queue — auto-resends on reconnect
   ✅ Success animation fires INSTANTLY on click
═══════════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", function () {

    /* ════════════════════════════════════════════════════
       ✏️  PASTE YOUR APPS SCRIPT WEB APP URL BELOW
       (See instructions at the bottom of this file)
    ════════════════════════════════════════════════════ */
    var GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby-Z5wqGBMJHAebqR6h25IQQYIxk4w6Y3b5iRQCDs71aRHgpFdi_bd_TKTldd78wrvm5Q/exec";

    /* ── DOM refs ── */
    var form = document.getElementById("feedbackForm");
    var submitBtn = document.getElementById("submitBtn");
    var btnText = document.getElementById("btnText");
    var spinner = document.getElementById("spinner");
    var errorMessage = document.getElementById("errorMessage");
    var submitHint = document.getElementById("submitHint");
    var successOverlay = document.getElementById("successOverlay");
    var successCloseBtn = document.getElementById("successCloseBtn");
    var confettiCont = document.getElementById("confettiContainer");

    /* ── Constants ── */
    var RATING_LABELS = {
        "1": "⭐ Poor", "2": "⭐⭐ Fair", "3": "⭐⭐⭐ Good",
        "4": "⭐⭐⭐⭐ Very Good", "5": "⭐⭐⭐⭐⭐ Excellent"
    };
    var QUESTION_NAMES = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"];
    var TEXT_FIELD_IDS = ["studentName", "rollNumber", "studentDegree"];
    var RADIO_QUESTION_NAMES = ["q2", "q3", "q4", "q5"];
    var TEXT_QUESTION_IDS = ["q1", "q6", "q7"];

    /* ── Field display names for toast messages ── */
    var FIELD_LABELS = {
        studentName: "Student Name",
        rollNumber: "Student ID / Roll Number",
        studentDegree: "Student Degree",
        q1: "Q1 – Area of Interest",
        q2: "Q2 – Trainer / Mentor",
        q3: "Q3 – Did trainer ignite interest?",
        q4: "Q4 – Lab & environment support",
        q5: "Q5 – Overall training rating",
        q6: "Q6 – Tools you will use",
        q7: "Q7 – Personal review"
    };

    /* ══════════════════════════════════════════════
       TOAST NOTIFICATION SYSTEM
    ══════════════════════════════════════════════ */
    // Create container once
    var toastContainer = document.getElementById("toastContainer");
    if (!toastContainer) {
        toastContainer = document.createElement("div");
        toastContainer.id = "toastContainer";
        document.body.appendChild(toastContainer);
    }

    function showToast(fieldKey, message, targetEl) {
        var label = FIELD_LABELS[fieldKey] || fieldKey;
        var t = document.createElement("div");
        t.className = "toast-warn";
        t.innerHTML =
            '<span class="toast-icon">⚠️</span>' +
            '<div class="toast-body">' +
            '<div class="toast-title">Required Field Missing</div>' +
            '<div class="toast-msg"><strong>' + label + '</strong><br>' + (message || 'This field cannot be empty.') + '</div>' +
            '</div>' +
            '<button class="toast-close" title="Dismiss">✕</button>' +
            '<div class="toast-progress"></div>';

        toastContainer.appendChild(t);

        // Close button
        t.querySelector(".toast-close").addEventListener("click", function () { dismissToast(t); });

        // Auto-dismiss after 4s
        var timer = setTimeout(function () { dismissToast(t); }, 4200);
        t.addEventListener("mouseenter", function () { clearTimeout(timer); });
        t.addEventListener("mouseleave", function () { timer = setTimeout(function () { dismissToast(t); }, 2000); });

        // Scroll to + pulse highlight the field
        if (targetEl) {
            var card = targetEl.closest(".question-card") || targetEl.closest(".input-group") || targetEl;
            card.classList.remove("toast-highlight"); void card.offsetWidth;
            card.classList.add("toast-highlight");
            card.addEventListener("animationend", function () { card.classList.remove("toast-highlight"); }, { once: true });
            setTimeout(function () {
                card.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 80);
        }
    }

    function dismissToast(t) {
        if (!t || !t.parentNode) return;
        t.classList.add("toast-hide");
        t.addEventListener("animationend", function () { if (t.parentNode) t.parentNode.removeChild(t); }, { once: true });
    }

    /* ═══════════════════════════════════════════════════
       OFFLINE QUEUE
    ═══════════════════════════════════════════════════ */
    var QUEUE_KEY = "jimpact_feedback_queue";
    function getQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch (e) { return []; } }
    function saveQueue(q) { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) { } }
    function enqueue(d) { var q = getQueue(); d._queued_at = new Date().toISOString(); q.push(d); saveQueue(q); }
    function dequeue(i) { var q = getQueue(); q.splice(i, 1); saveQueue(q); }

    async function sendWithRetry(data, max) {
        max = max || 3;
        for (var i = 1; i <= max; i++) {
            try {
                await fetch(GOOGLE_SCRIPT_URL, {
                    method: "POST", mode: "no-cors",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data)
                });
                return;
            } catch (err) {
                if (i < max) await new Promise(function (r) { setTimeout(r, Math.pow(2, i - 1) * 1000); });
                else throw err;
            }
        }
    }

    var flushing = false;
    async function flushQueue() {
        if (flushing || !navigator.onLine) return;
        flushing = true;
        var q = getQueue(); var sent = 0;
        for (var i = 0; i < q.length; i++) {
            try { await sendWithRetry(q[i]); dequeue(i - sent); sent++; } catch (e) { break; }
        }
        flushing = false;
    }
    window.addEventListener("online", function () { flushQueue(); });
    if (navigator.onLine) { flushQueue(); }

    /* ═══════════════════════════════════════════════════
       FORM READINESS GATE
    ═══════════════════════════════════════════════════ */
    var wasReady = false;
    function checkFormReady() {
        var ok1 = TEXT_FIELD_IDS.every(function (id) { var el = document.getElementById(id); return el && el.value.trim().length > 0; });
        var ok2 = TEXT_QUESTION_IDS.every(function (id) { var el = document.getElementById(id); return el && el.value.trim().length > 0; });
        var ok3 = RADIO_QUESTION_NAMES.every(function (n) { return !!document.querySelector('input[name="' + n + '"]:checked'); });
        var ready = ok1 && ok2 && ok3;
        submitBtn.disabled = !ready;
        submitHint.classList.toggle("hidden", ready);
        btnText.textContent = ready ? "🚀 Submit Feedback" : "Complete All Sections";
        if (ready && !wasReady) {
            submitBtn.classList.remove("unlocked-flash"); void submitBtn.offsetWidth; submitBtn.classList.add("unlocked-flash");
        }
        wasReady = ready;
    }

    submitBtn.addEventListener("click", function (e) {
        if (submitBtn.disabled) {
            e.preventDefault();
            submitBtn.classList.remove("shake"); void submitBtn.offsetWidth; submitBtn.classList.add("shake");
            submitBtn.addEventListener("animationend", function () { submitBtn.classList.remove("shake"); }, { once: true });
            // Find the FIRST unfilled field and toast it
            var firstMissing = null;
            for (var i = 0; i < TEXT_FIELD_IDS.length; i++) {
                var tf = document.getElementById(TEXT_FIELD_IDS[i]);
                if (tf && !tf.value.trim()) { firstMissing = { key: TEXT_FIELD_IDS[i], el: tf }; break; }
            }
            if (!firstMissing) {
                for (var j = 0; j < TEXT_QUESTION_IDS.length; j++) {
                    var tq = document.getElementById(TEXT_QUESTION_IDS[j]);
                    if (tq && !tq.value.trim()) { firstMissing = { key: TEXT_QUESTION_IDS[j], el: tq }; break; }
                }
            }
            if (!firstMissing) {
                for (var k = 0; k < RADIO_QUESTION_NAMES.length; k++) {
                    var rn = RADIO_QUESTION_NAMES[k];
                    if (!document.querySelector('input[name="' + rn + '"]:checked')) {
                        firstMissing = { key: rn, el: document.getElementById(rn + "-card") }; break;
                    }
                }
            }
            if (firstMissing) showToast(firstMissing.key, "You haven't filled this field yet. Please complete it.", firstMissing.el);
        }
    });

    /* ── Star rating Q5 ── */
    var q5c = document.getElementById("rating-q5");
    var q5l = document.getElementById("label-q5");
    var q5k = document.getElementById("q5-card");
    if (q5c) {
        q5c.querySelectorAll("input[type='radio']").forEach(function (r) {
            r.addEventListener("change", function () {
                if (q5l) q5l.textContent = RATING_LABELS[r.value] || "";
                if (q5k) { q5k.classList.add("answered"); q5k.classList.remove("missing"); }
                clearError("err-q5"); checkFormReady();
            });
        });
    }

    ["q2", "q3", "q4"].forEach(function (n) {
        var card = document.getElementById(n + "-card");
        document.querySelectorAll('input[name="' + n + '"]').forEach(function (r) {
            r.addEventListener("change", function () {
                if (card) { card.classList.add("answered"); card.classList.remove("missing"); }
                clearError("err-" + n); checkFormReady();
            });
        });
    });

    TEXT_FIELD_IDS.concat(TEXT_QUESTION_IDS).forEach(function (id) {
        var el = document.getElementById(id); if (!el) return;
        el.addEventListener("input", function () { clearMissing(id, false); checkFormReady(); });
        el.addEventListener("change", function () { clearMissing(id, false); checkFormReady(); });
    });

    /* ── Validation ── */
    function showError(id, msg) { var el = document.getElementById(id); if (el) el.textContent = msg; }
    function clearError(id) { var el = document.getElementById(id); if (el) el.textContent = ""; }
    function markInput(el, v) { el.classList.toggle("valid", v); el.classList.toggle("invalid", !v); }

    /* ── Missing-field visual marker ── */
    function markMissing(idOrName, isCard) {
        if (isCard) {
            var card = document.getElementById(idOrName + "-card");
            if (card) card.classList.add("missing");
        } else {
            var el = document.getElementById(idOrName);
            if (!el) return;
            var grp = el.closest(".input-group");
            if (grp) grp.classList.add("missing");
        }
    }
    function clearMissing(idOrName, isCard) {
        if (isCard) {
            var card = document.getElementById(idOrName + "-card");
            if (card) { card.classList.remove("missing"); }
        } else {
            var el = document.getElementById(idOrName);
            if (!el) return;
            var grp = el.closest(".input-group");
            if (grp) grp.classList.remove("missing");
        }
    }

    var validations = {
        studentName: { fn: function (v) { return v.trim().length >= 2; }, msg: "Enter your full name (min 2 chars)." },
        rollNumber: { fn: function (v) { return v.trim().length >= 3; }, msg: "Enter a valid Student ID." },
        studentDegree: { fn: function (v) { return v.trim().length > 0; }, msg: "Please select your degree." },
        q1: { fn: function (v) { return v.trim().length >= 2; }, msg: "Enter your area of interest." },
        q6: { fn: function (v) { return v.trim().length >= 2; }, msg: "Enter tools you plan to use." },
        q7: { fn: function (v) { return v.trim().length >= 5; }, msg: "Write a brief review (min 5 chars)." }
    };

    Object.keys(validations).forEach(function (id) {
        var rule = validations[id]; var el = document.getElementById(id); if (!el) return;
        el.addEventListener("blur", function () {
            if (!el.value.trim()) { markInput(el, false); showError("err-" + id, "This field is required."); return; }
            var ok = rule.fn(el.value); markInput(el, ok); showError("err-" + id, ok ? "" : rule.msg);
        });
        el.addEventListener("input", function () {
            if (el.classList.contains("invalid")) { var ok = rule.fn(el.value); markInput(el, ok); showError("err-" + id, ok ? "" : rule.msg); }
        });
    });

    /* ── Confetti ── */
    var CC = ["#10b981", "#34d399", "#6ee7b7", "#f59e0b", "#fbbf24", "#fde68a",
        "#6366f1", "#a78bfa", "#ec4899", "#f472b6", "#0ea5e9", "#38bdf8", "#c9a84c", "#fff"];
    function launchConfetti() {
        if (!confettiCont) return; confettiCont.innerHTML = "";
        for (var i = 0; i < 130; i++) {
            var p = document.createElement("div"); p.className = "confetti-piece";
            var s = Math.random() * 12 + 6;
            var c = CC[Math.floor(Math.random() * CC.length)];
            var t = Math.random();
            var br, w, h;
            if (t < 0.35) { br = "3px"; w = s; h = (s * (0.5 + Math.random() * 0.8)).toFixed(1); }
            else if (t < 0.65) { br = "50%"; w = s; h = s; }
            else if (t < 0.85) { br = "2px"; w = (s * 0.35).toFixed(1); h = (s * 2.5).toFixed(1); }
            else { br = "1px"; w = (s * 1.8).toFixed(1); h = (s * 0.4).toFixed(1); }
            p.style.cssText = "left:" + (Math.random() * 112 - 6) + "%;" +
                "top:-" + (Math.random() * 30) + "px;" +
                "width:" + w + "px;height:" + h + "px;background:" + c + ";" +
                "border-radius:" + br + ";opacity:0;" +
                "--dur:" + (Math.random() * 2.5 + 2.8).toFixed(2) + "s;" +
                "--delay:" + (Math.random() * 1.4).toFixed(2) + "s;";
            confettiCont.appendChild(p);
        }
        setTimeout(function () { if (confettiCont) confettiCont.innerHTML = ""; }, 7000);
    }

    /* ── Success overlay ── */
    function showSuccessOverlay() {
        if (!successOverlay) return;
        successOverlay.classList.remove("hidden");
        successOverlay.querySelectorAll(".check-circle,.check-tick").forEach(function (el) {
            el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
        });
        var card = document.getElementById("successCard");
        if (card) { card.style.animation = "none"; void card.offsetWidth; card.style.animation = ""; }
        launchConfetti();
        document.body.style.overflow = "hidden";
    }
    function hideSuccessOverlay() { if (successOverlay) successOverlay.classList.add("hidden"); document.body.style.overflow = ""; }

    if (successCloseBtn) {
        successCloseBtn.addEventListener("click", function () {
            hideSuccessOverlay(); form.reset();
            QUESTION_NAMES.forEach(function (n) {
                var l = document.getElementById("label-" + n); var c = document.getElementById(n + "-card");
                if (l) l.textContent = ""; if (c) c.classList.remove("answered");
            });
            Object.keys(validations).forEach(function (id) {
                var el = document.getElementById(id);
                if (el) { el.classList.remove("valid", "invalid"); clearError("err-" + id); }
            });
            checkFormReady();
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    /* ═══════════════════════════════════════════════════
       SUBMIT — Save first, show success instantly,
                send to Google Sheets in background
    ═══════════════════════════════════════════════════ */
    form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (errorMessage) errorMessage.classList.add("hidden");

        /* Validate — show toast for EACH missing field */
        var hasErrors = false;
        var firstErrorEl = null;

        Object.keys(validations).forEach(function (id) {
            var rule = validations[id]; var el = document.getElementById(id); if (!el) return;
            if (!el.value.trim()) {
                markInput(el, false);
                showError("err-" + id, "This field is required.");
                showToast(id, "You haven't filled this field yet. Please complete it to submit.", el);
                markMissing(id, false);
                if (!firstErrorEl) firstErrorEl = el;
                hasErrors = true;
            } else if (!rule.fn(el.value)) {
                markInput(el, false);
                showError("err-" + id, rule.msg);
                showToast(id, rule.msg, el);
                markMissing(id, false);
                if (!firstErrorEl) firstErrorEl = el;
                hasErrors = true;
            }
        });

        RADIO_QUESTION_NAMES.forEach(function (n) {
            if (!document.querySelector('input[name="' + n + '"]:checked')) {
                showError("err-" + n, "Please select an option.");
                var card = document.getElementById(n + "-card");
                showToast(n, "Please choose one of the options to continue.", card);
                markMissing(n, true);
                if (!firstErrorEl) firstErrorEl = card;
                hasErrors = true;
            }
        });

        if (hasErrors) {
            if (firstErrorEl) {
                setTimeout(function () {
                    firstErrorEl.scrollIntoView({ behavior: "smooth", block: "center" });
                }, 100);
            }
            return;
        }

        /* All good — clear any leftover missing marks */
        document.querySelectorAll(".missing").forEach(function (el) { el.classList.remove("missing"); });

        /* Build payload — keys match Apps Script FIELD_KEYS exactly */
        var data = {
            timestamp: new Date().toISOString(),
            studentName: document.getElementById("studentName").value.trim(),
            rollNumber: document.getElementById("rollNumber").value.trim(),
            studentDegree: document.getElementById("studentDegree").value.trim()
        };
        QUESTION_NAMES.forEach(function (n) {
            var r = document.querySelector('input[name="' + n + '"]:checked');
            if (r) { data[n] = r.value; } else { var t = document.getElementById(n); if (t) data[n] = t.value.trim(); }
        });

        /* 1. Save to queue (crash-safe) */
        enqueue(data);

        /* 2. Show SUCCESS + CONFETTI immediately */
        showSuccessOverlay();

        /* 3. Send to Google Sheets silently in background */
        if (GOOGLE_SCRIPT_URL.indexOf("YOUR_SCRIPT_ID") === -1) {
            sendWithRetry(data, 3)
                .then(function () { var q = getQueue(); var i = q.findIndex(function (x) { return x._queued_at === data._queued_at; }); if (i !== -1) dequeue(i); })
                .catch(function (err) { console.warn("Send failed — queued for auto-retry:", err); });
        }
    });

    checkFormReady();

    /*
    ════════════════════════════════════════════════════
    HOW TO ACTIVATE GOOGLE SHEETS STORAGE
    ════════════════════════════════════════════════════
    1. Open your Google Sheet:
       https://docs.google.com/spreadsheets/d/1edrbqxLk8nGtuYMdfj-v69qdGZ-fTsMUPFHMEGqJbwE/edit

    2. Go to: Extensions → Apps Script

    3. Delete everything and paste the code from:
       google_apps_script.js.txt  (in the brain folder)

    4. Click Save (💾), then Deploy → New Deployment
       - Type: Web App
       - Execute as: Me
       - Who has access: Anyone
       - Click Deploy

    5. Copy the Web App URL

    6. Paste it above on line 15 replacing "YOUR_SCRIPT_ID"
    ════════════════════════════════════════════════════
    */
});
