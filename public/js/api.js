// Client API service with Dual-Mode:
// - Mode 1: Backend Express REST API (when running with node server.js)
// - Mode 2: LocalStorage & Client-side interceptor (when running on static GitHub Pages)

const API_BASE = '/api/videos';
const DRM_BASE = '/api/drm';

const DEFAULT_VIDEOS = [
  {
    "id": "vid_widevine_demo",
    "title": "Angel One (Widevine DRM - Google License Server)",
    "streamUrl": "https://storage.googleapis.com/shaka-demo-assets/angel-one-widevine/dash.mpd",
    "drmType": "widevine",
    "licenseServer": "https://cwip-shaka-player.appspot.com/no_auth",
    "headers": JSON.stringify({
      "Authorization": "Bearer sample-jwt-widevine-token-xyz123",
      "X-Client-Version": "2.4.0",
      "X-User-ID": "tester_99"
    }, null, 2),
    "description": "Luồng DASH Widevine chính thức của Google. Hỗ trợ soi headers client gửi lên ở cửa sổ Debug!",
    "poster": "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80",
    "createdAt": new Date().toISOString()
  },
  {
    "id": "vid_clear_02",
    "title": "Angel One (Clear DASH - Không mã hóa)",
    "streamUrl": "https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd",
    "drmType": "none",
    "licenseServer": "",
    "headers": "{}",
    "description": "Bản không mã hóa (Clear Stream) để so sánh đối chiếu hiệu năng phát.",
    "poster": "https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=800&q=80",
    "createdAt": new Date().toISOString()
  },
  {
    "id": "vid_clear_03",
    "title": "Sintel (Clear DASH Multi-bitrate)",
    "streamUrl": "https://storage.googleapis.com/shaka-demo-assets/sintel/dash.mpd",
    "drmType": "none",
    "licenseServer": "",
    "headers": "{}",
    "description": "Luồng phim ngắn Sintel hỗ trợ kiểm tra tính năng chuyển đổi độ phân giải (ABR).",
    "poster": "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&q=80",
    "createdAt": new Date().toISOString()
  }
];

// In-memory client logs store for GitHub Pages static mode
let clientDrmLogs = [];

function getLocalVideos() {
  try {
    const raw = localStorage.getItem('drm_videos_data');
    if (!raw) {
      localStorage.setItem('drm_videos_data', JSON.stringify(DEFAULT_VIDEOS));
      return DEFAULT_VIDEOS;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_VIDEOS;
  }
}

function saveLocalVideos(videos) {
  try {
    localStorage.setItem('drm_videos_data', JSON.stringify(videos));
  } catch (e) {
    console.warn('LocalStorage error:', e);
  }
}

export const api = {
  // --- Video CRUD (Dual-Mode: Backend API first, fallback to LocalStorage) ---
  async getVideos() {
    try {
      const res = await fetch(API_BASE);
      if (!res.ok) throw new Error();
      const json = await res.json();
      return json.data;
    } catch {
      // Fallback for GitHub Pages static hosting
      return getLocalVideos();
    }
  },

  async getVideo(id) {
    try {
      const res = await fetch(`${API_BASE}/${id}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      return json.data;
    } catch {
      const videos = getLocalVideos();
      const found = videos.find(v => v.id === id);
      if (!found) throw new Error('Không tìm thấy video');
      return found;
    }
  },

  async createVideo(videoData) {
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(videoData)
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      return json.data;
    } catch {
      const videos = getLocalVideos();
      const newVideo = {
        ...videoData,
        id: 'vid_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        createdAt: new Date().toISOString()
      };
      videos.unshift(newVideo);
      saveLocalVideos(videos);
      return newVideo;
    }
  },

  async updateVideo(id, videoData) {
    try {
      const res = await fetch(`${API_BASE}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(videoData)
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      return json.data;
    } catch {
      const videos = getLocalVideos();
      const index = videos.findIndex(v => v.id === id);
      if (index === -1) throw new Error('Không tìm thấy video');
      videos[index] = { ...videos[index], ...videoData, updatedAt: new Date().toISOString() };
      saveLocalVideos(videos);
      return videos[index];
    }
  },

  async deleteVideo(id) {
    try {
      const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      const json = await res.json();
      return json;
    } catch {
      const videos = getLocalVideos();
      const filtered = videos.filter(v => v.id !== id);
      saveLocalVideos(filtered);
      return { success: true };
    }
  },

  async resetVideos() {
    try {
      const res = await fetch(`${API_BASE}/reset`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const json = await res.json();
      return json.data;
    } catch {
      saveLocalVideos(DEFAULT_VIDEOS);
      return DEFAULT_VIDEOS;
    }
  },

  // --- DRM Server & Header Debug Inspector ---
  async getDrmLogs() {
    try {
      const res = await fetch(`${DRM_BASE}/logs`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      // Combine with client intercepted logs
      return [...clientDrmLogs, ...(json.data || [])];
    } catch {
      return clientDrmLogs;
    }
  },

  async clearDrmLogs() {
    clientDrmLogs = [];
    try {
      await fetch(`${DRM_BASE}/logs`, { method: 'DELETE' });
    } catch {
      // Static mode ignore
    }
    return { success: true };
  },

  recordClientDrmLog(entry) {
    clientDrmLogs.unshift(entry);
    if (clientDrmLogs.length > 50) clientDrmLogs.pop();
  }
};
