/**
 * Confete em canvas (partículas nativas). Respeita prefers-reduced-motion.
 */

const CORES = ['#00f2fe', '#4facfe', '#ff0844', '#ffb199', '#f6d365', '#ffffff', '#10b981', '#a855f7'];

let canvas = null;
let ctx = null;
let particulas = [];
let animId = null;

function ajustar() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

export function initConfetti() {
  canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  ajustar();
  window.addEventListener('resize', ajustar);
}

export function triggerConfetti() {
  if (!ctx) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  cancelAnimationFrame(animId);
  particulas = [];

  for (let i = 0; i < 90; i++) {
    particulas.push({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2 - 50,
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 0.8) * 15,
      size: Math.random() * 8 + 4,
      color: CORES[Math.floor(Math.random() * CORES.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      opacity: 1
    });
  }

  function desenhar() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let vivas = 0;

    particulas.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35;
      p.rotation += p.rotationSpeed;
      p.opacity -= 0.009;

      if (p.opacity > 0) {
        vivas++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    });

    if (vivas > 0) {
      animId = requestAnimationFrame(desenhar);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  desenhar();
}
