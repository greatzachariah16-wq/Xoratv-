import type { InteractionTelemetry, MouseSample, ScrollSample, TouchSample } from "./types";

class TelemetryCollector {
  private scrollSamples: ScrollSample[] = [];
  private touchSamples: TouchSample[] = [];
  private mouseSamples: MouseSample[] = [];
  private lastScrollY = 0;
  private lastScrollTime = 0;
  private foregroundStart = Date.now();
  private totalForegroundMs = 0;
  private totalBackgroundMs = 0;
  private lastVisibilityChange = Date.now();
  private isHidden = false;
  private clickTimestamps: number[] = [];
  private isListening = false;

  public start(): void {
    if (typeof window === "undefined" || this.isListening) return;
    this.isListening = true;
    this.lastScrollY = window.scrollY || 0;
    this.lastScrollTime = performance.now();
    this.foregroundStart = Date.now();
    this.isHidden = document.hidden;

    window.addEventListener("scroll", this.handleScroll, { passive: true });
    window.addEventListener("touchstart", this.handleTouch, { passive: true });
    window.addEventListener("touchmove", this.handleTouch, { passive: true });
    window.addEventListener("mousemove", this.handleMouseMove, {
      passive: true,
    });
    window.addEventListener("click", this.handleClick, { passive: true });
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  public stop(): void {
    if (typeof window === "undefined" || !this.isListening) return;
    this.isListening = false;
    window.removeEventListener("scroll", this.handleScroll);
    window.removeEventListener("touchstart", this.handleTouch);
    window.removeEventListener("touchmove", this.handleTouch);
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("click", this.handleClick);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
  }

  public reset(): void {
    this.scrollSamples = [];
    this.touchSamples = [];
    this.mouseSamples = [];
    this.clickTimestamps = [];
    this.totalForegroundMs = 0;
    this.totalBackgroundMs = 0;
    this.lastVisibilityChange = Date.now();
  }

  private handleScroll = (): void => {
    const now = performance.now();
    const currentY = window.scrollY || 0;
    const deltaY = currentY - this.lastScrollY;
    const durationMs = Math.max(1, now - this.lastScrollTime);
    const velocity = Math.abs(deltaY / durationMs);

    const prevSample = this.scrollSamples[this.scrollSamples.length - 1];
    const prevVelocity = prevSample ? prevSample.velocity : velocity;
    const acceleration = (velocity - prevVelocity) / durationMs;

    this.scrollSamples.push({
      timestamp: now,
      scrollY: currentY,
      deltaY,
      durationMs,
      velocity,
      acceleration,
    });

    if (this.scrollSamples.length > 50) {
      this.scrollSamples.shift();
    }

    this.lastScrollY = currentY;
    this.lastScrollTime = now;
  };

  private handleTouch = (e: TouchEvent): void => {
    const now = performance.now();
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      this.touchSamples.push({
        timestamp: now,
        identifier: t.identifier,
        x: t.clientX,
        y: t.clientY,
        radiusX: t.radiusX || 0,
        radiusY: t.radiusY || 0,
        force: t.force || 0,
      });
    }

    if (this.touchSamples.length > 60) {
      this.touchSamples.splice(0, this.touchSamples.length - 60);
    }
  };

  private handleMouseMove = (e: MouseEvent): void => {
    const now = performance.now();
    const prev = this.mouseSamples[this.mouseSamples.length - 1];
    let speed = 0;
    if (prev) {
      const dt = Math.max(1, now - prev.timestamp);
      const dist = Math.hypot(e.clientX - prev.x, e.clientY - prev.y);
      speed = dist / dt;
    }

    this.mouseSamples.push({
      timestamp: now,
      x: e.clientX,
      y: e.clientY,
      speed,
    });

    if (this.mouseSamples.length > 50) {
      this.mouseSamples.shift();
    }
  };

  private handleClick = (): void => {
    const now = Date.now();
    this.clickTimestamps.push(now);
    // Keep only last 10 clicks within 5 seconds
    const threshold = now - 5000;
    this.clickTimestamps = this.clickTimestamps.filter((t) => t >= threshold);
  };

