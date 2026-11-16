"""
WattWise: train an energy prediction model and an anomaly detector.
 
Run:  python train_model.py new_energy_data.csv
Needs: pip install pandas scikit-learn matplotlib joblib
"""
import sys
import joblib
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
 
CSV = sys.argv[1] if len(sys.argv) > 1 else "new_energy_data.csv"
TEST_DAYS = 6          # last 6 days are held out for testing (time-based split)
SEED = 42
 
# ---------------------------------------------------------------- STEP 1
# Load and clean the data.
df = pd.read_csv(CSV, parse_dates=["timestamp"])
df = df.sort_values(["room_id", "timestamp"]).reset_index(drop=True)
assert not df.duplicated(["timestamp", "room_id"]).any(), "duplicate readings found"
df = df.dropna()
print(f"[1] Loaded {len(df)} rows, {df.room_id.nunique()} rooms, "
      f"{df.timestamp.min().date()} to {df.timestamp.max().date()}")
 
# ---------------------------------------------------------------- STEP 2
# Create features the model can learn from.
df["hour"] = df.timestamp.dt.hour
df["dow"] = df.timestamp.dt.day_of_week            # 0 = Monday
df["is_weekend"] = (df.dow >= 5).astype(int)
df["occ_ratio"] = df.occupancy / df.capacity
# Same hour yesterday: usable for forecasting because it is already known.
df["lag_24h"] = df.groupby("room_id").power_kw.shift(24)
df = df.dropna(subset=["lag_24h"]).reset_index(drop=True)   # first day has no lag
room_dummies = pd.get_dummies(df.room_id, prefix="room").astype(int)
df = pd.concat([df, room_dummies], axis=1)
ROOM_COLS = list(room_dummies.columns)
 
# Model A: "what should power be, given who is in the room?"  -> anomaly detection
FEATS_A = ["hour", "dow", "is_weekend", "occupancy", "occ_ratio", "temperature_c"] + ROOM_COLS
# Model B: "what will power be?" without knowing future occupancy -> forecasting
FEATS_B = ["hour", "dow", "is_weekend", "lag_24h"] + ROOM_COLS
print(f"[2] Features ready. A: {len(FEATS_A)} columns, B: {len(FEATS_B)} columns")
 
# ---------------------------------------------------------------- STEP 3
# Split by TIME (never randomly). Train only on normal rows.
cut = df.timestamp.max().normalize() - pd.Timedelta(days=TEST_DAYS - 1)
train = df[(df.timestamp < cut) & (df.is_injected_anomaly == 0)]
test = df[df.timestamp >= cut]                     # keeps anomalies, so we can test detection
print(f"[3] Train: {len(train)} normal rows before {cut.date()}. Test: {len(test)} rows after.")
 
# ---------------------------------------------------------------- STEP 4
# Train. Baseline first: average power for that room, hour and weekday/weekend.
base = (train.groupby(["room_id", "hour", "is_weekend"]).power_kw.mean().rename("base"))
test = test.join(base, on=["room_id", "hour", "is_weekend"])
 
def fit(feats):
    return RandomForestRegressor(n_estimators=300, min_samples_leaf=2,
                                 random_state=SEED, n_jobs=-1).fit(train[feats], train.power_kw)
 
model_a, model_b = fit(FEATS_A), fit(FEATS_B)
test["pred_a"] = model_a.predict(test[FEATS_A])
test["pred_b"] = model_b.predict(test[FEATS_B])
 
# ---------------------------------------------------------------- STEP 5
# Evaluate on NORMAL test rows (anomalies would unfairly count as model error).
normal = test[test.is_injected_anomaly == 0]
print("[5] Prediction accuracy on unseen days (normal rows only):")
for name, col in [("Baseline (room/hour/weekend average)", "base"),
                  ("Model B (forecast, no occupancy)", "pred_b"),
                  ("Model A (with occupancy)", "pred_a")]:
    mae = mean_absolute_error(normal.power_kw, normal[col])
    r2 = r2_score(normal.power_kw, normal[col])
    print(f"    {name:40s} MAE {mae:.3f} kW   R2 {r2:.3f}")
 
# ---------------------------------------------------------------- STEP 6
# Anomaly detection: flag when actual power is far above the prediction.
def detect(margin, pred_col="pred_a"):
    return (test.power_kw > test[pred_col] * (1 + margin) + 0.3).astype(int)
 
def scores(flag):
    y = test.is_injected_anomaly
    tp = ((flag == 1) & (y == 1)).sum(); fp = ((flag == 1) & (y == 0)).sum()
    fn = ((flag == 0) & (y == 1)).sum()
    prec = tp / max(tp + fp, 1); rec = tp / max(tp + fn, 1)
    return dict(accuracy=(flag == y).mean(), precision=prec, recall=rec,
                f1=2 * prec * rec / max(prec + rec, 1e-9), tp=int(tp), fp=int(fp), fn=int(fn))
 
print(f"[6] Anomaly detection on test set ({int(test.is_injected_anomaly.sum())} real anomalies of {len(test)} rows):")
best = max(((m, scores(detect(m))) for m in np.arange(0.05, 0.8, 0.05)), key=lambda t: t[1]["f1"])
MARGIN, s = best
print(f"    Best margin: {MARGIN:.2f}  accuracy {s['accuracy']:.3f}  precision {s['precision']:.3f}  "
      f"recall {s['recall']:.3f}  F1 {s['f1']:.3f}  (caught {s['tp']}, false alarms {s['fp']}, missed {s['fn']})")
 
# ---------------------------------------------------------------- STEP 7
# Save everything and make a chart for your report.
joblib.dump({"model_a": model_a, "model_b": model_b, "feats_a": FEATS_A, "feats_b": FEATS_B,
             "margin": MARGIN, "room_cols": ROOM_COLS}, "wattwise_model.joblib")
test.assign(flagged=detect(MARGIN))[["timestamp", "room_id", "occupancy", "power_kw", "pred_a",
                                     "pred_b", "is_injected_anomaly", "flagged"]].to_csv("test_predictions.csv", index=False)
 
room = "Lecture Hall A"
r = test[test.room_id == room]
fig, ax = plt.subplots(figsize=(11, 4))
ax.plot(r.timestamp, r.power_kw, label="Actual", color="#00796B")
ax.plot(r.timestamp, r.pred_a, label="Predicted", color="#8A9A95", linestyle="--")
bad = r[r.is_injected_anomaly == 1]
ax.scatter(bad.timestamp, bad.power_kw, color="#C0392B", zorder=3, label="Injected anomaly")
ax.set_title(f"{room}: actual vs predicted power (held-out days)"); ax.set_ylabel("kW"); ax.legend()
fig.tight_layout(); fig.savefig("actual_vs_predicted.png", dpi=150)
print("[7] Saved wattwise_model.joblib, test_predictions.csv, actual_vs_predicted.png")
 