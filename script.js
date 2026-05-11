/**
 * Machine Fault Prediction System — script.js
 * Connects to Flask backend at http://localhost:5000/predict
 */

const API_URL = "http://localhost:5000/predict";

// ── DOM refs ──────────────────────────────────────────────────
const form          = document.getElementById("predictForm");
const predictBtn    = document.getElementById("predictBtn");
const validationMsg = document.getElementById("validationMsg");

const outputPlaceholder = document.getElementById("outputPlaceholder");
const outputContent     = document.getElementById("outputContent");
const outputError       = document.getElementById("outputError");

const verdictBadge = document.getElementById("verdictBadge");
const verdictIcon  = document.getElementById("verdictIcon");
const verdictLabel = document.getElementById("verdictLabel");
const alertChip    = document.getElementById("alertChip");

const probValue  = document.getElementById("probValue");
const probBar    = document.getElementById("probBar");
const healthValue = document.getElementById("healthValue");
const healthBar  = document.getElementById("healthBar");
const rulValue   = document.getElementById("rulValue");
const riskBadge  = document.getElementById("riskBadge");

const riskSegments = document.querySelectorAll(".seg");

// ── Validation ────────────────────────────────────────────────
function validateInputs(data) {
  const errors = [];

  if (data.air_temp === "" || isNaN(Number(data.air_temp))) {
    errors.push("Air Temperature is required.");
  }
  if (data.process_temp === "" || isNaN(Number(data.process_temp))) {
    errors.push("Process Temperature is required.");
  }
  if (data.rpm === "" || isNaN(Number(data.rpm))) {
    errors.push("RPM is required.");
  }
  if (data.torque === "" || isNaN(Number(data.torque))) {
    errors.push("Torque is required.");
  }
  if (data.tool_wear === "" || isNaN(Number(data.tool_wear)) || Number(data.tool_wear) < 0) {
    errors.push("Tool Wear must be a non-negative number.");
  }
  if (!data.type) {
    errors.push("Machine Type must be selected.");
  }

  return errors;
}

// ── UI helpers ────────────────────────────────────────────────
function setLoading(isLoading) {
  predictBtn.disabled = isLoading;
  predictBtn.classList.toggle("loading", isLoading);
}

function showState(state) {
  // state: "placeholder" | "content" | "error"
  outputPlaceholder.hidden = state !== "placeholder";
  outputContent.hidden     = state !== "content";
  outputError.hidden       = state !== "error";
}

function animateBar(barEl, pct, delayMs = 100) {
  // Reset to 0 first for re-animation
  barEl.style.transition = "none";
  barEl.style.width = "0%";
  requestAnimationFrame(() => {
    setTimeout(() => {
      barEl.style.transition = "width 1s cubic-bezier(0.4, 0, 0.2, 1)";
      barEl.style.width = Math.min(100, Math.max(0, pct)) + "%";
    }, delayMs);
  });
}

function renderRisk(level) {
  const map = { Low: "low", Moderate: "moderate", High: "high", Critical: "critical" };
  const cls = map[level] || "low";

  // Clear old classes
  riskBadge.className = "risk-badge";
  riskBadge.classList.add(cls);
  riskBadge.textContent = level;

  // Highlight segments up to current level
  const order = ["Low", "Moderate", "High", "Critical"];
  const activeUpTo = order.indexOf(level);

  riskSegments.forEach((seg, i) => {
    seg.classList.toggle("active", i <= activeUpTo);
  });
}

function renderResults(result) {
  const isFailure = result.failure_prediction === "Failed";

  // Verdict badge
  verdictBadge.className = "verdict-badge " + (isFailure ? "failed" : "healthy");
  verdictIcon.textContent = isFailure ? "✕" : "✓";
  verdictLabel.textContent = result.failure_prediction;

  // Alert chip
  alertChip.textContent = result.alert;

  // Failure probability bar
  probValue.textContent = result.failure_probability.toFixed(1) + "%";
  animateBar(probBar, result.failure_probability, 80);

  // Health score bar
  healthValue.textContent = result.health_score.toFixed(1) + "%";
  animateBar(healthBar, result.health_score, 80);

  // RUL
  rulValue.textContent = result.predicted_RUL.toFixed(1) + " min";

  // Risk level
  renderRisk(result.risk_level);

  // Force re-animation of metric cards by cloning
  const metricsGrid = document.querySelector(".metrics-grid");
  metricsGrid.querySelectorAll(".metric-card").forEach((card, i) => {
    card.style.animation = "none";
    void card.offsetWidth; // reflow
    card.style.animation = "";
    card.style.animationDelay = (0.05 + i * 0.05) + "s";
  });

  showState("content");
}

// ── Main handler ──────────────────────────────────────────────
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Clear previous validation
  validationMsg.textContent = "";
  document.querySelectorAll(".form-group input, .form-group select").forEach(el => {
    el.classList.remove("invalid");
  });

  // Collect raw values (strings from form)
  const rawData = {
    air_temp:    document.getElementById("air").value.trim(),
    process_temp: document.getElementById("process").value.trim(),
    rpm:         document.getElementById("rpm").value.trim(),
    torque:      document.getElementById("torque").value.trim(),
    tool_wear:   document.getElementById("wear").value.trim(),
    type:        document.getElementById("type").value
  };

  // Validate
  const errors = validateInputs(rawData);
  if (errors.length > 0) {
    validationMsg.textContent = errors[0];

    // Highlight invalid fields
    const fieldMap = {
      air_temp:     "air",
      process_temp: "process",
      rpm:          "rpm",
      torque:       "torque",
      tool_wear:    "wear",
      type:         "type"
    };
    for (const [key, id] of Object.entries(fieldMap)) {
      if (
        rawData[key] === "" ||
        (key !== "type" && isNaN(Number(rawData[key]))) ||
        (key === "tool_wear" && Number(rawData[key]) < 0) ||
        (key === "type" && !rawData[key])
      ) {
        document.getElementById(id)?.classList.add("invalid");
      }
    }
    return;
  }

  // Build payload with numeric conversions (type stays as string "L"/"M"/"H")
  const payload = {
    air_temp:     Number(rawData.air_temp),
    process_temp: Number(rawData.process_temp),
    rpm:          Number(rawData.rpm),
    torque:       Number(rawData.torque),
    tool_wear:    Number(rawData.tool_wear),
    type:         rawData.type
  };

  setLoading(true);
  showState("placeholder"); // keep showing placeholder while loading

  try {
    const response = await fetch(API_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    renderResults(result);

  } catch (err) {
    console.error("Prediction error:", err);
    showState("error");
  } finally {
    setLoading(false);
  }
});

// Clear invalid styling on input change
document.querySelectorAll(".form-group input, .form-group select").forEach(el => {
  el.addEventListener("input", () => {
    el.classList.remove("invalid");
    validationMsg.textContent = "";
  });
});
