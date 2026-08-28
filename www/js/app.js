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

/*
  Κάτω από αυτή τη διαφορά θεωρούμε
  ότι είναι φυσιολογικός θόρυβος.
*/
const DEAD_ZONE = 0.8;

let cameraStarted = false;
let sensorStarted = false;

let lastDelta = 0;


/* =========================================================
   STATUS
========================================================= */

function updateStatus() {

  if (cameraStarted && sensorStarted) {

    $('state').textContent = 'CAM + MAG OK';

  } else if (cameraStarted) {

    $('state').textContent = 'CAM OK';

  } else if (sensorStarted) {

    $('state').textContent = 'MAG OK';

  } else {

    $('state').textContent = 'WAIT';

  }
}


/* =========================================================
   CANVAS
========================================================= */

function resize() {

  const d =
    window.devicePixelRatio || 1;

  canvas.width =
    innerWidth * d;

  canvas.height =
    innerHeight * d;

  canvas.style.width =
    innerWidth + 'px';

  canvas.style.height =
    innerHeight + 'px';

  ctx.setTransform(
    d,
    0,
    0,
    d,
    0,
    0
  );

  redraw();
}

window.addEventListener(
  'resize',
  resize
);


/* =========================================================
   COLOR SCALE

   negative ΔB  -> blue
   neutral      -> green
   positive ΔB  -> yellow/red
========================================================= */

function magneticColor(
  delta,
  alpha
) {

  let t =
    delta /
    Math.max(
      1,
      sensitivity
    );

  t = Math.max(
    -1,
    Math.min(
      1,
      t
    )
  );

  let hue;

  if (t < 0) {

    /*
       -1 = blue
        0 = green
    */

    hue =
      220 +
      (120 - 220) *
      (t + 1);

  } else {

    /*
       0 = green
       1 = red
    */

    hue =
      120 *
      (1 - t);
  }

  return `hsla(${hue},100%,50%,${alpha})`;
}


/* =========================================================
   LIVE MAGNETIC BLOB
========================================================= */

function drawLiveBlob(delta) {

  /*
     Σβήνουμε πολύ λίγο το προηγούμενο frame
     ώστε οι παλιές μετρήσεις να παραμένουν
     σαν heatmap trail.
  */

  ctx.save();

ctx.globalCompositeOperation =
  'destination-out';

ctx.fillStyle =
  'rgba(0,0,0,0.025)';

ctx.fillRect(
  0,
  0,
  innerWidth,
  innerHeight
);

ctx.restore();

  /*
     Dead-zone
  */

  if (
    Math.abs(delta) <
    DEAD_ZONE
  ) {
    return;
  }


  const cx =
    innerWidth / 2;

  const cy =
    innerHeight / 2;


  const strength =
    Math.min(
      1,
      Math.abs(delta) /
      Math.max(
        1,
        sensitivity
      )
    );


  /*
     Μικρό σήμα = μικρή κηλίδα
     Μεγάλο σήμα = μεγαλύτερη κηλίδα
  */

  const radius =
    25 +
    strength * 110;


  /*
     Ελαφριά τυχαία μετατόπιση
     γύρω από το crosshair,
     ώστε οι μετρήσεις να δημιουργούν
     πιο φυσικό heatmap.
  */

  const spread =
    10 +
    strength * 25;

  const x =
    cx +
    (Math.random() - 0.5) *
    spread;

  const y =
    cy +
    (Math.random() - 0.5) *
    spread;


  const gradient =
    ctx.createRadialGradient(

      x,
      y,
      0,

      x,
      y,
      radius
    );


  gradient.addColorStop(
    0,
    magneticColor(
      delta,
      0.80
    )
  );


  gradient.addColorStop(
    0.30,
    magneticColor(
      delta,
      0.55
    )
  );


  gradient.addColorStop(
    0.65,
    magneticColor(
      delta,
      0.22
    )
  );


  gradient.addColorStop(
    1,
    magneticColor(
      delta,
      0
    )
  );


  ctx.fillStyle =
    gradient;


  ctx.beginPath();

  ctx.arc(
    x,
    y,
    radius,
    0,
    Math.PI * 2
  );

  ctx.fill();
}


