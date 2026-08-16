// =============================================================================
// STARFIELD — анимированное звёздное небо на Canvas
// =============================================================================
class Starfield {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.stars = [];
    this.meteors = [];
    this.slowClusters = [];
    this.lastSlowClusterTime = 0;
    this.mouseX = 0;
    this.mouseY = 0;
    this.width = 0;
    this.height = 0;
    this.animationId = null;
    this.lastMeteorTime = 0;
    this.meteorInterval = 30000 + Math.random() * 5000;
    this.fallingStarInterval = 45000 + Math.random() * 10000;
    this.fallingStarLast = 0;
    this.fallingStars = [];
    this.cometInterval = 60000 + Math.random() * 15000;
    this.cometLast = 0;
    this.comets = [];
    
    this.flareLast = 0;
    this.flares = [];
    this.nebulaAngle = 0;
    this.scrollDimming = 0;
    this.init();
    this.bindEvents();
    this.animate();
  }

  init() {
    this.resize();
    this.createStars();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('scroll', () => { this.scrollDimming = Math.min(1, window.scrollY / 400); });
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const oldW = this.width || 1;
    const oldH = this.height || 1;
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    const scaleX = this.width / oldW;
    const scaleY = this.height / oldH;
    for (const m of this.meteors) { m.x *= scaleX; m.y *= scaleY; }
    for (const c of this.comets) { c.x *= scaleX; c.y *= scaleY; for (const p of c.trail) { p.x *= scaleX; p.y *= scaleY; } }
    for (const s of this.fallingStars) { s.x *= scaleX; s.y *= scaleY; for (const p of s.trail) { p.x *= scaleX; p.y *= scaleY; } }
    for (const f of this.flares) { f.x *= scaleX; f.y *= scaleY; }
    for (const c of this.slowClusters) { c.vx *= scaleX; c.vy *= scaleY; for (const p of c.particles) { p.x *= scaleX; p.y *= scaleY; } }
    const needed = Math.min(350, Math.floor((this.width * this.height) / 2000));
    this.createStars();
  }

  createStars() {
    const starCount = Math.min(350, Math.floor((this.width * this.height) / 2000));
    this.stars = [];
    for (let i = 0; i < starCount; i++) {
      this.stars.push(this.createStar());
    }
  }

  createStar() {
    const colorRand = Math.random();
    let baseColor, glowColor;
    if (colorRand < 0.55) {
      baseColor = 'rgba(255, 255, 255, ' + (0.3 + Math.random() * 0.7) + ')';  
      glowColor = 'rgba(180, 220, 255, ' + (0.2 + Math.random() * 0.3) + ')';  
    } else if (colorRand < 0.85) {
      baseColor = 'rgba(255, 220, 240, ' + (0.3 + Math.random() * 0.7) + ')';  
      glowColor = 'rgba(232, 121, 249, ' + (0.15 + Math.random() * 0.25) + ')';  
    } else {
      baseColor = 'rgba(192, 132, 255, ' + (0.5 + Math.random() * 0.5) + ')';  
      glowColor = 'rgba(168, 85, 247, ' + (0.2 + Math.random() * 0.3) + ')';  
    }

    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      radius: 0.6 + Math.random() * 2.2,
      baseOpacity: 0.2 + Math.random() * 0.8,
      opacity: 0.2 + Math.random() * 0.8,
      twinkleSpeed: 0.0005 + Math.random() * 0.003,
      twinklePhase: Math.random() * Math.PI * 2,
      color: baseColor,
      glowColor: glowColor,
      parallaxDepth: 0.3 + Math.random() * 0.7,
    };
  }

  bindEvents() {
    document.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      this.mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      } else if (!this.animationId) {
        this.animate();
      }
    });
  }

  spawnSlowCluster() {
    const now = Date.now();
    if (now - this.lastSlowClusterTime < 15000) return;
    const off = Math.max(this.width, this.height) * 1.2;
    const x = -off * 0.2 + Math.random() * (this.width + off * 0.4);
    const y = -off * 0.2 + Math.random() * (this.height + off * 0.4);
    const count = 8 + Math.floor(Math.random() * 10);
    const cluster = {
      particles: [],
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 0.8,
    };
    for (let i = 0; i < count; i++) {
      cluster.particles.push({
        x: x + (Math.random() - 0.5) * 60,
        y: y + (Math.random() - 0.5) * 60,
        r: 0.3 + Math.random() * 0.8,
        alpha: 0.3 + Math.random() * 0.5,
      });
    }
    this.slowClusters.push(cluster);
    this.lastSlowClusterTime = now;
  }

  updateSlowClusters() {
    const off = Math.max(this.width, this.height) * 1.2;
    for (let i = this.slowClusters.length - 1; i >= 0; i--) {
      const c = this.slowClusters[i];
      c.particles.forEach(p => {
        p.x += c.vx;
        p.y += c.vy;
      });
      const avgX = c.particles.reduce((s, p) => s + p.x, 0) / c.particles.length;
      const avgY = c.particles.reduce((s, p) => s + p.y, 0) / c.particles.length;
      if (avgX > this.width + off || avgY > this.height + off || avgX < -off || avgY < -off) {
        this.slowClusters.splice(i, 1);
      }
    }
  }

  drawSlowClusters() {
    for (const c of this.slowClusters) {
      for (const p of c.particles) {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(200,220,255,${p.alpha})`;
        this.ctx.fill();
      }
    }
  }

  spawnMeteor() {
    const now = Date.now();
    if (now - this.lastMeteorTime < this.meteorInterval) return;

    const fromTop = Math.random() < 0.7;
    let x, y, vx, vy;
    const off = Math.max(this.width, this.height) * 1.2;

    if (fromTop) {
      x = Math.random() * this.width;
      y = -off * 0.3;
      vx = (Math.random() - 0.5) * 2.7;
      vy = 8 + Math.random() * 6.7;
    } else {
      x = -off * 0.3;
      y = Math.random() * this.height;
      vx = 6.7 + Math.random() * 5.3;
      vy = (Math.random() - 0.5) * 4;
    }

    const length = 80 + Math.random() * 120;
    const width = 1.5 + Math.random() * 1.5;
    const colorRand = Math.random();
    let color, glowColor;
    if (colorRand < 0.5) {
      color = 'rgba(255, 255, 255, 0.95)';
      glowColor = 'rgba(180, 220, 255, 0.6)';
    } else {
      color = 'rgba(255, 220, 240, 0.95)';
      glowColor = 'rgba(232, 121, 249, 0.7)';
    }

    this.meteors.push({
      x, y, vx, vy, length, width, color, glowColor,
      life: 1, decay: 0.002 + Math.random() * 0.004,
      trail: []
    });

    this.lastMeteorTime = now;
    this.meteorInterval = 30000 + Math.random() * 5000;
  }

  updateMeteors() {
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.trail.unshift({ x: m.x, y: m.y });
      if (m.trail.length > 30) m.trail.pop();
      m.x += m.vx;
      m.y += m.vy;
      m.life -= m.decay;
      const off = Math.max(this.width, this.height) * 1.2;
      if (m.x > this.width + off || m.y > this.height + off || m.x < -off || m.y < -off) {
        this.meteors.splice(i, 1);
      }
    }
  }

  drawMeteors() {
    for (const m of this.meteors) {
      const gradient = this.ctx.createLinearGradient(
        m.x, m.y,
        m.x - m.vx * m.length / 8, m.y - m.vy * m.length / 8
      );
      gradient.addColorStop(0, m.color);
      gradient.addColorStop(0.3, m.glowColor);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      this.ctx.beginPath();
      this.ctx.moveTo(m.x, m.y);
      this.ctx.lineTo(m.x - m.vx * m.length / 8, m.y - m.vy * m.length / 8);
      this.ctx.strokeStyle = gradient;
      this.ctx.lineWidth = m.width;
      this.ctx.lineCap = 'round';
      this.ctx.stroke();
      for (let j = 0; j < m.trail.length; j++) {
        const p = m.trail[j];
        const alpha = (1 - j / m.trail.length) * m.life * 0.5;
        const size = m.width * (1 - j / m.trail.length) * 0.7;
        this.ctx.fillStyle = m.color.replace('0.95', alpha.toFixed(2));
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        this.ctx.fill();
      }
      const headGradient = this.ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.width * 6);
      headGradient.addColorStop(0, m.color);
      headGradient.addColorStop(0.5, m.glowColor);
      headGradient.addColorStop(1, 'rgba(0,0,0,0)');
      this.ctx.beginPath();
      this.ctx.arc(m.x, m.y, m.width * 6, 0, Math.PI * 2);
      this.ctx.fillStyle = headGradient;
      this.ctx.fill();
    }
  }

  drawStars() {
    const parallaxX = this.mouseX * 15; const parallaxY = this.mouseY * 15; const mx = (this.mouseX + 1) / 2 * this.width; const my = (this.mouseY + 1) / 2 * this.height;
    for (const star of this.stars) {
      star.opacity = star.baseOpacity * (0.4 + 0.6 * Math.sin(Date.now() * star.twinkleSpeed + star.twinklePhase));
      const px = star.x + parallaxX * star.parallaxDepth; const py = star.y + parallaxY * star.parallaxDepth; const wrappedX = ((px % this.width) + this.width) % this.width; const wrappedY = ((py % this.height) + this.height) % this.height;
      let r = star.radius; let opacity = Math.max(0, Math.min(1, star.opacity * (1 - this.scrollDimming * 0.6))); const dist = Math.hypot(wrappedX - mx, wrappedY - my);
      if (dist < 120) { const factor = 1 + (1 - dist / 120) * 2; r *= factor; opacity *= factor; }
      const rCapped = Math.min(r, 8); const opCapped = Math.min(opacity, 1);
      if (rCapped > 1 && opCapped > 0.5) { const glowGradient = this.ctx.createRadialGradient(wrappedX, wrappedY, 0, wrappedX, wrappedY, rCapped * 4); glowGradient.addColorStop(0, star.glowColor.replace(/[\d.]+\)$/, opCapped * 0.3 + ')' )); glowGradient.addColorStop(1, 'rgba(0,0,0,0)'); this.ctx.beginPath(); this.ctx.arc(wrappedX, wrappedY, rCapped * 4, 0, Math.PI * 2); this.ctx.fillStyle = glowGradient; this.ctx.fill(); }
      this.ctx.beginPath(); this.ctx.arc(wrappedX, wrappedY, rCapped, 0, Math.PI * 2); this.ctx.fillStyle = star.color.replace(/[\d.]+\)$/, opCapped + ')' ); this.ctx.fill();
    }
  }
  spawnFallingStar() {
    const now = Date.now();
    if (now - this.fallingStarLast < this.fallingStarInterval) return;
    const off = Math.max(this.width, this.height) * 1.5;
    this.fallingStars.push({ x: -off + Math.random() * (this.width + off * 2), y: -off + Math.random() * (this.height + off * 2), vx: 6 + Math.random() * 4, vy: 6 + Math.random() * 4, life: 1, length: 60 + Math.random() * 60, width: 2, color: 'rgba(255,255,255,0.95)', glowColor: 'rgba(200,240,255,0.5)', trail: [] });
    this.fallingStarLast = now;
  }
  updateFallingStars() {
    const off = Math.max(this.width, this.height) * 1.5;
    for (let i = this.fallingStars.length - 1; i >= 0; i--) {
      const s = this.fallingStars[i]; s.x += s.vx; s.y += s.vy; s.trail.push({x: s.x, y: s.y}); if (s.trail.length > s.length / 6) s.trail.shift(); if (s.x > this.width + off || s.y > this.height + off || s.x < -off || s.y < -off) this.fallingStars.splice(i, 1);
    }
  }
  drawGalaxy() {
    const time = Date.now() * 0.0003;
    const startX = -this.width + ((time * 20) % (this.width * 2));
    const startY = -this.height + ((time * 12) % (this.height * 2));
    for (let i = 0; i < 15; i++) {
      const t = i / 15;
      const x = startX + t * this.width * 1.2;
      const y = startY + t * this.height * 1.2;
      const alpha = 0.02 + 0.04 * Math.sin(t * 5 + time);
      const size = 0.5 + 0.8 * Math.sin(t * 3);
      this.ctx.beginPath();
      this.ctx.arc(x, y, size, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(240,240,255,${alpha})`;
      this.ctx.fill();
    }
  }
  drawFallingStars() {
    for (const s of this.fallingStars) {
      const gradient = this.ctx.createLinearGradient(s.x, s.y, s.x - s.vx * s.length / 8, s.y - s.vy * s.length / 8);
      gradient.addColorStop(0, 'rgba(255,255,255,0.9)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
      this.ctx.beginPath(); this.ctx.moveTo(s.x, s.y); this.ctx.lineTo(s.x - s.vx * s.length / 10, s.y - s.vy * s.length / 10); this.ctx.strokeStyle = gradient; this.ctx.lineWidth = s.width; this.ctx.lineCap = 'round'; this.ctx.stroke();
      for (const p of s.trail) { this.ctx.beginPath(); this.ctx.arc(p.x, p.y, s.width * 0.5, 0, Math.PI * 2); this.ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.4})`; this.ctx.fill(); }
    }
  }


  spawnComet() { const now = Date.now(); if (now - this.cometLast < this.cometInterval) return; const off = Math.max(this.width, this.height) * 1.5; this.comets.push({ x: -off, y: Math.random() * this.height, vx: 2 + Math.random() * 2, vy: (Math.random() - 0.5) * 1, life: 1, length: 150, color: 'rgba(255,220,180,0.9)', glowColor: 'rgba(255,200,150,0.4)', trail: [] }); this.cometLast = now; }
  updateComets() { const off = Math.max(this.width, this.height) * 1.5; for (let i = this.comets.length - 1; i >= 0; i--) { const c = this.comets[i]; c.x += c.vx; c.y += c.vy; c.trail.push({x: c.x, y: c.y}); if (c.trail.length > c.length / 4) c.trail.shift(); if (c.x > this.width + off || c.x < -off) this.comets.splice(i, 1); } }
  drawComets() { for (const c of this.comets) { const gradient = this.ctx.createLinearGradient(c.x, c.y, c.x - c.vx * c.length / 8, c.y - c.vy * c.length / 8); gradient.addColorStop(0, c.color); gradient.addColorStop(1, 'rgba(0,0,0,0)'); this.ctx.beginPath(); this.ctx.moveTo(c.x, c.y); this.ctx.lineTo(c.x - c.vx * c.length / 6, c.y - c.vy * c.length / 6); this.ctx.strokeStyle = gradient; this.ctx.lineWidth = 4; this.ctx.lineCap = 'round'; this.ctx.stroke(); } }
  spawnFlare() { const now = Date.now(); if (now - this.flareLast < this.flareInterval) return; this.flares.push({ x: Math.random() * this.width, y: Math.random() * this.height, life: 1, maxLife: 0.8 + Math.random() * 1.5, radius: 30 + Math.random() * 80 }); this.flareLast = now; }
  updateFlares() { for (let i = this.flares.length - 1; i >= 0; i--) { const f = this.flares[i]; f.life -= 0.03; if (f.life <= 0) this.flares.splice(i, 1); } }
  drawFlares() { for (const f of this.flares) { const alpha = Math.max(0, f.life / f.maxLife); const grad = this.ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius); grad.addColorStop(0, `rgba(255,255,255,${alpha * 0.4})`); grad.addColorStop(0.5, `rgba(220,240,255,${alpha * 0.15})`); grad.addColorStop(1, 'rgba(0,0,0,0)'); this.ctx.beginPath(); this.ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2); this.ctx.fillStyle = grad; this.ctx.fill(); } }
  drawNebula() { this.nebulaAngle += 0.005; const cx = this.width / 2 + Math.sin(this.nebulaAngle) * 20; const cy = this.height / 2 + Math.cos(this.nebulaAngle * 0.7) * 15; const radius = Math.max(this.width, this.height) * 0.6; const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.001); const grad = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, radius); grad.addColorStop(0, `rgba(40,30,80,${0.08 + pulse * 0.05})`); grad.addColorStop(0.5, `rgba(30,20,60,${0.04})`); grad.addColorStop(1, 'rgba(0,0,0,0)'); this.ctx.beginPath(); this.ctx.arc(cx, cy, radius, 0, Math.PI * 2); this.ctx.fillStyle = grad; this.ctx.fill(); }
  drawConstellations() { if (this.stars.length < 2) return; for (let i = 0; i < 3; i++) { const a = this.stars[Math.floor(Math.random() * this.stars.length)]; const b = this.stars[Math.floor(Math.random() * this.stars.length)]; const dx = (b.x - a.x) * 0.5; const dy = (b.y - a.y) * 0.5; const midX = a.x + dx; const midY = a.y + dy; this.ctx.beginPath(); this.ctx.moveTo(a.x, a.y); this.ctx.quadraticCurveTo(midX, midY, b.x, b.y); this.ctx.strokeStyle = `rgba(255,255,255,${0.03 + 0.02 * Math.sin(Date.now() * 0.002 + i)})`; this.ctx.lineWidth = 0.5; this.ctx.stroke(); } }

  drawFog() {
    const phase = Date.now() * 0.0002;
    const cx = this.width / 2 + Math.sin(phase) * 50; const cy = this.height / 2 + Math.cos(phase * 0.7) * 30;
    const grad = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(this.width, this.height) * 0.7);
    grad.addColorStop(0, `rgba(60,30,80,${0.04 + 0.03 * Math.sin(phase)})`);
    grad.addColorStop(0.5, `rgba(30,20,60,${0.02})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    this.ctx.beginPath(); this.ctx.arc(cx, cy, Math.max(this.width, this.height) * 0.7, 0, Math.PI * 2); this.ctx.fillStyle = grad; this.ctx.fill();
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    this.ctx.clearRect(0, 0, this.width, this.height);
    // subtle space gradient background
    const bgGrad = this.ctx.createRadialGradient(this.width/2, this.height/2, 0, this.width/2, this.height/2, Math.max(this.width, this.height) * 0.8);
    bgGrad.addColorStop(0, '#0b0d17');
    bgGrad.addColorStop(0.5, '#050714');
    bgGrad.addColorStop(1, '#02020a');
    this.ctx.fillStyle = bgGrad;
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.drawNebula();
    this.drawGalaxy();
    this.drawFog();
    this.drawConstellations();
    this.drawStars();
    this.spawnMeteor(); this.spawnFallingStar(); this.spawnSlowCluster(); this.spawnComet();
    this.updateMeteors(); this.updateSlowClusters(); this.updateFallingStars(); this.updateComets();
    this.drawMeteors(); this.drawSlowClusters(); this.drawFallingStars(); this.drawComets();
  }
}

// Инициализация звездного неба
const starfieldCanvas = document.getElementById('starfield');
if (starfieldCanvas) {
  new Starfield(starfieldCanvas);
}
