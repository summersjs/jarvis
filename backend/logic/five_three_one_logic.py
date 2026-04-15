# backend/logic/531_logic.py

class PowerliftingEngine:
    def __init__(self, one_rep_max):
        # 5/3/1 uses a Training Max (TM) which is 90% of your true 1RM
        self.training_max = one_rep_max * 0.90

    def get_week_1_sets(self):
        return {
            "Set 1": f"5 reps @ {round(self.training_max * 0.65)} lbs",
            "Set 2": f"5 reps @ {round(self.training_max * 0.75)} lbs",
            "Set 3": f"5+ reps @ {round(self.training_max * 0.85)} lbs",
        }

    def get_week_2_sets(self):
        return {
            "Set 1": f"3 reps @ {round(self.training_max * 0.70)} lbs",
            "Set 2": f"3 reps @ {round(self.training_max * 0.80)} lbs",
            "Set 3": f"3+ reps @ {round(self.training_max * 0.90)} lbs",
        }

    def get_week_3_sets(self):
        return {
            "Set 1": f"5 reps @ {round(self.training_max * 0.75)} lbs",
            "Set 2": f"3 reps @ {round(self.training_max * 0.85)} lbs",
            "Set 3": f"1+ reps @ {round(self.training_max * 0.95)} lbs",
        }

# Example usage for your 255lb deadlift session:
# coach = PowerliftingEngine(255)
# print(coach.get_week_2_sets())