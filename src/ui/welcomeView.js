import { soundEngine } from '../engine/audioEffects.js';
import { escapeHtml } from '../utils/sanitize.js';

export class WelcomeView {
  constructor({ eventConfig, onStart, onOpenSettings, onOpenHistory, onToggleFullscreen }) {
    this.eventConfig = eventConfig;
    this.onStart = onStart;
    this.onOpenSettings = onOpenSettings;
    this.onOpenHistory = onOpenHistory;
    this.onToggleFullscreen = onToggleFullscreen;
    this.container = null;
    this.isStarting = false;
  }

  render() {
    const div = document.createElement('div');
    div.className = 'view-container view-enter';
    this.container = div;

    const orgName = escapeHtml(this.eventConfig.organization);
    const eventName = escapeHtml(this.eventConfig.eventName);
    const subOrg = escapeHtml(this.eventConfig.subOrganization || this.eventConfig.organization);
    const year = escapeHtml(this.eventConfig.year);

    div.innerHTML = `
      <!-- Top Header Controls -->
      <header class="booth-header welcome-header">
        <div class="brand-badge welcome-brand-badge">
          <img src="${this.eventConfig.logoHipmi}" alt="HIPMI" class="brand-logo-mini" />
          <div class="brand-text-mini">
            <span class="brand-org">${orgName}</span>
            <span class="brand-event-name">${eventName}</span>
          </div>
        </div>
        <div class="header-actions">
          <button class="icon-btn" id="btn-history" title="Riwayat Foto (Gallery)" aria-label="Riwayat Foto">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
          </button>
          <button class="icon-btn" id="btn-fullscreen" title="Toggle Fullscreen" aria-label="Toggle Fullscreen">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
            </svg>
          </button>
          <button class="icon-btn" id="btn-settings" title="Operator Settings" aria-label="Operator Settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </header>

      <!-- Welcome Main Content -->
      <main class="welcome-screen">
        <div class="welcome-content">
          <!-- Official Dual Logo Lockup -->
          <div class="welcome-logo-lockup">
            <img src="${this.eventConfig.logoHipmi}" alt="HIPMI Telkom University" class="welcome-logo-hipmi" />
            <div class="welcome-logo-divider"></div>
            <img src="${this.eventConfig.logoTelu}" alt="Telkom University" class="welcome-logo-telu" />
          </div>

          <!-- Small Pill Label -->
          <div class="welcome-tag">
            <span class="welcome-tag-dot"></span>
            PHOTOBOOTH EXPERIENCE
          </div>

          <!-- Confident Headline -->
          <h1 class="welcome-headline">
            Capture Your <span>Moment.</span>
          </h1>

          <!-- Restrained Editorial Subheadline -->
          <p class="welcome-subheadline">
            Make a moment. Keep the memory.<br/>
            Official interactive photobooth for ${orgName}.
          </p>

          <!-- Primary CTA Button -->
          <div class="welcome-cta-group">
            <button class="btn-primary welcome-start-btn" id="btn-start-session" aria-label="Start Photo Session">
              START PHOTO
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>
            <span class="welcome-instruction">Tap to begin</span>
          </div>
        </div>

        <!-- Footer Event Tag -->
        <footer class="welcome-footer-info">
          <span>${subOrg}</span>
          <span>•</span>
          <span>${year}</span>
        </footer>
      </main>
    `;

    // Event Listeners with Double-click Protection
    const startBtn = div.querySelector('#btn-start-session');
    startBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.isStarting) return;
      this.isStarting = true;
      soundEngine.unlock();
      startBtn.classList.add('btn-disabled');
      startBtn.disabled = true;
      this.onStart();
    });

    const historyBtn = div.querySelector('#btn-history');
    if (historyBtn) {
      historyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.onOpenHistory) this.onOpenHistory();
      });
    }

    const settingsBtn = div.querySelector('#btn-settings');
    settingsBtn.addEventListener('click', () => {
      if (this.onOpenSettings) this.onOpenSettings();
    });

    const fullscreenBtn = div.querySelector('#btn-fullscreen');
    fullscreenBtn.addEventListener('click', () => {
      if (this.onToggleFullscreen) this.onToggleFullscreen();
    });

    return div;
  }

  destroy() {
    this.isStarting = false;
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
