import os
from datetime import datetime

import firebase_admin
import requests
from firebase_admin import credentials, firestore

# --- CONFIGURATION ---
POLITICIANS = ["Barack_Obama", "Elon_Musk", "Donald_Trump", "Kamala_Harris"]
START_DATE = "20240101"  # YYYYMMDD format
END_DATE = datetime.now().strftime("%Y%m%d")
WIKIMEDIA_CONTACT = os.environ.get("WIKIMEDIA_CONTACT", "caglayantalha@gmail.com")

# 1. Initialize Firebase
# Make sure your downloaded JSON key is in the same folder or set GOOGLE_APPLICATION_CREDENTIALS.
SERVICE_ACCOUNT_PATH = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "serviceAccountKey.json")
cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
firebase_admin.initialize_app(cred)
db = firestore.client()


def calculate_percent_changes(history):
    """Annotate each day with percent change versus the previous day.

    If the previous day's views are 0 or missing, the percent change is set to None.
    The incoming history list is expected in chronological order but will be sorted
    defensively by timestamp.
    """

    sorted_history = sorted(history, key=lambda entry: entry["timestamp"])
    previous_views = None
    annotated = []

    for day in sorted_history:
        current_views = day["views"]

        if previous_views not in (None, 0):
            percent_change = ((current_views - previous_views) / previous_views) * 100
        else:
            percent_change = None

        annotated.append(
            {
                "article": day["article"],
                "date": day["timestamp"][:8],  # "2024010100" -> "20240101"
                "views": current_views,
                "percent_change": percent_change,
            }
        )

        previous_views = current_views

    return annotated


def fetch_history(article, start, end):
    """Asks Wikipedia for daily views between two dates using the REST API."""

    url = (
        "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
        f"en.wikipedia/all-access/user/{article}/daily/{start}/{end}"
    )

    headers = {"User-Agent": f"PoliticianTracker/1.0 ({WIKIMEDIA_CONTACT})"}

    try:
        response = requests.get(url, headers=headers, timeout=15)
    except requests.RequestException as exc:  # noqa: PERF203 safe here for observability
        print(f"Network error fetching {article}: {exc}")
        return []

    if response.status_code == 200:
        return response.json().get("items", [])

    print(f"Error fetching {article}: {response.status_code} {response.text}")
    return []


def upload_to_firestore(data):
    """Writes a batch of data to Firestore.

    Structure: Collection 'daily_stats' -> Document 'YYYYMMDD_Name'
    """

    batch = db.batch()
    counter = 0

    for day in data:
        article_name = day["article"]
        date_str = day["date"]
        views = day["views"]

        # Create a unique ID for the document
        doc_id = f"{date_str}_{article_name}"

        doc_ref = db.collection("daily_stats").document(doc_id)

        batch.set(
            doc_ref,
            {
                "name": article_name,
                "date": date_str,
                "views": views,
                "percent_change": day["percent_change"],
                "timestamp": firestore.SERVER_TIMESTAMP,
            },
        )

        counter += 1

        # Firestore batches allow max 500 writes. We commit every 400 to be safe.
        if counter >= 400:
            batch.commit()
            batch = db.batch()  # Start new batch
            counter = 0
            print("Committed batch...")

    # Commit any leftovers
    if counter > 0:
        batch.commit()
        print("Final batch committed.")


def main():
    print("🚀 Starting Time Machine...")

    if WIKIMEDIA_CONTACT == "caglayantalha@gmail.com":
        print(
            "⚠️  Set WIKIMEDIA_CONTACT to a real email or URL for Wikimedia API politeness."
        )

    for person in POLITICIANS:
        print(f"Fetching history for: {person}...")
        history_data = fetch_history(person, START_DATE, END_DATE)

        if history_data:
            print(
                f"Found {len(history_data)} days of data. Calculating percent changes and uploading..."
            )
            enriched = calculate_percent_changes(history_data)
            upload_to_firestore(enriched)
        else:
            print(f"No data found for {person}")

    print("✅ Done! Check your Firebase Console.")


if __name__ == "__main__":
    main()
