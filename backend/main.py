import httpx
import os
import aiosqlite
import greenlet
import passlib.handlers.pbkdf2
import passlib.handlers.bcrypt
import passlib.handlers.sha2_crypt

from fastapi import FastAPI, HTTPException, Query, Depends, status, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from typing import List, Optional
from google.oauth2 import id_token
from google.auth.transport import requests

from music_engine import MusicEngine
from database import init_db, get_db
from models import User, Song, Playlist, LikedSong, ListenHistory, Room, RoomParticipant
from auth import get_password_hash, verify_password, create_access_token, get_current_user, oauth2_scheme
from pydantic import BaseModel
from dotenv import load_dotenv
from jose import JWTError, jwt

import httpx

load_dotenv()

app = FastAPI(title="Redew API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Engine initialization
engine_config = {
    "SESSION_STRING": os.getenv("SESSION_STRING"),
    "API_ID": os.getenv("API_ID"),
    "API_HASH": os.getenv("API_HASH"),
    "SPOTIFY_CLIENT_ID": os.getenv("SPOTIFY_CLIENT_ID"),
    "SPOTIFY_CLIENT_SECRET": os.getenv("SPOTIFY_CLIENT_SECRET"),
    "DATABASE_CHANNEL_ID": os.getenv("DATABASE_CHANNEL_ID"),
}
music_engine = MusicEngine(engine_config)

@app.on_event("startup")
async def on_startup():
    await init_db()

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class GoogleAuth(BaseModel):
    token: str

class LikeRequest(BaseModel):
    video_id: str
    title: str
    channel: str
    thumbnail: str
    duration: str

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")

SECRET_KEY = os.getenv("SECRET_KEY", "prod_secret_key_change_this")
ALGORITHM = "HS256"

async def get_optional_user(token: Optional[str] = Depends(oauth2_scheme)):
    """Returns username if authenticated, None otherwise"""
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None

@app.on_event("startup")
async def startup():
    await init_db()
    await music_engine.initialize()

# --- AUTH ROUTES ---

@app.post("/register", status_code=status.HTTP_201_CREATED)
async def register(user: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user exists
    result = await db.execute(select(User).filter(User.username == user.username))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Username already registered")
    
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=get_password_hash(user.password)
    )
    db.add(db_user)
    await db.commit()
    return {"message": "User created successfully"}

@app.post("/login", response_model=Token)
async def login(form_data: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == form_data.username))
    user = result.scalars().first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me")
async def read_users_me(username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": user.id,
        "username": user.username, 
        "email": user.email, 
        "onboarding_completed": user.onboarding_completed,
        "profile_photo": user.profile_photo,
        "current_queue": user.current_queue,
        "playback_state": user.playback_state
    }

class OnboardingData(BaseModel):
    genres: List[str]
    artists: List[str]

