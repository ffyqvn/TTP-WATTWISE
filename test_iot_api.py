
import csv
import json
from pathlib import Path
from urllib.request import Request, urlopen

API_URL = "http://127.0.0.1:8000/receive-reading"
CSV_FILE = Path(__file__).parent / "new_energy_data.csv"

with open(CSV_FILE, "r", encoding="utf-8", newline="") as file:
    reader = csv.DictReader(file)

    for i, row in enumerate(reader):
        if i >= 5:
            break

        reading = {
            "room_id": row["room_id"],
            "room_type": row["room_type"],
            "occupancy": int(row["occupancy"]),
            "capacity": int(row["capacity"]),
            "temperature": float(row["temperature_c"]),
            "power_kw": float(row["power_kw"]),
            "is_injected_anomaly": int(row["is_injected_anomaly"])
        }

        request = Request(
            API_URL,
            data=json.dumps(reading).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        with urlopen(request, timeout=10) as response:
            result = json.load(response)
            print(f"Reading {i + 1}: {result['status']}")

print("IoT API test completed!")
