// ── Skjermflimring ved opplåsning ──
function triggerFlicker() {
    const el = document.createElement('div');
    el.id = 'flicker-overlay';
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
}

// ── Støvpartikler ──
(function() {
    const canvas = document.getElementById('dust-canvas');
    const ctx = canvas.getContext('2d');
    let W, H;

    function resize() {
        W = canvas.width  = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const particles = Array.from({ length: 38 }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 1.2 + 0.3,
        vx: (Math.random() - 0.5) * 0.18,
        vy: -Math.random() * 0.12 - 0.04,
        o: Math.random() * 0.18 + 0.04,
        drift: Math.random() * Math.PI * 2
    }));

    function draw() {
        ctx.clearRect(0, 0, W, H);
        const t = Date.now() / 3000;
        particles.forEach(p => {
            p.x  += p.vx + Math.sin(t + p.drift) * 0.12;
            p.y  += p.vy;
            if (p.y < -4) { p.y = H + 4; p.x = Math.random() * W; }
            if (p.x < -4) p.x = W + 4;
            if (p.x > W + 4) p.x = -4;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200, 160, 80, ${p.o})`;
            ctx.fill();
        });
        requestAnimationFrame(draw);
    }
    draw();
})();
