package com.translatuhh.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import android.util.Base64;
import android.util.Log;
import androidx.core.app.NotificationCompat;

public class AudioCaptureService extends Service {
    private static final String TAG = "AudioCaptureService";
    private static final String CHANNEL_ID = "AudioCaptureChannel";
    private static final int NOTIFICATION_ID = 4591;

    private MediaProjection mediaProjection;
    private AudioRecord audioRecord;
    private Thread captureThread;
    private boolean isRecording = false;
    private AudioCaptureListener listener;

    public interface AudioCaptureListener {
        void onAudioChunkCaptured(String base64Data);
        void onError(String errorMsg);
    }

    public class LocalBinder extends Binder {
        AudioCaptureService getService() {
            return AudioCaptureService.this;
        }
    }

    private final IBinder binder = new LocalBinder();

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    public void setListener(AudioCaptureListener listener) {
        this.listener = listener;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_NOT_STICKY;
    }

    public void startCapture(int resultCode, Intent resultData, MediaProjectionManager manager) {
        if (isRecording) return;

        // Start Foreground Service immediately to satisfy Android background restrictions
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, createNotification(), android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIFICATION_ID, createNotification());
        }

        try {
            mediaProjection = manager.getMediaProjection(resultCode, resultData);
        } catch (Exception e) {
            Log.e(TAG, "Error getting media projection", e);
            mediaProjection = null;
        }

        if (mediaProjection == null) {
            if (listener != null) listener.onError("Failed to obtain media projection token.");
            stopSelf();
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            AudioPlaybackCaptureConfiguration config = new AudioPlaybackCaptureConfiguration.Builder(mediaProjection)
                    .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                    .addMatchingUsage(AudioAttributes.USAGE_GAME)
                    .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                    .build();

            int sampleRate = 48000;
            int channelConfig = AudioFormat.CHANNEL_IN_MONO;
            int audioFormat = AudioFormat.ENCODING_PCM_16BIT;
            int bufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat) * 2;

            try {
                audioRecord = new AudioRecord.Builder()
                        .setAudioFormat(new AudioFormat.Builder()
                                .setEncoding(audioFormat)
                                .setSampleRate(sampleRate)
                                .setChannelMask(channelConfig)
                                .build())
                        .setAudioPlaybackCaptureConfig(config)
                        .setBufferSizeInBytes(bufferSize)
                        .build();
            } catch (SecurityException e) {
                Log.e(TAG, "SecurityException: RECORD_AUDIO permission missing?", e);
                if (listener != null) listener.onError("Audio capture permission was denied.");
                stopCapture();
                return;
            } catch (Exception e) {
                Log.e(TAG, "Failed to initialize AudioRecord builder", e);
                if (listener != null) listener.onError("Initialization error: " + e.getMessage());
                stopCapture();
                return;
            }

            audioRecord.startRecording();
            isRecording = true;

            captureThread = new Thread(new Runnable() {
                @Override
                public void run() {
                    byte[] buffer = new byte[bufferSize];
                    while (isRecording) {
                        int readBytes = audioRecord.read(buffer, 0, buffer.length);
                        if (readBytes > 0) {
                            byte[] activeData = new byte[readBytes];
                            System.arraycopy(buffer, 0, activeData, 0, readBytes);
                            String base64 = Base64.encodeToString(activeData, Base64.NO_WRAP);
                            if (listener != null) {
                                listener.onAudioChunkCaptured(base64);
                            }
                        }
                    }
                }
            }, "AudioCaptureThread");
            captureThread.start();
        } else {
            if (listener != null) listener.onError("Android version is not supported for internal audio capture.");
            stopSelf();
        }
    }

    public void stopCapture() {
        isRecording = false;
        if (captureThread != null) {
            try {
                captureThread.join(1000);
            } catch (InterruptedException e) {
                Log.e(TAG, "Error stopping capture thread", e);
            }
            captureThread = null;
        }

        if (audioRecord != null) {
            try {
                if (audioRecord.getState() == AudioRecord.STATE_INITIALIZED) {
                    audioRecord.stop();
                }
            } catch (Exception e) {
                Log.e(TAG, "Error stopping audioRecord", e);
            }
            audioRecord.release();
            audioRecord = null;
        }

        if (mediaProjection != null) {
            try {
                mediaProjection.stop();
            } catch (Exception e) {
                Log.e(TAG, "Error stopping media projection", e);
            }
            mediaProjection = null;
        }

        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopCapture();
        super.onDestroy();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                    CHANNEL_ID,
                    "Audio Capture Service Channel",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(serviceChannel);
            }
        }
    }

    private Notification createNotification() {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Translatuhh is Recording")
                .setContentText("System audio is being translated in the background...")
                .setSmallIcon(android.R.drawable.presence_video_busy)
                .setPriority(NotificationCompat.PRIORITY_LOW);

        return builder.build();
    }
}
