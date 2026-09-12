import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'videos.json');

// In-memory DRM request logs for real-time debug inspection
let drmRequestLogs = [];
const MAX_LOGS = 100;

// Default backup dataset
const DEFAULT_VIDEOS = [
  {
    id: "vid_widevine_local_debug",
    title: "Angel One (Widevine - Qua Local Debug License Server)",
    streamUrl: "https://storage.googleapis.com/shaka-demo-assets/angel-one-widevine/dash.mpd",
    drmType: "widevine",
    licenseServer: "/api/drm/license",
    headers: JSON.stringify({
      "Authorization": "Bearer sample-jwt-widevine-token-xyz123",
      "X-Client-Version": "2.4.0",
      "X-User-ID": "tester_99"
    }, null, 2),
    description: "Luồng Widevine gửi license request qua server local của app để hiển thị toàn bộ headers client gửi lên ở cửa sổ Debug!",
    poster: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80",
    createdAt: new Date().toISOString()
  },
  {
    id: "vid_widevine_direct",
    title: "Angel One (Widevine - Google Direct CWIP)",
    streamUrl: "https://storage.googleapis.com/shaka-demo-assets/angel-one-widevine/dash.mpd",
    drmType: "widevine",
    licenseServer: "https://cwip-shaka-player.appspot.com/no_auth",
    headers: "{}",
    description: "Luồng DASH Widevine kết nối trực tiếp đến license server Google Shaka không qua proxy.",
    poster: "https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=800&q=80",
    createdAt: new Date().toISOString()
  },
  {
    id: "vid_clear_03",
    title: "Sintel (Clear DASH Multi-bitrate)",
    streamUrl: "https://storage.googleapis.com/shaka-demo-assets/sintel/dash.mpd",
    drmType: "none",
    licenseServer: "",
    headers: "{}",
    description: "Luồng phim ngắn Sintel không mã hóa để kiểm tra tính năng chuyển đổi độ phân giải (ABR).",
    poster: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&q=80",
    createdAt: new Date().toISOString()
  }
];

// Helper functions for reading & writing database file
function readVideos() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_VIDEOS, null, 2), 'utf-8');
      return DEFAULT_VIDEOS;
    }
    const content = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(content || '[]');
  } catch (err) {
    console.error('Lỗi khi đọc file data/videos.json:', err);
    return DEFAULT_VIDEOS;
  }
}

function saveVideos(videos) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(videos, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Lỗi khi ghi file data/videos.json:', err);
    return false;
  }
}

// Middleware
app.use(cors());

