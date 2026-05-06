import asyncio
import os
import re
import json
import time
import logging
import hashlib
import aiohttp
import yt_dlp
from typing import Union, Optional, Dict, List
from youtubesearchpython.__future__ import VideosSearch
from pyrogram import Client, filters
from pyrogram.enums import MessagesFilter
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("RedewMusicEngine")

class MusicEngine:
    def __init__(self, config=None):
        self.config = config or {}
        self.download_folder = "downloads"
        
        # Telegram Settings
        self.session_string = self.config.get("SESSION_STRING")
        self.you_music_session = self.config.get("YOU_MUSIC_SESSION")
        self.channel_username = self.config.get("CHANNEL_USERNAME", "@shakkydb")
        self.group_username = self.config.get("GROUP_USERNAME", "shadowmusicbase")
        self.db_channel_id = self.config.get("DATABASE_CHANNEL_ID")
        
        # Spotify Settings
        self.spotify_id = self.config.get("SPOTIFY_CLIENT_ID")
        self.spotify_secret = self.config.get("SPOTIFY_CLIENT_SECRET")
        self.spotify = None
        if self.spotify_id and self.spotify_secret:
            try:
                self.spotify = spotipy.Spotify(
                    client_credentials_manager=SpotifyClientCredentials(
                        self.spotify_id, self.spotify_secret
                    )
                )
            except Exception as e:
                logger.warning(f"Spotify Init Failed: {e}")

        # Pyrogram Clients
        self.app = None
        self.you_app = None
        self.initialized = False
        self.initializing = False
        
        os.makedirs(self.download_folder, exist_ok=True)

    async def initialize(self):
        if self.initialized or self.initializing: return
        self.initializing = True
        
        # We run this in background so it doesn't block the whole API if Telegram is slow
        asyncio.create_task(self._init_clients())

    async def _init_clients(self):
        try:
            if self.session_string:
                self.app = Client(
                    "redew_web_client",
                    session_string=self.session_string,
                    api_id=int(self.config.get("API_ID")),
                    api_hash=self.config.get("API_HASH"),
                    in_memory=True,
                    no_updates=True
                )
                await self.app.start()
                logger.info("Main Telegram Client Started")

            if self.you_music_session:
                self.you_app = Client(
                    "you_music_client",
                    session_string=self.you_music_session,
                    api_id=int(self.config.get("API_ID")),
                    api_hash=self.config.get("API_HASH"),
                    in_memory=True,
                    no_updates=True
                )
                await self.you_app.start()
                logger.info("YouMusic Client Started")
        except Exception as e:
            logger.error(f"Telegram Initialization Error: {e}")
        finally:
            self.initialized = True
            self.initializing = False

    async def search(self, query: str, limit: int = 20):
        """Search YouTube for songs with metadata enhancement"""
        print(f"DEBUG: Searching for '{query}'...")
        # If Spotify Link
        if "spotify.com" in query:
            return await self._handle_spotify(query)

        try:
            search = VideosSearch(query.strip(), limit=limit)
            result = await search.next()
            
            songs = []
            if result and "result" in result:
                for item in result["result"]:
                    try:
                        thumb = ""
                        if item.get("thumbnails") and len(item["thumbnails"]) > 0:
                            thumb = item["thumbnails"][0].get("url", "") or ""
                        
                        channel_info = item.get("channel") or {}
                        channel_name = channel_info.get("name") or "Unknown"
                        
                        songs.append({
                            "id": item.get("id", ""),
                            "title": item.get("title", "Unknown") or "Unknown",
                            "duration": item.get("duration") or "0:00",
                            "thumbnail": thumb,
                            "link": item.get("link") or "",
                            "channel": channel_name
                        })
                    except Exception as item_err:
                        print(f"DEBUG: Skipping bad result item: {item_err}")
                        continue
            print(f"DEBUG: Found {len(songs)} results")
            return songs
        except Exception as e:
            print(f"DEBUG: Search Error: {e}")
            return []

    async def get_related_videos(self, video_id: str, limit: int = 25):
        """Get YouTube's own radio mix recommendations for a video"""
        print(f"DEBUG: Getting related videos for {video_id}...")
        try:
            # Use YouTube's Radio Mix playlist — this is YouTube's own recommendation engine
            mix_url = f"https://www.youtube.com/watch?v={video_id}&list=RD{video_id}"
            
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': True,
                'skip_download': True,
                'playlist_items': f'1-{limit + 5}', # Fetch a few extra for filtering
                'extractor_args': {'youtube': ['player_client=android']}
            }

            def _extract():
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(mix_url, download=False)
                    return info

            info = await asyncio.get_event_loop().run_in_executor(None, _extract)
            
            songs = []
            entries = info.get('entries', []) if info else []
            for item in entries:
                if not item:
                    continue
                vid = item.get('id', '')
                if vid == video_id:
                    continue  # Skip the current song
                songs.append({
                    "id": vid,
                    "title": item.get('title', 'Unknown') or 'Unknown',
                    "duration": str(item.get('duration', 0) or 0),
                    "thumbnail": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg" if vid else "",
                    "link": f"https://www.youtube.com/watch?v={vid}" if vid else "",
                    "channel": item.get('uploader', 'Unknown') or item.get('channel', 'Unknown') or 'Unknown'
                })
                if len(songs) >= limit:
                    break
            
            # Format duration from seconds to MM:SS
            for song in songs:
                try:
                    secs = int(song['duration'])
                    song['duration'] = f"{secs // 60}:{secs % 60:02d}"
                except:
                    song['duration'] = "0:00"
            
            print(f"DEBUG: Found {len(songs)} related videos")
            return songs
        except Exception as e:
            print(f"DEBUG: Related videos error: {e}")
            return []

    async def _handle_spotify(self, link: str):
        if not self.spotify:
            return []
        
        if "/track/" in link:
            track = await asyncio.to_thread(self.spotify.track, link)
            query = f"{track['name']} {track['artists'][0]['name']}"
            return await self.search(query, limit=1)
        elif "/playlist/" in link:
            # For simplicity, we'll just search for the first few tracks
            pass
        return []

    async def get_stream_url(self, video_id: str):
        """Extract LIVE HLS/m3u8 URL for zero-delay streaming"""
        url = f"https://www.youtube.com/watch?v={video_id}"
        
        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'force_generic_extractor': False,
            'extractor_args': {'youtube': ['player_client=android']}
        }
        
        def _extract():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                # Check for HLS formats
                hls_url = info.get('url')
                # If it's a direct URL but not m3u8, it's still a fast stream
                return hls_url
        
        try:
            return await asyncio.get_event_loop().run_in_executor(None, _extract)
        except Exception as e:
            logger.error(f"Stream extraction failed: {e}")
            return None

    async def get_audio_path(self, video_id: str, title: str = None):
        """Tiered Retrieval Logic (The Redew Method)"""
        # 0. Local Check
        local_path = os.path.join(self.download_folder, f"{video_id}.mp3")
        if os.path.exists(local_path):
            return local_path

        # If Telegram is initialized, use the "Step 2" strategy
        if self.app:
            # 1. Sentinel DB Check (Primary Fast Cache)
            if self.db_channel_id:
                msg = await self._search_channel(self.db_channel_id, video_id)
                if msg:
                    logger.info(f"Sentinel DB Hit: {video_id}")
                    return await self.app.download_media(msg, file_name=local_path)

            # 2. SmashDB Check (Secondary Cache)
            msg = await self._search_channel(self.channel_username, video_id)
            if msg:
                logger.info(f"SmashDB Hit: {video_id}")
                return await self.app.download_media(msg, file_name=local_path)

        # 3. Fallback: yt-dlp (Direct Web Retrieval)
        return await self._download_ytdlp(video_id)

    async def _search_channel(self, chat_id, video_id):
        try:
            async for message in self.app.search_messages(chat_id, query=video_id, filter=MessagesFilter.AUDIO, limit=1):
                return message
        except: return None

    async def _download_ytdlp(self, video_id):
        file_path = os.path.join(self.download_folder, f"{video_id}.mp3")
        url = f"https://www.youtube.com/watch?v={video_id}"
        
        # Quality Handling: In a real app, we'd adjust based on 'quality' param
        # Here we use 'bestaudio' which is the standard High Quality
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': file_path.replace('.mp3', ''),
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192', # High quality bitrate
            }],
            'quiet': True,
            'no_warnings': True,
            'extractor_args': {'youtube': ['player_client=android']}
        }
        
        def _dl():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
        
        try:
            await asyncio.get_event_loop().run_in_executor(None, _dl)
            
            # Check for various extensions
            for ext in ['.mp3', '.m4a', '.webm']:
                p = file_path.replace('.mp3', ext)
                if os.path.exists(p):
                    if ext != '.mp3':
                        os.rename(p, file_path)
                    return file_path
        except Exception as e:
            logger.error(f"yt-dlp failed: {e}")
        return None
