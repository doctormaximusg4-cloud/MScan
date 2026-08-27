# MScan — Magnetic Live Scanner

## What this first GitHub build does
- Live rear-camera preview
- Raw Android magnetometer X / Y / Z
- Total magnetic field |B| in μT
- Calibration / baseline
- ΔB anomaly value
- Sensitivity and smoothing
- Start/stop scan
- Freeze / clear overlay

## Important v0.1 limitation
This version validates the hardware path first.
The magnetic color blob is currently drawn at the center reticle.
It does NOT yet claim to know the exact 2D shape or size of an object.
Spatial camera tracking / contour mapping is the next stage after camera + sensor are confirmed.

## Build with GitHub Actions
1. Create a new GitHub repository, for example: `MScan`.
2. Upload ALL files/folders from this project, including the hidden `.github` folder.
3. Commit them to `main`.
4. Open the repository's **Actions** tab.
5. Open **Build MScan Android APK**.
6. Run the workflow, or let the push trigger it automatically.
7. When the workflow succeeds, open the run and download the artifact:
   **MScan-Android-APK**
8. Inside it is `MScan-v0.1-debug.apk`.

## Notes
- Android build target: cordova-android 15.1.0
- Android SDK: API 36 / Build Tools 36.0.0
- Java: 17
- Node: 22
- Camera: cordova-plugin-camera-preview
- Magnetometer: custom MScan native Cordova plugin included in `plugins-src/`

The custom magnetometer plugin reads Android `Sensor.TYPE_MAGNETIC_FIELD`
directly and streams X/Y/Z + magnitude to JavaScript.