// Raw binary body parser for license requests (Widevine license challenge is binary octet-stream)
app.use('/api/drm/license', express.raw({ type: '*/*', limit: '10mb' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// DRM LICENSE SERVER & DEBUG ENDPOINTS
// ==========================================

// 1. DRM License Server (Inspects Client Headers & Proxies/Processes Key)
app.post('/api/drm/license', async (req, res) => {
  const logId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const clientHeaders = { ...req.headers };
  const rawBody = req.body || Buffer.alloc(0);
  const bodySize = Buffer.isBuffer(rawBody) ? rawBody.length : (typeof rawBody === 'string' ? Buffer.byteLength(rawBody) : 0);

  // Target upstream Widevine server (default: Google Shaka CWIP)
  const targetServer = req.query.target || 'https://cwip-shaka-player.appspot.com/no_auth';

  const logEntry = {
    id: logId,
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    clientIp: req.ip || req.connection?.remoteAddress,
    headers: clientHeaders,
    customHeadersDetected: Object.entries(clientHeaders).filter(([key]) =>
      ['authorization', 'x-', 'token', 'user'].some(prefix => key.toLowerCase().includes(prefix))
    ).reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}),
    query: req.query,
    bodySize: `${bodySize} bytes`,
    bodyPreviewHex: Buffer.isBuffer(rawBody) ? rawBody.subarray(0, 32).toString('hex') : '',
    targetServer,
    status: 'processing'
  };

  console.log(`\n📥 [DRM License Request Received] ID: ${logId}`);
  console.log(`Headers:`, JSON.stringify(clientHeaders, null, 2));

  try {
    // Forward the DRM license request to upstream Widevine CWIP server so decryption actually works!
    const upstreamHeaders = {
      'Content-Type': req.headers['content-type'] || 'application/octet-stream',
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0'
    };

    const upstreamResponse = await fetch(targetServer, {
      method: 'POST',
      headers: upstreamHeaders,
      body: rawBody
    });

    const responseBuffer = await upstreamResponse.arrayBuffer();
    const respHeaders = {};
    upstreamResponse.headers.forEach((val, key) => { respHeaders[key] = val; });

    logEntry.status = upstreamResponse.ok ? 'success' : 'upstream_error';
    logEntry.statusCode = upstreamResponse.status;
    logEntry.responseHeaders = respHeaders;
    logEntry.responseSize = `${responseBuffer.byteLength} bytes`;

    // Save log
    drmRequestLogs.unshift(logEntry);
    if (drmRequestLogs.length > MAX_LOGS) drmRequestLogs.pop();

    res.status(upstreamResponse.status);
    for (const [key, value] of Object.entries(respHeaders)) {
      if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }
    res.send(Buffer.from(responseBuffer));
  } catch (err) {
    console.error('Lỗi khi chuyển tiếp License request:', err);
    logEntry.status = 'error';
    logEntry.errorMessage = err.message;
    drmRequestLogs.unshift(logEntry);
    if (drmRequestLogs.length > MAX_LOGS) drmRequestLogs.pop();

    res.status(502).json({
      error: 'Upstream License Server Error',
      message: err.message,
      logId
    });
  }
});

// 2. Custom ClearKey License Endpoint with self-defined keys
// Client EME ClearKey format: {"keys": [{"kty":"oct", "k": "<base64>", "kid": "<base64>"}]}
app.post('/api/drm/clearkey', express.json(), (req, res) => {
  const logId = 'ck_' + Date.now();
  const clientHeaders = { ...req.headers };
  
  // Custom Key Configuration (Sample 128-bit AES Key & KeyID)
  // Key ID: 0123456789abcdef0123456789abcdef -> Base64: ASNFZ4mrze8BI0VniavN7w==
  // Key:    fedcba9876543210fedcba9876543210 -> Base64: /ty6mHZUMhD+3LqYdlQyEA==
  const customClearKeyResponse = {
    keys: [
      {
        kty: "oct",
        kid: "ASNFZ4mrze8BI0VniavN7w",
        k: "/ty6mHZUMhD+3LqYdlQyEA"
      }
    ],
    type: "temporary"
  };

  const logEntry = {
    id: logId,
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    clientIp: req.ip || req.connection?.remoteAddress,
    headers: clientHeaders,
    customHeadersDetected: clientHeaders,
    query: req.query,
    body: req.body,
    response: customClearKeyResponse,
    status: 'success',
    statusCode: 200,
    note: 'Custom ClearKey License Server Response'
  };

  drmRequestLogs.unshift(logEntry);
  if (drmRequestLogs.length > MAX_LOGS) drmRequestLogs.pop();

  res.json(customClearKeyResponse);
});

// 3. GET DRM Debug Logs for the client UI inspector
app.get('/api/drm/logs', (req, res) => {
  res.json({
    success: true,
    total: drmRequestLogs.length,
    data: drmRequestLogs
  });
});

// 4. DELETE DRM Debug Logs
app.delete('/api/drm/logs', (req, res) => {
  drmRequestLogs = [];
  res.json({ success: true, message: 'Đã xóa toàn bộ nhật ký debug DRM!' });
});

// ==========================================
// VIDEO CRUD REST API ENDPOINTS
// ==========================================

// 1. GET all videos
app.get('/api/videos', (req, res) => {
  const videos = readVideos();
  res.json({ success: true, data: videos });
});

// 2. GET single video
app.get('/api/videos/:id', (req, res) => {
  const videos = readVideos();
  const video = videos.find(v => v.id === req.params.id);
  if (!video) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy video' });
  }
  res.json({ success: true, data: video });
});

