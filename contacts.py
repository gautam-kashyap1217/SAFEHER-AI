# routes/contacts.py
from flask import Blueprint, request, jsonify
from pymongo import MongoClient
from bson import ObjectId

contacts_bp = Blueprint("contacts", __name__)

# Connect to MongoDB
client = MongoClient("mongodb://localhost:27017/")  # change if using Atlas
db = client["safeher"]
contacts_col = db["contacts"]

from bson import ObjectId

@contacts_bp.route("/api/contacts", methods=["GET"])
def get_contacts():
    contacts = list(contacts_col.find()) 

    for c in contacts:
        c["_id"] = str(c["_id"])
        
    print("Contacts from DB:", contacts)
    return contacts
    

@contacts_bp.route("/api/contacts", methods=["POST"])
def add_contact():
    data = request.json
    if not data.get("name") or not data.get("phone"):
        return jsonify({"error": "Name and phone required"}), 400
    contacts_col.insert_one({
        "name": data["name"],
        "phone": data["phone"],
        "relation": data.get("relation", "Contact")
    })
    return jsonify({"message": "Contact saved"}), 201

@contacts_bp.route("/api/contacts/<phone>", methods=["DELETE"])
def delete_contact(phone):
    contacts_col.delete_one({"phone": phone})
    return jsonify({"message": "Deleted"})