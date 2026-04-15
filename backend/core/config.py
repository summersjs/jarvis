from zoneinfo import ZoneInfo

LOCAL_TZ = ZoneInfo("America/New_York")

WEEKLY_TEMPLATE = {
    0: "deadlift",        # Monday
    1: None,              # Tuesday
    2: None,              # Wednesday
    3: "bench",           # Thursday
    4: "squat",           # Friday
    5: None,              # Saturday
    6: "overhead_press",  # Sunday
}