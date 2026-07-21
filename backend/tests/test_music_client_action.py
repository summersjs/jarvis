import unittest
from unittest.mock import patch

from backend.assistant.tools.registry import AssistantToolContext
from backend.services.ollama_service import chat_with_jarvis, detect_music_intent, generate_music_playback_response, is_start_music_request


class MusicClientActionTests(unittest.TestCase):
    def test_natural_music_start_phrases_are_allowlisted(self):
        for phrase in (
            "play some tunes",
            "play some music",
            "get some music going",
            "put some music on",
            "throw some tunes on",
            "let's get some music going",
            "start my music",
            "fire up some tunes",
            "turn on music",
            "open YouTube Music",
            "launch youtube music please",
        ):
            with self.subTest(phrase=phrase):
                self.assertTrue(is_start_music_request(phrase))

    def test_song_search_is_not_mistaken_for_generic_start(self):
        self.assertFalse(is_start_music_request("play music by Prince"))
        self.assertFalse(is_start_music_request("what music should I play"))

    def test_media_control_phrases_resolve_deterministically(self):
        expected = {
            "skip this song": "next_track",
            "next": "next_track",
            "go back": "previous_track",
            "play that again": "previous_track",
            "who's playing": "now_playing",
            "what song is this": "now_playing",
            "what song is playing": "now_playing",
            "who sings this song": "now_playing",
            "can you pause this song?": "pause_music",
            "I like this song": "like_track",
            "thumbs up this track": "like_track",
        }
        for phrase, intent in expected.items():
            with self.subTest(phrase=phrase):
                self.assertEqual(detect_music_intent(phrase), intent)

    def test_chat_returns_only_the_allowlisted_desktop_action(self):
        result = chat_with_jarvis(
            [{"role": "user", "content": "get some music going"}],
            context=AssistantToolContext(request_id="req_music_test", source_message_id="msg_music_test"),
        )
        self.assertEqual(result["clientActions"], [{"type": "start_youtube_music"}])
        self.assertEqual(result["tools"], [])
        self.assertEqual(result["actions"], [])

    def test_pause_routes_to_desktop_and_requires_verified_paused_state(self):
        result = chat_with_jarvis(
            [{"role": "user", "content": "can you pause this song?"}],
            context=AssistantToolContext(request_id="req_pause_test", source_message_id="msg_pause_test"),
        )
        self.assertEqual(result["clientActions"], [{"type": "pause_music"}])
        self.assertEqual(generate_music_playback_response({"intent": "pause_music", "command_available": True, "command_verified": True, "verified_playing": False}), "Paused.")
        self.assertNotIn("paused", generate_music_playback_response({"intent": "pause_music", "command_available": True, "command_verified": False, "verified_playing": True}).lower().split("but")[0])

    def test_never_claims_playing_when_desktop_did_not_verify_playing(self):
        with patch("backend.services.ollama_service._request_json") as model:
            response = generate_music_playback_response({
                "command_available": True,
                "verified_playing": False,
                "playback_status": "paused",
                "title": "Sooner or Later",
                "artist": "Breaking Benjamin",
            })
        model.assert_not_called()
        self.assertEqual(response, "I found the player, but playback did not start.")
        self.assertNotIn("is playing", response.lower())

    def test_unavailable_bridge_never_claims_playback(self):
        response = generate_music_playback_response({"command_available": False, "verified_playing": False})
        self.assertEqual(response, "The desktop music controls are unavailable.")
        self.assertNotIn("music is playing", response.lower())

    def test_verified_playback_uses_only_real_metadata(self):
        with patch("backend.services.ollama_service._request_json", return_value={
            "message": {"content": "Say less. Breaking Benjamin is on with Sooner or Later."}
        }):
            response = generate_music_playback_response({
                "command_available": True,
                "verified_playing": True,
                "playback_status": "playing",
                "title": "Sooner or Later",
                "artist": "Breaking Benjamin",
            })
        self.assertIn("Breaking Benjamin", response)
        self.assertIn("Sooner or Later", response)

    def test_verified_playback_without_metadata_does_not_invent_it(self):
        with patch("backend.services.ollama_service._request_json") as model:
            response = generate_music_playback_response({
                "command_available": True,
                "verified_playing": True,
                "playback_status": "playing",
            })
        model.assert_not_called()
        self.assertEqual(response, "You got it. Music is playing.")

    def test_skip_never_claims_change_until_metadata_changes(self):
        with patch("backend.services.ollama_service._request_json") as model:
            response = generate_music_playback_response({
                "intent": "next_track",
                "command_available": True,
                "verified_playing": True,
                "track_changed": False,
                "title": "Sooner or Later",
                "artist": "Breaking Benjamin",
            })
        model.assert_not_called()
        self.assertEqual(response, "I found the player and sent the command, but the track did not change.")

    def test_now_playing_uses_verified_metadata(self):
        with patch("backend.services.ollama_service._request_json", return_value={
            "message": {"content": "That's Sooner or Later by Breaking Benjamin."}
        }):
            response = generate_music_playback_response({
                "intent": "now_playing",
                "command_available": True,
                "verified_playing": True,
                "playback_status": "playing",
                "title": "Sooner or Later",
                "artist": "Breaking Benjamin",
            })
        self.assertEqual(response, "That's Sooner or Later by Breaking Benjamin.")


if __name__ == "__main__":
    unittest.main()
