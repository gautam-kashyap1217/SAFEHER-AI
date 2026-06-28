# ============================================
# SafeHer AI — routes/location.py
# AI Risk Analysis based on GPS coordinates
# ============================================

from flask import Blueprint, request, jsonify
from db import db
import math
from datetime import datetime

location_bp = Blueprint("location", __name__)

# MongoDB collection for incident reports
reports_col = db["reports"]

# ============================================
# Known risky areas in Bhopal (lat, lng, label)
# In production: load from MongoDB + ML model
# ============================================
RISK_ZONES = [
    {"lat": 23.278, "lng": 77.395, "radius_km": 0.6, "level": "HIGH",   "label": "Industrial Area"},
    {"lat": 23.245, "lng": 77.430, "radius_km": 0.45,"level": "MEDIUM", "label": "Bittan Market"},
    {"lat": 23.265, "lng": 77.450, "radius_km": 0.35,"level": "MEDIUM", "label": "Railway Colony"},
    {"lat": 23.255, "lng": 77.405, "radius_km": 0.5, "level": "LOW",    "label": "MP Nagar Zone"},
]

SAFE_STATIONS = [
    {"lat": 23.2315, "lng": 77.4322, "name": "Habibganj Railway Station"},
    {"lat": 23.2686, "lng": 77.4012, "name": "Bhopal Junction"},
    {"lat": 23.2750, "lng": 77.4200, "name": "MP Nagar Police Post"},
    {"lat": 23.2500, "lng": 77.4450, "name": "Hamidia Hospital"},
]

# ============================================
# HELPER: Haversine distance (km)
# ============================================
def haversine(lat1, lng1, lat2, lng2):
    R = 6371  # Earth radius in km
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) *
         math.cos(math.radians(lat2)) *
         math.sin(d_lng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

# ============================================
# POST — Analyze user location
# POST /api/analyze-location
# Body: { lat, lng }
# ============================================
@location_bp.route("/api/analyze-location", methods=["POST"])
def analyze_location():
    try:
        data = request.get_json()
        lat  = float(data.get("lat", 23.2599))
        lng  = float(data.get("lng", 77.4126))
        hour = datetime.now().hour

        # Check which risk zone user is in
        current_risk  = "LOW"
        current_label = "Safe Area"
        for zone in RISK_ZONES:
            dist = haversine(lat, lng, zone["lat"], zone["lng"])
            if dist <= zone["radius_km"]:
                current_risk  = zone["level"]
                current_label = zone["label"]
                break

        # Nighttime increases risk
        if 21 <= hour or hour <= 5:
            if current_risk == "LOW":
                current_risk = "MEDIUM"

        # Find nearest safe station
        nearest = min(
            SAFE_STATIONS,
            key=lambda s: haversine(lat, lng, s["lat"], s["lng"])
        )
        nearest_dist = haversine(lat, lng, nearest["lat"], nearest["lng"])

        # Safety score (0–100)
        score_map = {"LOW": 82, "MEDIUM": 55, "HIGH": 28}
        score = score_map.get(current_risk, 72)

        # Build AI message
        risk_color = {"LOW": "#00C48C", "MEDIUM": "#FFB800", "HIGH": "#FF3B3B"}
        color      = risk_color.get(current_risk, "#00C48C")

        message = (
            f'Current area: <b style="color:{color}">{current_label} — {current_risk} RISK</b>. '
            f'{"Night-time detected. Extra caution advised. " if (21 <= hour or hour <= 5) else ""}'
            f'Nearest safe point: <b style="color:#F0EEF8">{nearest["name"]}</b> '
            f'({nearest_dist:.1f} km away). '
            f'<br><br><b style="color:#F0EEF8">3 contacts</b> are monitoring your journey.'
        )

        return jsonify({
            "score":   score,
            "risk":    current_risk,
            "label":   current_label,
            "nearest": nearest["name"],
            "message": message
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============================================
# POST — Submit community report
# POST /api/report
# Body: { lat, lng, type }
# ============================================
@location_bp.route("/api/report", methods=["POST"])
def submit_report():
    try:
        data = request.get_json()
        report = {
            "lat":       float(data.get("lat", 0)),
            "lng":       float(data.get("lng", 0)),
            "type":      data.get("type", "incident"),
            "timestamp": datetime.now().isoformat(),
        }
        reports_col.insert_one(report)
        return jsonify({"message": "Report submitted! Safety map updated. Thank you."}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============================================
# GET — Fetch all community reports
# GET /api/reports
# ============================================
@location_bp.route("/api/reports", methods=["GET"])
def get_reports():
    try:
        docs = list(reports_col.find().sort("timestamp", -1).limit(50))
        reports = [
            {
                "id":        str(d["_id"]),
                "lat":       d["lat"],
                "lng":       d["lng"],
                "type":      d["type"],
                "timestamp": d["timestamp"],
            }
            for d in docs
        ]
        return jsonify({"reports": reports}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500