  private handleVisibilityChange = (): void => {
    const now = Date.now();
    const elapsed = now - this.lastVisibilityChange;
    if (this.isHidden) {
      this.totalBackgroundMs += elapsed;
    } else {
      this.totalForegroundMs += elapsed;
    }
    this.isHidden = document.hidden;
    this.lastVisibilityChange = now;
  };

  /**
   * Evaluates collected behavioral telemetry.
   */
  public getTelemetry(): InteractionTelemetry {
    // Update active foreground/background duration
    const now = Date.now();
    const currentElapsed = now - this.lastVisibilityChange;
    const finalFg = (this.totalForegroundMs + (!this.isHidden ? currentElapsed : 0)) / 1000;
    const finalBg = (this.totalBackgroundMs + (this.isHidden ? currentElapsed : 0)) / 1000;

    // Scroll metrics
    const scrollCount = this.scrollSamples.length;
    let scrollVelocityVariance = 0;
    let hasHumanScrollCurves = false;

    if (scrollCount >= 3) {
      const velocities = this.scrollSamples.map((s) => s.velocity);
      const mean = velocities.reduce((a, b) => a + b, 0) / velocities.length;
      const variance =
        velocities.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / velocities.length;
      scrollVelocityVariance = Number(Math.sqrt(variance).toFixed(4));
      // Human scroll has variable velocity and non-zero variance
      hasHumanScrollCurves = scrollVelocityVariance > 0.05;
    }

    // Touch metrics
    const touchCount = this.touchSamples.length;
    let totalRadius = 0;
    let touchPressureVariance = 0;
    let hasHumanTouchJitter = false;

    if (touchCount > 0) {
      totalRadius =
        this.touchSamples.reduce((sum, t) => sum + t.radiusX + t.radiusY, 0) / (touchCount * 2);

      const forces = this.touchSamples.map((t) => t.force);
      const meanForce = forces.reduce((a, b) => a + b, 0) / forces.length;
      const forceVar =
        forces.reduce((sum, f) => sum + Math.pow(f - meanForce, 2), 0) / forces.length;
      touchPressureVariance = Number(Math.sqrt(forceVar).toFixed(4));

      // Check micro-jitter across points (humans tremble minutely, bots have perfectly round integer steps)
      let jitters = 0;
      for (let i = 1; i < this.touchSamples.length; i++) {
        const dx = Math.abs(this.touchSamples[i].x - this.touchSamples[i - 1].x);
        const dy = Math.abs(this.touchSamples[i].y - this.touchSamples[i - 1].y);
        if (dx > 0 && dx < 2 && dy > 0 && dy < 2) {
          jitters++;
        }
      }
      hasHumanTouchJitter = jitters > 0 || totalRadius > 5;
    }

    // Mouse metrics
    const mouseMoveCount = this.mouseSamples.length;
    let mouseTrajectoryCurvature = 0;
    if (mouseMoveCount >= 5) {
      // Calculate deviation from straight chord
      const first = this.mouseSamples[0];
      const last = this.mouseSamples[mouseMoveCount - 1];
      const chord = Math.hypot(last.x - first.x, last.y - first.y);
      let arcLength = 0;
      for (let i = 1; i < mouseMoveCount; i++) {
        arcLength += Math.hypot(
          this.mouseSamples[i].x - this.mouseSamples[i - 1].x,
          this.mouseSamples[i].y - this.mouseSamples[i - 1].y,
        );
      }
      if (chord > 10) {
        mouseTrajectoryCurvature = Number((arcLength / chord).toFixed(3));
      }
    }

    // Rapid click bursts (>6 clicks per 2 seconds)
    const rapidClickBurstCount = this.clickTimestamps.length > 6 ? 1 : 0;
    const totalInteractionEvents = scrollCount + touchCount + mouseMoveCount;

    return {
      scrollCount,
      scrollVelocityVariance,
      hasHumanScrollCurves,
      touchCount,
      averageTouchRadius: Number(totalRadius.toFixed(2)),
      touchPressureVariance,
      hasHumanTouchJitter,
      mouseMoveCount,
      mouseTrajectoryCurvature,
      activeForegroundSeconds: Number(finalFg.toFixed(1)),
      backgroundSeconds: Number(finalBg.toFixed(1)),
      rapidClickBurstCount,
      totalInteractionEvents,
    };
  }
}

export const telemetryCollector = new TelemetryCollector();
