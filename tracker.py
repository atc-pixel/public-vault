import requests
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime

# --- CONFIGURATION ---
POLITICIANS = ["Barack_Obama", "Elon_Musk", "Donald_Trump", "Kamala_Harris"]
START_DATE = "20240101"  # YYYYMMDD format
END_DATE = datetime.now().strftime("%Y%m%d")

# 1. Initialize Firebase
# Make sure your downloaded JSON key is in the same folder
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

def fetch_history(article, start, end):
    """
    Asks Wikipedia for daily views between two dates.
    API: Wikimedia REST API
    """
    # We use 'user' agent to ignore bots/spiders for cleaner data
    url = f"https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/{article}/daily/{start}/{end}"
    
    # Wikipedia requires a User-Agent header
    headers = {'User-Agent': 'PoliticianTracker/1.0 (your_email@example.com)'}
    
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        return response.json().get('items', [])
    else:
        print(f"Error fetching {article}: {response.status_code}")
        return []

def upload_to_firestore(data):
    """
    Writes a batch of data to Firestore.
    Structure: Collection 'daily_stats' -> Document 'YYYYMMDD_Name'
    """
    batch = db.batch()
    counter = 0

    for day in data:
        article_name = day['article']
        date_str = day['timestamp'][:8] # Clean up date format "2024010100" -> "20240101"
        views = day['views']

        # Create a unique ID for the document
        doc_id = f"{date_str}_{article_name}"
        
        doc_ref = db.collection('daily_stats').document(doc_id)
        
        batch.set(doc_ref, {
            'name': article_name,
            'date': date_str,
            'views': views,
            'timestamp': firestore.SERVER_TIMESTAMP
        })
        
        counter += 1
        
        # Firestore batches allow max 500 writes. We commit every 400 to be safe.
        if counter >= 400:
            batch.commit()
            batch = db.batch() # Start new batch
            counter = 0
            print(f"Committed batch...")

    # Commit any leftovers
    if counter > 0:
        batch.commit()
        print("Final batch committed.")

# --- MAIN EXECUTION ---
print("🚀 Starting Time Machine...")

for person in POLITICIANS:
    print(f"Fetching history for: {person}...")
    history_data = fetch_history(person, START_DATE, END_DATE)
    
    if history_data:
        print(f"Found {len(history_data)} days of data. Uploading...")
        upload_to_firestore(history_data)
    else:
        print(f"No data found for {person}")

print("✅ Done! Check your Firebase Console.")