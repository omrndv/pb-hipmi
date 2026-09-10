/**
 * HIPMI Telkom University - Main Application Controller
 * State Machine: WELCOME -> CAMERA -> REVIEW -> TEMPLATE -> RESULT
 * Complete lifecycle management, memory cleanup, popstate safety, and reload recovery.
 */

import { loadEventConfig } from './config/eventConfig.js';
import { sessionManager } from './engine/sessionManager.js';
import { cameraManager } from './engine/cameraManager.js';
import { runPhotoboothStressTest } from './engine/stressTestRunner.js';
import { WelcomeView } from './ui/welcomeView.js';
import { LayoutSelectView } from './ui/layoutSelectView.js';
import { CameraView } from './ui/cameraView.js';
import { ReviewView } from './ui/reviewView.js';
import { TemplateView } from './ui/templateView.js';
import { ResultView } from './ui/resultView.js';
import { OperatorModal } from './ui/operatorModal.js';
import { ErrorModal } from './ui/errorModal.js';
import { HistoryModal } from './ui/historyModal.js';
import { historyStorage } from './engine/historyStorage.js';
import { escapeHtml } from './utils/sanitize.js';

import './styles/main.css';

class PhotoboothApp {
  constructor() {
    this.appEl = document.getElementById('app');
    this.eventConfig = loadEventConfig();
    this.currentView = null;
    this.currentScreen = null;
    this.isTransitioning = false;
    this.isOperatorModalOpen = false;
    this.isHistoryModalOpen = false;
  }

