from pydantic import BaseModel


class VoiceLogRequest(BaseModel):
    input: str
    user_id: str = "john"