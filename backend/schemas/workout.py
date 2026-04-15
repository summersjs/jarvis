from pydantic import BaseModel


class WorkoutSetLog(BaseModel):
    set_name: str
    weight: float
    reps: int


class CompleteWorkoutLog(BaseModel):
    user_id: str
    lift: str
    cycle: int
    week: int
    sets: list[WorkoutSetLog]