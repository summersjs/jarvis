import re


def normalize_number_words(text: str) -> str:
    number_map = {
        "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
        "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
        "ten": "10", "eleven": "11", "twelve": "12", "thirteen": "13",
        "fourteen": "14", "fifteen": "15", "sixteen": "16", "seventeen": "17",
        "eighteen": "18", "nineteen": "19", "twenty": "20",
    }
    words = text.lower().split()
    normalized = [number_map.get(word, word) for word in words]
    return " ".join(normalized)


def normalize_lift(text: str) -> str | None:
    text = text.lower()
    if "bench press" in text or text.startswith("bench"):
        return "bench"
    if "overhead press" in text or "ohp" in text:
        return "overhead_press"
    if "deadlift" in text or "dead lift" in text:
        return "deadlift"
    if "squat" in text:
        return "squat"
    return None


def parse_voice_log_input(original_text: str):
    text = normalize_number_words(original_text.strip().lower())
    lift = normalize_lift(text)
    if not lift:
        return None, None, None, text

    match = re.search(r"(\d+(?:\.\d+)?)\s+reps\s+(\d+)", text)
    if not match:
        return lift, None, None, text

    weight = int(float(match.group(1)))
    reps = int(match.group(2))
    return lift, weight, reps, text