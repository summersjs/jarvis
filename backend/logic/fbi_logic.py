# backend/logic/fbi_logic.py

class FBIPFTScorer:
    @staticmethod
    def get_pullup_points(reps):
        # Pull-ups are mandatory for your track
        if reps >= 20: return 10
        if reps >= 15: return 7
        if reps >= 10: return 5
        if reps >= 5: return 2
        if reps < 2: return -2 # Failing the minimum
        return 1

    @staticmethod
    def get_run_points(seconds):
        # 1.5 Mile Run (900 seconds = 15:00)
        if seconds <= 540: return 10  # 9:00
        if seconds <= 630: return 7   # 10:30
        if seconds <= 735: return 4   # 12:15
        if seconds > 840: return 0    # Over 14:00
        return 2

    @staticmethod
    def get_sprint_points(seconds):
        # 300-meter sprint
        if seconds <= 40.0: return 10
        if seconds <= 46.0: return 5
        if seconds > 55.0: return 0
        return 2
    
    @staticmethod
    def get_push_up_points(reps):
        # Push-ups are optional but can boost your score
        if reps >= 50: return 10
        if reps >= 40: return 7
        if reps >= 30: return 4
        if reps >= 20: return 2
        if reps < 10: return -1 # Failing the minimum
        return 1

# Example: score = FBIPFTScorer.get_pullup_points(6)