/* =========================================================
   REDRAW
========================================================= */

function redraw() {

  if (
    scanning &&
    baseline !== null
  ) {

    drawLiveBlob(
      lastDelta
    );
  }
}


/* =========================================================
   MAGNETOMETER
========================================================= */

function onMagneticReading(r) {

  const x =
    Number(r.x) || 0;

  const y =
    Number(r.y) || 0;

  const z =
    Number(r.z) || 0;

  const total =
    Number.isFinite(
      Number(r.magnitude)
    )

      ? Number(r.magnitude)

      : Math.sqrt(
          x * x +
          y * y +
          z * z
        );


  /*
     Low-pass smoothing
  */

  /*
   Προστασία από πολύ μεγάλα αντικείμενα / saturation.

   Ένα τεράστιο magnetic spike δεν επιτρέπεται
   να τραβήξει το φίλτρο εκατοντάδες μT μακριά
   από το baseline.
*/

let filterInput = total;

if (baseline !== null) {

  const maxInfluence =
    Math.max(
      20,
      sensitivity * 3
    );

  const minAllowed =
    baseline - maxInfluence;

  const maxAllowed =
    baseline + maxInfluence;

  filterInput =
    Math.max(
      minAllowed,
      Math.min(
        maxAllowed,
        total
      )
    );
}


/*
   Normal smoothing
*/

smoothB =
  smoothB === null
    ? filterInput
    : smoothing * smoothB +
      (1 - smoothing) * filterInput;


/*
   Γρήγορη επαναφορά όταν φύγουμε
   από το μεγάλο αντικείμενο.
*/

if (baseline !== null) {

  const rawDifference =
    Math.abs(
      total - baseline
    );

  if (
    rawDifference <
    Math.max(
      2,
      sensitivity * 0.35
    )
  ) {

    smoothB =
      smoothB * 0.35 +
      total * 0.65;
  }
}


  let delta = 0;

  if (baseline !== null) {

    delta =
      smoothB -
      baseline;
  }

  lastDelta =
    delta;


  /* -------------------------
     UI VALUES
  ------------------------- */

  $('x').textContent =
    x.toFixed(1);

  $('y').textContent =
    y.toFixed(1);

  $('z').textContent =
    z.toFixed(1);

  $('total').textContent =
    smoothB.toFixed(1);

  $('delta').textContent =
    (delta >= 0 ? '+' : '') +
    delta.toFixed(1);

  $('delta').style.color =
    magneticColor(
      delta,
      1
    );


  sensorStarted =
    true;

  updateStatus();


  /*
     Το overlay ανανεώνεται
     μόνο όταν γίνεται scan.
  */

  if (
    scanning &&
    !frozen &&
    baseline !== null
  ) {

    drawLiveBlob(
      delta
    );
  }
}


/* =========================================================
   START MAGNETOMETER
========================================================= */

function startMagnetometer() {

  if (
    !window.MScanMagnetometer
  ) {

    sensorStarted =
      false;

    updateStatus();

    $('message').textContent =
      'MAG ERROR: native plugin not loaded';

    return;
  }


  window.MScanMagnetometer.start(

    onMagneticReading,

    err => {

      sensorStarted =
        false;

      updateStatus();

      $('message').textContent =
        'MAG ERROR: ' +
        err;
    },

    {
      frequency: 50
    }
  );
}


/* =========================================================
   CAMERA
========================================================= */

function startCamera() {

  if (
    !window.MScanCamera
  ) {

    cameraStarted =
      false;

    updateStatus();

    $('message').textContent =
      'CAM ERROR: native plugin not loaded';

    return;
  }


  window.MScanCamera.start(

    () => {

      cameraStarted =
        true;

      updateStatus();

      $('message').textContent =
        sensorStarted

          ? 'Camera + magnetometer ready. Press CALIBRATE.'

          : 'Camera ready. Waiting for magnetometer…';
    },

    err => {

      cameraStarted =
        false;

      updateStatus();

      $('message').textContent =
        'CAM ERROR: ' +
        err;
    }
  );
}


