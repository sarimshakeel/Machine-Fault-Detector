from flask import Flask, request, jsonify, send_from_directory
import os
from flask_cors import CORS
import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor

app = Flask(__name__)
CORS(app)


df = pd.read_csv("ai4i2020.csv")

df.drop(columns=["UDI", "Product ID"], inplace=True)
df.rename(columns={
    "Air temperature [K]":      "Air_Temp",
    "Process temperature [K]":  "Process_Temp",
    "Rotational speed [rpm]":   "RPM",
    "Torque [Nm]":              "Torque",
    "Tool wear [min]":          "Tool_Wear",
    "Machine failure":          "Failure"
}, inplace=True)

df["Type_Label"] = df["Type"].map({"L": 0, "M": 1, "H": 2})

# Feature engineering
df["Temp_Diff"]         = df["Process_Temp"] - df["Air_Temp"]
df["Power"]             = df["Torque"] * (df["RPM"] * 2 * np.pi / 60)
df["Wear_Torque"]       = df["Tool_Wear"] * df["Torque"]
df["Speed_Torque_Ratio"]= df["RPM"] / (df["Torque"] + 1)

# Absolute maxima used later for per-request raw health calculation
MAX_WEAR      = df["Tool_Wear"].max()   # 253
TORQUE_MAX    = df["Torque"].max()      # 76.6
RPM_MAX       = df["RPM"].max()         # 2886
TEMP_DIFF_MAX = df["Temp_Diff"].max()   # 12.1

def _raw_health(wear, torque, rpm, temp_diff):
    return (
        0.35 * (1 - wear      / MAX_WEAR)
        + 0.25 * (1 - torque  / TORQUE_MAX)
        + 0.25 * (rpm         / RPM_MAX)
        + 0.15 * (1 - temp_diff / TEMP_DIFF_MAX)
    ) * 100

df["_health_raw"] = _raw_health(
    df["Tool_Wear"], df["Torque"], df["RPM"], df["Temp_Diff"]
)

HEALTH_P5  = df["_health_raw"].quantile(0.05)   # ≈ 31.9
HEALTH_P95 = df["_health_raw"].quantile(0.95)   # ≈ 64.0

def compute_health(wear, torque, rpm, temp_diff):
    """Return a 0-100 health score calibrated against the dataset distribution."""
    raw = _raw_health(wear, torque, rpm, temp_diff)
    scaled = (raw - HEALTH_P5) / (HEALTH_P95 - HEALTH_P5) * 100
    return float(np.clip(scaled, 0.0, 100.0))

df["Health_Score"] = df.apply(
    lambda r: compute_health(r["Tool_Wear"], r["Torque"], r["RPM"], r["Temp_Diff"]),
    axis=1
)

# Model training
NUMERIC_COLS = [
    "Air_Temp", "Process_Temp", "RPM", "Torque", "Tool_Wear",
    "Temp_Diff", "Power", "Wear_Torque", "Speed_Torque_Ratio"
]
FEATURES = NUMERIC_COLS + ["Health_Score", "Type_Label"]

X      = df[FEATURES].copy()
y_clf  = df["Failure"].copy()
y_reg  = df["Tool_Wear"].copy()

X_train, X_test, y_train, y_test, yreg_train, yreg_test = train_test_split(
    X, y_clf, y_reg,
    test_size=0.5, random_state=42, stratify=y_clf
)

scaler = MinMaxScaler()
X_train[NUMERIC_COLS] = scaler.fit_transform(X_train[NUMERIC_COLS])
X_test[NUMERIC_COLS]  = scaler.transform(X_test[NUMERIC_COLS])

clf = RandomForestClassifier(n_estimators=100, random_state=42)
clf.fit(X_train, y_train)
reg = RandomForestRegressor(n_estimators=100, random_state=42)
reg.fit(X_train, yreg_train)

# Prediction endpoint
@app.route("/predict", methods=["POST"])
def predict():
    data = request.json

    air     = float(data["air_temp"])
    process = float(data["process_temp"])
    rpm     = float(data["rpm"])
    torque  = float(data["torque"])
    wear    = float(data["tool_wear"])
    t       = {"L": 0, "M": 1, "H": 2}[data["type"]]

    # Derived features
    temp_diff  = process - air
    power      = torque * (rpm * 2 * np.pi / 60)
    wear_torque = wear * torque
    ratio      = rpm / (torque + 1)

    health = compute_health(wear, torque, rpm, temp_diff)

    input_df = pd.DataFrame(
        [[air, process, rpm, torque, wear,
          temp_diff, power, wear_torque, ratio,
          health, t]],
        columns=FEATURES
    )
    input_df[NUMERIC_COLS] = scaler.transform(input_df[NUMERIC_COLS])
    input_data = input_df[FEATURES]

    # Failure classification
    failure       = int(clf.predict(input_data)[0])
    prob          = float(clf.predict_proba(input_data)[0][1]) * 100   # 0-100 %
    predicted_wear = float(reg.predict(input_data)[0])
    predicted_wear = np.clip(predicted_wear, 0.0, MAX_WEAR)
    rul            = max(0.0, float(MAX_WEAR - predicted_wear))

    risk_score = prob + 0.3 * (100.0 - health)

    if risk_score >= 80:
        risk  = "Critical"
        alert = "Immediate Maintenance Required"
    elif risk_score >= 50:
        risk  = "High"
        alert = "Schedule Maintenance Soon"
    elif risk_score >= 25:
        risk  = "Moderate"
        alert = "Monitor Closely"
    else:
        risk  = "Low"
        alert = "Normal Operation"

    return jsonify({
        "failure_prediction":  "Failed" if failure else "Healthy",
        "failure_probability": round(prob, 2),
        "predicted_RUL":       round(rul, 1),
        "health_score":        round(health, 2),
        "risk_level":          risk,
        "alert":               alert
    })


# Static file serving
@app.route("/", methods=["GET"])
def index():
    root = os.path.abspath(os.path.dirname(__file__))
    return send_from_directory(root, "index.html")

@app.route("/<path:filename>", methods=["GET"])
def serve_file(filename):
    root = os.path.abspath(os.path.dirname(__file__))
    return send_from_directory(root, filename)

if __name__ == "__main__":
    app.run(debug=True)