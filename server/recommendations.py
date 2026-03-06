import os
import requests

NHS_LIVEWELL_URL = "https://sandbox.api.service.nhs.uk/nhs-website-content/live-well"

NHS_API_KEY = os.getenv("NHS_API_KEY", "")  

HEADERS = {
    "accept": "application/json",
    "apikey": NHS_API_KEY,
}

def fetch_livewell_topics():
    r = requests.get(NHS_LIVEWELL_URL, headers=HEADERS, timeout=20)
    r.raise_for_status()
    data = r.json()

    # Defensive: return list safely
    return data.get("data", []) if isinstance(data, dict) else []

def decide_topics(metrics: dict) -> set[str]:
    """
    Turn user metrics into a set of Live Well topic slugs you want to show.
    These slugs MUST match the slugs coming back from the NHS response.
    """
    topics = set()

    # Steps -> exercise advice
    steps = metrics.get("steps")
    if isinstance(steps, (int, float)) and steps < 5000:
        topics.add("exercise")

    # Sleep -> sleep advice
    sleep = metrics.get("sleep")
    if isinstance(sleep, (int, float)) and sleep < 7:
        topics.add("sleep-and-tiredness")

    # Weight -> healthy weight advice (simple heuristic)
    weight = metrics.get("weight")
    if isinstance(weight, (int, float)) and weight >= 85:
        topics.add("healthy-weight")

    # BP high -> lifestyle: healthy eating + exercise (NHS Live Well topics)
    sys = metrics.get("systolicBP")
    dia = metrics.get("diastolicBP")
    if isinstance(sys, (int, float)) and isinstance(dia, (int, float)):
        if sys >= 140 or dia >= 90:
            topics.add("exercise")
            topics.add("healthy-eating")
            topics.add("healthy-weight")

    # Cholesterol high -> healthy eating + weight
    chol = metrics.get("cholesterol")
    if isinstance(chol, (int, float)) and chol > 5:
        topics.add("healthy-eating")
        topics.add("healthy-weight")

    # Glucose high -> healthy eating + weight + exercise (general lifestyle)
    gluc = metrics.get("bloodGlucose")
    if isinstance(gluc, (int, float)) and gluc > 7.8:
        topics.add("healthy-eating")
        topics.add("exercise")
        topics.add("healthy-weight")

    return topics

def get_recommendations(metrics: dict) -> list[dict]:
    wanted = decide_topics(metrics)
    topics = fetch_livewell_topics()

    results = []
    for t in topics:
        slug = t.get("slug")
        if slug in wanted:
            results.append({
                "title": t.get("title", "NHS advice"),
                "summary": t.get("description", ""),
                "url": t.get("url", ""),
                "slug": slug,
            })

    # If none matched (slug mismatch), return a safe fallback
    if not results and wanted:
        results.append({
            "title": "NHS Live Well",
            "summary": "View NHS lifestyle guidance based on your health metrics.",
            "url": "https://www.nhs.uk/live-well/",
            "slug": "live-well",
        })

    return results
