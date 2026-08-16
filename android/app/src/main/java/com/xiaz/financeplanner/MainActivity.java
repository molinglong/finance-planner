package com.xiaz.financeplanner;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 注册冷静期应用锁插件（需在 super.onCreate 前调用）
        registerPlugin(AppLockPlugin.class);
        super.onCreate(savedInstanceState);
        // 页面为 https 源，但 API 走 http（局域网后端），放行混合内容限制
        WebSettings settings = bridge.getWebView().getSettings();
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    }
}
