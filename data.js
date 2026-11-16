/* =====================================================================
   data.js : the ONLY file you need to change to use real data.

   loadDashboardData() must return (or resolve to) an object shaped like:

   {
     isSample: false,          // true shows "sample data" in the header
     nowHour: 15,              // current hour of day, 0-23
     reductionPct: 11.4,       // % energy saved since deployment (target 15-20)
     rooms: [
       {
         name: "Lecture Hall A",
         type: "Lecture hall",     // "Hostel" | "Lecture hall" | "Tutorial room"
         occupancy: 3,             // people detected now
         capacity: 220,
         currentKw: 14.8,          // power draw now (from IoT meter)
         predictedKw: 9.6,         // model prediction for the current hour
         flagged: false,           // optional: model's anomaly decision (overrides thresholds)
         predictedHourly: [ ...24 numbers, kW ],       // model output for today
         actualHourly:    [ ...numbers up to nowHour ] // measured so far today
       }
     ]
   }
   ===================================================================== */

async function loadDashboardData() {
  // ---- STEP 1 (later): replace the sample with your real source ----
  // Example with a REST API / Firebase function / your Python model server:
  //
  //   const res = await fetch("https://your-server/api/rooms/today");
  //   const raw = await res.json();
  //   return toDashboardData(raw);
  //
  // Example with a CSV/JSON exported from your data pipeline:
  //
  //   const raw = await (await fetch("data/today.json")).json();
  //   return toDashboardData(raw);

  // today_data.js is created by export_dashboard.py and defines window.TODAY_DATA
  if (window.TODAY_DATA) return toDashboardData(window.TODAY_DATA);
  return sampleData();
}

// Convert your raw data into the shape described at the top of this file.
function toDashboardData(raw) {
  return {
    isSample: false,
    asOf: raw.asOf || "",
    nowHour: raw.nowHour ?? new Date().getHours(),
    reductionPct: raw.reductionPct ?? null,   // null = not available yet
    rooms: raw.rooms.map(r => ({
      name: r.room_name,          // <- rename these keys to match your data
      type: r.room_type,
      occupancy: r.occupancy,
      capacity: r.capacity,
      currentKw: r.power_kw,
      predictedKw: r.predicted_kw,
      flagged: !!r.flagged,     // the model's own anomaly decision
      predictedHourly: r.predicted_hourly,
      actualHourly: r.actual_hourly
    }))
  };
}

/* ---------------------------- SAMPLE DATA ----------------------------
   Delete everything below once your real data works. */

function sampleData() {
  const NOW = 15;
  const PROFILE = [.22,.2,.19,.19,.2,.24,.33,.5,.74,.9,.98,1,.97,.95,1,.96,.84,.68,.58,.62,.55,.42,.32,.26];
  const base = [
    ["Block 23 · Room 3-01","Hostel",2,4,3.4,2.1],
    ["Block 17 · Room 1-12","Hostel",4,4,2.0,2.1],
    ["Block 5 · Level 2 study","Hostel",9,12,4.1,4.3],
    ["Lecture Hall A","Lecture hall",3,220,14.8,9.6],
    ["Lecture Hall C","Lecture hall",140,200,12.2,12.5],
    ["Lecture Hall F","Lecture hall",0,150,7.9,6.9],
    ["Tutorial 5-02","Tutorial room",0,40,3.6,1.9],
    ["Tutorial 5-07","Tutorial room",28,40,3.1,3.2],
    ["Tutorial 3-04","Tutorial room",12,40,2.4,2.3]
  ];
  const rooms = base.map(([name, type, occupancy, capacity, currentKw, predictedKw]) => {
    const predictedHourly = PROFILE.map(v => +(predictedKw / PROFILE[NOW] * v).toFixed(2));
    const ratio = currentKw / predictedKw;
    const actualHourly = predictedHourly.slice(0, NOW + 1).map((v, i) => {
      const drift = i >= 11 ? 1 + (ratio - 1) * (i - 10) / 5 : 1 + Math.sin(i * 1.7) * .03;
      return +(v * drift).toFixed(2);
    });
    actualHourly[NOW] = currentKw;
    return { name, type, occupancy, capacity, currentKw, predictedKw, predictedHourly, actualHourly };
  });
  return { isSample: true, nowHour: NOW, reductionPct: 11.4, rooms };
}