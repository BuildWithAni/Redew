import React, { useState, useRef, useCallback, useEffect, memo } from 'react';
import {
  Search, Home, Library, Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Repeat, Repeat1, Shuffle, Music2, User, Heart,
  PlusSquare, ListMusic, Maximize2, ChevronDown, X, Clock, Disc3, Users, Share2, UserPlus
} from 'lucide-react';
import axios from 'axios';
import { useMusic } from './context/MusicContext';
// Google OAuth handled via system browser + backend polling
import { motion, AnimatePresence } from 'framer-motion';
import './App.css';

// For local development: http://127.0.0.1:8000
// For production/global sharing: Put your Render/Railway URL here (e.g., https://redew-api.onrender.com)
const API_BASE = 'http://127.0.0.1:8000'; 

const ONBOARDING_GENRES = [
  "Bollywood", "Punjabi", "Haryanvi", "Pop", "Hip-Hop", "Lo-Fi", "Indie", "Rock",
  "Classical", "Devotional", "EDM", "R&B", "Jazz", "Metal", "K-Pop", "Retro"
];

const ONBOARDING_ARTISTS = [
  { name: "Arijit Singh", img: "https://i.scdn.co/image/ab6761610000e5eb10bd2334f90f2367d328ca57" },
  { name: "Sidhu Moose Wala", img: "https://i.scdn.co/image/ab6761610000e5eb981b248b866672eeed4cb06c" },
  { name: "The Weeknd", img: "https://i.scdn.co/image/ab6761610000e5eb4718e2d1245382117ca68d34" },
  { name: "Taylor Swift", img: "https://i.scdn.co/image/ab6761610000e5eb98f39578648a8c99fca0fb8c" },
  { name: "Diljit Dosanjh", img: "https://i.scdn.co/image/ab6761610000e5eb51680de6f3d5ca46032b453e" },
  { name: "A.R. Rahman", img: "https://i.scdn.co/image/ab6761610000e5ebb19af0ea736c6228d6ba53d0" },
  { name: "Badshah", img: "https://i.scdn.co/image/ab6761610000e5ebb699042b5a67c7e5a073f136" },
  { name: "Shreya Ghoshal", img: "https://i.scdn.co/image/ab6761610000e5eb1ec999a41b528096230f878f" },
  { name: "Post Malone", img: "https://i.scdn.co/image/ab6761610000e5eb9435a7570ae5ca3362398896" },
  { name: "Justin Bieber", img: "https://i.scdn.co/image/ab6761610000e5eb8ae7f23317af295f1c045db3" },
  { name: "Drake", img: "https://i.scdn.co/image/ab6761610000e5eb4293385d324db8558179afd9" },
  { name: "Lana Del Rey", img: "https://i.scdn.co/image/ab6761610000e5eb2d08316130d210515f4834f8" }
];

// Extracted outside App to prevent recreation on every render
const EqBars = memo(() => (
  <div className="eq-bars">
    <span /><span /><span /><span />
  </div>
));

const TrackRow = memo(({ track, index, list, isActive, isPlaying, isLiked, onPlay, onLike, playlists, onAddToPlaylist }) => {
  const [showPlMenu, setShowPlMenu] = useState(false);

  return (
    <div
      className={`track-row ${isActive ? 'active' : ''}`}
      onClick={() => onPlay(track, list)}
    >
      <div className="track-num">
        {isActive && isPlaying ? <EqBars /> : <span>{index + 1}</span>}
      </div>
      <div className="track-thumb">
        <img src={track.thumbnail} alt="" loading="lazy" />
        <div className="track-thumb-overlay">
          {isActive && isPlaying ? <Pause size={16} /> : <Play size={16} fill="white" />}
        </div>
      </div>
      <div className="track-meta">
        <p className="track-title">{track.title}</p>
        <p className="track-artist">{track.channel}</p>
      </div>
      <div className="track-row-actions">
        <Heart
          size={16}
          className={`track-like ${isLiked ? 'liked' : ''}`}
          fill={isLiked ? '#e60000' : 'none'}
          onClick={(e) => { e.stopPropagation(); onLike(track); }}
        />
        <div className="pl-dropdown-wrap" onClick={(e) => e.stopPropagation()}>
          <PlusSquare size={16} className="track-plus" onClick={() => setShowPlMenu(!showPlMenu)} />
          {showPlMenu && (
            <div className="pl-dropdown">
              <p className="pl-dropdown-label">Add to Playlist</p>
              {playlists.map(p => (
                <div key={p.id} className="pl-dropdown-item" onClick={() => { onAddToPlaylist(p.id, track); setShowPlMenu(false); }}>
                  {p.name}
                </div>
              ))}
              {playlists.length === 0 && <p className="pl-dropdown-empty">No playlists</p>}
            </div>
          )}
        </div>
        <span className="track-dur">{track.duration}</span>
      </div>
    </div>
  );
});

