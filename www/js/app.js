(() => {
'use strict';
const $ = id => document.getElementById(id);
const canvas = $('overlay');
const ctx = canvas.getContext('2d');

let baseline = null;
let smoothB = null;
let scanning = false;
let frozen = false;
let sensitivity = 10;
let smoothing = 0.65;
let points = [];
let cameraStarted = false;
let sensorStarted = false;

function resize() {
  const d = window.devicePixelRatio || 1;
  canvas.width = innerWidth * d;
  canvas.height = innerHeight * d;
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  ctx.setTransform(d, 0, 0, d, 0, 0);
  redraw();
}
window.addEventListener('resize', resize);

function magneticColor(delta, alpha) {
  const t = Math.max(-1, Math.min(1, delta / Math.max(1, sensitivity)));
  let hue;
  if (t < 0) {
    const q = t + 1;
    hue = 225 + (180 - 225) * q;
  } else {
    hue = 120 * (1 - t);
  }
  return `hsla(${hue},100%,50%,${alpha})`;
}

function drawBlob(p) {
  const strength = Math.min(1.8, Math.abs(p.delta) / Math.max(1, sensitivity));
  const radius = 52 + strength * 55;
  const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, radius);
  g.addColorStop(0, magneticColor(p.delta, 0.72));
  g.addColorStop(0.45, magneticColor(p.delta, 0.35));
  g.addColorStop(1, magneticColor(p.delta, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function redraw() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  points.forEach(drawBlob);
}

function onMagneticReading(r) {
  const x = Number(r.x) || 0;
  const y = Number(r.y) || 0;
  const z = Number(r.z) || 0;
  const total = Number.isFinite(Number(r.magnitude))
    ? Number(r.magnitude)
    : Math.sqrt(x*x + y*y + z*z);

  smoothB = smoothB === null
    ? total
    : smoothing * smoothB + (1 - smoothing) * total;

  const delta = baseline === null ? 0 : smoothB - baseline;

  $('x').textContent = x.toFixed(1);
  $('y').textContent = y.toFixed(1);
  $('z').textContent = z.toFixed(1);
  $('total').textContent = smoothB.toFixed(1);
  $('delta').textContent = (delta >= 0 ? '+' : '') + delta.toFixed(1);
  $('delta').style.color = magneticColor(delta, 1);
  $('state').textContent = 'MAG OK';

  if (scanning && !frozen && baseline !== null) {
    // v0.1: raw magnetic response is painted at the center reticle.
    // Exact spatial contour tracking will be added after this hardware test.
    points.push({ x: innerWidth / 2, y: innerHeight / 2, delta });
    if (points.length > 220) points.shift();
    redraw();
  }
}

function startMagnetometer() {
  if (!window.MScanMagnetometer) {
    $('state').textContent = 'NO SENSOR';
    $('message').textContent = 'MScan native magnetometer plugin was not loaded.';
    return;
  }
  window.MScanMagnetometer.start(
    onMagneticReading,
    err => {
      $('state').textContent = 'MAG ERROR';
      $('message').textContent = 'Magnetometer: ' + err;
    },
    { frequency: 50 }
  );
  sensorStarted = true;
}

function startCamera() {
  if (!window.CameraPreview) {
    $('message').textContent = 'Camera Preview plugin was not loaded.';
    return;
  }
  const options = {
    x: 0, y: 0,
    width: innerWidth,
    height: innerHeight,
    camera: CameraPreview.CAMERA_DIRECTION.BACK,
    toBack: true,
    tapPhoto: false,
    tapFocus: true,
    previewDrag: false,
    storeToFile: false
  };
  CameraPreview.startCamera(
    options,
    () => {
      cameraStarted = true;
      $('message').textContent = sensorStarted
        ? 'Camera + magnetometer ready. Press CALIBRATE.'
        : 'Camera ready. Waiting for magnetometer…';
    },
    e => $('message').textContent = 'Camera error: ' + e
  );
}

function calibrate() {
  if (smoothB === null) {
    $('message').textContent = 'Waiting for real magnetometer readings…';
    return;
  }
  baseline = smoothB;
  points = [];
  redraw();
  $('message').textContent = 'Baseline set: ' + baseline.toFixed(1) + ' μT';
}

$('calibrate').addEventListener('click', calibrate);

$('scan').addEventListener('click', () => {
  if (baseline === null) {
    $('message').textContent = 'Calibrate first.';
    return;
  }
  scanning = !scanning;
  frozen = false;
  $('scan').textContent = scanning ? 'STOP SCAN' : 'START SCAN';
  $('freeze').textContent = 'FREEZE';
  $('message').textContent = scanning
    ? 'Scanning… move the phone slowly over the target.'
    : 'Scan stopped.';
});

$('freeze').addEventListener('click', () => {
  frozen = !frozen;
  $('freeze').textContent = frozen ? 'RESUME' : 'FREEZE';
  $('message').textContent = frozen ? 'Overlay frozen.' : 'Overlay resumed.';
});

$('clear').addEventListener('click', () => {
  points = [];
  redraw();
  $('message').textContent = 'Overlay cleared.';
});

$('sens').addEventListener('input', e => {
  sensitivity = Number(e.target.value);
  $('sensVal').textContent = sensitivity + ' μT';
  redraw();
});

$('smooth').addEventListener('input', e => {
  smoothing = Number(e.target.value) / 100;
  $('smoothVal').textContent = e.target.value + '%';
});

function init() {
  resize();
  startCamera();
  startMagnetometer();
}

document.addEventListener('deviceready', init, { once: true });

document.addEventListener('pause', () => {
  if (window.MScanMagnetometer) window.MScanMagnetometer.stop(() => {}, () => {});
}, false);

document.addEventListener('resume', () => {
  startMagnetometer();
}, false);
})();
