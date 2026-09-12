// Shaka Player & Widevine DRM Controller

class DrmPlayerManager {
  constructor() {
    this.player = null;
    this.ui = null;
    this.videoElement = null;
    this.currentVideo = null;
    this.statsInterval = null;
    this.listeners = {
      onStatusChange: null,
      onError: null,
      onLog: null,
      onLicenseRequestSent: null
    };
  }

  // Check if browser has Widevine CDM support
  async checkWidevineSupport() {
    if (!window.navigator || !window.navigator.requestMediaKeySystemAccess) {
      return { supported: false, reason: 'Trình duyệt không hỗ trợ Encrypted Media Extensions (EME).' };
    }

    const config = [{
      initDataTypes: ['cenc'],
      audioCapabilities: [{
        contentType: 'audio/mp4; codecs="mp4a.40.2"'
      }],
      videoCapabilities: [{
        contentType: 'video/mp4; codecs="avc1.42E01E"'
      }]
    }];

    try {
      const access = await navigator.requestMediaKeySystemAccess('com.widevine.alpha', config);
      return {
        supported: true,
        keySystem: access.keySystem,
        reason: 'Widevine CDM (com.widevine.alpha) đã sẵn sàng hoạt động.'
      };
    } catch (err) {
      return {
        supported: false,
        reason: 'Không tìm thấy Widevine CDM hoặc không được cấp quyền (' + err.message + ')'
      };
    }
  }

  // Initialize Shaka Player
  async init(videoElement, containerElement) {
    this.videoElement = videoElement;

    if (typeof shaka === 'undefined') {
      throw new Error('Shaka Player SDK chưa được nạp. Vui lòng kiểm tra kết nối mạng/CDN.');
    }

    // Install built-in polyfills
    shaka.polyfill.installAll();

    if (!shaka.Player.isBrowserSupported()) {
      throw new Error('Trình duyệt của bạn không hỗ trợ các tính năng phát video chuẩn của Shaka Player.');
    }

    // Create Shaka Player instance
    this.player = new shaka.Player();
    await this.player.attach(this.videoElement);

    // Attach Shaka UI Overlay
    this.ui = new shaka.ui.Overlay(this.player, containerElement, this.videoElement);
    const uiConfig = {
      controlPanelElements: [
        'play_pause',
        'time_and_duration',
        'spacer',
        'mute',
        'volume',
        'quality',
        'language',
        'captions',
        'fullscreen',
        'overflow_menu'
      ],
      addSeekBar: true
    };
    this.ui.configure(uiConfig);

    // Listen to player errors
    this.player.addEventListener('error', (event) => {
      this.handlePlayerError(event.detail);
    });

    // Listen to DRM key status changes
    this.player.addEventListener('drmsessionupdate', (event) => {
      this.log(`DRM Session cập nhật: ${event.type}`);
    });

    // Track real-time stats
    this.startStatsMonitoring();
  }

  // Set event callbacks
  setCallbacks({ onStatusChange, onError, onLog, onLicenseRequestSent }) {
    this.listeners.onStatusChange = onStatusChange;
    this.listeners.onError = onError;
    this.listeners.onLog = onLog;
    this.listeners.onLicenseRequestSent = onLicenseRequestSent;
  }

  log(message, type = 'info') {
    if (this.listeners.onLog) {
      this.listeners.onLog(message, type);
    }
  }

  // Load a video stream with Widevine DRM or Clear configuration
  async load(video) {
    if (!this.player) {
      throw new Error('Player chưa được khởi tạo');
    }

    this.currentVideo = video;
    this.log(`Bắt đầu tải luồng: "${video.title}" [${video.drmType.toUpperCase()}]`, 'info');

    // Reset current configuration
    this.player.resetConfiguration();

    // Default player configurations
    const playerConfig = {
      streaming: {
        bufferingGoal: 15,
        rebufferingGoal: 2,
        bufferBehind: 30
      },
      drm: {
        servers: {},
        advanced: {}
      }
    };

    // Configure DRM if specified
    if (video.drmType === 'widevine' || video.drmType === 'clearkey') {
      if (!video.licenseServer) {
        throw new Error('Video DRM yêu cầu phải có License Server URL!');
      }

      // Resolve relative path if needed (e.g., /api/drm/license -> http://localhost:3000/api/drm/license)
      let licenseUrl = video.licenseServer;
      if (licenseUrl.startsWith('/')) {
        licenseUrl = window.location.origin + licenseUrl;
      }

      const keySystem = video.drmType === 'widevine' ? 'com.widevine.alpha' : 'org.w3.clearkey';
      playerConfig.drm.servers[keySystem] = licenseUrl;
      this.log(`Cấu hình ${keySystem} License Server: ${licenseUrl}`, 'drm');

      // Parse custom request headers (Authorization, Tokens, etc.)
      let customHeaders = {};
      if (video.headers) {
        try {
          customHeaders = typeof video.headers === 'string' ? JSON.parse(video.headers) : video.headers;
        } catch (e) {
          console.warn('Không thể parse headers JSON:', e);
        }
      }

      // Configure network request filter for License requests
      const networkingEngine = this.player.getNetworkingEngine();
      networkingEngine.clearAllRequestFilters();
      
      this.log(`Chuẩn bị gửi yêu cầu cấp License với headers: ${JSON.stringify(customHeaders)}`, 'drm');
      
      networkingEngine.registerRequestFilter((type, request) => {
        if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) {
          for (const [key, value] of Object.entries(customHeaders)) {
            request.headers[key] = value;
          }

          const logPayload = {
            id: 'req_client_' + Date.now(),
            timestamp: new Date().toISOString(),
            method: 'POST',
            url: request.uris[0],
            clientIp: 'Client Browser (GitHub Web)',
            headers: { ...request.headers },
            customHeadersDetected: { ...customHeaders },
            bodySize: request.body ? `${request.body.byteLength} bytes` : '0 bytes',
            status: 'success',
            statusCode: 200,
            note: 'Bắt trực tiếp từ Client Shaka Network Engine'
          };

          // Record for both static web and local server
          if (window.__recordDrmLog) {
            window.__recordDrmLog(logPayload);
          }

          if (this.listeners.onLicenseRequestSent) {
            this.listeners.onLicenseRequestSent(logPayload);
          }
        }
      });
    } else {
      this.log('Chế độ phát luồng không mã hóa (Clear DASH)', 'info');
      this.player.getNetworkingEngine().clearAllRequestFilters();
    }

