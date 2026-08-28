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

let anomalyState = 'NORMAL';
let anomalyCounter = 0;
let normalCounter = 0;

const POSSIBLE_THRESHOLD = 3.0;
const ANOMALY_THRESHOLD = 8.0;

const ANOMALY_CONFIRM_COUNT = 10;
const NORMAL_CONFIRM_COUNT = 15; 
/*
  Κάτω από αυτή τη διαφορά θεωρούμε
  ότι είναι φυσιολογικός θόρυβος.
*/
const DEAD_ZONE = 0.8;

let cameraStarted = false;
let sensorStarted = false;

let lastDelta = 0;

let stableSamples = 0;
let previousSmoothB = null;

const AUTOZERO_STABLE_EPS = 0.5;
const AUTOZERO_DELAY = 40;     // περίπου 2 sec
const AUTOZERO_RATE = 0.006;   // πολύ αργή διόρθωση

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

function updateAnomalyState(delta) {

  const absDelta =
    Math.abs(delta);


  /*
     ΙΣΧΥΡΗ ΑΝΩΜΑΛΙΑ
  */

  if (
    absDelta >=
    ANOMALY_THRESHOLD
  ) {

    anomalyCounter++;

    normalCounter =
      0;


    if (
      anomalyCounter >=
      ANOMALY_CONFIRM_COUNT
    ) {

      anomalyState =
        'ANOMALY';
    }

  }


  /*
     ΠΙΘΑΝΗ ΑΝΩΜΑΛΙΑ
  */

  else if (
    absDelta >=
    POSSIBLE_THRESHOLD
  ) {

    anomalyCounter =
      0;

    normalCounter =
      0;


    if (
      anomalyState !==
      'ANOMALY'
    ) {

      anomalyState =
        'POSSIBLE';
    }

  }


  /*
     NORMAL
  */

  else {

    anomalyCounter =
      0;

    normalCounter++;


    if (
      normalCounter >=
      NORMAL_CONFIRM_COUNT
    ) {

      anomalyState =
        'NORMAL';
    }
  }


  /*
     UPDATE LARGE PANEL
  */

  const panel =
    $('anomalyPanel');

  const title =
    $('anomalyTitle');

  const description =
    $('anomalyDescription');

  const deltaDisplay =
    $('anomalyDelta');


  deltaDisplay.textContent =
    (delta >= 0 ? '+' : '') +
    delta.toFixed(1);


  /*
     NORMAL
  */

  if (
    anomalyState ===
    'NORMAL'
  ) {

    panel.className =
      'anomaly-panel normal';

    title.textContent =
      '● NORMAL';

    description.textContent =
      'No significant magnetic anomaly';

  }


  /*
     POSSIBLE
  */

  else if (
    anomalyState ===
    'POSSIBLE'
  ) {

    panel.className =
      'anomaly-panel possible';

    title.textContent =
      '● POSSIBLE ANOMALY';

    description.textContent =
      'Magnetic variation under evaluation';

  }


  /*
     CONFIRMED
  */

  else if (
    anomalyState ===
    'ANOMALY'
  ) {

    panel.className =
      'anomaly-panel anomaly';

    title.textContent =
      '⚠ ANOMALY DETECTED';

    description.textContent =
      'Strong magnetic anomaly detected';
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
     Καθαρίζουμε το προηγούμενο live blob.
     Δεν κρατάμε πλέον τεχνητό trail / zig-zag.
  */

  ctx.clearRect(
    0,
    0,
    innerWidth,
    innerHeight
  );


  /*
     Μικρές διακυμάνσεις αγνοούνται.
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


  /*
     ΝΕΟ dynamic range.

     Δεν τερματίζει πλέον στα ±10 μT.
     Χρησιμοποιούμε πιο ήπια καμπύλη
     ώστε μεγάλα σήματα να έχουν περιθώριο.
  */

  const absDelta =
    Math.abs(delta);

  const range =
    Math.max(
      40,
      sensitivity * 5
    );

  let strength =
    Math.log1p(absDelta) /
    Math.log1p(range);

  strength =
    Math.max(
      0,
      Math.min(
        1,
        strength
      )
    );


  /*
     Μέγεθος blob
  */

  const radius =
    35 +
    strength * 120;


  /*
     Λίγο πιο ήπια διαφάνεια
     για να μη "μπουκώνει" η εικόνα.
  */

  const centerAlpha =
    0.30 +
    strength * 0.40;


  const gradient =
    ctx.createRadialGradient(
      cx,
      cy,
      0,
      cx,
      cy,
      radius
    );


  gradient.addColorStop(
    0,
    magneticColor(
      delta,
      centerAlpha
    )
  );

  gradient.addColorStop(
    0.30,
    magneticColor(
      delta,
      centerAlpha * 0.70
    )
  );

  gradient.addColorStop(
    0.65,
    magneticColor(
      delta,
      centerAlpha * 0.30
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
    cx,
    cy,
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

  /*
   AUTO ZERO / BASELINE DRIFT COMPENSATION

   Αν η μέτρηση μείνει σταθερή για λίγο
   και η διαφορά δεν είναι πολύ μεγάλη,
   το baseline ακολουθεί ΠΟΛΥ αργά.
*/

if (
  baseline !== null &&
  scanning &&
  !frozen
) {

  if (previousSmoothB !== null) {

    const movement =
      Math.abs(
        smoothB - previousSmoothB
      );

    if (
      movement <
      AUTOZERO_STABLE_EPS
    ) {

      stableSamples++;

    } else {

      stableSamples = 0;
    }
  }


  /*
     Μέχρι ποια διαφορά επιτρέπεται
     να θεωρήσουμε ότι είναι drift.
  */

  const autoZeroWindow =
    Math.max(
      6,
      sensitivity * 0.70
    );


  const provisionalDelta =
    smoothB - baseline;


  /*
     Μόνο αφού μείνει σταθερό
     περίπου 2 δευτερόλεπτα.
  */

  if (
    stableSamples >= AUTOZERO_DELAY &&
    Math.abs(provisionalDelta) <
      autoZeroWindow
  ) {

    baseline +=
      provisionalDelta *
      AUTOZERO_RATE;
  }

} else {

  stableSamples = 0;
}


previousSmoothB =
  smoothB;

  let delta = 0;

  if (baseline !== null) {

    delta =
      smoothB -
      baseline;
  }

  lastDelta =
    delta;

  if (
    scanning &&
    baseline !== null
  ) {
    updateAnomalyState(delta);
  }


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

    anomalyState = 'NORMAL';
    anomalyCounter = 0;
    normalCounter = 0;
    
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
   anomalyState = 'NORMAL';
   anomalyCounter = 0;
   normalCounter = 0;

$('message').style.color = '';
    ctx.clearRect(
      0,
      0,
      innerWidth,
      innerHeight
    );

    lastDelta = 0;

    stableSamples = 0;
    previousSmoothB = smoothB;

    $('message').textContent =
      'Heatmap cleared.';
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
