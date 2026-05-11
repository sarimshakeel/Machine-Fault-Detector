# 🔧 Machine Fault Prediction System

A real-time predictive maintenance dashboard powered by machine learning. Input live sensor readings and get instant failure probability, health score, risk level, and remaining useful life (RUL) estimates — all served through a clean, dark-themed web UI.

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.1-000000?style=flat-square&logo=flask&logoColor=white)
![scikit-learn](https://img.shields.io/badge/scikit--learn-1.8-F7931E?style=flat-square&logo=scikit-learn&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

---

## 📸 Preview

> Input machine parameters → get a live health assessment with failure probability, RUL, and risk level.

---

## ✨ Features

- **Failure Classification** — RandomForest model predicts machine failure (Healthy / Failed)
- **Health Score** — Composite 0–100% metric weighted across tool wear, torque, RPM, and temperature
- **Remaining Useful Life (RUL)** — Estimated minutes of operation left before failure
- **Risk Levels** — Four-tier system: Low → Moderate → High → Critical
- **Live UI** — Animated progress bars, risk gauge, and real-time API calls
- **No data leakage** — Scaler fit only on training split (50/50 stratified)

---

## 🏗️ Architecture

```
┌─────────────────────┐        POST /predict        ┌──────────────────────────┐
│   Frontend          │ ─────────────────────────► │   Flask Backend          │
│   index.html        │                             │   app.py                 │
│   script.js         │ ◄───────────────────────── │                          │
│   styles.css        │        JSON response        │   RandomForestClassifier │
└─────────────────────┘                             │   RandomForestRegressor  │
                                                    │   MinMaxScaler           │
                                                    └──────────────────────────┘
```

---

## 📂 Project Structure

```
Fault Detection/
├── app.py              # Flask API + model training
├── index.html          # Dashboard UI
├── script.js           # Frontend logic & API calls
├── styles.css          # Dark industrial theme
├── ai4i2020.csv        # AI4I 2020 Predictive Maintenance Dataset
├── requirements.txt    # Python dependencies
├── test_direct.py      # Direct model tests (no HTTP)
├── test_api.py         # API integration tests
└── evaluate.py         # Classification metrics
```

---

## 🚀 Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/sarimshakeel/machine-fault-predictor.git
cd machine-fault-predictor
```

### 2. Set up a virtual environment

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Add the dataset

Download the [AI4I 2020 Predictive Maintenance Dataset](https://archive.ics.uci.edu/dataset/601/ai4i+2020+predictive+maintenance+dataset) and place `ai4i2020.csv` in the project root.

### 5. Run the server

```bash
python app.py
```

Then open **http://127.0.0.1:5000** in your browser.

---

## 🧠 Model Details

### Features (11 total)

| Feature | Description |
|---|---|
| `Air_Temp` | Air temperature [K] |
| `Process_Temp` | Process temperature [K] |
| `RPM` | Rotational speed |
| `Torque` | Torque [Nm] |
| `Tool_Wear` | Accumulated tool wear [min] |
| `Temp_Diff` | `Process_Temp − Air_Temp` |
| `Power` | `Torque × angular_velocity` |
| `Wear_Torque` | `Tool_Wear × Torque` |
| `Speed_Torque_Ratio` | `RPM / (Torque + 1)` |
| `Health_Score` | Composite health metric (see below) |
| `Type_Label` | Machine variant encoded (L=0, M=1, H=2) |

### Health Score Formula

```
Health = (
  0.35 × (1 − tool_wear / max_wear)       ← most critical
  0.25 × (1 − torque / max_torque)
  0.25 × (rpm / max_rpm)
  0.15 × (1 − temp_diff / max_temp_diff)
) × 100
```

The raw score is then calibrated against the dataset's P5–P95 range and clipped to [0, 100].

### Risk Classification

| Risk Level | Condition |
|---|---|
| 🟢 **Low** | `risk_score < 25` |
| 🟡 **Moderate** | `25 ≤ risk_score < 50` |
| 🟠 **High** | `50 ≤ risk_score < 80` |
| 🔴 **Critical** | `risk_score ≥ 80` |

Where `risk_score = failure_prob + 0.3 × (100 − health_score)`.

---

## 📡 API Reference

### `POST /predict`

**Request body:**

```json
{
  "air_temp": 298.1,
  "process_temp": 308.6,
  "rpm": 1551,
  "torque": 42.8,
  "tool_wear": 108,
  "type": "M"
}
```

**Response:**

```json
{
  "failure_prediction": "Healthy",
  "failure_probability": 3.5,
  "health_score": 61.2,
  "predicted_RUL": 145.0,
  "risk_level": "Moderate",
  "alert": "Monitor Closely"
}
```

---

## 🧪 Example Inputs by Risk Level

<details>
<summary><strong>🔴 Critical</strong> — Failure Prob: 86%, Health: 0%, RUL: 23 min</summary>

```json
{ "air_temp": 320, "process_temp": 350, "rpm": 3000, "torque": 100, "tool_wear": 230, "type": "H" }
```
</details>

<details>
<summary><strong>🟠 High</strong> — Failure Prob: 88%, Health: 28.6%, RUL: 73 min</summary>

```json
{ "air_temp": 308, "process_temp": 320, "rpm": 3000, "torque": 100, "tool_wear": 180, "type": "H" }
```
</details>

<details>
<summary><strong>🟡 Moderate</strong> — Failure Prob: 1%, Health: 49.3%, RUL: 203 min</summary>

```json
{ "air_temp": 295, "process_temp": 305, "rpm": 1200, "torque": 60, "tool_wear": 50, "type": "M" }
```
</details>

<details>
<summary><strong>🟢 Low</strong> — Failure Prob: 1%, Health: 66%, RUL: ~250 min</summary>

```json
{ "air_temp": 293, "process_temp": 300, "rpm": 1500, "torque": 40, "tool_wear": 2, "type": "M" }
```
</details>

---

## 📦 Dependencies

```
flask==3.1.3
flask-cors==6.0.2
pandas==3.0.2
numpy==2.4.4
scikit-learn==1.8.0
```

---

## 🛣️ Roadmap

- [ ] Persist trained models with `joblib` (skip retraining on startup)
- [ ] Model metrics dashboard (accuracy, F1, confusion matrix)
- [ ] FastAPI migration for async performance
- [ ] Time-series RUL prediction
- [ ] Production deployment with Gunicorn + Nginx
- [ ] Docker support

---

## 📄 License

MIT — free to use, modify, and distribute.

---

## 🙏 Acknowledgements

- Dataset: [AI4I 2020 Predictive Maintenance Dataset](https://archive.ics.uci.edu/dataset/601/ai4i+2020+predictive+maintenance+dataset) — UCI Machine Learning Repository
- Built with [Flask](https://flask.palletsprojects.com/), [scikit-learn](https://scikit-learn.org/), and vanilla JS
