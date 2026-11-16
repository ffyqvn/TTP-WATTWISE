
import csv
import time
from pathlib import Path

# =====================================
# WATTWISE IoT SIMULATOR
# =====================================

# Choose your electricity dataset
DATA_FILE = Path(__file__).parent / "new_energy_data.csv"

# Number of readings to simulate
MAX_READINGS = 10

# Delay between readings (seconds)
INTERVAL = 2

print("====================================")
print("       WATTWISE IoT SIMULATOR")
print("====================================")

# Check if the dataset exists
if not DATA_FILE.exists():
    print("ERROR: Dataset not found!")
    print("Expected file:", DATA_FILE.name)
    print("Check the CSV filename in your folder.")

else:
    # Read electricity data
    with open(DATA_FILE, "r", encoding="utf-8") as file:
        readings = list(csv.DictReader(file))

    print("Dataset loaded successfully!")
    print("Total available readings:", len(readings))
    print("Starting IoT simulation...\n")

    # Simulate sensor readings
    for number, reading in enumerate(readings[:MAX_READINGS], start=1):

        print("------------------------------------")
        print("Sensor Reading:", number)
        print("Room:", reading["room_id"])
        print("Timestamp:", reading["timestamp"])
        print("Occupancy:", reading["occupancy"])
        print("Temperature:", reading["temperature_c"], "°C")
        print("Electricity Usage:", reading["power_kw"], "kW")

        if reading["is_injected_anomaly"] == "1":
            print("Simulated Event: INJECTED ANOMALY")
        else:
            print("Simulated Event: NORMAL")

        print("------------------------------------\n")

        time.sleep(INTERVAL)

    print("====================================")
    print("IoT simulation completed successfully!")
    print("====================================")
