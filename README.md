# 🎵 Redew Music — Premium Streaming Platform

<p align="center">
  <img src="public/icon.png" width="128" height="128" alt="Redew Logo">
</p>

<p align="center">
  <b>Elevate your auditory experience with Redew, the next-generation desktop music player.</b>
</p>

---

## ✨ Overview

**Redew** is a high-performance desktop music streaming application built for music enthusiasts who crave a minimalist yet powerful interface. Seamlessly integrating the vast library of YouTube with a premium, glassmorphic design, Redew provides an unparalleled listening experience.

## 🚀 Key Features

- 🎧 **High-Fidelity Streaming**: Integrated `hls.js` for adaptive, high-quality audio playback.
- 🔐 **Secure Authentication**: Native Google OAuth integration for personalized playlists and sync.
- 🎨 **Minimalist Aesthetics**: A sleek, dark-mode interface built with Tailwind CSS and Framer Motion.
- 🔍 **Smart Search**: Lightning-fast search engine powered by a custom Python backend.
- 📦 **Desktop Native**: Fully optimized for Windows with a native installer and system tray support.

## 🛠️ The Tech Stack (Peak Performance)

Redew is forged using a modern, robust tech stack designed for speed, security, and beauty:

### **Frontend & UI**
- **[React 19](https://react.dev/)**: The core UI library for building a dynamic, component-based interface.
- **[Vite 8](https://vitejs.dev/)**: The next-generation frontend tool for ultra-fast HMR and optimized builds.
- **[Electron.js](https://www.electronjs.org/)**: Bringing the power of web technologies to the desktop.
- **[Framer Motion](https://www.framer.com/motion/)**: For buttery-smooth micro-animations and page transitions.
- **[Tailwind CSS](https://tailwindcss.com/)**: A utility-first CSS framework for a highly customizable and modern design system.
- **[Lucide React](https://lucide.dev/)**: Beautiful, consistent iconography.

### **Backend & Engine**
- **[Python](https://www.python.org/)**: Powering the core music processing and metadata extraction engine.
- **[SQLite](https://sqlite.org/)**: Lightweight, local database for lightning-fast history and favorites retrieval.
- **[YouTube Music API](https://ytmusicapi.readthedocs.io/)**: Real-time access to millions of tracks.

### **DevOps & Packaging**
- **[Electron Forge](https://www.electronforge.io/)**: Professional packaging and distribution toolkit.
- **[PyInstaller](https://pyinstaller.org/)**: Compiling the Python backend into a high-performance standalone executable.

## 📥 Installation

1. Download the latest installer: **[Redew-1.1-Installer.exe](./Redew-1.1-Installer.exe)**.
2. Run the installer and follow the setup wizard.
3. Launch Redew from your desktop or start menu and start streaming!

## 👩‍💻 For Developers

If you want to run the project from source:

### Prerequisites
- Node.js (v18+)
- Python 3.10+

### Setup
1. **Clone the repository**:
   ```bash
   git clone https://github.com/BuildWithAni/Redew.git
   cd Redew
   ```

2. **Install Frontend Dependencies**:
   ```bash
   npm install
   ```

3. **Install Backend Dependencies**:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

4. **Run Development Server**:
   ```bash
   # Terminal 1: Start Backend
   python main.py

   # Terminal 2: Start Electron
   npm run electron:dev
   ```

---

<p align="center">
  Built with ❤️ by <b>Anirudh</b>
</p>