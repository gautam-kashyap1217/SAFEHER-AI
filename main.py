# ============================================
# SafeHer AI — main.py
# Flask App Entry Point
# Run: python main.py
# ============================================

from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO

# Import route blueprints
from contacts import contacts_bp
from location import location_bp
from sos import sos_bp

from flask import send_from_directory
import os



# ============================================
# APP SETUP
# ============================================
app = Flask(__name__)
app.config["SECRET_KEY"] = "safeher-secret-key-2024"

# Allow requests from frontend (HTML file or localhost)
CORS(app, origins=["*"])

# WebSocket support (for live location sharing)
socketio = SocketIO(app, cors_allowed_origins="*")

# ============================================
# REGISTER BLUEPRINTS
# ============================================
app.register_blueprint(contacts_bp)
app.register_blueprint(location_bp)
app.register_blueprint(sos_bp)

# ============================================
# WEBSOCKET EVENTS
# ============================================
@socketio.on("connect")
def on_connect():
    print("Client connected via WebSocket")

@socketio.on("disconnect")
def on_disconnect():
    print("Client disconnected")

@socketio.on("location_update")
def on_location_update(data):
    """Broadcast live location to all connected contacts"""
    socketio.emit("location_broadcast", data)
    print(f"Location update: {data}")

# ============================================
# HOME ROUTE (health check)
# ============================================
@app.route("/")
def home():
    return {
        "app": "SafeHer AI",
        "status": "running",
        "version": "1.0.0"
    }

# ============================================
# RUN
# ============================================
if __name__ == "__main__":
    print("🛡️  SafeHer AI Backend starting...")
    print("📡  Server: http://localhost:5000")
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
    
from flask import send_from_directory
import os

@app.route("/")
def serve_frontend():
    return send_from_directory("../frontend", "index.html")

app = Flask(__name__, static_folder="../frontend", static_url_path="")