# 安卓语音桥接对接文档

> 面向安卓侧开发者。H5 侧的实现已经在仓库里（`frontend/src/services/voice.js`、
> `frontend/src/services/dialog.js`），本文是**原生需要实现什么**的契约。

## 0. 为什么必须要桥接（不是优化项）

安卓 WebView **默认不提供 `SpeechRecognition`**，`SpeechSynthesis` 也只在部分版本上可用。
更关键的是：本项目的公网入口是 FRP 的**纯 TCP 转发**（`http://47.120.48.245:14030`，没有 TLS 终结），
浏览器会判定为非安全上下文（`isSecureContext === false`），**麦克风在那里直接被禁**。

所以：

| 环境 | TTS 播报 | 语音输入 |
| --- | --- | --- |
| `localhost:4030`（开发机） | ✅ | ✅ |
| 公网 http 入口 | ✅ | ❌ 只能文字输入 |
| 安卓 App（走桥接） | ✅ | ✅ |

H5 侧的降级逻辑已经写好：拿不到桥就看浏览器能力，再不行就把麦克风按钮置灰并在 title 里说明原因——
**不会出现"点了没反应"**。安卓侧要做的只有一件事：把桥注入进去。

## 1. 注入

```java
webView.getSettings().setJavaScriptEnabled(true);
// 自动播报必须依赖这一条：默认 WebView 要求用户手势才允许出声，
// 而助手回答是在流式结束后自动朗读的，没有用户手势可用。
webView.getSettings().setMediaPlaybackRequiresUserGesture(false);

webView.addJavascriptInterface(new VoiceBridge(this, webView), "SchoolBikeBridge");
```

```java
class VoiceBridge {
    private final Context ctx;
    private final WebView webView;
    VoiceBridge(Context ctx, WebView webView) { this.ctx = ctx; this.webView = webView; }

    @JavascriptInterface
    public boolean isAvailable() { return true; }

    @JavascriptInterface
    public String getCapabilities() {
        return "{\"tts\":true,\"stt\":true}";
    }

    @JavascriptInterface
    public void startRecognition(String optsJson) { /* 见 §3 */ }

    @JavascriptInterface
    public void stopRecognition()  { /* 停止但保留已识别内容 */ }

    @JavascriptInterface
    public void cancelRecognition(){ /* 丢弃，用于用户点了"结束对话" */ }

    @JavascriptInterface
    public void startSpeak(String optsJson) { /* 见 §4 */ }

    @JavascriptInterface
    public void stopSpeak() { /* 立刻停 */ }
}
```

**必须加 `@JavascriptInterface` 注解**，否则 Android 4.2+ 会拒绝暴露该方法（方法存在但调用时静默失败）。

## 2. 页面 → 原生

| 方法 | 入参 | 说明 |
| --- | --- | --- |
| `isAvailable()` | — | H5 只在启动时看 `startRecognition`/`startSpeak` **是不是函数**，此方法可选 |
| `getCapabilities()` | — | 可选，返回 JSON 字符串 |
| `startRecognition(optsJson)` | JSON 字符串 | 开始一次识别 |
| `stopRecognition()` | — | 停止识别（正常收尾） |
| `cancelRecognition()` | — | 取消识别并丢弃结果 |
| `startSpeak(optsJson)` | JSON 字符串 | 朗读一段文本 |
| `stopSpeak()` | — | 停止朗读 |

### `startRecognition` 的入参

```json
{ "requestId": 3, "lang": "zh-CN", "continuous": false, "interim": false }
```

- `requestId` —— **必须原样回传**，见 §5。它从 1 开始单调递增。
- `continuous` —— 恒为 `false`。H5 不依赖原生做连续识别，而是**每轮结束后自己再调一次**
  （应用层循环，见 §6）。原生只需实现"识别一句就结束"。
- `interim` —— 恒为 `false`，只要最终结果。
- `lang` —— BCP-47，当前是 `zh-CN` 或 `en-US`。

### `startSpeak` 的入参

```json
{ "requestId": 7, "text": "主教学楼站现在有 3 辆车可租。", "lang": "zh-CN", "rate": 1 }
```

- `text` 已经过 H5 侧清洗：**没有 Markdown 标记、没有 URL、没有 emoji**，可直接送 TTS。
- `lang` 是 H5 按**正文内容的 CJK 占比**判出来的，不是界面语言——用户可能用英文提问而界面是中文。
  原生请按这个值选发音人，不要用系统默认语言。

## 3. 原生 → 页面

原生通过 `evaluateJavascript` 调用下面这几个**全局函数**：

| 函数 | 时机 | 参数 |
| --- | --- | --- |
| `__schoolBikeVoiceOnResult(json)` | 识别出最终结果 | `{"requestId":3,"text":"现在有哪些站点"}` |
| `__schoolBikeVoiceOnError(json)` | 出错 | `{"requestId":3,"code":"no-speech"}` |
| `__schoolBikeVoiceOnEnd(json)` | 一次识别结束 | `{"requestId":3}` |
| `__schoolBikeVoiceOnSpeakStart(json)` | 开始朗读（可选） | `{"requestId":7}` |
| `__schoolBikeVoiceOnSpeakEnd(json)` | 朗读结束 | `{"requestId":7}` |

