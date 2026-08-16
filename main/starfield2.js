// =============================================================================
// STARFIELD — только звёзды
// =============================================================================
class Starfield {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.stars = [];
    this.width = 0;
    this.height = 0;
    this.animationId = null;
    this.init();
    this.animate();
  }

  init() {
    this.resize();
    this.createStars();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
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
      radius: (0.2 + Math.random() * 0.6) * 1.3,
      baseOpacity: 0.15 + Math.random() * 0.35,
      opacity: 0.15 + Math.random() * 0.35,
      twinkleSpeed: (0.002 + Math.random() * 0.005) / 2.5,
      twinklePhase: Math.random() * Math.PI * 2,
      color: baseColor,
      glowColor: glowColor,
    };
  }

  drawStars() {
    for (const star of this.stars) {
      star.opacity = star.baseOpacity * (0.4 + 0.6 * Math.sin(Date.now() * star.twinkleSpeed + star.twinklePhase));
      const opCapped = Math.min(star.opacity, 1);
      const rCapped = Math.min(star.radius, 8);
      if (rCapped > 1 && opCapped > 0.5) {
        const glowGradient = this.ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, rCapped * 4);
        glowGradient.addColorStop(0, star.glowColor.replace(/[\d.]+\)$/, opCapped * 0.3 + ')' ));
        glowGradient.addColorStop(1, 'rgba(0,0,0,0)');
        this.ctx.beginPath();
        this.ctx.arc(star.x, star.y, rCapped * 4, 0, Math.PI * 2);
        this.ctx.fillStyle = glowGradient;
        this.ctx.fill();
      }
      this.ctx.beginPath();
      this.ctx.arc(star.x, star.y, rCapped, 0, Math.PI * 2);
      this.ctx.fillStyle = star.color.replace(/[\d.]+\)$/, opCapped + ')' );
      this.ctx.fill();
    }
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.fillStyle = '#050014';
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.drawStars();
  }
}

const starfieldCanvas = document.getElementById('starfield2');
if (starfieldCanvas) {
  new Starfield(starfieldCanvas);
}