// 3. POST - Create new video
app.post('/api/videos', (req, res) => {
  const { title, streamUrl, drmType, licenseServer, headers, description, poster } = req.body;

  if (!title || !streamUrl) {
    return res.status(400).json({
      success: false,
      message: 'Tiêu đề (title) và đường dẫn luồng (streamUrl) là bắt buộc!'
    });
  }

  // Validate headers JSON format if provided
  if (headers && headers.trim()) {
    try {
      JSON.parse(headers);
    } catch {
      return res.status(400).json({
        success: false,
        message: 'Headers phải là định dạng JSON hợp lệ (ví dụ: {"Authorization": "Bearer ..."})'
      });
    }
  }

  const videos = readVideos();
  const newVideo = {
    id: 'vid_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    title: title.trim(),
    streamUrl: streamUrl.trim(),
    drmType: drmType === 'widevine' ? 'widevine' : (drmType === 'clearkey' ? 'clearkey' : 'none'),
    licenseServer: (licenseServer || '').trim(),
    headers: headers ? headers.trim() : '{}',
    description: (description || '').trim(),
    poster: (poster || '').trim() || 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=800&q=80',
    createdAt: new Date().toISOString()
  };

  videos.unshift(newVideo);
  saveVideos(videos);

  res.status(201).json({
    success: true,
    message: 'Thêm video thành công!',
    data: newVideo
  });
});

// 4. PUT - Update existing video
app.put('/api/videos/:id', (req, res) => {
  const { title, streamUrl, drmType, licenseServer, headers, description, poster } = req.body;
  const videos = readVideos();
  const index = videos.findIndex(v => v.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy video để cập nhật' });
  }

  if (!title || !streamUrl) {
    return res.status(400).json({
      success: false,
      message: 'Tiêu đề (title) và đường dẫn luồng (streamUrl) là bắt buộc!'
    });
  }

  if (headers && headers.trim()) {
    try {
      JSON.parse(headers);
    } catch {
      return res.status(400).json({
        success: false,
        message: 'Headers phải là định dạng JSON hợp lệ'
      });
    }
  }

  videos[index] = {
    ...videos[index],
    title: title.trim(),
    streamUrl: streamUrl.trim(),
    drmType: drmType === 'widevine' ? 'widevine' : (drmType === 'clearkey' ? 'clearkey' : 'none'),
    licenseServer: (licenseServer || '').trim(),
    headers: headers ? headers.trim() : '{}',
    description: (description || '').trim(),
    poster: (poster || '').trim() || videos[index].poster,
    updatedAt: new Date().toISOString()
  };

  saveVideos(videos);

  res.json({
    success: true,
    message: 'Cập nhật video thành công!',
    data: videos[index]
  });
});

// 5. DELETE - Remove video
app.delete('/api/videos/:id', (req, res) => {
  const videos = readVideos();
  const filtered = videos.filter(v => v.id !== req.params.id);

  if (filtered.length === videos.length) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy video để xoá' });
  }

  saveVideos(filtered);
  res.json({ success: true, message: 'Xoá video thành công!' });
});

// 6. POST - Reset default videos
app.post('/api/videos/reset', (req, res) => {
  saveVideos(DEFAULT_VIDEOS);
  res.json({
    success: true,
    message: 'Đã khôi phục dữ liệu video mẫu!',
    data: DEFAULT_VIDEOS
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`=====================================================`);
  console.log(`🚀 Widevine DRM & CRUD Server is running!`);
  console.log(`🌐 Web UI: http://localhost:${PORT}`);
  console.log(`🔑 DRM License Debug Endpoint: http://localhost:${PORT}/api/drm/license`);
  console.log(`📋 DRM Debug Logs: http://localhost:${PORT}/api/drm/logs`);
  console.log(`=====================================================`);
});
