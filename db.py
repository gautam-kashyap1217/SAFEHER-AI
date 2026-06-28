# ============================================
# SafeHer AI — db.py
# MongoDB Connection using PyMongo
#
# HOW TO SETUP MONGODB:
# ============================================
# OPTION 1 — MongoDB Atlas (Cloud, Recommended):
#   1. Go to https://cloud.mongodb.com
#   2. Create free account → Create cluster
#   3. Click "Connect" → "Python" → Copy URI
#   4. Replace MONGO_URI below with your URI
#
# OPTION 2 — Local MongoDB:
#   1. Install: https://www.mongodb.com/try/download/community
#   2. Start: mongod --dbpath C:/data/db  (Windows)
#             mongod                       (Mac/Linux)
#   3. Use URI: mongodb://localhost:27017
#
# INSTALL PyMongo:
#   pip install pymongo
#   pip install pymongo[srv]   ← needed for Atlas URI
# ============================================

from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

# ============================================
# YOUR MONGODB URI — Replace this!
# ============================================
# Atlas (cloud):
# MONGO_URI = "mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority"

# Local:
MONGO_URI = "mongodb://localhost:27017"

DATABASE_NAME = "safeher_db"

# ============================================
# Connect to MongoDB
# ============================================
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    # Test connection
    client.admin.command("ping")
    db = client[DATABASE_NAME]
    print(f"✅ MongoDB connected: {DATABASE_NAME}")
except ConnectionFailure as e:
    print(f"❌ MongoDB connection failed: {e}")
    print("   Check MONGO_URI in db.py")
    db = None

# ============================================
# Collections used in SafeHer AI:
# ============================================
# db["contacts"]   → Emergency contacts
# db["reports"]    → Community incident reports
# db["sos_logs"]   → SOS event history
# db["users"]      → User profiles (future)
# ============================================