function App() {
  const {
    currentTrack, playTrack, isPlaying, togglePlay,
    isScraping, progress, duration, seek, volume, setVolume,
    user, setUser, nextTrack, prevTrack,
    shuffle, setShuffle, repeat, setRepeat,
    queue, showQueue, setShowQueue,
    likedSongs, setLikedSongs, toggleLike,
    playlists, fetchPlaylists, createPlaylist, addToPlaylist,
    recentTracks,
    currentRoom, joinRoom, leaveRoom, roomParticipants, isRoomHost,
    roomSettings, updateRoomSettings
  } = useMusic();

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [homeResults, setHomeResults] = useState([]);
  const [currentPage, setCurrentPage] = useState('home');
  const [isLoading, setIsLoading] = useState(false);
  const [isHomeLoading, setIsHomeLoading] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ username: '', password: '', email: '' });
  const [isFullPlayer, setIsFullPlayer] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [likedSongsList, setLikedSongsList] = useState([]);
  const [featuredPlaylists, setFeaturedPlaylists] = useState([]);
  const [currentPlaylist, setCurrentPlaylist] = useState(null);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedArtists, setSelectedArtists] = useState([]);

  // Room State
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const [updateStatus, setUpdateStatus] = useState(null); // 'available', 'downloaded'
  const [showVideo, setShowVideo] = useState(false);
  const [videoStartTime, setVideoStartTime] = useState(0);
  
  // Friends System
  const [friends, setFriends] = useState(() => JSON.parse(localStorage.getItem('redew_friends')) || []);
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [newFriendName, setNewFriendName] = useState("");

  const handleAddFriend = () => {
    if (newFriendName.trim()) {
      const updatedFriends = [...friends, { username: newFriendName.trim(), isOnline: Math.random() > 0.5 }];
      setFriends(updatedFriends);
      localStorage.setItem('redew_friends', JSON.stringify(updatedFriends));
      setNewFriendName("");
      setIsAddingFriend(false);
    }
  };

  const fileInputRef = useRef(null);
  const progressBarRef = useRef(null);
  const volumeBarRef = useRef(null);

  const handleCreateRoom = async () => {
    const token = localStorage.getItem('token');
    if (!token || !newRoomName) return;
    try {
      const res = await axios.post(`${API_BASE}/rooms?name=${encodeURIComponent(newRoomName)}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await joinRoom(res.data.room_code);
      setIsCreatingRoom(false);
      setNewRoomName("");
      setCurrentPage('jam');
    } catch (e) { console.error(e); }
  };

  const handleJoinRoom = async () => {
    if (!joinCode) return;
    await joinRoom(joinCode.toUpperCase());
    setCurrentPage('jam');
    setJoinCode("");
  };

  const searchTimerRef = useRef(null);

  // Auth check on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.get(`${API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => {
          setUser(res.data);
          setShowAuth(false);
          if (!res.data.onboarding_completed) setShowOnboarding(true);
        })
        .catch(() => { localStorage.removeItem('token'); setShowAuth(true); })
        .finally(() => setIsAuthChecking(false));
    } else {
      setShowAuth(true);
      setIsAuthChecking(false);
    }

    // Electron Update Listeners
    if (window.ipcRenderer) {
      window.ipcRenderer.on('update_available', () => setUpdateStatus('available'));
      window.ipcRenderer.on('update_downloaded', () => setUpdateStatus('downloaded'));
    }
  }, [setUser]);

  const restartApp = () => {
    if (window.ipcRenderer) window.ipcRenderer.send('restart_app');
  };

  // Fetch home results & featured playlists
  useEffect(() => {
    const fetchHomeData = async () => {
      setIsHomeLoading(true);
      // Fetch trending search
      try {
        const searchRes = await axios.get(`${API_BASE}/search?q=latest+trending+music+hits`);
        setHomeResults(searchRes.data.results);
      } catch (e) { console.error("Trending search failed", e); }

      // Fetch featured playlists
      try {
        const featRes = await axios.get(`${API_BASE}/featured-playlists`);
        setFeaturedPlaylists(featRes.data);
      } catch (e) { console.error("Featured playlists failed", e); }
      
      setIsHomeLoading(false);
    };
    fetchHomeData();
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    const endpoint = isLogin ? '/login' : '/register';
    try {
      const res = await axios.post(`${API_BASE}${endpoint}`, formData);
      if (isLogin) {
        localStorage.setItem('token', res.data.access_token);
        const me = await axios.get(`${API_BASE}/users/me`, { headers: { Authorization: `Bearer ${res.data.access_token}` } });
        setUser(me.data);
        setShowAuth(false);
        if (!me.data.onboarding_completed) setShowOnboarding(true);
      } else { setIsLogin(true); }
    } catch (err) { alert(err.response?.data?.detail || "Auth failed"); }
  };

  const handleOnboardingComplete = async () => {
    const token = localStorage.getItem('token');
    try {
      await axios.post(`${API_BASE}/users/onboarding`, {
        genres: selectedGenres,
        artists: selectedArtists
      }, { headers: { Authorization: `Bearer ${token}` } });
      setShowOnboarding(false);
    } catch (e) { console.error(e); }
  };

  const handleSaveProfile = async (photoUrl = null) => {
    const token = localStorage.getItem('token');
    try {
      const res = await axios.put(`${API_BASE}/users/profile`, {
        username: editUsername || user.username,
        email: editEmail || user.email,
        profile_photo: photoUrl || user.profile_photo
      }, { headers: { Authorization: `Bearer ${token}` } });

      setUser(prev => ({ ...prev, ...res.data }));
      setIsEditingProfile(false);
      if (editUsername && editUsername !== user.username) {
        alert("Username updated! Please log in again if you encounter session issues.");
      }
    } catch (e) {
      alert(e.response?.data?.detail || "Update failed");
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      // Use local backend proxy to avoid CORS issues
      const res = await axios.post(`${API_BASE}/upload-to-catbox`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const photoUrl = res.data.url;
      await handleSaveProfile(photoUrl);
    } catch (err) {
      console.error("Upload failed", err);
      alert("Failed to upload photo. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const startEditing = () => {
    setEditUsername(user.username);
    setEditEmail(user.email || "");
    setIsEditingProfile(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setShowAuth(true);
  };

  const handleGoogleLogin = async () => {
    try {
      // First, confirm the backend is up
      const res = await axios.get(`${API_BASE}/auth/google/start`);
      const { url, session_id } = res.data;
      
      console.log('Opening OAuth URL:', url);
      
      // Open Google login in the system browser
      // Open Google login in the system browser
      // This is intercepted by main process setWindowOpenHandler
      window.open(url, '_blank');

      // Poll backend until Google login completes
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        if (attempts > 150) { // 5 minutes timeout
          clearInterval(pollInterval);
          return;
        }
        try {
          const pollRes = await axios.get(`${API_BASE}/auth/google/poll/${session_id}`);
          if (pollRes.data.status === 'complete') {
            clearInterval(pollInterval);
            localStorage.setItem('token', pollRes.data.access_token);
            const me = await axios.get(`${API_BASE}/users/me`, {
              headers: { Authorization: `Bearer ${pollRes.data.access_token}` }
            });
            setUser(me.data);
            setShowAuth(false);
          }
        } catch (e) {
          // Ignore errors during polling
        }
      }, 2000);
    } catch (error) {
      console.error(error);
      alert('Failed to start Google login. Please ensure the backend is running.');
    }
  };

  // Debounced search
  const onSearch = useCallback((e) => {
    const val = e.target.value;
    setSearchQuery(val);
    setCurrentPage('search');
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (val.length > 2) {
      setIsLoading(true);
      searchTimerRef.current = setTimeout(async () => {
        try {
          const res = await axios.get(`${API_BASE}/search?q=${encodeURIComponent(val)}`);
        setResults(res.data.results);
        setCurrentPage('search');
        // Record search history
        const token = localStorage.getItem('token');
        if (token) axios.post(`${API_BASE}/users/search-history?q=${encodeURIComponent(val)}`, {}, { headers: { Authorization: `Bearer ${token}` } });
      } catch (err) { console.error(err); }
      finally { setIsLoading(false); }
      }, 400);
    } else { setResults([]); setIsLoading(false); }
  }, []);

  useEffect(() => {
    if (user) fetchPlaylists();
  }, [user, fetchPlaylists]);

  // Fetch liked songs
  const fetchLikedSongs = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE}/liked-songs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLikedSongsList(res.data.songs);
      setLikedSongs(new Set(res.data.songs.map(s => s.id)));
    } catch (err) { console.error(err); }
  }, [setLikedSongs]);

  const handlePlaylistClick = async (p) => {
    if (p.songs) {
      setCurrentPlaylist(p);
      setCurrentPage('playlist');
      return;
    }
    // If it's a featured/remote playlist
    try {
      if (p.query) {
        setIsLoading(true);
        const res = await axios.get(`${API_BASE}/search?q=${encodeURIComponent(p.query)}`);
        setCurrentPlaylist({ ...p, songs: res.data.results });
      } else {
        const res = await axios.get(`${API_BASE}/playlists/${p.id}`);
        setCurrentPlaylist(res.data);
      }
      setCurrentPage('playlist');
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName) return;
    await createPlaylist(newPlaylistName);
    setIsCreatingPlaylist(false);
    setNewPlaylistName("");
  };

  useEffect(() => {
    if (currentPage === 'library') fetchLikedSongs();
  }, [currentPage, fetchLikedSongs]);

  const formatTime = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const handleProgressClick = (e) => {
    if (isDragging) return;
    const bar = progressBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(p * duration);
  };

  const handleDragStart = (e) => {
    setIsDragging(true);
    updateDrag(e);
  };

  const updateDrag = (e) => {
    const bar = progressBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setDragProgress(p * duration);
  };

  useEffect(() => {
    if (isDragging) {
      const handleMouseMove = (e) => updateDrag(e);
      const handleMouseUp = (e) => {
        updateDrag(e);
        setIsDragging(false);
        // Extracting p from updateDrag logic for final seek
        const bar = progressBarRef.current;
        if (bar) {
          const rect = bar.getBoundingClientRect();
          const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          seek(p * duration);
        }
      };
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, duration, seek]);

  const displayProgress = isDragging ? dragProgress : progress;
  const progressPercent = duration > 0 ? (displayProgress / duration) * 100 : 0;

  const handleVolumeClick = (e) => {
    const bar = volumeBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setVolume(p);
  };


  // Skeleton loader
  const SkeletonCard = () => (
    <div className="skeleton-card">
      <div className="skeleton-img shimmer" />
      <div className="skeleton-text shimmer" />
      <div className="skeleton-text short shimmer" />
    </div>
  );

  return (
    <div className={`app ${isFullPlayer ? 'player-expanded' : ''}`}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-box">
          <div className="logo" onClick={() => setCurrentPage('home')}>
            <Disc3 size={24} className="logo-icon" />
            <span>Redew</span>
          </div>
          <nav className="nav">
            <div className={`nav-item ${currentPage === 'home' ? 'active' : ''}`} onClick={() => setCurrentPage('home')}>
              <Home size={22} /><span>Home</span>
            </div>
            <div className={`nav-item ${currentPage === 'search' ? 'active' : ''}`} onClick={() => setCurrentPage('search')}>
              <Search size={22} /><span>Search</span>
            </div>
          </nav>
        </div>

        <div className="library-section">
          <div className="library-header">
            <span><Users size={22} /> Jam Session</span>
            {!currentRoom && <PlusSquare size={20} className="ctrl-icon" onClick={() => setIsCreatingRoom(true)} />}
          </div>
          <div className="jam-section-body">
            {currentRoom ? (
              <div className="active-jam-card" onClick={() => setCurrentPage('jam')}>
                <div className="jam-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={14} color="var(--primary-accent)" />
                    <p className="jam-name">{currentRoom}</p>
                  </div>
                  <span>{roomParticipants.length} listening • {isRoomHost ? 'Host' : 'Member'}</span>
                </div>
                <ChevronDown size={18} style={{ transform: 'rotate(-90deg)', color: 'var(--text-dim)' }} />
              </div>
            ) : (
              <div className="jam-join-box">
                <input
                  type="text"
                  placeholder="Enter code..."
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && joinCode && joinRoom(joinCode)}
                />
                <button className="join-btn-mini" onClick={() => joinCode && joinRoom(joinCode)}>Join</button>
              </div>
            )}
          </div>
        </div>

        <div className="library-section" style={{ marginTop: '24px' }}>
          <div className="library-header">
            <span><User size={22} /> Friends</span>
            <UserPlus size={20} className="ctrl-icon" onClick={() => setIsAddingFriend(!isAddingFriend)} />
          </div>
          <div className="jam-section-body">
            {isAddingFriend && (
              <div className="jam-join-box" style={{ marginBottom: '16px' }}>
                <input
                  type="text"
                  placeholder="Username..."
                  value={newFriendName}
                  onChange={e => setNewFriendName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddFriend()}
                />
                <button className="join-btn-mini" onClick={handleAddFriend}>Add</button>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {friends.map((friend, i) => (
                <div key={i} className="friend-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px 8px', borderRadius: '8px', transition: '0.2s' }}>
                  <div style={{ position: 'relative' }}>
                    <img src={`https://i.pravatar.cc/150?u=${friend.username}`} style={{ width: '32px', height: '32px', borderRadius: '50%' }} alt="" />
                    <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '10px', height: '10px', borderRadius: '50%', background: friend.isOnline ? '#1db954' : '#555', border: '2px solid #000' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: friend.isOnline ? '700' : '500', opacity: friend.isOnline ? 1 : 0.6 }}>{friend.username}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{friend.isOnline ? 'Online' : 'Offline'}</span>
                  </div>
                </div>
              ))}
              {friends.length === 0 && <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>No friends added yet.</span>}
            </div>
          </div>
        </div>

        <div className="library-section" style={{ flex: 2 }}>
          <div className="library-header">
            <span><Library size={22} /> Your Library</span>
            <PlusSquare size={20} className="ctrl-icon" onClick={() => setIsCreatingPlaylist(true)} />
          </div>

          <div className="library-scroll">
            <div className="pl-item" onClick={() => setCurrentPage('library')}>
              <div className="pl-item-img" style={{ background: 'linear-gradient(135deg, #450af5, #c4efd9)' }}>
                <Heart size={20} fill="white" color="white" />
              </div>
              <div className="pl-item-info">
                <p>Liked Songs</p>
                <span>Playlist • {likedSongs.size} songs</span>
              </div>
            </div>

            {playlists.map(p => (
              <div key={p.id} className="pl-item" onClick={() => handlePlaylistClick(p)}>
                <div className="pl-item-img">
                  <ListMusic size={20} />
                </div>
                <div className="pl-item-info">
                  <p>{p.name}</p>
                  <span>Playlist • {user?.username}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <header className="topbar">
          <div className="nav-controls">
            <button className="nav-btn"><Search size={16} style={{ transform: 'rotate(180deg)' }} /></button>
            <button className="nav-btn"><Search size={16} /></button>
          </div>

          <div className="search-wrap">
            <Search size={18} className="search-icon" />
            <input
              placeholder="What do you want to listen to?"
              value={searchQuery}
              onChange={onSearch}
              id="search-input"
            />
          </div>
          <div className="topbar-right">
            {user ? (
              <div className="user-account-trigger" onClick={() => setShowAccountPanel(true)}>
                {user.profile_photo ? (
                  <img src={user.profile_photo} className="user-icon-circle" style={{ objectFit: 'cover' }} alt="" />
                ) : (
                  <User size={18} className="user-icon-circle" />
                )}
                <span className="username-text">{user.username}</span>
              </div>
            ) : (
              <button className="topbar-btn" onClick={() => setShowAuth(true)}>Log in</button>
            )}
          </div>
        </header>

        <section className="content">
          <AnimatePresence mode="wait">
            {currentPage === 'home' && (
              <motion.div key="home" className="home-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                {/* 1. Time-Adaptive Daily Vibe */}
                <div 
                  className="time-vibe-hero" 
                  style={{
                    background: new Date().getHours() >= 6 && new Date().getHours() < 12 ? 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)' :
                                new Date().getHours() >= 12 && new Date().getHours() < 18 ? 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)' :
                                new Date().getHours() >= 18 && new Date().getHours() < 22 ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' :
                                'linear-gradient(135deg, #09203f 0%, #537895 100%)',
                    color: new Date().getHours() >= 6 && new Date().getHours() < 18 ? '#000' : '#fff',
                    padding: '48px', borderRadius: 'var(--radius-lg)', marginBottom: '32px', position: 'relative', overflow: 'hidden',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
                  }}
                >
                  <div style={{ position: 'relative', zIndex: 2, maxWidth: '600px' }}>
                    <h1 style={{ fontSize: '48px', fontWeight: '900', letterSpacing: '-2px', marginBottom: '8px' }}>
                      {new Date().getHours() >= 6 && new Date().getHours() < 12 ? 'Good Morning' :
                       new Date().getHours() >= 12 && new Date().getHours() < 18 ? 'Good Afternoon' :
                       new Date().getHours() >= 18 && new Date().getHours() < 22 ? 'Good Evening' : 'Late Night'}
                    </h1>
                    <h3 style={{ fontSize: '24px', fontWeight: '800', opacity: 0.9, marginBottom: '16px' }}>
                      {new Date().getHours() >= 6 && new Date().getHours() < 12 ? 'Focus & Coffee' :
                       new Date().getHours() >= 12 && new Date().getHours() < 18 ? 'Energy Boost' :
                       new Date().getHours() >= 18 && new Date().getHours() < 22 ? 'Unwind & Relax' : 'Late Night Drives'}
                    </h3>
                    <p style={{ fontSize: '16px', opacity: 0.8, marginBottom: '24px', lineHeight: '1.6' }}>
                      {new Date().getHours() >= 6 && new Date().getHours() < 12 ? 'Bright, fresh acoustics and lo-fi to start your day right.' :
                       new Date().getHours() >= 12 && new Date().getHours() < 18 ? 'Keep the momentum going with upbeat hits and viral tracks.' :
                       new Date().getHours() >= 18 && new Date().getHours() < 22 ? 'Deep sunset aesthetics with smooth R&B and chill pop.' : 'Dark, neon-lit aesthetics highlighting synthwave and deep house.'}
                    </p>
                    <button className="hero-play-btn" style={{ background: new Date().getHours() >= 6 && new Date().getHours() < 18 ? '#000' : '#fff', color: new Date().getHours() >= 6 && new Date().getHours() < 18 ? '#fff' : '#000' }} onClick={() => handlePlaylistClick(featuredPlaylists[0] || {query: "chill vibes"})}>
                      <Play size={20} fill={new Date().getHours() >= 6 && new Date().getHours() < 18 ? '#fff' : '#000'} /> Play the Vibe
                    </button>
                  </div>
                </div>

                {/* 2. Your Daily Discovery (AI DJ) */}
                <div className="section-header">
                  <h2><Disc3 size={24} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '8px', color: 'var(--primary-accent)' }} /> Your Daily Discovery</h2>
                  <span className="show-all">Refresh DJ</span>
                </div>
                <div className="ai-dj-scroll" style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '16px', marginBottom: '32px' }}>
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="music-card" style={{ minWidth: '180px' }} onClick={() => handlePlaylistClick({ query: `undiscovered gem track ${i}` })}>
                      <div className="card-img-wrap" style={{ borderRadius: '50%' }}>
                        <img src={`https://picsum.photos/seed/${i * 10}/200`} alt="" />
                        <button className="card-play-btn"><Play size={24} fill="black" /></button>
                      </div>
                      <p className="card-title" style={{ textAlign: 'center' }}>Daily Gem #{i}</p>
                      <p className="card-sub" style={{ textAlign: 'center' }}>Hyper-personalized</p>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '32px', marginBottom: '40px' }}>
                  {/* Left Column */}
                  <div>
                    {/* 5. Artist Spotlight of the Day */}
                    <div className="section-header">
                      <h2>Artist Spotlight</h2>
                    </div>
                    <div style={{ 
                      background: 'linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.8)), url(https://i.scdn.co/image/ab6761610000e5eb4718e2d1245382117ca68d34)', 
                      backgroundSize: 'cover', backgroundPosition: 'center', 
                      borderRadius: 'var(--radius-lg)', padding: '32px', minHeight: '280px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                    }}>
                      <span style={{ background: 'var(--primary-accent)', color: '#fff', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '800', width: 'fit-content', marginBottom: '8px' }}>SPOTLIGHT</span>
                      <h1 style={{ fontSize: '40px', fontWeight: '900', marginBottom: '8px' }}>The Weeknd</h1>
                      <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px', maxWidth: '400px', marginBottom: '20px' }}>Did you know? "Blinding Lights" holds the record for the most streamed song in history. Dive into his curated essentials mix today.</p>
                      <button className="btn-primary" style={{ width: 'fit-content', borderRadius: '30px', padding: '10px 24px' }} onClick={() => handlePlaylistClick({query: "The Weeknd Top Tracks"})}>Play Artist Mix</button>
                    </div>

                    {/* 6. Active Public Jam Rooms */}
                    <div className="section-header" style={{ marginTop: '32px' }}>
                      <h2><Users size={24} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '8px' }} /> Active Public Jams</h2>
                    </div>
                    {/* Render from real DB data (currently empty) */}
                    <div className="empty-state" style={{ padding: '24px 0', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
                      <Users size={32} opacity={0.3} style={{ marginBottom: '8px' }} />
                      <h4 style={{ color: 'var(--text-muted)' }}>No public jams right now</h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Be the first to start one and invite friends!</p>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div>
                    {/* 4. Real-Time Top 10 Global Hits Chart */}
                    <div className="section-header">
                      <h2><span style={{ color: '#1db954' }}>#</span> Global Hits</h2>
                    </div>
                    <div style={{ background: 'var(--elevated)', borderRadius: 'var(--radius-lg)', padding: '16px' }}>
                      {[
                        { rank: 1, title: "Blinding Lights", artist: "The Weeknd", trend: "up" },
                        { rank: 2, title: "Shape of You", artist: "Ed Sheeran", trend: "same" },
                        { rank: 3, title: "Starboy", artist: "The Weeknd", trend: "down" },
                        { rank: 4, title: "As It Was", artist: "Harry Styles", trend: "up" },
                        { rank: 5, title: "Dance Monkey", artist: "Tones And I", trend: "down" }
                      ].map(track => (
                        <div key={track.rank} className="track-row" style={{ padding: '12px 8px' }} onClick={() => handlePlaylistClick({query: track.title + " " + track.artist})}>
                          <span style={{ width: '20px', fontWeight: '800', color: track.rank === 1 ? 'var(--primary-accent)' : 'var(--text-muted)' }}>{track.rank}</span>
                          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingLeft: '12px' }}>
                            <span style={{ fontSize: '14px', fontWeight: '700' }}>{track.title}</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{track.artist}</span>
                          </div>
                          <span style={{ color: track.trend === 'up' ? '#1db954' : track.trend === 'down' ? '#e60000' : 'var(--text-dim)', fontSize: '16px' }}>
                            {track.trend === 'up' ? '▲' : track.trend === 'down' ? '▼' : '−'}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* 3. Live Social Feed */}
                    <div className="section-header" style={{ marginTop: '32px' }}>
                      <h2>Live Friend Activity</h2>
                    </div>
                    {/* Render from real DB data (currently empty) */}
                    <div className="empty-state" style={{ padding: '24px 0', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
                      <User size={32} opacity={0.3} style={{ marginBottom: '8px' }} />
                      <h4 style={{ color: 'var(--text-muted)' }}>No recent activity</h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Add friends to see what they are listening to.</p>
                    </div>
                  </div>
                </div>

                <div className="home-spacer" style={{ height: '40px' }} />
              </motion.div>
            )}

            {currentPage === 'search' && (
              <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                <h2 className="section-heading">
                  {searchQuery ? `Results for "${searchQuery}"` : 'Search'}
                </h2>
                {isLoading ? (
                  <div className="track-list">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="skeleton-row shimmer" />
                    ))}
                  </div>
                ) : results.length > 0 ? (
                  <div className="track-list">
                    <div className="track-list-header">
                      <span className="th-num">#</span>
                      <span className="th-title">Title</span>
                      <span className="th-dur"><Clock size={14} /></span>
                    </div>
                    {results.map((track, i) => (
                      <TrackRow key={track.id} track={track} index={i} list={[track]} isActive={currentTrack?.id === track.id} isPlaying={isPlaying} isLiked={likedSongs.has(track.id)} onPlay={playTrack} onLike={toggleLike} playlists={playlists} onAddToPlaylist={addToPlaylist} />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Search size={48} strokeWidth={1} />
                    <h3>Search for music</h3>
                    <p>Find your favorite songs, artists, and albums.</p>
                  </div>
                )}
              </motion.div>
            )}

            {currentPage === 'jam' && (
              <motion.div key="jam" className="jam-room-page" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {!currentRoom ? (
                  <div className="empty-state">
                    <Users size={64} color="var(--primary-accent)" />
                    <h2>Not in a Jam</h2>
                    <p>Join or create a session to listen together.</p>
                    <button className="btn-primary" style={{ marginTop: '20px' }} onClick={() => setIsCreatingRoom(true)}>Create Session</button>
                  </div>
                ) : (
                  <div className="jam-grid">
                    <div className="jam-main-view">
                      <div className="jam-header-row">
                        <div className="jam-title-block">
                          <span className="live-tag">LIVE SESSION</span>
                          <h1>{currentRoom}</h1>
                        </div>
                        <div className="jam-actions">
                          <button className="share-btn" onClick={() => { navigator.clipboard.writeText(currentRoom); alert("Code copied!"); }}>
                            <Share2 size={18} /> <span>{currentRoom}</span>
                          </button>
                          <button className="leave-btn-red" onClick={leaveRoom}>Leave Session</button>
                        </div>
                      </div>

                      {currentTrack ? (
                        <div className="jam-now-playing">
                          <div className="jam-art-wrap">
                            <img src={currentTrack.thumbnail} className="jam-big-art" alt="" />
                            {isPlaying && <div className="art-pulse" />}
                          </div>
                          <div className="jam-track-info">
                            <h2>{currentTrack.title}</h2>
                            <p>{currentTrack.channel}</p>
                            <div className="jam-visualizer">
                              {[...Array(12)].map((_, i) => <div key={i} className="v-bar" style={{ animationDelay: `${i * 0.1}s` }} />)}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="jam-nothing-playing">
                          <p>Nothing playing yet...</p>
                        </div>
                      )}
                    </div>

                    <div className="jam-sidebar-view">
                      <div className="jam-panel-section">
                        <h3>Participants ({roomParticipants.length})</h3>
                        <div className="participant-list">
                          {(roomParticipants || []).map((p, i) => (
                            <div key={i} className="participant-item">
                              <div className="p-avatar">
                                {p ? p.charAt(0).toUpperCase() : '?'}
                                {p === (user?.username || "Guest") && <div className="me-badge" />}
                              </div>
                              <div className="p-info">
                                <p>{p || "Unknown"}</p>
                                <span>{i === 0 ? 'Room Host' : 'Listening'}</span>
                              </div>
                              {i === 0 && <Disc3 size={16} className="logo-icon" />}
                            </div>
                          ))}
                        </div>
                      </div>

                      {isRoomHost && (
                        <div className="jam-panel-section" style={{ marginTop: '32px' }}>
                          <h3>Room Settings</h3>
                          <div className="settings-stack">
                            <div className="setting-toggle">
                              <span>Allow Skips</span>
                              <div className={`toggle-pill ${roomSettings.allow_skips ? 'active' : ''}`} onClick={() => updateRoomSettings({ allow_skips: !roomSettings.allow_skips })} />
                            </div>
                            <div className="setting-toggle">
                              <span>Collaborative Queue</span>
                              <div className={`toggle-pill ${roomSettings.allow_add_to_queue ? 'active' : ''}`} onClick={() => updateRoomSettings({ allow_add_to_queue: !roomSettings.allow_add_to_queue })} />
                            </div>
                            <div className="setting-toggle">
                              <span>Private Session</span>
                              <div className={`toggle-pill ${roomSettings.private_room ? 'active' : ''}`} onClick={() => updateRoomSettings({ private_room: !roomSettings.private_room })} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {currentPage === 'playlist' && currentPlaylist && (
              <motion.div key="playlist" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                <div className="playlist-header">
                  <div className="pl-art">
                    {currentPlaylist.image ? <img src={currentPlaylist.image} alt="" /> : <ListMusic size={64} color="var(--primary)" />}
                  </div>
                  <div className="pl-info">
                    <p className="pl-tag">{currentPlaylist.type === 'mood' ? 'Mood Playlist' : currentPlaylist.type === 'artist' ? 'Artist Radio' : 'Playlist'}</p>
                    <h1 className="pl-name-big">{currentPlaylist.name}</h1>
                    <p className="pl-desc">{currentPlaylist.description}</p>
                    <div className="pl-actions">
                      <button className="pl-play-main" onClick={() => playTrack(currentPlaylist.songs[0], currentPlaylist.songs)}>
                        <Play size={24} fill="black" /> Play
                      </button>
                    </div>
                  </div>
                </div>
                <div className="track-list">
                  <div className="track-list-header">
                    <span className="th-num">#</span>
                    <span className="th-title">Title</span>
                    <span className="th-dur"><Clock size={14} /></span>
                  </div>
                  {currentPlaylist.songs?.map((track, i) => (
                    <TrackRow key={track.id} track={track} index={i} list={currentPlaylist.songs} isActive={currentTrack?.id === track.id} isPlaying={isPlaying} isLiked={likedSongs.has(track.id)} onPlay={playTrack} onLike={toggleLike} playlists={playlists} onAddToPlaylist={addToPlaylist} />
                  ))}
                </div>
              </motion.div>
            )}

            {currentPage === 'library' && (
              <motion.div key="library" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                <h2 className="section-heading">
                  <Heart size={28} fill="#e60000" color="#e60000" /> Liked Songs
                </h2>
                {likedSongsList.length > 0 ? (
                  <div className="track-list">
                    {likedSongsList.map((track, i) => (
                      <TrackRow key={track.id} track={track} index={i} list={likedSongsList} isActive={currentTrack?.id === track.id} isPlaying={isPlaying} isLiked={likedSongs.has(track.id)} onPlay={playTrack} onLike={toggleLike} playlists={playlists} onAddToPlaylist={addToPlaylist} />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Heart size={48} strokeWidth={1} />
                    <h3>Songs you like appear here</h3>
                    <p>Save songs by tapping the heart icon.</p>
                  </div>
                )}
              </motion.div>
            )}

            {currentPage === 'room' && (
              <motion.div key="room" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                {!currentRoom ? (
                  <div className="room-entry">
                    <div className="room-entry-card">
                      <Users size={64} color="var(--primary)" />
                      <h1>Join a Jam</h1>
                      <p>Listen together with friends in real-time.</p>

                      <div className="room-actions">
                        <div className="join-group">
                          <input
                            placeholder="Enter Room Code"
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value)}
                            maxLength={8}
                          />
                          <button className="btn-primary" onClick={handleJoinRoom}>Join Room</button>
                        </div>

                        <div className="divider-text">OR</div>

                        <button className="btn-secondary create-room-btn" onClick={() => setIsCreatingRoom(true)}>
                          <PlusSquare size={18} /> Create New Room
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="room-active">
                    <div className="room-header">
                      <div className="room-info">
                        <p className="room-tag">Active Jam Session</p>
                        <h1>Room Code: <span className="highlight">{currentRoom}</span></h1>
                      </div>
                      <button className="btn-secondary leave-btn" onClick={leaveRoom}>Leave Room</button>
                    </div>

                    <div className="room-controls-card">
                      <h3>Room Settings</h3>
                      <div className="setting-row">
                        <span>Allow participants to skip</span>
                        <div
                          className={`toggle ${roomSettings.allowSkip ? 'active' : ''} ${!isRoomHost ? 'disabled' : ''}`}
                          onClick={() => isRoomHost && updateRoomSettings({ allowSkip: !roomSettings.allowSkip })}
                        ></div>
                      </div>
                      <div className="setting-row">
                        <span>Allow participants to add to queue</span>
                        <div
                          className={`toggle ${roomSettings.allowQueue ? 'active' : ''} ${!isRoomHost ? 'disabled' : ''}`}
                          onClick={() => isRoomHost && updateRoomSettings({ allowQueue: !roomSettings.allowQueue })}
                        ></div>
                      </div>
                      <div className="setting-row">
                        <span>Private room</span>
                        <div
                          className={`toggle ${roomSettings.isPrivate ? 'active' : ''} ${!isRoomHost ? 'disabled' : ''}`}
                          onClick={() => isRoomHost && updateRoomSettings({ isPrivate: !roomSettings.isPrivate })}
                        ></div>
                      </div>
                    </div>

                    <div className="room-participants-list">
                      <h3>Participants</h3>
                      <div className="p-grid">
                        {roomParticipants.map((p, i) => (
                          <div key={i} className={`p-badge ${p === user?.username ? 'me' : ''}`}>
                            <User size={14} /> <span>{p} {p === user?.username ? '(You)' : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      {/* Right Panel */}
      <aside className="right-panel">
        <div className="now-playing-box">
          <div className="now-playing-header">
            <h3>Now Playing</h3>
            <X size={18} className="ctrl-icon" onClick={() => setIsFullPlayer(false)} />
          </div>

          {currentTrack ? (
            <>
              <div className="now-playing-art">
                {showVideo ? (
                  <iframe 
                    width="100%" 
                    height="100%" 
                    src={`https://www.youtube-nocookie.com/embed/${currentTrack.id}?autoplay=1&start=${videoStartTime}&origin=https://localhost`} 
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen
                    style={{ borderRadius: 'var(--radius-md)' }}
                  />
                ) : (
                  <img src={currentTrack.thumbnail} alt="" />
                )}
              </div>
              <div className="now-playing-info">
                <h2>{currentTrack.title.split('|')[0].trim()}</h2>
                <p>{currentTrack.channel}</p>
              </div>

              <button 
                className="btn-secondary" 
                style={{ width: '100%', marginTop: '12px', background: 'var(--elevated)', border: '1px solid var(--border)', padding: '8px', borderRadius: '20px', color: 'var(--text)', fontWeight: 'bold', cursor: 'pointer' }}
                onClick={() => {
                  if (!showVideo) {
                    setVideoStartTime(Math.floor(progress));
                  }
                  setShowVideo(!showVideo);
                }}
              >
                {showVideo ? 'Switch to Audio Image' : 'Switch to Video'}
              </button>

              <div className="about-artist">
                <h4>About the artist</h4>
                <p>
                  {currentTrack.channel} is one of the most trending creators on the platform.
                  Currently vibing with thousands of listeners worldwide.
                </p>
              </div>

              <div className="next-in-queue" style={{ marginTop: '24px' }}>
                <div className="section-header">
                  <h4 style={{ fontSize: '14px', fontWeight: '800' }}>Next in queue</h4>
                  <span className="show-all" onClick={() => setShowQueue(true)}>Open queue</span>
                </div>
                {queue.length > 1 ? (
                  <div className="pl-item" style={{ background: 'var(--elevated)', marginTop: '8px' }}>
                    <img src={queue[1].thumbnail} style={{ width: '48px', height: '48px', borderRadius: '4px' }} alt="" />
                    <div className="pl-item-info">
                      <p style={{ fontSize: '13px' }}>{queue[1].title.slice(0, 30)}...</p>
                      <span style={{ fontSize: '11px' }}>{queue[1].channel}</span>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '8px' }}>Queue is empty</p>
                )}
              </div>

              <div className="friend-activity" style={{ marginTop: '32px' }}>
                <div className="section-header">
                  <h4 style={{ fontSize: '14px', fontWeight: '800' }}>Friend Activity</h4>
                  <User size={16} className="ctrl-icon" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                  {[
                    { name: 'Anirudh', track: 'Blinding Lights', time: '2m', img: 'https://i.pravatar.cc/150?u=ani' },
                    { name: 'Rahul', track: 'Kesariya', time: '10m', img: 'https://i.pravatar.cc/150?u=rahul' },
                    { name: 'Sneha', track: 'Starboy', time: '1h', img: 'https://i.pravatar.cc/150?u=sneha' }
                  ].map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <img src={f.img} style={{ width: '32px', height: '32px', borderRadius: '50%' }} alt="" />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '13px', fontWeight: '700' }}>{f.name}</p>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{f.track} • {f.time}</p>
                      </div>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1db954' }} />
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <Disc3 size={48} />
              <p>Select a song to start listening</p>
            </div>
          )}
        </div>
      </aside>

      <AnimatePresence>
        {isCreatingRoom && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal-content" initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
              <h2>Create Jam Room</h2>
              <input placeholder="Room Name" value={newRoomName} onChange={e => setNewRoomName(e.target.value)} />
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setIsCreatingRoom(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleCreateRoom}>Create</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showAccountPanel && user && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAccountPanel(false)}>
            <motion.div
              className="account-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="account-panel-header">
                <h2>Account Management</h2>
                <X size={24} className="ctrl-icon" onClick={() => setShowAccountPanel(false)} />
              </div>

              <div className="account-profile-hero">
                <div
                  className={`profile-avatar-large ${isUploading ? 'uploading' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {user.profile_photo ? (
                    <img src={user.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  ) : (
                    user.username[0].toUpperCase()
                  )}
                  <div className="avatar-edit-overlay">
                    {isUploading ? <Disc3 className="spin" size={24} /> : <Search size={20} />}
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={handleFileSelect}
                  />
                </div>
                <div className="profile-info-large">
                  {isEditingProfile ? (
                    <div className="profile-edit-fields">
                      <input
                        type="text"
                        value={editUsername}
                        onChange={e => setEditUsername(e.target.value)}
                        placeholder="Username"
                        className="edit-input"
                      />
                      <input
                        type="email"
                        value={editEmail}
                        onChange={e => setEditEmail(e.target.value)}
                        placeholder="Email"
                        className="edit-input"
                      />
                      <div className="profile-edit-actions">
                        <button className="btn-save" onClick={handleSaveProfile}>Save</button>
                        <button className="btn-cancel-small" onClick={() => setIsEditingProfile(false)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h1>{user.username}</h1>
                      <p>{user.email || 'user@redew.io'}</p>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span className="profile-badge">Free Member</span>
                        <button className="edit-profile-btn" onClick={startEditing}>Edit Profile</button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="account-sections">
                {/* Your Plan */}
                <div className="account-section">
                  <div className="section-title">
                    <Disc3 size={18} /> <h3>Your Plan</h3>
                  </div>
                  <div className="membership-card spotify-style">
                    <div className="membership-info">
                      <p className="plan-name">Redew Free</p>
                      <p className="plan-status">Ad-supported listening</p>
                    </div>
                    <button className="btn-join-premium">Join Premium</button>
                  </div>
                </div>

                {/* Account Management */}
                <div className="account-section">
                  <div className="section-title">
                    <User size={18} /> <h3>Account</h3>
                  </div>
                  <div className="setting-group">
                    <div className="setting-item" onClick={() => alert("Redirecting to subscription management...")}>
                      <div className="setting-label">
                        <span>Manage your subscription</span>
                        <p>Change your plan or billing cycle</p>
                      </div>
                      <ChevronDown size={18} style={{ transform: 'rotate(-90deg)' }} />
                    </div>
                    <div className="setting-item">
                      <div className="setting-label">
                        <span>Edit personal info</span>
                        <p>Update your email or username</p>
                      </div>
                      <ChevronDown size={18} style={{ transform: 'rotate(-90deg)' }} />
                    </div>
                    <div className="setting-item">
                      <div className="setting-label">
                        <span>Recover playlists</span>
                        <p>Get back playlists you've deleted</p>
                      </div>
                      <ChevronDown size={18} style={{ transform: 'rotate(-90deg)' }} />
                    </div>
                    <div className="setting-item">
                      <span>Address</span>
                      <ChevronDown size={18} style={{ transform: 'rotate(-90deg)' }} />
                    </div>
                  </div>
                </div>

                {/* Payment */}
                <div className="account-section">
                  <div className="section-title">
                    <ListMusic size={18} /> <h3>Payment</h3>
                  </div>
                  <div className="setting-group">
                    <div className="setting-item"><span>Payment history</span></div>
                    <div className="setting-item"><span>Saved payment cards</span></div>
                    <div className="setting-item"><span>Redeem</span></div>
                  </div>
                </div>

                {/* Security & Privacy */}
                <div className="account-section">
                  <div className="section-title">
                    <Music2 size={18} /> <h3>Security and privacy</h3>
                  </div>
                  <div className="setting-group">
                    <div className="setting-item"><span>Change password</span></div>
                    <div className="setting-item"><span>Manage apps</span></div>
                    <div className="setting-item"><span>Notification settings</span></div>
                    <div className="setting-item"><span>Account privacy</span></div>
                    <div className="setting-item"><span>Edit login methods</span></div>
                    <div className="setting-item danger" onClick={() => alert("Are you sure you want to close your account?")}>
                      <span>Close account</span>
                    </div>
                    <div className="setting-item" onClick={() => alert("Signing out from all devices...")}>
                      <span>Sign out everywhere</span>
                    </div>
                  </div>
                </div>

                {/* Advertising */}
                <div className="account-section">
                  <div className="section-title">
                    <Maximize2 size={18} /> <h3>Advertising</h3>
                  </div>
                  <div className="setting-group">
                    <div className="setting-item"><span>Ad preferences</span></div>
                  </div>
                </div>

                {/* Help */}
                <div className="account-section">
                  <div className="section-title">
                    <Search size={18} /> <h3>Help</h3>
                  </div>
                  <div className="setting-group">
                    <div className="setting-item"><span>Redew support</span></div>
                  </div>
                </div>
              </div>

              <div className="account-footer">
                <button className="logout-button-full" onClick={() => { handleLogout(); setShowAccountPanel(false); }}>
                  Log out
                </button>
                <p className="version-tag">Redew Music v1.1.0 • Clean Build</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCreatingPlaylist && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal-content" initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}>
              <h3>Create New Playlist</h3>
              <input
                type="text"
                placeholder="Playlist name"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                autoFocus
              />
              <div className="modal-btns">
                <button className="btn-secondary" onClick={() => setIsCreatingPlaylist(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleCreatePlaylist}>Create</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCreatingRoom && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal-content" initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}>
              <h3>Create Jam Room</h3>
              <input
                type="text"
                placeholder="Room Name"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                autoFocus
              />
              <div className="modal-btns">
                <button className="btn-secondary" onClick={() => setIsCreatingRoom(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleCreateRoom}>Create</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Onboarding Modal */}
      <AnimatePresence>
        {showOnboarding && (
          <motion.div className="modal-overlay onboarding-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal-content onboarding-content" initial={{ y: 50 }} animate={{ y: 0 }} exit={{ y: 50 }}>
              <div className="onboarding-header">
                <h1>{onboardingStep === 1 ? "What music do you love?" : "Choose your favorite artists"}</h1>
                <p>{onboardingStep === 1 ? "Select at least 3 genres to personalize your feed" : "Follow artists you enjoy"}</p>
              </div>

              {onboardingStep === 1 ? (
                <div className="genre-grid">
                  {ONBOARDING_GENRES.map(genre => (
                    <div
                      key={genre}
                      className={`genre-pill ${selectedGenres.includes(genre) ? 'selected' : ''}`}
                      onClick={() => setSelectedGenres(prev => prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre])}
                    >
                      {genre}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="artist-selection-grid">
                  {ONBOARDING_ARTISTS.map(artist => (
                    <div
                      key={artist.name}
                      className={`artist-select-card ${selectedArtists.includes(artist.name) ? 'selected' : ''}`}
                      onClick={() => setSelectedArtists(prev => prev.includes(artist.name) ? prev.filter(a => a !== artist.name) : [...prev, artist.name])}
                    >
                      <img src={artist.img} alt="" />
                      <span>{artist.name}</span>
                      {selectedArtists.includes(artist.name) && <div className="select-check"><Disc3 size={14} /></div>}
                    </div>
                  ))}
                </div>
              )}

              <div className="onboarding-footer">
                {onboardingStep === 2 && (
                  <button className="btn-secondary" onClick={() => setOnboardingStep(1)}>Back</button>
                )}
                <div className="step-dots">
                  <div className={`dot ${onboardingStep === 1 ? 'active' : ''}`} />
                  <div className={`dot ${onboardingStep === 2 ? 'active' : ''}`} />
                </div>
                {onboardingStep === 1 ? (
                  <button className="btn-primary" disabled={selectedGenres.length < 3} onClick={() => setOnboardingStep(2)}>Next</button>
                ) : (
                  <button className="btn-primary" onClick={handleOnboardingComplete}>Finish Selection</button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Queue Panel */}
      <AnimatePresence>
        {showQueue && (
          <motion.aside
            className="queue-panel"
            initial={{ x: 320 }} animate={{ x: 0 }} exit={{ x: 320 }}
            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
          >
            <div className="queue-header">
              <h3>Queue</h3>
              <X size={20} className="queue-close" onClick={() => setShowQueue(false)} />
            </div>
            {currentTrack && (
              <div className="queue-now">
                <p className="queue-label">Now Playing</p>
                <div className="queue-item active">
                  <img src={currentTrack.thumbnail} alt="" />
                  <div>
                    <p className="q-title">{currentTrack.title}</p>
                    <p className="q-artist">{currentTrack.channel}</p>
                  </div>
                </div>
              </div>
            )}
            <p className="queue-label">Next Up</p>
            <div className="queue-list">
              {queue.filter(t => t.id !== currentTrack?.id).slice(0, 20).map((track, i) => (
                <div key={track.id} className="queue-item" onClick={() => playTrack(track, queue)}>
                  <img src={track.thumbnail} alt="" />
                  <div>
                    <p className="q-title">{track.title}</p>
                    <p className="q-artist">{track.channel}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Player Bar */}
      <footer className="player-bar">
        <div className="pb-left">
          {currentTrack && (
            <>
              <img src={currentTrack.thumbnail} alt="" className="pb-art" onClick={() => setIsFullPlayer(true)} />
              <div className="pb-info">
                <p className="pb-title">{currentTrack.title.split('|')[0].trim()}</p>
                <p className="pb-artist">{currentTrack.channel}</p>
              </div>
              <Heart
                size={18}
                className={`pb-like ${likedSongs.has(currentTrack.id) ? 'liked' : ''}`}
                fill={likedSongs.has(currentTrack.id) ? '#1db954' : 'none'}
                color={likedSongs.has(currentTrack.id) ? '#1db954' : 'currentColor'}
                onClick={() => toggleLike(currentTrack)}
              />
            </>
          )}
        </div>

        <div className="pb-center">
          <div className="pb-controls">
            <Shuffle size={16} className={`ctrl-icon ${shuffle ? 'active' : ''}`} onClick={() => setShuffle(!shuffle)} />
            <SkipBack size={20} fill="currentColor" className="ctrl-icon" onClick={prevTrack} />
            <button className="play-btn" onClick={togglePlay}>
              {isPlaying ? <Pause size={20} fill="black" color="black" /> : <Play size={20} fill="black" color="black" />}
            </button>
            <SkipForward size={20} fill="currentColor" className="ctrl-icon" onClick={nextTrack} />
            <Repeat size={16} className={`ctrl-icon ${repeat !== 'none' ? 'active' : ''}`} onClick={() => setRepeat(repeat === 'none' ? 'all' : 'none')} />
          </div>
          <div className="pb-progress-wrap">
            <span className="pb-time">{formatTime(progress)}</span>
            <div className="progress-bar" ref={progressBarRef} onMouseDown={handleDragStart} onClick={handleProgressClick}>
              <div className="progress-fill" style={{ width: `${progressPercent}%` }}>
                <div className="progress-knob" />
              </div>
            </div>
            <span className="pb-time">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="pb-right">
          <ListMusic size={18} className="ctrl-icon" onClick={() => setShowQueue(!showQueue)} />
          <div className="vol-wrap">
            {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            <input
              type="range" min="0" max="1" step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="vol-slider"
              style={{
                backgroundImage: `linear-gradient(90deg, #e60000 ${volume * 100}%, rgba(255,255,255,0.1) ${volume * 100}%)`
              }}
            />
          </div>
          <Maximize2 size={18} className="ctrl-icon" onClick={() => setIsFullPlayer(true)} />
        </div>
      </footer>

      {/* Full Screen Player */}
      <AnimatePresence>
        {isFullPlayer && currentTrack && (
          <motion.div
            className="fullscreen-player"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="fp-bg" style={{ backgroundImage: `url(${currentTrack.thumbnail})` }} />
            <button className="fp-close" onClick={() => setIsFullPlayer(false)}>
              <ChevronDown size={28} />
            </button>
            <div className="fp-body">
              <motion.img
                src={currentTrack.thumbnail}
                className="fp-art"
                alt=""
                animate={{ rotate: isPlaying ? 360 : 0 }}
                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                style={{ borderRadius: '50%' }}
              />
              <div className="fp-details">
                <h1 className="fp-title">{currentTrack.title}</h1>
                <h3 className="fp-artist">{currentTrack.channel}</h3>

                <div className="fp-progress">
                  <div className="progress-bar large" ref={null} onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    seek(((e.clientX - rect.left) / rect.width) * duration);
                  }}>
                    <div className="progress-fill" style={{ width: `${progressPercent}%` }}>
                      <div className="progress-knob" />
                    </div>
                  </div>
                  <div className="fp-times">
                    <span>{formatTime(progress)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                <div className="fp-controls">
                  <Shuffle size={20} className={`ctrl-icon ${shuffle ? 'active' : ''}`} onClick={() => setShuffle(!shuffle)} />
                  <SkipBack size={28} fill="white" className="ctrl-icon" onClick={prevTrack} />
                  <button className="play-btn large" onClick={togglePlay}>
                    {isPlaying ? <Pause size={28} fill="black" color="black" /> : <Play size={28} fill="black" color="black" />}
                  </button>
                  <SkipForward size={28} fill="white" className="ctrl-icon" onClick={nextTrack} />
                  <Repeat size={20} className={`ctrl-icon ${repeat !== 'none' ? 'active' : ''}`} onClick={() => setRepeat(repeat === 'none' ? 'all' : 'none')} />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth Modal */}
      {showAuth && !isAuthChecking && (
        <div className="auth-overlay">
          <div className="auth-modal">
            <div className="auth-brand">
              <Disc3 size={56} className="auth-logo" />
              <h1>REDEW</h1>
              <p>Music. Redefined.</p>
            </div>
            <div className="auth-form-side">
              <h2>{isLogin ? "Welcome back" : "Join Redew"}</h2>
              <button onClick={handleGoogleLogin} className="google-btn">
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
                  <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
                  <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.519-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
                  <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
                </svg>
                Continue with Google
              </button>
              <div className="auth-divider"><span>or</span></div>
              <form onSubmit={handleAuth}>
                {!isLogin && <input placeholder="Email" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />}
                <input placeholder="Username" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} />
                <input placeholder="Password" type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                <button type="submit" className="submit-btn">{isLogin ? 'Log In' : 'Sign Up'}</button>
              </form>
              <p className="toggle-auth" onClick={() => setIsLogin(!isLogin)}>
                {isLogin ? "Don't have an account? Sign up" : "Already have an account? Log in"}
              </p>
              <button className="guest-btn" onClick={() => setShowAuth(false)}>Continue as Guest</button>
            </div>
          </div>
        </div>
      )}

      {/* Update Notification */}
      <AnimatePresence>
        {updateStatus && (
          <motion.div 
            className="update-notif"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            style={{
              position: 'fixed', bottom: '110px', right: '30px',
              background: '#181818', border: '1px solid var(--primary-accent)',
              padding: '16px', borderRadius: '16px', zIndex: 1000,
              display: 'flex', alignItems: 'center', gap: '16px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
            }}
          >
            <Disc3 className="spin" size={24} color="var(--primary-accent)" />
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: '700', fontSize: '14px', margin: 0 }}>
                {updateStatus === 'available' ? 'Update Downloading...' : 'Update Ready!'}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-dim)', margin: 0 }}>
                New features are waiting for you.
              </p>
            </div>
            {updateStatus === 'downloaded' && (
              <button 
                className="btn-primary" 
                style={{ padding: '8px 16px', fontSize: '12px' }}
                onClick={restartApp}
              >
                Restart Now
              </button>
            )}
            <X size={18} style={{ cursor: 'pointer', opacity: 0.5 }} onClick={() => setUpdateStatus(null)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
