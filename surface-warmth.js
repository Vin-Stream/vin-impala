document.addEventListener("DOMContentLoaded", () => {
  const motionAllowed = window.matchMedia?.("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
  if (!motionAllowed) return;

  for (const surface of document.querySelectorAll(".player-container, .player-stage")) {
    const canvas = surface.querySelector(":scope > .chassis-fluid");
    const context = canvas?.getContext("2d");
    if (!context) continue;

  let width = 0;
  let height = 0;
  let cutouts = [];
  let beadAngle = 0;
  let active = false;
  let opacity = 0;
  let targetX = 0;
  let targetY = 0;
  let x = 0;
  let y = 0;
  let velocityX = 0;
  let velocityY = 0;
  let trailX = 0;
  let trailY = 0;
  let animationFrame = 0;

  function resize() {
    const bounds = surface.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = bounds.width;
    height = bounds.height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    updateCutouts();
    draw();
  }

  function updateCutouts() {
    const bounds = surface.getBoundingClientRect();
    cutouts = Array.from(surface.querySelectorAll("button, select, .lcd-display, audio, video"))
      .filter((element) => getComputedStyle(element).display !== "none")
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width && rect.height && rect.right > bounds.left && rect.left < bounds.right && rect.bottom > bounds.top && rect.top < bounds.bottom)
      .map((rect) => ({
        x: rect.left - bounds.left,
        y: rect.top - bounds.top,
        width: rect.width,
        height: rect.height
      }));
  }

  function gel(xPosition, yPosition, xRadius, yRadius, centerColor, middleColor) {
    context.save();
    context.translate(xPosition, yPosition);
    context.scale(xRadius, yRadius);
    const fill = context.createRadialGradient(-0.12, -0.16, 0.05, 0, 0, 1);
    fill.addColorStop(0, centerColor);
    fill.addColorStop(0.48, middleColor);
    fill.addColorStop(1, "rgba(92, 48, 46, 0)");
    context.fillStyle = fill;
    context.beginPath();
    context.arc(0, 0, 1, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function bead() {
    const stretch = Math.min(22, Math.hypot(velocityX, velocityY) * 2);
    context.save();
    context.translate(x, y);
    context.rotate(beadAngle);
    context.beginPath();
    context.moveTo(-50 - stretch, 0);
    context.bezierCurveTo(-35, -12, 5, -16, 46 + stretch, -2);
    context.bezierCurveTo(59 + stretch, 7, 18, 15, -43, 10);
    context.closePath();
    context.fillStyle = "rgba(76, 39, 41, 0.22)";
    context.strokeStyle = "rgba(231, 162, 122, 0.19)";
    context.lineWidth = 1.2;
    context.fill();
    context.stroke();
    context.restore();
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    if (opacity < 0.005 || !width || !height) return;

    context.save();
    context.beginPath();
    context.roundRect(0, 0, width, height, surface.classList.contains("player-container") ? 32 : 22);
    context.clip();
    context.globalAlpha = opacity;
    gel(trailX, trailY, 105, 68, "rgba(122, 62, 57, 0.3)", "rgba(155, 74, 59, 0.16)");
    gel(x, y, 75, 52, "rgba(190, 106, 76, 0.38)", "rgba(168, 83, 64, 0.22)");
    bead();
    for (const rect of cutouts) context.clearRect(rect.x, rect.y, rect.width, rect.height);
    context.restore();
  }

  function animate() {
    velocityX = (velocityX + (targetX - x) * 0.1) * 0.76;
    velocityY = (velocityY + (targetY - y) * 0.1) * 0.76;
    if (Math.hypot(velocityX, velocityY) > 0.15) beadAngle = Math.atan2(velocityY, velocityX);
    x += velocityX;
    y += velocityY;
    trailX += (x - trailX) * 0.075;
    trailY += (y - trailY) * 0.075;
    opacity += ((active ? 1 : 0) - opacity) * (active ? 0.15 : 0.075);
    draw();

    if (active || opacity > 0.008 || Math.abs(velocityX) + Math.abs(velocityY) > 0.05) {
      animationFrame = requestAnimationFrame(animate);
    } else {
      animationFrame = 0;
      context.clearRect(0, 0, width, height);
    }
  }

  function startAnimation() {
    if (!animationFrame) animationFrame = requestAnimationFrame(animate);
  }

  function touchChassis(event) {
    if (!motionAllowed.matches || event.pointerType === "touch") return;
    if (surface.classList.contains("player-container") && event.target.closest?.(".player-frame")) {
      active = false;
      startAnimation();
      return;
    }
    const bounds = surface.getBoundingClientRect();
    targetX = event.clientX - bounds.left;
    targetY = event.clientY - bounds.top;
    if (!active) {
      updateCutouts();
      x = trailX = targetX;
      y = trailY = targetY;
      velocityX = velocityY = 0;
    }
    active = true;
    startAnimation();
  }

  surface.addEventListener("pointerenter", touchChassis);
  surface.addEventListener("pointermove", touchChassis);
  surface.addEventListener("pointerleave", () => {
    active = false;
    startAnimation();
  });
  motionAllowed.addEventListener?.("change", () => {
    active = false;
    if (!motionAllowed.matches) opacity = 0;
    startAnimation();
  });
  if (window.ResizeObserver) new ResizeObserver(resize).observe(surface);
  else window.addEventListener("resize", resize);
  resize();
  }
});
