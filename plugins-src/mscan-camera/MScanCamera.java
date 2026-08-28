package com.mintsog.mscan;
import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.SurfaceTexture;
import android.hardware.camera2.*;
import android.os.*;
import android.util.Size;
import android.view.*;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import org.apache.cordova.*;
import org.json.*;
import java.util.Collections;

public class MScanCamera extends CordovaPlugin {
  private static final int REQ=9101;
  private TextureView tv;
  private CameraDevice cam;
  private CameraCaptureSession session;
  private CaptureRequest.Builder builder;
  private HandlerThread thread;
  private Handler handler;
  private CallbackContext pending;

  public boolean execute(String action, JSONArray args, CallbackContext cb) throws JSONException{
    if("start".equals(action)){ start(cb); return true; }
    if("stop".equals(action)){ stop(cb); return true; }
    return false;
  }

  private void start(CallbackContext cb){
    if(!cordova.hasPermission(Manifest.permission.CAMERA)){
      pending=cb; cordova.requestPermission(this,REQ,Manifest.permission.CAMERA); return;
    }
    createView(cb);
  }

  public void onRequestPermissionResult(int requestCode,String[] permissions,int[] results) throws JSONException{
    if(requestCode!=REQ) return;
    CallbackContext cb=pending; pending=null; if(cb==null) return;
    if(results.length>0 && results[0]==PackageManager.PERMISSION_GRANTED) createView(cb);
    else cb.error("Camera permission denied");
  }

  private void createView(CallbackContext cb){
    cordova.getActivity().runOnUiThread(()->{
      try{
        View web=webView.getView();
        ViewGroup parent=(ViewGroup)web.getParent();
        parent.setBackgroundColor(Color.TRANSPARENT);
        web.setBackgroundColor(Color.TRANSPARENT);

        if(tv!=null){ cb.success("CAM OK"); return; }
        tv=new TextureView(cordova.getActivity());
        ViewGroup.LayoutParams lp=new ViewGroup.LayoutParams(-1,-1);
        int idx=Math.max(0,parent.indexOfChild(web));
        parent.addView(tv,idx,lp);
        web.bringToFront();

        startThread();

        tv.setSurfaceTextureListener(new TextureView.SurfaceTextureListener(){
          public void onSurfaceTextureAvailable(@NonNull SurfaceTexture s,int w,int h){ openCamera(cb); }
          public void onSurfaceTextureSizeChanged(@NonNull SurfaceTexture s,int w,int h){}
          public boolean onSurfaceTextureDestroyed(@NonNull SurfaceTexture s){ closeCamera(); return true; }
          public void onSurfaceTextureUpdated(@NonNull SurfaceTexture s){}
        });

        if(tv.isAvailable()) openCamera(cb);
      }catch(Exception e){ cb.error("TextureView setup failed: "+e.getMessage()); }
    });
  }

  private void openCamera(CallbackContext cb){
    try{
      CameraManager m=(CameraManager)cordova.getActivity().getSystemService(Context.CAMERA_SERVICE);
      String id=null;
      for(String x:m.getCameraIdList()){
        Integer facing=m.getCameraCharacteristics(x).get(CameraCharacteristics.LENS_FACING);
        if(facing!=null && facing==CameraCharacteristics.LENS_FACING_BACK){ id=x; break; }
      }
      if(id==null){ cb.error("No rear camera found"); return; }
      if(ActivityCompat.checkSelfPermission(cordova.getActivity(),Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){
        cb.error("Camera permission missing"); return;
      }
      m.openCamera(id,new CameraDevice.StateCallback(){
        public void onOpened(@NonNull CameraDevice c){ cam=c; createSession(cb); }
        public void onDisconnected(@NonNull CameraDevice c){ c.close(); cam=null; cb.error("Camera disconnected"); }
        public void onError(@NonNull CameraDevice c,int error){ c.close(); cam=null; cb.error("Camera2 error: "+error); }
      },handler);
    }catch(Exception e){ cb.error("Open camera failed: "+e.getMessage()); }
  }

  private void createSession(CallbackContext cb){
    try{
      SurfaceTexture st=tv.getSurfaceTexture();
      if(st==null){ cb.error("SurfaceTexture unavailable"); return; }
      st.setDefaultBufferSize(1280,720);
      Surface surface=new Surface(st);
      builder=cam.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
      builder.addTarget(surface);
      builder.set(CaptureRequest.CONTROL_AF_MODE,CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
      cam.createCaptureSession(Collections.singletonList(surface),new CameraCaptureSession.StateCallback(){
        public void onConfigured(@NonNull CameraCaptureSession s){
          session=s;
          try{ session.setRepeatingRequest(builder.build(),null,handler); cb.success("CAM OK"); }
          catch(Exception e){ cb.error("Preview failed: "+e.getMessage()); }
        }
        public void onConfigureFailed(@NonNull CameraCaptureSession s){ cb.error("Preview configuration failed"); }
      },handler);
    }catch(Exception e){ cb.error("Preview setup failed: "+e.getMessage()); }
  }

  private void startThread(){ if(thread!=null)return; thread=new HandlerThread("MScanCamera2"); thread.start(); handler=new Handler(thread.getLooper()); }
  private void closeCamera(){ try{ if(session!=null)session.close(); }catch(Exception ignored){} session=null; try{ if(cam!=null)cam.close(); }catch(Exception ignored){} cam=null; }
  private void stopThread(){ if(thread!=null){ thread.quitSafely(); thread=null; handler=null; } }

  private void stop(CallbackContext cb){
    cordova.getActivity().runOnUiThread(()->{
      closeCamera();
      if(tv!=null){ try{ ViewGroup p=(ViewGroup)tv.getParent(); if(p!=null)p.removeView(tv); }catch(Exception ignored){} tv=null; }
      stopThread(); cb.success();
    });
  }

  public void onDestroy(){ closeCamera(); stopThread(); super.onDestroy(); }
}