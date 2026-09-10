/**
 * HIPMI Telkom University - Screen 3: Photo Review View
 * Displays captured session photos with individual retake capability and continue navigation.
 */

export class ReviewView {
  constructor({ photos, onRetakeSingle, onRetakeAll, onContinue, eventConfig }) {
    this.photos = photos || [];
    this.onRetakeSingle = onRetakeSingle;
    this.onRetakeAll = onRetakeAll;
    this.onContinue = onContinue;
    this.eventConfig = eventConfig;
    this.container = null;
    this.isNavigating = false;
  }

  render() {
    const div = document.createElement('div');
    div.className = 'view-container view-enter review-screen';
    this.container = div;

    let cardsHtml = '';
    this.photos.forEach((p, idx) => {
      const numDisplay = String(idx + 1).padStart(2, '0');
      const imgSrc = p.objectUrl || p.dataUrl;

      cardsHtml += `
        <div class="review-card">
          <div class="review-card-img-wrap">
            <img src="${imgSrc}" alt="Photo ${numDisplay}" class="review-card-img" />
            <div class="review-card-badge">SHOT ${numDisplay}</div>
          </div>
          <div class="review-card-footer">
            <span class="review-card-label">Photo ${idx + 1}</span>
            <button class="review-retake-btn" data-slot="${p.index}" aria-label="Retake Photo ${idx + 1}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M23 4v6h-6"></path>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
              Retake
            </button>
          </div>
        </div>
      `;
    });

    div.innerHTML = `
      <!-- Header -->
      <div class="review-header">
        <h1 class="review-title">YOUR MOMENTS</h1>
        <p class="review-subtitle">Review your photos. Retake any individual shot or continue to select your template.</p>
      </div>

      <!-- Photo Cards Grid -->
      <div class="review-grid">
        ${cardsHtml}
      </div>

      <!-- Actions Bar -->
      <div class="review-actions-bar">
        <button class="btn-secondary" id="btn-retake-all" aria-label="Retake All Photos">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 4v6h-6"></path>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          Retake All
        </button>

        <button class="btn-primary" id="btn-continue" aria-label="Continue to Templates">
          Continue
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </button>
      </div>
    `;

    // Listeners for individual retake
    const retakeButtons = div.querySelectorAll('.review-retake-btn');
    retakeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.isNavigating) return;
        this.isNavigating = true;
        const slot = parseInt(btn.getAttribute('data-slot'), 10);
        if (this.onRetakeSingle) this.onRetakeSingle(slot);
      });
    });

    // Retake all
    const retakeAllBtn = div.querySelector('#btn-retake-all');
    retakeAllBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.isNavigating) return;
      this.isNavigating = true;
      if (this.onRetakeAll) this.onRetakeAll();
    });

    // Continue
    const continueBtn = div.querySelector('#btn-continue');
    continueBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.isNavigating) return;
      this.isNavigating = true;
      continueBtn.classList.add('btn-disabled');
      continueBtn.disabled = true;
      if (this.onContinue) this.onContinue();
    });

    return div;
  }

  destroy() {
    this.isNavigating = false;
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
