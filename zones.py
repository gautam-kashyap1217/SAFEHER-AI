# In main.py or routes/zones.py
@app.route("/api/danger-zones")
def danger_zones():
    zones = list(db["danger_zones"].find({}, {"_id": 0}))
    if not zones:
        zones = [
            {"name": "Industrial Area Bypass", "lat": 23.255, "lng": 77.401, "level": "HIGH", "radius": 350},
            {"name": "Bittan Market Area",     "lat": 23.231, "lng": 77.441, "level": "MED",  "radius": 300},
            {"name": "Railway Colony Rd",      "lat": 23.242, "lng": 77.431, "level": "MED",  "radius": 280},
        ]
    return jsonify(zones)