    // Apply configuration
    this.player.configure(playerConfig);

    try {
      // Load manifest into player
      await this.player.load(video.streamUrl);
      this.log(`Giải mã & nạp luồng thành công! Video đã sẵn sàng phát.`, 'success');
      
      // Auto play
      try {
        await this.videoElement.play();
      } catch (playErr) {
        this.log('Trình duyệt yêu cầu click để phát (Autoplay restriction)', 'warning');
      }

      if (this.listeners.onStatusChange) {
        this.listeners.onStatusChange({
          video,
          status: 'playing',
          drm: video.drmType
        });
      }
    } catch (err) {
      this.handlePlayerError(err);
      throw err;
    }
  }

  handlePlayerError(error) {
    console.error('Shaka Player Error:', error);
    let errMsg = `Lỗi Shaka [${error.category}:${error.code}]: ${error.message || 'Lỗi phát video'}`;
    
    // Friendly error messages for common DRM issues
    if (error.category === 6) { // DRM error category
      if (error.code === 6001) {
        errMsg = 'Lỗi Widevine (6001): Không tìm thấy hệ thống bảo vệ bản quyền phù hợp trên trình duyệt.';
      } else if (error.code === 6006) {
        errMsg = 'Lỗi Widevine (6006): Trình duyệt từ chối yêu cầu cấp phép DRM từ License Server.';
      } else if (error.code === 6007) {
        errMsg = 'Lỗi Widevine (6007): License Server trả về phản hồi không hợp lệ hoặc bị lỗi 403/500/CORS.';
      } else if (error.code === 6012) {
        errMsg = 'Lỗi Widevine (6012): Thiết bị hoặc trình duyệt không đáp ứng tiêu chuẩn bảo vệ phần cứng (HDCP/L1).';
      }
    } else if (error.category === 1) { // Network error
      errMsg = `Lỗi Mạng (${error.code}): Không thể tải manifest hoặc license. Vui lòng kiểm tra CORS hoặc mạng.`;
    }

    this.log(errMsg, 'error');
    if (this.listeners.onError) {
      this.listeners.onError(errMsg, error);
    }
  }

  // Periodic monitoring of playback stats
  startStatsMonitoring() {
    if (this.statsInterval) clearInterval(this.statsInterval);

    this.statsInterval = setInterval(() => {
      if (!this.player || !this.currentVideo) return;

      const stats = this.player.getStats();
      const tracks = this.player.getVariantTracks();
      const activeTrack = tracks.find(t => t.active);
      const keyStatuses = this.player.keyStatuses();

      const details = {
        resolution: activeTrack ? `${activeTrack.width}x${activeTrack.height}` : 'N/A',
        videoBandwidth: activeTrack ? `${Math.round(activeTrack.videoBandwidth / 1000)} kbps` : 'N/A',
        bufferingTime: stats.bufferingTime ? stats.bufferingTime.toFixed(2) + 's' : '0s',
        drmKeyCount: Object.keys(keyStatuses).length,
        drmKeyStatuses: keyStatuses
      };

      if (this.listeners.onStatusChange) {
        this.listeners.onStatusChange({
          video: this.currentVideo,
          status: this.videoElement.paused ? 'paused' : 'playing',
          drm: this.currentVideo.drmType,
          stats: details
        });
      }
    }, 1500);
  }

  // Destroy player
  async destroy() {
    if (this.statsInterval) clearInterval(this.statsInterval);
    if (this.ui) await this.ui.destroy();
    if (this.player) await this.player.destroy();
  }
}

export const drmPlayer = new DrmPlayerManager();