  init() {
    // Reload safety: always clean up existing tracks, timers, and start fresh
    cameraManager.stopCamera();
    sessionManager.cleanupCurrentSession();

    // Check if opened as mobile download viewer from QR scan
    const urlParams = new URLSearchParams(window.location.search);
    const sessionParam = urlParams.get('session');
    const actionParam = urlParams.get('action');
    const photoParam = urlParams.get('photo');

    if (sessionParam && (actionParam === 'view' || actionParam === 'download')) {
      this.renderMobileViewer(sessionParam, photoParam);
      return;
    }

    const stressParam = urlParams.get('stresstest') || urlParams.get('autostress');
    if (stressParam) {
      const count = parseInt(stressParam, 10) || 50;
      this.runStressTestDashboard(count);
      return;
    }

    // Reset browser history state synchronously on fresh initialization to prevent stale popstate
    try {
      window.history.replaceState({ screen: 'WELCOME' }, '', window.location.pathname);
    } catch (e) {
      // Handled
    }

    // Bind unload cleanup
    window.addEventListener('beforeunload', () => {
      cameraManager.stopCamera();
      sessionManager.cleanupCurrentSession();
    });

    // Browser Back / Forward (popstate) Safety
    window.addEventListener('popstate', (e) => {
      if (this.isTransitioning) return;
      const targetScreen = e.state && e.state.screen ? e.state.screen : 'WELCOME';
      this._handlePopState(targetScreen);
    });

    // Keyboard shortcut for Operator Modal (Ctrl+Shift+O)
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        this.openOperatorSettings();
      }
    });

    // Navigate to initial screen without creating duplicate history entry
    this.goToWelcome(false);
  }

  /**
   * Handle browser navigation without state corruption
   */
  _handlePopState(targetScreen) {
    switch (targetScreen) {
      case 'WELCOME':
        this.goToWelcome(false);
        break;
      case 'LAYOUT':
        this.goToLayoutSelect(false);
        break;
      case 'CAMERA': {
        const session = sessionManager.getSession();
        if (session) {
          this.goToCamera(null, false);
        } else {
          this.goToWelcome(false);
        }
        break;
      }
      case 'REVIEW': {
        const session = sessionManager.getSession();
        if (session && session.photos.length > 0) {
          this.goToReview(false);
        } else {
          this.goToWelcome(false);
        }
        break;
      }
      case 'TEMPLATE': {
        const session = sessionManager.getSession();
        if (session && session.photos.length > 0) {
          this.goToTemplate(false);
        } else {
          this.goToWelcome(false);
        }
        break;
      }
      case 'RESULT': {
        const session = sessionManager.getSession();
        if (session && session.finalDataUrl) {
          this.goToResult(false);
        } else {
          this.goToWelcome(false);
        }
        break;
      }
      default:
        this.goToWelcome(false);
    }
  }

  /**
   * Safe view transition helper
   */
  _switchView(newViewInstance, screenName, pushHistory = true) {
    if (this.currentView && typeof this.currentView.destroy === 'function') {
      try {
        this.currentView.destroy();
      } catch (err) {
        console.warn("View destroy error:", err);
      }
    }

    this.appEl.innerHTML = '';
    this.currentView = newViewInstance;
    this.currentScreen = screenName;
    this.isTransitioning = false;

    if (pushHistory) {
      try {
        window.history.pushState({ screen: screenName }, '', window.location.pathname);
      } catch (e) {
        // Handled
      }
    }
  }

  /**
   * SCREEN 1: WELCOME
   */
  goToWelcome(pushHistory = true) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    // Guaranteed camera & session cleanup on Welcome
    cameraManager.stopCamera();
    sessionManager.resetSession();

    const view = new WelcomeView({
      eventConfig: this.eventConfig,
      onStart: () => {
        this.goToLayoutSelect();
      },
      onOpenHistory: () => this.openHistoryModal(),
      onOpenSettings: () => this.openOperatorSettings(),
      onToggleFullscreen: () => this.toggleFullscreen()
    });

    const el = view.render();
    this._switchView(view, 'WELCOME', pushHistory);
    this.appEl.appendChild(el);
  }

  /**
   * SCREEN 1.5: LAYOUT & PHOTO COUNT SELECTOR (1, 3, or 4 Photos)
   */
  goToLayoutSelect(pushHistory = true) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    cameraManager.stopCamera();

    const view = new LayoutSelectView({
      eventConfig: this.eventConfig,
      onSelectLayout: (photoCount) => {
        this.eventConfig.photoCount = photoCount;
        sessionManager.startNewSession(this.eventConfig, photoCount);
        this.goToCamera(null);
      },
      onBack: () => {
        this.goToWelcome();
      }
    });

    const el = view.render();
    this._switchView(view, 'LAYOUT', pushHistory);
    this.appEl.appendChild(el);
  }

  /**
   * SCREEN 2: CAMERA
   * @param {number|null} targetSlotIndex - null for normal full sequence, number for single retake
   */
  async goToCamera(targetSlotIndex = null, pushHistory = true) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    // Destroy existing view first so old camera streams are fully stopped before new stream opens
    if (this.currentView && typeof this.currentView.destroy === 'function') {
      try {
        this.currentView.destroy();
      } catch (err) {
        console.warn("View destroy error:", err);
      }
      this.currentView = null;
    }

    const session = sessionManager.getSession();
    if (!session) {
      sessionManager.startNewSession(this.eventConfig);
    }
    const currentSession = sessionManager.getSession();

    const view = new CameraView({
      targetSlotIndex,
      totalSlots: currentSession?.totalSlots || this.eventConfig.photoCount || 4,
      countdownSeconds: this.eventConfig.countdownSeconds || 3,
      eventConfig: this.eventConfig,
      onPhotoCaptured: (slotIndex, blob, dataUrl) => {
        sessionManager.addPhoto(slotIndex, blob, dataUrl);
      },
      onAllPhotosCompleted: () => {
        this.goToReview();
      },
      onCancel: () => {
        const activeSession = sessionManager.getSession();
        if (activeSession && activeSession.photos.length > 0) {
          this.goToReview();
        } else {
          this.goToLayoutSelect();
        }
      },
      onCameraError: (errType) => {
        this.showErrorModal(
          errType,
          () => this.goToCamera(targetSlotIndex),
          () => {
            this.eventConfig.selectedCameraId = 'simulated';
            this.goToCamera(targetSlotIndex);
          }
        );
      }
    });

    try {
      const el = await view.render();
      this._switchView(view, 'CAMERA', pushHistory);
      this.appEl.appendChild(el);
    } catch (err) {
      this.isTransitioning = false;
      const errorType = err.message === 'PERMISSION_DENIED' ? 'PERMISSION_DENIED' : 'CAMERA_UNAVAILABLE';
      this.showErrorModal(
        errorType,
        () => this.goToCamera(targetSlotIndex),
        () => {
          this.eventConfig.selectedCameraId = 'simulated';
          this.goToCamera(targetSlotIndex);
        }
      );
    }
  }

  /**
   * SCREEN 3: PHOTO REVIEW
   */
  goToReview(pushHistory = true) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    // Guaranteed camera stream cleanup
    cameraManager.stopCamera();

    const session = sessionManager.getSession();
    if (!session || !session.photos || session.photos.length === 0) {
      this.isTransitioning = false;
      this.goToWelcome(pushHistory);
      return;
    }

    const view = new ReviewView({
      photos: session.photos,
      eventConfig: this.eventConfig,
      onRetakeSingle: (slotIndex) => {
        this.goToCamera(slotIndex);
      },
      onRetakeAll: () => {
        const prevSlots = session?.totalSlots || this.eventConfig.photoCount || 4;
        sessionManager.startNewSession(this.eventConfig, prevSlots);
        this.goToCamera(null);
      },
      onContinue: () => {
        this.goToTemplate();
      }
    });

    const el = view.render();
    this._switchView(view, 'REVIEW', pushHistory);
    this.appEl.appendChild(el);
  }

  /**
   * SCREEN 4: TEMPLATE & CUSTOMIZATION
   */
  goToTemplate(pushHistory = true) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    const session = sessionManager.getSession();
    if (!session || !session.photos || session.photos.length === 0) {
      this.isTransitioning = false;
      this.goToWelcome(pushHistory);
      return;
    }

    const view = new TemplateView({
      photos: session.photos,
      selectedTemplateId: session.selectedTemplateId || "signature",
      customization: session.customization,
      eventConfig: this.eventConfig,
      onTemplateSelected: (templateId) => {
        sessionManager.setTemplate(templateId);
      },
      onCustomizationChanged: (customizationData) => {
        sessionManager.setCustomization(customizationData);
      },
      onContinue: ({ blob, dataUrl }) => {
        sessionManager.setFinalResult(blob, dataUrl);
        this.goToResult();
      },
      onBack: () => {
        this.goToReview();
      }
    });

    const el = view.render();
    this._switchView(view, 'TEMPLATE', pushHistory);
    this.appEl.appendChild(el);
  }

  /**
   * SCREEN 5: FINAL RESULT & QR
   */
  async goToResult(pushHistory = true) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    const session = sessionManager.getSession();
    if (!session || !session.finalDataUrl) {
      this.isTransitioning = false;
      this.goToWelcome(pushHistory);
      return;
    }

    const view = new ResultView({
      finalBlob: session.finalBlob,
      finalDataUrl: session.finalDataUrl,
      sessionId: session.sessionId,
      customization: session.customization,
      eventConfig: this.eventConfig,
      onNewSession: () => {
        this.goToWelcome();
      }
    });

    const el = await view.render();
    this._switchView(view, 'RESULT', pushHistory);
    this.appEl.appendChild(el);
  }

  /**
   * Mobile Viewer for QR Code scans
   */
  async renderMobileViewer(sessionId, photoUrl = '') {
    const safeSessionId = escapeHtml(sessionId);
    const safeOrg = escapeHtml(this.eventConfig.organization);
    const safeEvent = escapeHtml(this.eventConfig.eventName);

    let displayPhotoUrl = (photoUrl || '').trim();

    // 1. Check in-memory session if on same booth device
    if (!displayPhotoUrl) {
      const session = sessionManager.getSession();
      if (session && session.finalDataUrl && session.sessionId === sessionId) {
        displayPhotoUrl = session.finalDataUrl;
      }
    }

    // 2. Check local IndexedDB history
    if (!displayPhotoUrl) {
      try {
        const historyItem = await historyStorage.getById(sessionId);
        if (historyItem) {
          displayPhotoUrl = historyItem.uploadedUrl || historyItem.finalDataUrl;
        }
      } catch (e) {
        // Handled
      }
    }

    if (displayPhotoUrl) {
      this.appEl.innerHTML = `
        <div class="mobile-viewer-screen view-enter">
          <div class="mobile-viewer-content">
            <div class="mobile-viewer-header">
              <img src="${this.eventConfig.logoHipmi}" alt="HIPMI" style="height: 52px; margin: 0 auto 10px; object-fit: contain;" />
              <h2 style="font-size: 20px; font-weight: 800; color: var(--color-accent); margin-bottom: 4px;">${safeOrg}</h2>
              <p style="font-size: 13px; color: #9E9EA7; margin-bottom: 8px;">${safeEvent}</p>
              <div style="display: inline-block; padding: 4px 14px; border-radius: 9999px; background: rgba(200,168,75,0.15); border: 1px solid rgba(200,168,75,0.3); font-size: 11px; color: #EAD79B; font-weight: 700; letter-spacing: 0.5px;">
                SESSION #${safeSessionId}
              </div>
            </div>

            <!-- Hero Image Card (Full Aspect Ratio, Never Clipped) -->
            <div class="mobile-viewer-card">
              <img src="${displayPhotoUrl}" alt="Photobooth Memory" id="mobile-photo-img" />
            </div>

            <!-- Mobile Action Buttons -->
            <div class="mobile-viewer-actions">
              <a href="${displayPhotoUrl}" download="hipmi-photobooth-${safeSessionId}.png" target="_blank" class="btn-primary btn-accent" id="btn-mobile-download" style="width: 100%; min-height: 54px; font-size: 16px; font-weight: 800; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 10px;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download Foto HD
              </a>
            </div>

            <!-- Tips Card -->
            <div class="mobile-viewer-tips" style="margin-bottom: 36px;">
              <p style="font-size: 12px; color: #A0A0AA; line-height: 1.5; margin: 0;">
                💡 <strong>Tips iPhone / Android:</strong> Tekan dan tahan foto di atas, lalu pilih <em>"Simpan Gambar"</em> atau <em>"Save to Photos"</em> untuk langsung tersimpan di galeri kamera HP kamu.
              </p>
            </div>
          </div>
        </div>
      `;
    } else {
      this.appEl.innerHTML = `
        <div class="mobile-viewer-screen view-enter" style="justify-content: center;">
          <div class="mobile-viewer-content">
            <div class="mobile-viewer-header">
              <img src="${this.eventConfig.logoHipmi}" alt="HIPMI" style="height: 64px; margin: 0 auto 16px;" />
              <h2 style="font-size: 22px; font-weight: 800; color: var(--color-accent); margin-bottom: 6px;">${safeOrg}</h2>
              <div style="display: inline-block; padding: 4px 12px; border-radius: 9999px; background: rgba(200,168,75,0.15); border: 1px solid rgba(200,168,75,0.3); font-size: 12px; color: #EAD79B; font-weight: 700;">
                SESSION ${safeSessionId}
              </div>
            </div>

            <div class="mobile-viewer-info-card">
              <div class="mobile-viewer-info-icon">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
              </div>
              <h3 style="font-size: 17px; font-weight: 700; color: #FFFFFF; margin-bottom: 8px;">Event Station Photobooth</h3>
              <p style="font-size: 13px; color: #9E9EA7; line-height: 1.5; margin: 0;">
                Foto beresolusi tinggi kamu diproses di layar monitor booth. Silakan unduh langsung dari layar booth atau hubungi operator.
              </p>
            </div>
          </div>
        </div>
      `;
    }
  }

  /**
   * Live Stress Test Dashboard for 50-Session Automation & QA
   */
  async runStressTestDashboard(totalSessions = 50) {
    this.appEl.innerHTML = `
      <div class="view-container view-enter" style="background: #090A0C; color: #FFFFFF; padding: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow-y: auto;">
        <div style="max-width: 680px; width: 100%; text-align: center;">
          <img src="${this.eventConfig.logoHipmi}" alt="HIPMI" style="height: 64px; margin: 0 auto 16px;" />
          <div style="display: inline-block; padding: 4px 12px; border-radius: 9999px; background: rgba(200,168,75,0.15); border: 1px solid rgba(200,168,75,0.4); color: var(--color-accent); font-size: 12px; font-weight: 800; margin-bottom: 12px; letter-spacing: 1px;">
            AUTOMATED QA STRESS TEST
          </div>
          <h1 style="font-size: 28px; font-weight: 900; margin-bottom: 8px;">Simulating ${totalSessions} Consecutive Sessions</h1>
          <p style="font-size: 14px; color: #8E8E93; margin-bottom: 28px;">Monitoring camera stream cleanup, object URL revocation, memory stability, and canvas rendering.</p>

          <div style="background: #14161B; border: 1px solid #242730; border-radius: 12px; padding: 24px; text-align: left; margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; font-weight: 700;">
              <span id="st-progress-text">Executing session 1 of ${totalSessions}...</span>
              <span id="st-pct-text">0%</span>
            </div>
            <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.1); border-radius: 9999px; overflow: hidden; margin-bottom: 20px;">
              <div id="st-progress-bar" style="width: 0%; height: 100%; background: var(--color-accent); transition: width 100ms ease;"></div>
            </div>

            <div id="st-terminal" style="height: 180px; overflow-y: auto; background: #000000; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px; color: #34D399; line-height: 1.6;">
              <div>Starting session runner...</div>
            </div>
          </div>

          <div id="st-actions" style="display: none;">
            <button id="btn-st-enter" class="btn-primary btn-accent" style="width: 100%;">
              Enter Photobooth Experience
            </button>
          </div>
        </div>
      </div>
    `;

    const progText = document.getElementById('st-progress-text');
    const pctText = document.getElementById('st-pct-text');
    const bar = document.getElementById('st-progress-bar');
    const term = document.getElementById('st-terminal');
    const actions = document.getElementById('st-actions');
    const enterBtn = document.getElementById('btn-st-enter');

    const logFn = (msg) => {
      const line = document.createElement('div');
      line.textContent = msg;
      term.appendChild(line);
      term.scrollTop = term.scrollHeight;
    };

    // Custom progress tracker
    const report = await runPhotoboothStressTest(totalSessions, (msg) => {
      logFn(msg);
      if (msg.includes('passed')) {
        const match = msg.match(/Session (\d+)\/(\d+)/);
        if (match) {
          const cur = parseInt(match[1], 10);
          const total = parseInt(match[2], 10);
          const pct = Math.round((cur / total) * 100);
          progText.textContent = `Completed ${cur} of ${total} sessions`;
          pctText.textContent = `${pct}%`;
          bar.style.width = `${pct}%`;
        }
      }
    });

    if (report.failedSessions === 0) {
      progText.textContent = `✅ All ${totalSessions} sessions completed flawlessly!`;
      pctText.textContent = `100%`;
      bar.style.width = `100%`;
      bar.style.background = '#10B981';
      actions.style.display = 'block';
    } else {
      progText.textContent = `❌ Completed with ${report.failedSessions} failures`;
      bar.style.background = '#EF4444';
      actions.style.display = 'block';
    }

    enterBtn.addEventListener('click', () => {
      window.history.pushState({ screen: 'WELCOME' }, '', '/');
      this.goToWelcome(false);
    });
  }

  /**
   * Open Operator Settings Modal
   */
  openOperatorSettings() {
    if (this.isOperatorModalOpen) return;
    this.isOperatorModalOpen = true;

    const modal = new OperatorModal({
      eventConfig: this.eventConfig,
      onConfigUpdated: (newConfig) => {
        this.eventConfig = newConfig;
        // If on Welcome screen, refresh Welcome view with new branding
        if (this.currentScreen === 'WELCOME') {
          this.goToWelcome(false);
        }
      },
      onOpenHistory: () => this.openHistoryModal(),
      onClose: () => {
        this.isOperatorModalOpen = false;
      }
    });

    modal.render().then(el => {
      document.body.appendChild(el);
    }).catch(() => {
      this.isOperatorModalOpen = false;
    });
  }

  /**
   * Open Photo History / Gallery Modal
   */
  openHistoryModal() {
    if (this.isHistoryModalOpen) return;
    this.isHistoryModalOpen = true;

    const modal = new HistoryModal({
      eventConfig: this.eventConfig,
      onClose: () => {
        this.isHistoryModalOpen = false;
      }
    });

    modal.render().then(el => {
      document.body.appendChild(el);
    }).catch((err) => {
      console.warn("History modal error:", err);
      this.isHistoryModalOpen = false;
    });
  }

  /**
   * Open Error Modal
   */
  showErrorModal(errorType, onRetry, onUseVirtual) {
    const modal = new ErrorModal({
      type: errorType,
      onRetry: () => {
        if (onRetry) onRetry();
      },
      onUseVirtual: () => {
        if (onUseVirtual) onUseVirtual();
      },
      onHome: () => {
        this.goToWelcome();
      }
    });

    const el = modal.render();
    document.body.appendChild(el);
  }

  /**
   * Fullscreen Toggle
   */
  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }
}

// Instantiate and initialize on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  const app = new PhotoboothApp();
  app.init();
  app.sessionManager = sessionManager;
  window.__HIPMI_APP__ = app; // Expose for testing & automation
  window.__runStressTest = runPhotoboothStressTest;
});
