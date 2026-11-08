package com.xuelinhu.lanwebclient;

import android.content.Context;
import android.content.Intent;
import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Locale;

/** Native voice bridge consumed by frontend/src/services/voice.js. */
final class VoiceBridge {
    static final int AUDIO_PERMISSION_REQUEST = 42;
    private final MainActivity activity;
    private final WebView webView;
    private SpeechRecognizer recognizer;
    private TextToSpeech textToSpeech;
    private int recognitionRequestId;
    private int speakingRequestId;
    private String pendingRecognitionOptions;

    VoiceBridge(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        textToSpeech = new TextToSpeech(activity, status -> {
            if (status == TextToSpeech.SUCCESS) textToSpeech.setLanguage(Locale.getDefault());
        });
    }

    @JavascriptInterface
    public boolean isAvailable() {
        return SpeechRecognizer.isRecognitionAvailable(activity);
    }

    @JavascriptInterface
    public String getCapabilities() {
        return "{\"tts\":true,\"stt\":" + SpeechRecognizer.isRecognitionAvailable(activity) + "}";
    }

    @JavascriptInterface
    public void startRecognition(String optsJson) {
        activity.runOnUiThread(() -> {
            JSONObject opts = parse(optsJson);
            recognitionRequestId = opts.optInt("requestId", 0);
            String language = opts.optString("lang", "zh-CN");
            if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                    != PackageManager.PERMISSION_GRANTED) {
                pendingRecognitionOptions = optsJson;
                activity.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO_PERMISSION_REQUEST);
                return;
            }
            stopRecognizer();
            if (!SpeechRecognizer.isRecognitionAvailable(activity)) {
                dispatch("__schoolBikeVoiceOnError", payload("code", "not-available"));
                dispatch("__schoolBikeVoiceOnEnd", payload("requestId", recognitionRequestId));
                return;
            }
            recognizer = SpeechRecognizer.createSpeechRecognizer(activity);
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) { }
                @Override public void onBeginningOfSpeech() { }
                @Override public void onRmsChanged(float rmsdB) { }
                @Override public void onBufferReceived(byte[] buffer) { }
                @Override public void onEndOfSpeech() { }
                @Override public void onPartialResults(Bundle partialResults) { }
                @Override public void onEvent(int eventType, Bundle params) { }

                @Override public void onResults(Bundle results) {
                    ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    String text = matches == null || matches.isEmpty() ? "" : matches.get(0).trim();
                    if (!text.isEmpty()) {
                        JSONObject result = new JSONObject();
                        try {
                            result.put("requestId", recognitionRequestId);
                            result.put("text", text);
                        } catch (JSONException ignored) { }
                        dispatch("__schoolBikeVoiceOnResult", result.toString());
                    }
                    dispatch("__schoolBikeVoiceOnEnd", payload("requestId", recognitionRequestId));
                    stopRecognizer();
                }

                @Override public void onError(int error) {
                    String code = error == SpeechRecognizer.ERROR_NO_MATCH ? "no-speech" : "recognition-error";
                    dispatch("__schoolBikeVoiceOnError", payload("code", code));
                    dispatch("__schoolBikeVoiceOnEnd", payload("requestId", recognitionRequestId));
                    stopRecognizer();
                }
            });
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
                    .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
                    .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            recognizer.startListening(intent);
        });
    }

    void onAudioPermissionResult(boolean granted) {
        String options = pendingRecognitionOptions;
        pendingRecognitionOptions = null;
        if (options == null) return;
        if (granted) startRecognition(options);
        else {
            dispatch("__schoolBikeVoiceOnError", payload("code", "permission-denied"));
            dispatch("__schoolBikeVoiceOnEnd", payload("requestId", recognitionRequestId));
        }
    }

    @JavascriptInterface
    public void stopRecognition() {
        activity.runOnUiThread(this::stopRecognizer);
    }

    @JavascriptInterface
    public void cancelRecognition() {
        activity.runOnUiThread(this::stopRecognizer);
    }

    @JavascriptInterface
    public void startSpeak(String optsJson) {
        activity.runOnUiThread(() -> {
            JSONObject opts = parse(optsJson);
            speakingRequestId = opts.optInt("requestId", 0);
            String text = opts.optString("text", "");
            String language = opts.optString("lang", "zh-CN");
            if (textToSpeech == null || text.isEmpty()) {
                dispatch("__schoolBikeVoiceOnSpeakEnd", payload("requestId", speakingRequestId));
                return;
            }
            Locale locale = Locale.forLanguageTag(language);
            textToSpeech.setLanguage(locale);
            textToSpeech.setSpeechRate((float) opts.optDouble("rate", 1.0));
            String utteranceId = "school-bike-" + speakingRequestId;
            textToSpeech.setOnUtteranceProgressListener(new android.speech.tts.UtteranceProgressListener() {
                @Override public void onStart(String id) {
                    dispatch("__schoolBikeVoiceOnSpeakStart", payload("requestId", speakingRequestId));
                }
                @Override public void onDone(String id) {
                    dispatch("__schoolBikeVoiceOnSpeakEnd", payload("requestId", speakingRequestId));
                }
                @Override public void onError(String id) {
                    dispatch("__schoolBikeVoiceOnError", payload("code", "tts-error"));
                    dispatch("__schoolBikeVoiceOnSpeakEnd", payload("requestId", speakingRequestId));
                }
            });
            textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);
        });
    }

    @JavascriptInterface
    public void stopSpeak() {
        activity.runOnUiThread(() -> {
            if (textToSpeech != null) textToSpeech.stop();
        });
    }

    void destroy() {
        stopRecognizer();
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
            textToSpeech = null;
        }
    }

    private void stopRecognizer() {
        if (recognizer != null) {
            recognizer.cancel();
            recognizer.destroy();
            recognizer = null;
        }
    }

    private void dispatch(String function, String json) {
        String js = "typeof " + function + " === 'function' && " + function + "(" + JSONObject.quote(json) + ")";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private static JSONObject parse(String value) {
        try { return new JSONObject(value == null ? "{}" : value); }
        catch (JSONException ignored) { return new JSONObject(); }
    }

    private static String payload(String key, Object value) {
        JSONObject result = new JSONObject();
        try { result.put(key, value); } catch (JSONException ignored) { }
        return result.toString();
    }
}
