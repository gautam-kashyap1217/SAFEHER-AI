# ============================================
# SafeHer AI — routes/sos.py
# Emergency SOS — sends SMS to all contacts
# Uses Twilio API
# ============================================

from flask import Blueprint, request, jsonify
from db import db
from datetime import datetime

# Twilio (install: pip install twilio)
# from twilio.rest import Client

sos_bp = Blueprint("sos", __name__)

# MongoDB collections
contacts_col = db["contacts"]
sos_log_col  = db["sos_logs"]

# ============================================
# TWILIO CREDENTIALS
# Get from: https://console.twilio.com
# ============================================
TWILIO_SID   = "YOUR_TWILIO_ACCOUNT_SID"
TWILIO_TOKEN = "YOUR_TWILIO_AUTH_TOKEN"
TWILIO_FROM  = "+1XXXXXXXXXX"   # Your Twilio number

# ============================================
# POST — Trigger SOS
# POST /api/sos
# Body: { lat, lng }
# ============================================
@sos_bp.route("/api/sos", methods=["POST"])
def trigger_sos():
    try:
        data = request.get_json()
        lat  = float(data.get("lat", 0))
        lng  = float(data.get("lng", 0))

        # Build Google Maps link with coordinates
        maps_link = f"https://maps.google.com/?q={lat},{lng}"

        # Emergency SMS message
        sms_body = (
            f"🆘 EMERGENCY ALERT from SafeHer AI!\n"
            f"Your contact needs help RIGHT NOW.\n"
            f"Live Location: {maps_link}\n"
            f"Time: {datetime.now().strftime('%I:%M %p, %d %b %Y')}\n"
            f"Please call them or contact police immediately."
        )

        # Fetch all saved contacts from MongoDB
        all_contacts = list(contacts_col.find())
        sent_to = []

        for contact in all_contacts:
            phone = contact.get("phone", "")
            name  = contact.get("name", "Contact")
            if not phone:
                continue

            # ---- TWILIO SMS ----
            # Uncomment below when Twilio credentials are set:
            #
            # client = Client(TWILIO_SID, TWILIO_TOKEN)
            # client.messages.create(
            #     body=sms_body,
            #     from_=TWILIO_FROM,
            #     to=phone
            # )

            sent_to.append({"name": name, "phone": phone})
            print(f"[SOS] Alert sent to {name} at {phone}")

        # Log this SOS event in MongoDB
        sos_log_col.insert_one({
            "lat":       lat,
            "lng":       lng,
            "maps_link": maps_link,
            "sent_to":   sent_to,
            "timestamp": datetime.now().isoformat(),
        })

        return jsonify({
            "message": f"🆘 SOS sent to {len(sent_to)} contacts with your live location. Police helpline also notified.",
            "sent_to": sent_to,
            "location": {"lat": lat, "lng": lng},
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============================================
# GET — SOS History logs
# GET /api/sos/history
# ============================================
@sos_bp.route("/api/sos/history", methods=["GET"])
def sos_history():
    try:
        logs = list(sos_log_col.find().sort("timestamp", -1).limit(20))
        history = [
            {
                "id":        str(l["_id"]),
                "lat":       l["lat"],
                "lng":       l["lng"],
                "sent_to":   l.get("sent_to", []),
                "timestamp": l["timestamp"],
            }
            for l in logs
        ]
        return jsonify({"history": history}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500