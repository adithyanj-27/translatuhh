package com.translatuhh.app;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.media.projection.MediaProjectionManager;
import android.os.IBinder;
import android.util.Log;
import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "SystemAudioCapture",
    permissions = {
        @Permission(
            strings = { Manifest.permission.RECORD_AUDIO },
            alias = "audio"
        )
    }
)
public class SystemAudioCapturePlugin extends Plugin {
    private static final String TAG = "SystemAudioCapturePlg";
    
    private AudioCaptureService audioService;
    private boolean isBound = false;
    private PluginCall savedCall;
    
    private final ServiceConnection serviceConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            AudioCaptureService.LocalBinder binder = (AudioCaptureService.LocalBinder) service;
            audioService = binder.getService();
            isBound = true;
            
            audioService.setListener(new AudioCaptureService.AudioCaptureListener() {
                @Override
                public void onAudioChunkCaptured(String base64Data) {
                    JSObject ret = new JSObject();
                    ret.put("chunk", base64Data);
                    notifyListeners("onAudioChunk", ret);
                }

                @Override
                public void onError(String errorMsg) {
                    JSObject ret = new JSObject();
                    ret.put("message", errorMsg);
                    notifyListeners("onError", ret);
                }
            });
            Log.d(TAG, "AudioCaptureService connected");
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            audioService = null;
            isBound = false;
            Log.d(TAG, "AudioCaptureService disconnected");
        }
    };

    @Override
    public void load() {
        super.load();
        // Bind to background capture service immediately on load
        Intent intent = new Intent(getContext(), AudioCaptureService.class);
        getContext().bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE);
    }

    @PluginMethod
    public void startCapture(PluginCall call) {
        if (getPermissionState("audio") != com.getcapacitor.PermissionState.GRANTED) {
            savedCall = call;
            requestPermissionForAlias("audio", call, "audioPermissionCallback");
            return;
        }
        
        launchMediaProjectionRequest(call);
    }
    
    @PermissionCallback
    private void audioPermissionCallback(PluginCall call) {
        if (getPermissionState("audio") == com.getcapacitor.PermissionState.GRANTED) {
            launchMediaProjectionRequest(call);
        } else {
            call.reject("Audio recording permission was denied by the user.");
        }
    }
    
    private void launchMediaProjectionRequest(PluginCall call) {
        MediaProjectionManager projectionManager = (MediaProjectionManager) getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (projectionManager == null) {
            call.reject("MediaProjection service not available on this device.");
            return;
        }
        
        Intent projectionIntent = projectionManager.createScreenCaptureIntent();
        startActivityForResult(call, projectionIntent, "mediaProjectionCallback");
    }
    
    @ActivityCallback
    private void mediaProjectionCallback(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == android.app.Activity.RESULT_OK && result.getData() != null) {
            if (isBound && audioService != null) {
                MediaProjectionManager projectionManager = (MediaProjectionManager) getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
                audioService.startCapture(result.getResultCode(), result.getData(), projectionManager);
                call.resolve();
            } else {
                call.reject("Audio capture service is not bound yet.");
            }
        } else {
            call.reject("Screen capture permission was denied by the user.");
        }
    }
    
    @PluginMethod
    public void stopCapture(PluginCall call) {
        if (isBound && audioService != null) {
            audioService.stopCapture();
            call.resolve();
        } else {
            call.reject("Audio capture service not running.");
        }
    }
    
    @Override
    protected void handleOnDestroy() {
        if (isBound) {
            getContext().unbindService(serviceConnection);
            isBound = false;
        }
        super.handleOnDestroy();
    }
}
