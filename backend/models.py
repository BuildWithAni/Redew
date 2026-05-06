from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float, Table, JSON
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime

Base = declarative_base()

# Many-to-Many relationship for playlists and songs
playlist_songs = Table(
    "playlist_songs",
    Base.metadata,
    Column("playlist_id", Integer, ForeignKey("playlists.id"), primary_key=True),
    Column("song_id", Integer, ForeignKey("songs.id"), primary_key=True),
    Column("added_at", DateTime, default=datetime.utcnow),
    Column("order", Integer, default=0)
)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_premium = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Onboarding preferences (JSON list of strings)
    preferred_genres = Column(JSON, default=[])
    preferred_artists = Column(JSON, default=[])
    onboarding_completed = Column(Boolean, default=False)
    profile_photo = Column(String, nullable=True)
    
    # NEW: Persistence for "every single thing"
    current_queue = Column(JSON, default=[]) # List of song objects
    playback_state = Column(JSON, default={
        "track_id": None,
        "progress": 0,
        "volume": 0.5,
        "shuffle": False,
        "repeat": "none",
        "isPlaying": False,
        "last_updated": None
    })
    
    # Relationships
    playlists = relationship("Playlist", back_populates="owner")
    history = relationship("ListenHistory", back_populates="user")
    liked_songs = relationship("LikedSong", back_populates="user")

class Song(Base):
    __tablename__ = "songs"
    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(String, unique=True, index=True) # YouTube ID
    title = Column(String, index=True)
    artist = Column(String, index=True)
    album = Column(String, index=True)
    duration = Column(Integer) # In seconds
    thumbnail = Column(String)
    genre = Column(String)
    release_date = Column(String)
    lyrics = Column(String) # For synced lyrics
    
    play_count = Column(Integer, default=0)
    
class Playlist(Base):
    __tablename__ = "playlists"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String)
    is_public = Column(Boolean, default=True)
    is_collaborative = Column(Boolean, default=False)
    owner_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    owner = relationship("User", back_populates="playlists")
    songs = relationship("Song", secondary=playlist_songs)

class LikedSong(Base):
    __tablename__ = "liked_songs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    song_id = Column(Integer, ForeignKey("songs.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="liked_songs")

class ListenHistory(Base):
    __tablename__ = "listen_history"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    song_id = Column(Integer, ForeignKey("songs.id"))
    played_at = Column(DateTime, default=datetime.utcnow)
    duration_played = Column(Integer) # To track partially played songs
    
    user = relationship("User", back_populates="history")

class Room(Base):
    __tablename__ = "rooms"
    id = Column(Integer, primary_key=True, index=True)
    room_code = Column(String, unique=True, index=True) # Shareable code
    name = Column(String)
    host_id = Column(Integer, ForeignKey("users.id"))
    
    # Massive Settings (Stored as JSON for flexibility)
    # Includes: allow_skips, allow_add_to_queue, private_room, max_participants
    settings = Column(JSON, default={
        "allow_skips": True,
        "allow_add_to_queue": True,
        "private_room": False,
        "max_participants": 20,
        "only_host_controls": False
    })
    
    # State
    current_song_id = Column(String, nullable=True) # video_id
    is_playing = Column(Boolean, default=False)
    progress = Column(Float, default=0.0)
    last_sync_at = Column(DateTime, default=datetime.utcnow)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    host = relationship("User")
    participants = relationship("RoomParticipant", back_populates="room")

class RoomParticipant(Base):
    __tablename__ = "room_participants"
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    joined_at = Column(DateTime, default=datetime.utcnow)
    
    room = relationship("Room", back_populates="participants")
    user = relationship("User")
class SearchHistory(Base):
    __tablename__ = "search_history"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    query = Column(String)
    searched_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User")