### ⚠️ 四条硬性要求

1. **必须切主线程**。`evaluateJavascript` 只能在 UI 线程调用，从识别回调线程直接调会崩：

   ```java
   webView.post(() -> webView.evaluateJavascript(
       "__schoolBikeVoiceOnResult(" + JSONObject.quote(payload) + ")", null));
   ```

2. **必须先判函数存在**。页面上还没加载完、或者 H5 换了版本时，这个函数可能不存在，
   直接调用会抛 `TypeError` 且没有任何提示：

   ```java
   String js = "typeof __schoolBikeVoiceOnResult === 'function' && __schoolBikeVoiceOnResult("
             + JSONObject.quote(payload) + ")";
   ```

   H5 侧在 `voice.js` 被引入时就会把这几个函数挂到 `window` 上，所以只要页面加载完成就一定有；
   但**竞态仍然存在**（页面刚 `loadUrl` 完、Vue 还没挂载），所以两边都要判。

3. **JSON 用 `JSONObject.quote()` 转义**，不要手工拼字符串——识别结果里出现引号或换行会把 JS 语法打断。

4. **`stopSpeak()` 之后不要再发 `OnSpeakEnd`**（或者发了也无所谓，H5 用 `requestId` + 代数做了幂等）。
   反过来，`startSpeak` 之后**一定要发 `OnSpeakEnd`**，否则 H5 会一直停在"正在播报"、
   麦克风不会重新打开。H5 侧有看门狗兜底（按字数估算，最长 120 秒），但那是保险不是常态。

## 4. `requestId` 的用途

H5 侧对一个 `requestId` 只认第一次回调，迟到的直接丢弃。
**原生请保证回调里带上对应的 `requestId`**，否则用户快速点了两次"结束对话"又重开时，
上一轮的识别结果会被当成新一轮的输入。

识别和朗读各自独立编号，不要共用一个计数器。

## 5. 状态机（H5 侧行为，原生需要理解的部分）

```
idle → listening → transcribing → thinking → speaking → listening → …
```

关键约束：**朗读期间绝不录音**。助手自己的声音被麦克风录进去会识别成新问题 → 再回答 → 死循环。
H5 在进入 `speaking` 前一定调 `stopRecognition()`，在收到 `OnSpeakEnd` 后**等 250ms**
（等功放尾音散掉）再调 `startRecognition()`。

因此原生侧会观察到这样的调用序列：

```
startRecognition(1) → stopRecognition() → [问模型] → startSpeak(1) → OnSpeakEnd → startRecognition(2) → …
```

**`stopRecognition()` 之后到 `startRecognition()` 之前，麦克风必须是真正关闭的**——
如果原生只是停止了结果回调、录音线程还开着，功放的声音仍会被采集进缓冲区，
下一轮 `startRecognition` 时可能把上一轮的尾音当成结果吐出来。

## 6. 连续识别是应用层循环

`continuous` 恒为 `false`，所以 H5 会在一轮结束后自己再调一次 `startRecognition`，
间隔 300ms，**最多连续 5 次**（连续 5 次拿不到结果就退出对话并提示用户）。
原生不需要实现"一直听"。

## 7. 权限

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

```java
webView.setWebChromeClient(new WebChromeClient() {
    @Override
    public void onPermissionRequest(PermissionRequest request) {
        for (String res : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) {
                request.grant(new String[]{ res });
                return;
            }
        }
        request.deny();
    }
});
```

运行时权限（`RECORD_AUDIO`）需要自己申请。**建议在用户第一次点麦克风按钮时申请**，
而不是一进 App 就弹——后者在国产 ROM 上很容易被直接拒绝。

## 8. 自测

在 WebView 里注入桩对象即可验证 H5 侧的状态机（不需要真的接原生）：

```js
window.SchoolBikeBridge = {
  startRecognition: (o) => console.log('start', o),
  stopRecognition:  () => console.log('stop'),
  cancelRecognition:() => console.log('cancel'),
  startSpeak:       (o) => { console.log('speak', o); setTimeout(() => window.__schoolBikeVoiceOnSpeakEnd('{}'), 800); },
  stopSpeak:        () => console.log('stopSpeak')
};
```

仓库里已有一份完整的自动化用例做同样的事（`test-voice.mjs`，19 条断言），
覆盖了"播报期间麦克风必须是关的""播报结束要重新开麦""requestId 递增"这几条关键约束，
安卓侧改完桥之后可以拿它比对行为。

## 9. 已知限制

- **第一期不做打断（barge-in）**：助手说话时用户插话不会被识别，需要点一下停止。
  要做的话得在 `speaking` 期间维护第二路识别，H5 侧实现复杂且容易自激。
- `zh-CN`/`en-US` 之外的语种没有处理；`detectScript()` 只按 CJK 占比做二分。
- 长回答会整段送 TTS。如果原生 TTS 引擎对超长文本表现不好，可以在原生侧按标点切分，
  但**不要改 `text` 的内容**——H5 已经在 `sanitizeForSpeech()` 里清洗过了。
