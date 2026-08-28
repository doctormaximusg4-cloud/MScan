package com.mintsog.mscan;

import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.Camera;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.json.JSONArray;
import org.json.JSONException;

import java.io.IOException;

public class MScanCamera extends CordovaPlugin implements SurfaceHolder.Callback {
    private static final int CAMERA_PERMISSION_REQ = 9101;
    private Camera camera;
    private SurfaceView surfaceView;
    private SurfaceHolder surfaceHolder;
    private CallbackContext pendingStartCallback;

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callbackContext) throws JSONException {
        if ("start".equals(action)) { start(callbackContext); return true; }
        if ("stop".equals(action)) { stop(callbackContext); return true; }
        return false;
    }

    private void start(CallbackContext cb) {
        if (!cordova.hasPermission(Manifest.permission.CAMERA)) {
            pendingStartCallback = cb;
            cordova.requestPermission(this, CAMERA_PERMISSION_REQ, Manifest.permission.CAMERA);
            return;
        }
        startPreview(cb);
    }

    @Override
    public void onRequestPermissionResult(int requestCode, String[] permissions, int[] grantResults)
            throws JSONException {
        if (requestCode != CAMERA_PERMISSION_REQ) return;
        CallbackContext cb = pendingStartCallback;
        pendingStartCallback = null;
        if (cb == null) return;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) startPreview(cb);
        else cb.error("Camera permission denied");
    }

    private void startPreview(final CallbackContext cb) {
        cordova.getActivity().runOnUiThread(() -> {
            try {
                View web = webView.getView();
                ViewGroup parent = (ViewGroup) web.getParent();
                web.setBackgroundColor(Color.TRANSPARENT);

                if (surfaceView != null) {
                    cb.success("Camera already active");
                    return;
                }

                surfaceView = new SurfaceView(cordova.getActivity());
                surfaceHolder = surfaceView.getHolder();
                surfaceHolder.addCallback(this);

                ViewGroup.LayoutParams lp = new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                );

                parent.addView(surfaceView, 0, lp);
                cb.success("Native camera surface created");
            } catch (Exception e) {
                cb.error("Camera start failed: " + e.getMessage());
            }
        });
    }

    @Override
    public void surfaceCreated(SurfaceHolder holder) {
        try {
            camera = Camera.open(Camera.CameraInfo.CAMERA_FACING_BACK);
            if (camera == null) return;
            camera.setDisplayOrientation(90);
            try {
                Camera.Parameters p = camera.getParameters();
                if (p.getSupportedFocusModes()!=null &&
                    p.getSupportedFocusModes().contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE)) {
                    p.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);
                    camera.setParameters(p);
                }
            } catch(Exception ignored) {}
            camera.setPreviewDisplay(holder);
            camera.startPreview();
        } catch (RuntimeException | IOException e) {
            releaseCamera();
        }
    }

    @Override
    public void surfaceChanged(SurfaceHolder holder,int format,int width,int height) {
        if (camera==null) return;
        try { camera.stopPreview(); } catch(Exception ignored) {}
        try {
            camera.setPreviewDisplay(holder);
            camera.startPreview();
        } catch(Exception ignored) {}
    }

    @Override
    public void surfaceDestroyed(SurfaceHolder holder) { releaseCamera(); }

    private void stop(CallbackContext cb) {
        cordova.getActivity().runOnUiThread(() -> {
            releaseCamera();
            if (surfaceView!=null) {
                try {
                    ViewGroup p=(ViewGroup)surfaceView.getParent();
                    if (p!=null) p.removeView(surfaceView);
                } catch(Exception ignored) {}
            }
            surfaceView=null; surfaceHolder=null;
            cb.success();
        });
    }

    private void releaseCamera() {
        if (camera!=null) {
            try { camera.stopPreview(); } catch(Exception ignored) {}
            try { camera.release(); } catch(Exception ignored) {}
            camera=null;
        }
    }

    @Override
    public void onDestroy() {
        releaseCamera();
        super.onDestroy();
    }
}
