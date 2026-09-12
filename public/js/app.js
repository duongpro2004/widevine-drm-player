import { api } from './api.js';
import { drmPlayer } from './player.js';

// Expose client DRM log recorder for static GitHub Pages
window.__recordDrmLog = (entry) => {
  api.recordClientDrmLog(entry);
  fetchDrmDebugLogs();
};

// State
let allVideos = [];
let activeVideoId = null;
let pollTimer = null;
let currentTab = 'headers';

// DOM Elements
const cdmBadge = document.getElementById('cdm-badge');
const cdmStatusText = document.getElementById('cdm-status-text');
const videoElement = document.getElementById('video-player');
const videoContainer = document.getElementById('video-container');

// Now Playing elements
const currentDrmBadge = document.getElementById('current-drm-badge');
const currentVideoTitle = document.getElementById('current-video-title');
const playerStateText = document.getElementById('player-state-text');
const metricResolution = document.getElementById('metric-resolution');
const metricBandwidth = document.getElementById('metric-bandwidth');
const metricKeys = document.getElementById('metric-keys');
const metricBuffer = document.getElementById('metric-buffer');

// Tabs & Debug Elements
const tabBtnHeaders = document.getElementById('tab-btn-headers');
const tabBtnLogs = document.getElementById('tab-btn-logs');
const tabContentHeaders = document.getElementById('tab-content-headers');
const tabContentLogs = document.getElementById('tab-content-logs');
const tabBadgeHeadersCount = document.getElementById('tab-badge-headers-count');
const debugCounterBadge = document.getElementById('debug-counter-badge');
const licenseRequestsList = document.getElementById('license-requests-list');
const terminalLogs = document.getElementById('terminal-logs');
const btnRefreshLogs = document.getElementById('btn-refresh-logs');
const btnClearLogs = document.getElementById('btn-clear-logs');
const btnToggleDebugTop = document.getElementById('btn-toggle-debug-top');

// Video CRUD elements
const videosContainer = document.getElementById('videos-container');
const inputSearch = document.getElementById('input-search');
const selectFilterDrm = document.getElementById('select-filter-drm');
const btnOpenCreateModal = document.getElementById('btn-open-create-modal');
const btnResetData = document.getElementById('btn-reset-data');

// Modal Form elements
const videoModal = document.getElementById('video-modal');
const modalTitle = document.getElementById('modal-title');
const videoForm = document.getElementById('video-form');
const formVideoId = document.getElementById('form-video-id');
const formTitle = document.getElementById('form-title');
const formStreamUrl = document.getElementById('form-stream-url');
const formDrmType = document.getElementById('form-drm-type');
const formLicenseServer = document.getElementById('form-license-server');
const formHeaders = document.getElementById('form-headers');
const formDescription = document.getElementById('form-description');
const formPoster = document.getElementById('form-poster');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const btnSaveText = document.getElementById('btn-save-text');

// Preset buttons
const btnPresetWidevineLocal = document.getElementById('btn-preset-widevine-local');
const btnPresetClearKey = document.getElementById('btn-preset-clearkey');