@app.post("/users/onboarding")
async def save_onboarding(data: OnboardingData, username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.preferred_genres = data.genres
    user.preferred_artists = data.artists
    user.onboarding_completed = True
    await db.commit()
    return {"message": "Onboarding completed"}

class SyncState(BaseModel):
    current_queue: List[dict]
    playback_state: dict

@app.post("/users/sync-state")
async def sync_state(data: SyncState, username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.current_queue = data.current_queue
    user.playback_state = data.playback_state
    await db.commit()
    return {"status": "synced"}

@app.post("/users/search-history")
async def add_search_history(query: str = Query(...), username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    history = SearchHistory(user_id=user.id, query=query)
    db.add(history)
    await db.commit()
    return {"status": "recorded"}

class UserProfileUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    profile_photo: Optional[str] = None

@app.put("/users/profile")
async def update_profile(data: UserProfileUpdate, username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if data.username:
        # Check if username is already taken by someone else
        check = await db.execute(select(User).filter(User.username == data.username, User.id != user.id))
        if check.scalars().first():
            raise HTTPException(status_code=400, detail="Username already taken")
        user.username = data.username
    
    if data.email:
        user.email = data.email

    if data.profile_photo:
        user.profile_photo = data.profile_photo
        
    await db.commit()
    return {"message": "Profile updated", "username": user.username, "email": user.email, "profile_photo": user.profile_photo}

class GoogleDirectAuth(BaseModel):
    email: str
    name: str

@app.post("/google-login-direct")
async def google_login_direct(auth: GoogleDirectAuth, db: AsyncSession = Depends(get_db)):
    email = auth.email
    name = auth.name
    
    # Check if user exists
    result = await db.execute(select(User).filter(User.email == email))
    user = result.scalars().first()
    
    if not user:
        # Check if username is taken, append random if so
        uname_check = await db.execute(select(User).filter(User.username == name))
        if uname_check.scalars().first():
            import random
            name = f"{name}{random.randint(1000, 9999)}"
        
        user = User(
            username=name,
            email=email,
            hashed_password=get_password_hash(f"google_user_{email}")
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    access_token = create_access_token(data={"sub": user.username})
    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "username": user.username,
        "id": user.id,
        "profile_photo": user.profile_photo
    }
@app.post("/upload-to-catbox")
async def upload_proxy(file: UploadFile = File(...)):
    try:
        async with httpx.AsyncClient() as client:
            files = {'fileToUpload': (file.filename, await file.read(), file.content_type)}
            data = {'reqtype': 'fileupload'}
            response = await client.post('https://catbox.moe/user/api.php', data=data, files=files)
            
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail="Catbox upload failed")
            
            return {"url": response.text.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- MUSIC ROUTES ---

@app.get("/search")
async def search(q: str = Query(...), db: AsyncSession = Depends(get_db)):
    # 1. Check local DB first for fast indexed retrieval
    db_results = await db.execute(select(Song).filter(Song.title.ilike(f"%{q}%")).limit(5))
    local_songs = db_results.scalars().all()
    
    # 2. Get from YouTube engine
    yt_results = await music_engine.search(q, limit=15)
    
    return {
        "local": local_songs,
        "results": yt_results[:15]
    }

@app.get("/recommendations")
async def recommendations(title: str = Query(...), channel: str = Query(...), current_id: str = Query(...)):
    """Spotify-grade vibe-matching recommendation engine"""
    results = []
    
    # Strategy 1: YouTube Radio Mix (Highest Quality Vibe Matching)
    try:
        related = await music_engine.get_related_videos(current_id, limit=25)
        if related and len(related) > 5:
            results = related
            print(f"DEBUG: Using Radio Mix for {current_id}")
    except Exception as e:
        print(f"DEBUG: Radio Mix failed: {e}")

    # Strategy 2: Search-based Vibe Matching (Fallback)
    if not results:
        import re
        clean_title = re.sub(
            r'\(?(official\s*(music\s*)?video|lyric(al)?\s*video|audio|full\s*song|hd|4k|official\s*audio|visualizer)\)?',
            '', title, flags=re.IGNORECASE
        ).strip()
        clean_title = re.sub(r'[\|\-\[\]()]', ' ', clean_title).strip()
        clean_title = re.sub(r'\s+', ' ', clean_title)
        
        # Try a "Related" keyword search
        query = f"{clean_title} {channel} similar music mix"
        yt_results = await music_engine.search(query, limit=15)
        results = [track for track in yt_results if track["id"] != current_id]
        print(f"DEBUG: Using Search-based fallback for {current_id}")

    # Final filter and variety sort
    if results:
        # Occasionally shuffle for variety, but keep top matches first
        return {"results": results}
    
    return {"results": []}

@app.get("/stream-live/{video_id}")
async def stream_live(video_id: str):
    """Zero-delay HLS Streaming Redirect"""
    stream_url = await music_engine.get_stream_url(video_id)
    if not stream_url:
        raise HTTPException(status_code=404, detail="Live stream not found")
    # Instead of downloading, we redirect the browser to the direct audio source
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=stream_url)

@app.get("/stream/{video_id}")
async def stream(video_id: str, title: str = None, username: str = Depends(get_optional_user), db: AsyncSession = Depends(get_db)):
    # Track listen history if user is authenticated
    if username:
        result = await db.execute(select(User).filter(User.username == username))
        user = result.scalars().first()
        
        # Find or create song in DB
        song_result = await db.execute(select(Song).filter(Song.video_id == video_id))
        song = song_result.scalars().first()
        
        if not song and title:
            song = Song(video_id=video_id, title=title)
            db.add(song)
            await db.commit()
            await db.refresh(song)
        
        if song and user:
            history = ListenHistory(user_id=user.id, song_id=song.id)
            song.play_count += 1
            db.add(history)
            await db.commit()

    file_path = await music_engine.get_audio_path(video_id, title)
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio not found")
    return FileResponse(file_path, media_type="audio/mpeg")

# --- LIKED SONGS ROUTES ---

@app.post("/like")
async def toggle_like(req: LikeRequest, username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Find or create song
    song_result = await db.execute(select(Song).filter(Song.video_id == req.video_id))
    song = song_result.scalars().first()
    if not song:
        song = Song(video_id=req.video_id, title=req.title, thumbnail=req.thumbnail)
        db.add(song)
        await db.commit()
        await db.refresh(song)
    
    # Check if already liked
    like_result = await db.execute(
        select(LikedSong).filter(LikedSong.user_id == user.id, LikedSong.song_id == song.id)
    )
    existing = like_result.scalars().first()
    
    if existing:
        await db.delete(existing)
        await db.commit()
        return {"liked": False, "video_id": req.video_id}
    else:
        new_like = LikedSong(user_id=user.id, song_id=song.id)
        db.add(new_like)
        await db.commit()
        return {"liked": True, "video_id": req.video_id}

@app.get("/liked-songs")
async def get_liked_songs(username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    liked = await db.execute(
        select(LikedSong, Song)
        .join(Song, LikedSong.song_id == Song.id)
        .filter(LikedSong.user_id == user.id)
        .order_by(LikedSong.created_at.desc())
    )
    rows = liked.all()
    songs = []
    for like, song in rows:
        songs.append({
            "id": song.video_id,
            "title": song.title,
            "channel": song.artist or "Unknown",
            "thumbnail": song.thumbnail or "",
            "duration": str(song.duration) if song.duration else "0:00",
            "video_id": song.video_id
        })
    return {"songs": songs}

# --- PLAYLIST ROUTES ---

class PlaylistCreate(BaseModel):
    name: str
    description: Optional[str] = None

class PlaylistAddSong(BaseModel):
    video_id: str
    title: str
    channel: str
    thumbnail: str
    duration: str

@app.post("/playlists")
async def create_playlist(req: PlaylistCreate, username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    
    playlist = Playlist(name=req.name, description=req.description, owner_id=user.id)
    db.add(playlist)
    await db.commit()
    await db.refresh(playlist)
    return {"id": playlist.id, "name": playlist.name}

@app.get("/playlists")
async def get_playlists(username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    pl_result = await db.execute(select(Playlist).filter(Playlist.owner_id == user.id))
    playlists = pl_result.scalars().all()
    return [{"id": p.id, "name": p.name, "description": p.description} for p in playlists]

@app.post("/playlists/{playlist_id}/add")
async def add_to_playlist(playlist_id: int, req: PlaylistAddSong, username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Verify owner
    user_res = await db.execute(select(User).filter(User.username == username))
    user = user_res.scalars().first()
    
    pl_res = await db.execute(select(Playlist).filter(Playlist.id == playlist_id, Playlist.owner_id == user.id))
    playlist = pl_res.scalars().first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    # Get or create song
    song_res = await db.execute(select(Song).filter(Song.video_id == req.video_id))
    song = song_res.scalars().first()
    if not song:
        song = Song(video_id=req.video_id, title=req.title, artist=req.channel, thumbnail=req.thumbnail)
        db.add(song)
        await db.commit()
        await db.refresh(song)
    
    # Add to junction table if not already there
    from models import playlist_songs
    check = await db.execute(playlist_songs.select().where(playlist_songs.c.playlist_id == playlist_id, playlist_songs.c.song_id == song.id))
    if not check.first():
        await db.execute(playlist_songs.insert().values(playlist_id=playlist_id, song_id=song.id))
        await db.commit()
    
    return {"message": "Added to playlist"}

@app.get("/playlists/{playlist_id}")
async def get_playlist_details(playlist_id: int, db: AsyncSession = Depends(get_db)):
    pl_res = await db.execute(select(Playlist).filter(Playlist.id == playlist_id))
    playlist = pl_res.scalars().first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    from models import playlist_songs
    songs_res = await db.execute(
        select(Song)
        .join(playlist_songs, Song.id == playlist_songs.c.song_id)
        .where(playlist_songs.c.playlist_id == playlist_id)
    )
    songs = songs_res.scalars().all()
    
    return {
        "id": playlist.id,
        "name": playlist.name,
        "description": playlist.description,
        "songs": [{
            "id": s.video_id,
            "title": s.title,
            "channel": s.artist or "Unknown",
            "thumbnail": s.thumbnail,
            "duration": "0:00"
        } for s in songs]
    }

@app.get("/featured-playlists")
async def featured_playlists():
    """Returns mood and artist-dedicated playlists with live YouTube thumbnails"""
    categories = [
        {"id": "chart_global", "name": "Top 50 - Global", "type": "trending", "query": "top 50 global songs this week"},
        {"id": "chart_india", "name": "Top 50 - India", "type": "trending", "query": "top 50 india bollywood hits"},
        {"id": "mood_party", "name": "Party Mashup", "type": "mood", "query": "latest bollywood party mashup 2024"},
        {"id": "mood_romance", "name": "Romantic Melodies", "type": "mood", "query": "best romantic hindi songs hits"},
        {"id": "mood_focus", "name": "Lofi Study", "type": "mood", "query": "lofi hip hop study beats 24/7"},
        {"id": "mood_retro", "name": "Golden Hits", "type": "mood", "query": "70s 80s kishore kumar lata hits"},
        {"id": "artist_arijit", "name": "Arijit Singh Radio", "type": "artist", "query": "Arijit Singh greatest hits"},
        {"id": "artist_sidhu", "name": "Sidhu Moose Wala", "type": "artist", "query": "Sidhu Moose Wala legendary tracks"},
        {"id": "artist_diljit", "name": "Diljit Dosanjh", "type": "artist", "query": "Diljit Dosanjh G.O.A.T hits"},
        {"id": "artist_weeknd", "name": "The Weeknd Mix", "type": "artist", "query": "The Weeknd essential mix"},
        {"id": "artist_karan", "name": "Karan Aujla", "type": "artist", "query": "Karan Aujla geetan di machine hits"},
        {"id": "artist_badshah", "name": "Badshah Radio", "type": "artist", "query": "Badshah club party hits"}
    ]
    
    # Simple cache to avoid hitting YT too hard on every refresh
    # For a production app, you'd use a real cache like Redis
    results = []
    for cat in categories:
        try:
            # Get the top search result's thumbnail to use as the playlist cover
            search_results = await music_engine.search(cat["query"], limit=1)
            if search_results:
                cat["image"] = search_results[0]["thumbnail"]
            else:
                cat["image"] = "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=400"
            
            cat["description"] = f"Curated {cat['name']} collection"
            results.append(cat)
        except:
            cat["image"] = "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=400"
            results.append(cat)
            
    return results

# --- ROOMS (JAM) SYSTEM ---

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[dict]] = {}

    async def connect(self, room_code: str, websocket: WebSocket, username: str):
        await websocket.accept()
        if room_code not in self.active_connections:
            self.active_connections[room_code] = []
        self.active_connections[room_code].append({"ws": websocket, "user": username})
        return [c["user"] for c in self.active_connections[room_code]]

    def disconnect(self, room_code: str, websocket: WebSocket):
        if room_code in self.active_connections:
            self.active_connections[room_code] = [c for c in self.active_connections[room_code] if c["ws"] != websocket]
            if not self.active_connections[room_code]:
                del self.active_connections[room_code]

    async def broadcast(self, room_code: str, message: dict):
        if room_code in self.active_connections:
            for connection in self.active_connections[room_code]:
                await connection["ws"].send_json(message)

manager = ConnectionManager()

@app.post("/rooms")
async def create_room(name: str, username: str = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    import uuid
    room_code = str(uuid.uuid4())[:8].upper()
    
    result = await db.execute(select(User).filter(User.username == username))
    user = result.scalars().first()
    
    room = Room(
        room_code=room_code,
        name=name,
        host_id=user.id,
        is_playing=False,
        progress=0.0
    )
    db.add(room)
    await db.commit()
    await db.refresh(room)
    return room

@app.get("/rooms/{room_code}")
async def get_room(room_code: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Room).filter(Room.room_code == room_code))
    room = result.scalars().first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room

@app.websocket("/ws/room/{room_code}")
async def room_websocket(websocket: WebSocket, room_code: str, username: str = "Anonymous"):
    participants = await manager.connect(room_code, websocket, username)
    # Send initial list to the new joiner
    await websocket.send_json({"type": "PARTICIPANT_LIST", "participants": participants})
    # Broadcast join to others
    await manager.broadcast(room_code, {"type": "USER_JOIN", "username": username})
    try:
        while True:
            data = await websocket.receive_json()
            await manager.broadcast(room_code, data)
    except WebSocketDisconnect:
        manager.disconnect(room_code, websocket)
        await manager.broadcast(room_code, {"type": "USER_LEAVE", "username": username})

# --- ANALYTICS ---

@app.get("/analytics/top-songs")
async def top_songs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Song).order_by(Song.play_count.desc()).limit(10))
    return result.scalars().all()

# --- SERVER-SIDE GOOGLE OAUTH WITH PKCE (for Electron desktop app) ---

import uuid as _uuid
import hashlib
import base64
pending_google_auth = {}
GOOGLE_REDIRECT_URI = "http://127.0.0.1:8000/auth/google/callback"

def generate_pkce():
    verifier = base64.urlsafe_b64encode(os.urandom(32)).decode('utf-8').replace('=', '')
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode('utf-8')).digest()).decode('utf-8').replace('=', '')
    return verifier, challenge

@app.get("/auth/google/start")
async def google_auth_start():
    session_id = str(_uuid.uuid4())[:12]
    verifier, challenge = generate_pkce()
    pending_google_auth[session_id] = {"status": "pending", "verifier": verifier}
    
    google_auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={GOOGLE_REDIRECT_URI}&"
        f"response_type=code&"
        f"scope=openid%20email%20profile&"
        f"state={session_id}&"
        f"code_challenge={challenge}&"
        f"code_challenge_method=S256&"
        f"prompt=select_account"
    )
    return {"url": google_auth_url, "session_id": session_id}

@app.get("/auth/google/callback")
async def google_auth_callback(code: str, state: str):
    from fastapi.responses import HTMLResponse
    # We have the code, now we tell the client to complete the exchange
    html = f"""<!DOCTYPE html>
<html><head><title>Redew - Signing In</title>
<style>
body{{background:#121212;color:#fff;font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}}
.card{{text-align:center;padding:40px;max-width:400px}}
.spinner{{width:40px;height:40px;border:3px solid #333;border-top:3px solid #1DB954;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 20px}}
@keyframes spin{{to{{transform:rotate(360deg)}}}}
h1{{font-size:24px;margin-bottom:8px}}
p{{color:#b3b3b3;font-size:14px}}
.ok{{color:#1DB954}}
.err{{color:#e74c3c}}
</style></head><body>
<div class="card" id="c">
<div class="spinner"></div>
<h1>Completing login...</h1>
<p>You can close this window now.</p>
</div>
<script>
// Automatically send the code to our backend to exchange for a token
fetch('/auth/google/complete', {{
    method: 'POST',
    headers: {{ 'Content-Type': 'application/json' }},
    body: JSON.stringify({{ code: '{code}', session_id: '{state}' }})
}})
.then(r => r.json())
.then(data => {{
    if (data.status === 'ok') {{
        document.getElementById('c').innerHTML = '<h1 class="ok">✓ Login Successful</h1><p>Return to the Redew app to continue.</p>';
        setTimeout(() => window.close(), 3000);
    }} else {{
        document.getElementById('c').innerHTML = '<h1 class="err">Login Failed</h1><p>' + (data.detail || 'Error exchanging code') + '</p>';
    }}
}})
.catch(err => {{
    document.getElementById('c').innerHTML = '<h1 class="err">Login Failed</h1><p>Connection error.</p>';
}});
</script></body></html>"""
    return HTMLResponse(content=html)

class GoogleCompleteRequest(BaseModel):
    code: str
    session_id: str

@app.post("/auth/google/complete")
async def google_auth_complete(req: GoogleCompleteRequest, db: AsyncSession = Depends(get_db)):
    if req.session_id not in pending_google_auth:
        raise HTTPException(status_code=400, detail="Invalid session")
    
    session_data = pending_google_auth[req.session_id]
    
    # Exchange code for token using PKCE verifier
    async with httpx.AsyncClient() as client:
        token_res = await client.post('https://oauth2.googleapis.com/token', data={
            'client_id': GOOGLE_CLIENT_ID,
            'client_secret': GOOGLE_CLIENT_SECRET,
            'code': req.code,
            'code_verifier': session_data['verifier'],
            'redirect_uri': GOOGLE_REDIRECT_URI,
            'grant_type': 'authorization_code'
        })
        
        if token_res.status_code != 200:
            print(f"Token exchange failed: {token_res.text}")
            raise HTTPException(status_code=400, detail="Failed to exchange code for token")
        
        tokens = token_res.json()
        access_token = tokens.get('access_token')
        
        # Get user info
        user_res = await client.get('https://www.googleapis.com/oauth2/v3/userinfo',
                                  headers={'Authorization': f'Bearer {access_token}'})
        if user_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get user info")
        userinfo = user_res.json()

    email = userinfo.get('email')
    name = userinfo.get('name', email.split('@')[0])
    
    result = await db.execute(select(User).filter(User.email == email))
    user = result.scalars().first()
    
    if not user:
        uname_check = await db.execute(select(User).filter(User.username == name))
        if uname_check.scalars().first():
            import random
            name = f"{name}{random.randint(1000, 9999)}"
        user = User(username=name, email=email, hashed_password=get_password_hash(f"google_user_{email}"))
        db.add(user)
        await db.commit()
        await db.refresh(user)
        
    jwt_token = create_access_token(data={"sub": user.username})
    pending_google_auth[req.session_id] = {
        "status": "complete",
        "access_token": jwt_token,
        "username": user.username
    }
    return {"status": "ok"}

@app.get("/auth/google/poll/{session_id}")
async def google_auth_poll(session_id: str):
    if session_id not in pending_google_auth:
        raise HTTPException(status_code=404, detail="Session not found")
    session = pending_google_auth[session_id]
    if session["status"] == "complete":
        result = dict(session)
        del pending_google_auth[session_id]
        return result
    return {"status": "pending"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