/* =========================================================
   CALIBRATION

   Αντί για μία μόνο μέτρηση,
   παίρνουμε περίπου 1.5 sec
   από πραγματικές μετρήσεις.
========================================================= */

function calibrate() {

  if (
    smoothB === null
  ) {

    $('message').textContent =
      'Waiting for magnetometer readings…';

    return;
  }


  $('message').textContent =
    'CALIBRATING… Keep phone still.';


  const samples = [];

  const timer =
    setInterval(
      () => {

        if (
          smoothB !== null
        ) {

          samples.push(
            smoothB
          );
        }

      },
      50
    );


  setTimeout(
    () => {

      clearInterval(
        timer
      );


      if (
        samples.length === 0
      ) {

        $('message').textContent =
          'Calibration failed.';

        return;
      }


      baseline =
        samples.reduce(
          (a, b) =>
            a + b,
          0
        ) /
        samples.length;


      lastDelta =
        0;


      ctx.clearRect(
        0,
        0,
        innerWidth,
        innerHeight
      );


      $('message').textContent =
        'Baseline: ' +
        baseline.toFixed(1) +
        ' μT — Ready to scan.';

    },
    1500
  );
}


/* =========================================================
   BUTTONS
========================================================= */

$('calibrate')
.addEventListener(
  'click',
  calibrate
);


$('scan')
.addEventListener(
  'click',
  () => {

    if (
      baseline === null
    ) {

      $('message').textContent =
        'Calibrate first.';

      return;
    }


    scanning =
      !scanning;

    frozen =
      false;


    $('scan').textContent =
      scanning

        ? 'STOP SCAN'

        : 'START SCAN';


    $('freeze').textContent =
      'FREEZE';


    if (scanning) {

      $('message').textContent =
        'LIVE SCAN — move phone slowly over target.';

    } else {

      ctx.clearRect(
        0,
        0,
        innerWidth,
        innerHeight
      );

      $('message').textContent =
        'Scan stopped.';
    }
  }
);


$('freeze')
.addEventListener(
  'click',
  () => {

    frozen =
      !frozen;


    $('freeze').textContent =
      frozen

        ? 'RESUME'

        : 'FREEZE';


    $('message').textContent =
      frozen

        ? 'Magnetic overlay frozen.'

        : 'Live overlay resumed.';
  }
);


$('clear')
.addEventListener(
  'click',
  () => {

    ctx.clearRect(
      0,
      0,
      innerWidth,
      innerHeight
    );

    lastDelta =
      0;

    $('message').textContent =
      'Overlay cleared.';
  }
);


/* =========================================================
   SENSITIVITY
========================================================= */

$('sens')
.addEventListener(
  'input',
  e => {

    sensitivity =
      Number(
        e.target.value
      );

    $('sensVal').textContent =
      sensitivity +
      ' μT';

    redraw();
  }
);


/* =========================================================
   SMOOTHING
========================================================= */

$('smooth')
.addEventListener(
  'input',
  e => {

    smoothing =
      Number(
        e.target.value
      ) /
      100;

    $('smoothVal').textContent =
      e.target.value +
      '%';
  }
);


/* =========================================================
   INIT
========================================================= */

function init() {

  document.documentElement.style.background =
    'transparent';

  document.body.style.background =
    'transparent';

  resize();

  startCamera();

  startMagnetometer();
}


document.addEventListener(
  'deviceready',
  init,
  {
    once: true
  }
);


/* =========================================================
   APP PAUSE / RESUME
========================================================= */

document.addEventListener(
  'pause',
  () => {

    if (
      window.MScanMagnetometer
    ) {

      window.MScanMagnetometer.stop(
        () => {},
        () => {}
      );
    }

  },
  false
);


document.addEventListener(
  'resume',
  () => {

    startMagnetometer();

  },
  false
);

})();