// Toast container
const toastContainer = document.getElementById('toast-container');

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  const bgColors = {
    success: 'bg-emerald-600/95 border-emerald-500 text-white',
    error: 'bg-rose-600/95 border-rose-500 text-white',
    warning: 'bg-amber-600/95 border-amber-500 text-white',
    info: 'bg-indigo-600/95 border-indigo-500 text-white'
  };
  const icons = {
    success: 'fa-check-circle',
    error: 'fa-triangle-exclamation',
    warning: 'fa-circle-exclamation',
    info: 'fa-info-circle'
  };

  toast.className = `px-4 py-3 rounded-xl border shadow-xl flex items-center space-x-3 text-xs pointer-events-auto transform transition-all duration-300 translate-y-2 opacity-0 ${bgColors[type] || bgColors.info}`;
  toast.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.info} text-base"></i>
    <span class="font-medium">${message}</span>
  `;

  toastContainer.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ==========================================
// LOGGER HELPER
// ==========================================
function appendTerminalLog(message, type = 'info') {
  const colors = {
    info: 'text-slate-300',
    drm: 'text-violet-400 font-semibold',
    success: 'text-emerald-400',
    warning: 'text-amber-300',
    error: 'text-rose-400 font-bold'
  };
  const time = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.className = `flex space-x-2 ${colors[type] || 'text-slate-300'}`;
  line.innerHTML = `<span class="text-slate-600 select-none">[${time}]</span> <span>${escapeHtml(message)}</span>`;
  terminalLogs.appendChild(line);
  terminalLogs.scrollTop = terminalLogs.scrollHeight;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
}

// ==========================================
// INITIALIZE APPLICATION
// ==========================================
async function initApp() {
  // 1. Check Widevine CDM
  try {
    const cdm = await drmPlayer.checkWidevineSupport();
    if (cdm.supported) {
      cdmBadge.className = 'px-3 py-1.5 rounded-full text-xs font-medium flex items-center space-x-2 bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 shadow-inner';
      cdmBadge.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
        <span>Widevine CDM: Sẵn sàng (L3)</span>
      `;
      appendTerminalLog('Phát hiện Widevine CDM com.widevine.alpha sẵn sàng hoạt động', 'success');
    } else {
      cdmBadge.className = 'px-3 py-1.5 rounded-full text-xs font-medium flex items-center space-x-2 bg-rose-950/80 border border-rose-700/60 text-rose-300 shadow-inner';
      cdmBadge.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-rose-400"></span>
        <span>Widevine CDM: Không hỗ trợ</span>
      `;
      appendTerminalLog('Cảnh báo: ' + cdm.reason, 'warning');
    }
  } catch (err) {
    console.error('Lỗi kiểm tra CDM:', err);
  }

  // 2. Initialize Shaka Player
  try {
    await drmPlayer.init(videoElement, videoContainer);
    appendTerminalLog('Shaka Player SDK đã được nạp và khởi tạo thành công', 'success');

    // Register Player Callbacks
    drmPlayer.setCallbacks({
      onStatusChange: (info) => {
        updatePlayerMetrics(info);
      },
      onError: (msg) => {
        showToast(msg, 'error');
      },
      onLog: (msg, type) => {
        appendTerminalLog(msg, type);
      },
      onLicenseRequestSent: (reqData) => {
        appendTerminalLog(`Client gửi yêu cầu cấp license đến: ${reqData.url}`, 'drm');
        // Immediately fetch logs
        fetchDrmDebugLogs();
      }
    });
  } catch (err) {
    appendTerminalLog('Khởi tạo Player thất bại: ' + err.message, 'error');
    showToast('Lỗi khởi tạo Player: ' + err.message, 'error');
  }

  // 3. Load Videos from Backend API (Read CRUD)
  await loadVideos();

  // 4. Auto play first video
  if (allVideos.length > 0) {
    playVideo(allVideos[0].id);
  }

  // 5. Start Polling DRM Debug Logs
  fetchDrmDebugLogs();
  pollTimer = setInterval(fetchDrmDebugLogs, 2500);

  // 6. Setup event listeners
  setupEventListeners();
}

// ==========================================
// PLAYER METRICS UPDATE
// ==========================================
function updatePlayerMetrics(info) {
  if (info.status === 'playing') {
    playerStateText.textContent = 'Đang phát';
    playerStateText.previousElementSibling.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400';
  } else if (info.status === 'paused') {
    playerStateText.textContent = 'Tạm dừng';
    playerStateText.previousElementSibling.className = 'w-1.5 h-1.5 rounded-full bg-amber-400';
  }

  if (info.stats) {
    metricResolution.textContent = info.stats.resolution || '--';
    metricBandwidth.textContent = info.stats.videoBandwidth || '--';
    metricBuffer.textContent = info.stats.bufferingTime || '0s';

    const keys = info.stats.drmKeyStatuses;
    if (keys && Object.keys(keys).length > 0) {
      const activeCount = Object.values(keys).filter(s => s === 'usable').length;
      metricKeys.textContent = `${activeCount} usable / ${Object.keys(keys).length}`;
    } else {
      metricKeys.textContent = info.drm === 'none' ? 'Không DRM' : 'Chờ cấp khóa...';
    }
  }
}

// ==========================================
// LOAD & RENDER VIDEOS (CRUD READ)
// ==========================================
async function loadVideos() {
  try {
    allVideos = await api.getVideos();
    renderVideoList();
  } catch (err) {
    videosContainer.innerHTML = `
      <div class="text-center py-8 text-rose-400 text-xs">
        <i class="fa-solid fa-triangle-exclamation text-xl mb-1"></i>
        <p>Lỗi tải danh sách video: ${escapeHtml(err.message)}</p>
      </div>
    `;
    showToast('Không thể kết nối đến máy chủ API', 'error');
  }
}

function renderVideoList() {
  const searchTerm = inputSearch.value.trim().toLowerCase();
  const filterDrm = selectFilterDrm.value;

  const filtered = allVideos.filter(v => {
    const matchesSearch = v.title.toLowerCase().includes(searchTerm) || (v.description && v.description.toLowerCase().includes(searchTerm));
    const matchesDrm = filterDrm === 'all' || v.drmType === filterDrm;
    return matchesSearch && matchesDrm;
  });

  if (filtered.length === 0) {
    videosContainer.innerHTML = `
      <div class="glass-card rounded-xl p-8 text-center text-slate-500 text-xs">
        <i class="fa-solid fa-video-slash text-2xl mb-2 text-slate-600 block"></i>
        Không tìm thấy video nào phù hợp điều kiện tìm kiếm.
      </div>
    `;
    return;
  }

  videosContainer.innerHTML = filtered.map(v => {
    const isPlaying = v.id === activeVideoId;
    
    // DRM Badge styling
    let drmBadgeHtml = '';
    if (v.drmType === 'widevine') {
      drmBadgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-violet-500/20 text-violet-300 border border-violet-500/40"><i class="fa-solid fa-shield-halved mr-1"></i>Widevine</span>`;
    } else if (v.drmType === 'clearkey') {
      drmBadgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"><i class="fa-solid fa-key mr-1"></i>ClearKey</span>`;
    } else {
      drmBadgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"><i class="fa-solid fa-circle-play mr-1"></i>Clear</span>`;
    }

    // Has custom headers indicator
    let hasCustomHeaders = false;
    try {
      if (v.headers && Object.keys(JSON.parse(v.headers)).length > 0) hasCustomHeaders = true;
    } catch (e) {}

    return `
      <div class="glass-card rounded-xl p-3 border ${isPlaying ? 'border-indigo-500 bg-indigo-950/20 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/40' : 'border-slate-800'} glass-card-hover transition relative group" data-video-id="${v.id}">
        <div class="flex gap-3">
          <!-- Thumbnail Image -->
          <div class="w-24 h-16 rounded-lg bg-slate-900 overflow-hidden relative shrink-0">
            <img src="${escapeHtml(v.poster)}" alt="${escapeHtml(v.title)}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" onerror="this.src='https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=800&q=80'">
            ${isPlaying ? `
              <div class="absolute inset-0 bg-indigo-600/60 backdrop-blur-[2px] flex items-center justify-center">
                <i class="fa-solid fa-volume-high text-white text-sm animate-pulse"></i>
              </div>
            ` : ''}
          </div>

          <!-- Video Details -->
          <div class="flex-1 min-w-0 flex flex-col justify-between">
            <div>
              <div class="flex items-center space-x-2 mb-1">
                ${drmBadgeHtml}
                ${hasCustomHeaders ? `<span class="px-1.5 py-0.2 rounded text-[9px] bg-slate-800 text-indigo-300 border border-indigo-500/30 font-mono" title="Có custom headers">+Headers</span>` : ''}
              </div>
              <h4 class="font-semibold text-slate-100 text-xs truncate ${isPlaying ? 'text-indigo-300' : ''}">${escapeHtml(v.title)}</h4>
              <p class="text-[11px] text-slate-400 line-clamp-1 mt-0.5">${escapeHtml(v.description || 'Không có mô tả')}</p>
            </div>

            <!-- Action buttons -->
            <div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/70">
              <span class="text-[10px] text-slate-500 font-mono truncate max-w-[150px]">
                ${v.drmType !== 'none' ? escapeHtml(v.licenseServer || 'Chưa set license server') : 'Không cần license'}
              </span>
              <div class="flex items-center space-x-1">
                <button class="btn-play-video px-2.5 py-1 rounded-md text-[11px] font-semibold ${isPlaying ? 'bg-indigo-600 text-white' : 'bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white'} transition flex items-center space-x-1" data-id="${v.id}">
                  <i class="fa-solid ${isPlaying ? 'fa-rotate-right' : 'fa-play'} text-[10px]"></i>
                  <span>${isPlaying ? 'Phát lại' : 'Phát'}</span>
                </button>
                <button class="btn-edit-video p-1.5 rounded-md text-[11px] text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition" data-id="${v.id}" title="Chỉnh sửa thông số">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn-delete-video p-1.5 rounded-md text-[11px] text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition" data-id="${v.id}" title="Xóa video này">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Attach card event listeners
  document.querySelectorAll('.btn-play-video').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      playVideo(btn.dataset.id);
    });
  });

  document.querySelectorAll('.btn-edit-video').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(btn.dataset.id);
    });
  });

  document.querySelectorAll('.btn-delete-video').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDeleteVideo(btn.dataset.id);
    });
  });
}

// ==========================================
// PLAY VIDEO ACTION
// ==========================================
async function playVideo(id) {
  const video = allVideos.find(v => v.id === id);
  if (!video) return;

  activeVideoId = id;
  renderVideoList();

  // Update Now Playing UI
  currentVideoTitle.textContent = video.title;
  currentDrmBadge.textContent = video.drmType.toUpperCase();
  if (video.drmType === 'widevine') {
    currentDrmBadge.className = 'px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-violet-500/20 text-violet-300 border border-violet-500/30';
  } else if (video.drmType === 'clearkey') {
    currentDrmBadge.className = 'px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';
  } else {
    currentDrmBadge.className = 'px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
  }

  // Load into player
  try {
    showToast(`Đang tải luồng "${video.title}"...`, 'info');
    await drmPlayer.load(video);
    showToast(`Đang phát "${video.title}"`, 'success');
  } catch (err) {
    showToast('Lỗi khi nạp video: ' + err.message, 'error');
  }
}

// ==========================================
// DRM LICENSE SERVER & DEBUG LOGS INSPECTOR
// ==========================================
async function fetchDrmDebugLogs() {
  try {
    const logs = await api.getDrmLogs();
    renderDrmDebugLogs(logs);
  } catch (err) {
    // Silent fail for polling
  }
}

function renderDrmDebugLogs(logs) {
  const count = logs.length;
  debugCounterBadge.textContent = count;
  tabBadgeHeadersCount.textContent = count;

  if (!logs || logs.length === 0) {
    licenseRequestsList.innerHTML = `
      <div class="text-center py-12 text-slate-500 text-xs">
        <i class="fa-solid fa-satellite-dish text-2xl mb-2 text-slate-600 block"></i>
        Chưa có yêu cầu cấp phép nào gửi lên.<br>
        Hãy bấm phát video Widevine để xem toàn bộ thông số Header client gửi lên!
      </div>
    `;
    return;
  }

  licenseRequestsList.innerHTML = logs.map((log, idx) => {
    const timeFormatted = new Date(log.timestamp).toLocaleTimeString();
    const isSuccess = log.status === 'success';
    
    // Extract headers
    const headersList = Object.entries(log.headers || {}).map(([k, v]) => {
      const isCustom = ['authorization', 'x-', 'token', 'user'].some(prefix => k.toLowerCase().includes(prefix));
      return `
        <tr class="${isCustom ? 'bg-indigo-950/40 text-indigo-200 font-semibold' : 'text-slate-300'} border-b border-slate-800/60">
          <td class="py-1 px-2 font-mono text-[11px] text-slate-400 select-all">${escapeHtml(k)}</td>
          <td class="py-1 px-2 font-mono text-[11px] select-all break-all ${isCustom ? 'text-indigo-300' : 'text-slate-200'}">${escapeHtml(v)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="glass-card rounded-xl border border-slate-800 p-3 text-xs">
        <!-- Request Header Line -->
        <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono ${isSuccess ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}">
              ${log.method} ${log.statusCode || 200}
            </span>
            <span class="font-mono text-slate-300 font-semibold text-[11px]">${escapeHtml(log.url)}</span>
            <!-- Prominent Source IP Badge -->
            <span class="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center space-x-1 shadow-sm" title="Địa chỉ IP nguồn (Client Source IP)">
              <i class="fa-solid fa-location-dot text-[9px] text-sky-400"></i>
              <span>IP: <strong class="text-sky-200">${escapeHtml(log.sourceIp || log.clientIp || '127.0.0.1')}</strong></span>
            </span>
          </div>
          <div class="flex items-center space-x-2 text-[10px] text-slate-400 font-mono">
            <span><i class="fa-regular fa-clock mr-1"></i>${timeFormatted}</span>
            <span class="px-1.5 py-0.2 bg-slate-800 rounded text-slate-300">${escapeHtml(log.bodySize)}</span>
          </div>
        </div>

        <!-- Custom Headers Highlight Banner -->
        ${log.customHeadersDetected && Object.keys(log.customHeadersDetected).length > 0 ? `
          <div class="mt-2 p-2 rounded-lg bg-indigo-950/50 border border-indigo-500/30">
            <span class="text-[10px] font-bold text-indigo-300 block mb-1 uppercase tracking-wider">
              <i class="fa-solid fa-key text-indigo-400 mr-1"></i>Custom Headers phát hiện từ Client:
            </span>
            <div class="space-y-0.5 font-mono text-[11px]">
              ${Object.entries(log.customHeadersDetected).map(([k, v]) => `
                <div class="truncate"><span class="text-indigo-400">${escapeHtml(k)}:</span> <span class="text-slate-200">${escapeHtml(v)}</span></div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Collapsible Full Headers Table -->
        <details class="mt-2.5">
          <summary class="cursor-pointer text-slate-400 hover:text-slate-200 text-[11px] font-medium flex items-center space-x-1">
            <i class="fa-solid fa-list-ul text-[10px]"></i>
            <span>Xem đầy đủ ${Object.keys(log.headers || {}).length} Headers</span>
          </summary>
          <div class="mt-2 overflow-x-auto bg-slate-900 rounded-lg p-2 border border-slate-850">
            <table class="w-full text-left">
              <thead>
                <tr class="text-[10px] uppercase text-slate-500 border-b border-slate-800">
                  <th class="py-1 px-2">Header Name</th>
                  <th class="py-1 px-2">Value</th>
                </tr>
              </thead>
              <tbody>
                ${headersList}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    `;
  }).join('');
}

// ==========================================
// MODAL & CRUD ACTIONS (CREATE, UPDATE, DELETE)
// ==========================================
function openCreateModal() {
  formVideoId.value = '';
  modalTitle.innerHTML = '<i class="fa-solid fa-plus text-indigo-400 mr-2"></i>Thêm luồng Video mới';
  btnSaveText.textContent = 'Lưu Video';
  videoForm.reset();

  // Defaults
  formDrmType.value = 'widevine';
  formLicenseServer.value = '/api/drm/license';
  formHeaders.value = JSON.stringify({
    "Authorization": "Bearer sample-jwt-widevine-token-xyz123",
    "X-Client-Version": "2.4.0",
    "X-User-ID": "tester_99"
  }, null, 2);
  formPoster.value = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80';

  videoModal.classList.remove('hidden');
}

function openEditModal(id) {
  const video = allVideos.find(v => v.id === id);
  if (!video) return;

  formVideoId.value = video.id;
  modalTitle.innerHTML = '<i class="fa-solid fa-pen text-indigo-400 mr-2"></i>Chỉnh sửa luồng Video';
  btnSaveText.textContent = 'Cập nhật Video';

  formTitle.value = video.title || '';
  formStreamUrl.value = video.streamUrl || '';
  formDrmType.value = video.drmType || 'widevine';
  formLicenseServer.value = video.licenseServer || '';
  formHeaders.value = video.headers || '{}';
  formDescription.value = video.description || '';
  formPoster.value = video.poster || '';

  videoModal.classList.remove('hidden');
}

function closeModal() {
  videoModal.classList.add('hidden');
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const id = formVideoId.value;
  const payload = {
    title: formTitle.value.trim(),
    streamUrl: formStreamUrl.value.trim(),
    drmType: formDrmType.value,
    licenseServer: formLicenseServer.value.trim(),
    headers: formHeaders.value.trim() || '{}',
    description: formDescription.value.trim(),
    poster: formPoster.value.trim()
  };

  // Validate JSON format for headers
  if (payload.headers) {
    try {
      JSON.parse(payload.headers);
    } catch (err) {
      showToast('Headers phải là định dạng JSON hợp lệ!', 'error');
      return;
    }
  }

  try {
    if (id) {
      // UPDATE (PUT)
      await api.updateVideo(id, payload);
      showToast('Cập nhật video thành công!', 'success');
    } else {
      // CREATE (POST)
      const created = await api.createVideo(payload);
      showToast('Thêm video mới thành công!', 'success');
      activeVideoId = created.id;
    }

    closeModal();
    await loadVideos();

    // Auto play if updated current video or created
    const targetId = id || activeVideoId;
    if (targetId) playVideo(targetId);

  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function confirmDeleteVideo(id) {
  const video = allVideos.find(v => v.id === id);
  if (!video) return;

  if (!confirm(`Bạn có chắc chắn muốn xoá video "${video.title}" không?`)) {
    return;
  }

  try {
    await api.deleteVideo(id);
    showToast('Đã xóa video thành công!', 'success');
    await loadVideos();

    if (activeVideoId === id && allVideos.length > 0) {
      playVideo(allVideos[0].id);
    }
  } catch (err) {
    showToast('Lỗi khi xoá: ' + err.message, 'error');
  }
}

async function handleResetData() {
  if (!confirm('Khôi phục danh sách video mẫu ban đầu? Các thay đổi trước đó sẽ được làm mới.')) {
    return;
  }

  try {
    await api.resetVideos();
    showToast('Đã khôi phục dữ liệu mẫu!', 'success');
    await loadVideos();
    if (allVideos.length > 0) playVideo(allVideos[0].id);
  } catch (err) {
    showToast('Lỗi khi khôi phục: ' + err.message, 'error');
  }
}

// ==========================================
// PRESET BUTTONS FOR QUICK CONFIG
// ==========================================
function setupPresets() {
  btnPresetWidevineLocal.addEventListener('click', () => {
    formTitle.value = 'Angel One (Widevine - Debug Headers)';
    formStreamUrl.value = 'https://storage.googleapis.com/shaka-demo-assets/angel-one-widevine/dash.mpd';
    formDrmType.value = 'widevine';
    formLicenseServer.value = '/api/drm/license';
    formHeaders.value = JSON.stringify({
      "Authorization": "Bearer sample-jwt-widevine-token-xyz123",
      "X-Client-Version": "2.4.0",
      "X-User-ID": "tester_99"
    }, null, 2);
    formDescription.value = 'Luồng Widevine qua Local Debug License Server để kiểm tra toàn bộ thông số Headers';
    formPoster.value = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80';
    showToast('Đã áp dụng mẫu Widevine Debug', 'info');
  });

  btnPresetClearKey.addEventListener('click', () => {
    formTitle.value = 'Custom ClearKey Stream (Tự cấp Key)';
    formStreamUrl.value = 'https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd';
    formDrmType.value = 'clearkey';
    formLicenseServer.value = '/api/drm/clearkey';
    formHeaders.value = JSON.stringify({
      "Authorization": "Bearer clearkey-auth-token-demo"
    }, null, 2);
    formDescription.value = 'Kiểm thử cơ chế ClearKey với License Server tự cấp khóa cục bộ';
    formPoster.value = 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=800&q=80';
    showToast('Đã áp dụng mẫu ClearKey', 'info');
  });
}

// ==========================================
// EVENT LISTENERS SETUP
// ==========================================
function setupEventListeners() {
  // Tabs
  tabBtnHeaders.addEventListener('click', () => {
    currentTab = 'headers';
    tabBtnHeaders.className = 'px-4 py-2.5 text-xs font-semibold text-indigo-400 border-b-2 border-indigo-500 flex items-center space-x-2 transition';
    tabBtnLogs.className = 'px-4 py-2.5 text-xs font-medium text-slate-400 hover:text-slate-200 border-b-2 border-transparent flex items-center space-x-2 transition';
    tabContentHeaders.classList.remove('hidden');
    tabContentLogs.classList.add('hidden');
  });

  tabBtnLogs.addEventListener('click', () => {
    currentTab = 'logs';
    tabBtnLogs.className = 'px-4 py-2.5 text-xs font-semibold text-indigo-400 border-b-2 border-indigo-500 flex items-center space-x-2 transition';
    tabBtnHeaders.className = 'px-4 py-2.5 text-xs font-medium text-slate-400 hover:text-slate-200 border-b-2 border-transparent flex items-center space-x-2 transition';
    tabContentLogs.classList.remove('hidden');
    tabContentHeaders.classList.add('hidden');
  });

  // Top Debug button toggles / focuses headers tab
  btnToggleDebugTop.addEventListener('click', () => {
    tabBtnHeaders.click();
    document.getElementById('tab-content-headers').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // Refresh & clear logs
  btnRefreshLogs.addEventListener('click', () => {
    fetchDrmDebugLogs();
    showToast('Đã làm mới dữ liệu Debug', 'info');
  });

  btnClearLogs.addEventListener('click', async () => {
    try {
      await api.clearDrmLogs();
      terminalLogs.innerHTML = '<div class="text-slate-500 italic">// Nhật ký đã được xóa.</div>';
      fetchDrmDebugLogs();
      showToast('Đã xóa toàn bộ nhật ký debug', 'success');
    } catch (err) {
      showToast('Lỗi khi xóa nhật ký', 'error');
    }
  });

  // CRUD actions
  btnOpenCreateModal.addEventListener('click', openCreateModal);
  btnCloseModal.addEventListener('click', closeModal);
  btnCancelModal.addEventListener('click', closeModal);
  videoForm.addEventListener('submit', handleFormSubmit);
  btnResetData.addEventListener('click', handleResetData);

  // Search & Filter
  inputSearch.addEventListener('input', renderVideoList);
  selectFilterDrm.addEventListener('change', renderVideoList);

  // Quick Presets
  setupPresets();
}

// Start application when DOM is ready
window.addEventListener('DOMContentLoaded', initApp);
