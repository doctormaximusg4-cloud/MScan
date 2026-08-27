package com.mintsog.mscan;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class MScanMagnetometer extends CordovaPlugin implements SensorEventListener {

    private SensorManager sensorManager;
    private Sensor magneticSensor;
    private CallbackContext streamCallback;
    private boolean running = false;

    @Override
    protected void pluginInitialize() {
        Context context = cordova.getActivity().getApplicationContext();
        sensorManager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager != null) {
            magneticSensor = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
        }
    }

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callbackContext) throws JSONException {
        if ("start".equals(action)) {
            start(args.optJSONObject(0), callbackContext);
            return true;
        }
        if ("stop".equals(action)) {
            stop(callbackContext);
            return true;
        }
        return false;
    }

    private void start(JSONObject options, CallbackContext callbackContext) {
        if (sensorManager == null || magneticSensor == null) {
            callbackContext.error("This device has no magnetometer.");
            return;
        }

        if (running) {
            stopInternal();
        }

        int frequencyHz = 50;
        if (options != null) {
            frequencyHz = options.optInt("frequency", 50);
        }
        if (frequencyHz < 1) frequencyHz = 1;
        if (frequencyHz > 100) frequencyHz = 100;

        int samplingPeriodUs = 1000000 / frequencyHz;
        streamCallback = callbackContext;
        running = sensorManager.registerListener(
            this,
            magneticSensor,
            samplingPeriodUs,
            SensorManager.SENSOR_DELAY_GAME
        );

        if (!running) {
            callbackContext.error("Unable to register magnetometer listener.");
            streamCallback = null;
            return;
        }

        PluginResult pending = new PluginResult(PluginResult.Status.NO_RESULT);
        pending.setKeepCallback(true);
        callbackContext.sendPluginResult(pending);
    }

    private void stop(CallbackContext callbackContext) {
        stopInternal();
        callbackContext.success();
    }

    private void stopInternal() {
        if (sensorManager != null) {
            sensorManager.unregisterListener(this);
        }
        running = false;
        streamCallback = null;
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (!running || streamCallback == null || event.sensor.getType() != Sensor.TYPE_MAGNETIC_FIELD) {
            return;
        }

        float x = event.values[0];
        float y = event.values[1];
        float z = event.values[2];
        double magnitude = Math.sqrt(x*x + y*y + z*z);

        try {
            JSONObject data = new JSONObject();
            data.put("x", x);
            data.put("y", y);
            data.put("z", z);
            data.put("magnitude", magnitude);
            data.put("timestamp", event.timestamp);

            PluginResult result = new PluginResult(PluginResult.Status.OK, data);
            result.setKeepCallback(true);
            streamCallback.sendPluginResult(result);
        } catch (JSONException ignored) {
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // Not required for the first prototype.
    }

    @Override
    public void onReset() {
        stopInternal();
    }

    @Override
    public void onDestroy() {
        stopInternal();
        super.onDestroy();
    }
}
